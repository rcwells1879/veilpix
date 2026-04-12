const express = require('express');
const multer = require('multer');
const { db } = require('../utils/database');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    uploadTemporaryImage,
    deleteTemporaryImage
} = require('../utils/imageUpload');
const {
    buildImageToVideoRequest,
    normalizeVideoResponse
} = require('../utils/wanAdapter');

const router = express.Router();

// Configure multer for image uploads (reference frame)
const upload = multer({
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Wan API configuration (same kie.ai key as other models)
const WAN_API_KEY = process.env.SEEDREAM_API_KEY;
const WAN_API_URL = process.env.SEEDREAM_API_BASE_URL || 'https://api.kie.ai';
const CREDITS_PER_VIDEO = 2;

// Helper: create Wan task
async function createWanTask(requestBody) {
    console.log('🎬 Creating Wan 2.7 image-to-video task');

    const payload = {
        model: 'wan/2-7-image-to-video',
        input: requestBody
    };

    console.log('📤 Wan request payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(`${WAN_API_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WAN_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Wan API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Wan task created:', result);

    if (result.code !== 200 || !result.data || !result.data.taskId) {
        throw new Error(`Task creation failed: ${result.message || 'Unknown error'}`);
    }

    return result;
}

// Helper: poll Wan job status (longer timeout for video - up to 10 minutes)
async function pollWanJob(taskId, maxAttempts = 300, intervalMs = 2000) {
    console.log(`⏳ Polling Wan task: ${taskId}`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await fetch(`${WAN_API_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${WAN_API_KEY}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Task status check failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        if (result.code !== 200) {
            throw new Error(`Task query failed: ${result.message || 'Unknown error'}`);
        }

        const taskData = result.data;
        const state = taskData.state;

        // Log progress every 30 seconds
        if (attempt % 15 === 0) {
            console.log(`📊 Wan task status (attempt ${attempt + 1}/${maxAttempts}): ${state}`);
        }

        if (state === 'success') {
            console.log('✅ Wan video task completed successfully');
            const resultData = JSON.parse(taskData.resultJson);
            return resultData;
        }

        if (state === 'fail') {
            throw new Error(`Video generation failed: ${taskData.failMsg || taskData.failCode || 'Unknown error'}`);
        }

        // States: waiting, queuing, generating - continue polling
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Video generation timeout - exceeded maximum wait time (10 minutes)');
}

// Helper: call Wan API with full async flow
async function callWanAPI(requestBody) {
    const taskResponse = await createWanTask(requestBody);
    const taskId = taskResponse.data.taskId;
    console.log(`📋 Wan task created with ID: ${taskId}`);

    const completedJob = await pollWanJob(taskId);
    return completedJob;
}

// Helper: deduct credit and track usage
async function deductCreditAndTrack(req, startTime, requestType, success = true, errorMessage = null) {
    const { user } = req;

    try {
        await db.logUsage({
            userId: user.id,
            clerkUserId: user.userId,
            requestType,
            geminiRequestId: 'wan-' + Date.now(),
            imageSize: 'video',
            processingTimeMs: Date.now() - startTime,
            success,
            errorMessage
        });

        if (success) {
            // Deduct credits (2 per video)
            for (let i = 0; i < CREDITS_PER_VIDEO; i++) {
                const deductResult = await db.deductUserCredit(user.userId);
                if (!deductResult.success) {
                    console.error('🚨 Failed to deduct credit:', deductResult.error);
                    return false;
                }
            }

            if (req.creditsInfo) {
                req.creditsInfo.remaining = Math.max(0, req.creditsInfo.remaining - CREDITS_PER_VIDEO);
            }
        }

        return true;
    } catch (error) {
        console.error('🚨 Credit deduction/tracking error:', error);
        return false;
    }
}

// Check user credits
async function checkUserCredits(req, res, next) {
    try {
        const { user } = req;
        const { credits, error } = await db.getUserCredits(user.userId);

        if (error) {
            return res.status(500).json({
                error: 'Failed to check credits',
                message: 'Please try again in a moment.'
            });
        }

        if (credits < CREDITS_PER_VIDEO) {
            return res.status(402).json({
                error: 'Insufficient credits',
                message: `Video generation requires ${CREDITS_PER_VIDEO} credits. You have ${credits}.`,
                creditsRemaining: credits,
                requiresPayment: true
            });
        }

        req.creditsInfo = { remaining: credits };
        next();
    } catch (error) {
        console.error('🚨 Credits check error:', error);
        res.status(500).json({
            error: 'Failed to check credits',
            message: 'Please try again in a moment.'
        });
    }
}

// Apply authentication middleware to all routes
router.use(getUser, requireAuth, requireAllowedEmail);

// Generate video from image endpoint
router.post('/generate-video', upload.single('image'), checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;
    let uploadedFilename = null;

    try {
        const { prompt, duration = '5', resolution = '1080p' } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No reference image provided' });
        }
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'No video description provided' });
        }
        if (prompt.length > 5000) {
            return res.status(400).json({ error: 'Prompt must be 5000 characters or less' });
        }

        // Upload reference image to Supabase for public URL
        const uploadResult = await uploadTemporaryImage(
            req.file.buffer,
            req.file.mimetype,
            req.user.userId
        );

        if (!uploadResult.success) {
            throw new Error(`Failed to upload image: ${uploadResult.error}`);
        }

        uploadedFilename = uploadResult.filename;
        console.log(`✅ Reference image uploaded for Wan: ${uploadResult.url}`);

        // Build Wan API request
        const wanRequest = buildImageToVideoRequest(
            uploadResult.url,
            prompt.trim(),
            {
                duration: parseInt(duration),
                resolution
            }
        );

        // Call Wan API (this may take several minutes)
        const wanResponse = await callWanAPI(wanRequest);

        // Normalize response
        const normalizedResponse = normalizeVideoResponse(wanResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process video response');
        }

        // Clean up uploaded reference image
        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        usageLogged = await deductCreditAndTrack(req, startTime, 'video');

        res.json({
            success: true,
            videoUrl: normalizedResponse.videoUrl,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        console.error('Error generating video with Wan:', error);

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'video', false, error.message);
        }

        res.status(500).json({
            error: 'Failed to generate video',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;
