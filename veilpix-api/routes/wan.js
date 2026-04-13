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
    buildTextToVideoRequest,
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

// Video credit pricing table: { duration: { resolution: credits } }
// Targeting ~12% profit margin at mid-tier credit pricing ($0.0699/credit)
const VIDEO_CREDIT_TABLE = {
    5:  { '720p': 7,  '1080p': 10 },
    10: { '720p': 13, '1080p': 19 },
    15: { '720p': 19, '1080p': 29 },
};

function getVideoCreditCost(duration, resolution) {
    const d = parseInt(duration);
    const r = resolution || '1080p';
    // Exact match from table
    if (VIDEO_CREDIT_TABLE[d] && VIDEO_CREDIT_TABLE[d][r]) {
        return VIDEO_CREDIT_TABLE[d][r];
    }
    // Interpolate for non-standard durations using per-second rates
    const perSecRate = r === '1080p' ? 2.0 : 1.4;
    return Math.ceil(d * perSecRate);
}

// Helper: create Wan task
async function createWanTask(requestBody, model = 'wan/2-7-image-to-video') {
    console.log(`🎬 Creating Wan 2.7 task (${model})`);

    const payload = {
        model,
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
    console.log('✅ Wan task response:', JSON.stringify(result, null, 2));

    if (result.code !== 200 || !result.data || !result.data.taskId) {
        throw new Error(`Task creation failed: ${result.message || result.msg || JSON.stringify(result)}`);
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
async function deductCreditAndTrack(req, startTime, requestType, creditsToDeduct, success = true, errorMessage = null) {
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
            for (let i = 0; i < creditsToDeduct; i++) {
                const deductResult = await db.deductUserCredit(user.userId);
                if (!deductResult.success) {
                    console.error('🚨 Failed to deduct credit:', deductResult.error);
                    return false;
                }
            }

            if (req.creditsInfo) {
                req.creditsInfo.remaining = Math.max(0, req.creditsInfo.remaining - creditsToDeduct);
            }
        }

        return true;
    } catch (error) {
        console.error('🚨 Credit deduction/tracking error:', error);
        return false;
    }
}

// Check user credits (uses body params to calculate required credits)
async function checkUserCredits(req, res, next) {
    try {
        const { user } = req;
        const duration = parseInt(req.body?.duration || '5');
        const resolution = req.body?.resolution || '1080p';
        const requiredCredits = getVideoCreditCost(duration, resolution);

        const { credits, error } = await db.getUserCredits(user.userId);

        if (error) {
            return res.status(500).json({
                error: 'Failed to check credits',
                message: 'Please try again in a moment.'
            });
        }

        if (credits < requiredCredits) {
            return res.status(402).json({
                error: 'Insufficient credits',
                message: `This video requires ${requiredCredits} credits. You have ${credits}.`,
                creditsRemaining: credits,
                creditsRequired: requiredCredits,
                requiresPayment: true
            });
        }

        req.creditsInfo = { remaining: credits };
        req.videoCreditCost = requiredCredits;
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
        const { prompt, duration = '5', resolution = '1080p', nsfwFilterEnabled = 'true' } = req.body;

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
                resolution,
                nsfwFilterEnabled: nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true
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

        const creditCost = req.videoCreditCost;
        usageLogged = await deductCreditAndTrack(req, startTime, 'video', creditCost);

        res.json({
            success: true,
            videoUrl: normalizedResponse.videoUrl,
            processingTime: Date.now() - startTime,
            creditsUsed: creditCost,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        console.error('Error generating video with Wan:', error);

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'video', 0, false, error.message);
        }

        res.status(500).json({
            error: 'Failed to generate video',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Generate video from text prompt (no image required)
router.post('/generate-text-to-video', express.json({ limit: '1mb' }), checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const { prompt, duration = 5, resolution = '1080p', ratio = '16:9', nsfwFilterEnabled = true } = req.body;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'No video description provided' });
        }
        if (prompt.length > 5000) {
            return res.status(400).json({ error: 'Prompt must be 5000 characters or less' });
        }

        const validRatios = ['16:9', '9:16', '1:1', '4:3', '3:4'];
        const selectedRatio = validRatios.includes(ratio) ? ratio : '16:9';

        // Build Wan text-to-video API request
        const wanRequest = buildTextToVideoRequest(
            prompt.trim(),
            {
                duration: typeof duration === 'number' ? duration : parseInt(duration),
                resolution,
                ratio: selectedRatio,
                nsfwFilterEnabled: nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true || nsfwFilterEnabled === undefined
            }
        );

        // Call Wan API (text-to-video uses a different model name)
        const taskResponse = await createWanTask(wanRequest, 'wan/2-7-text-to-video');
        const taskId = taskResponse.data.taskId;
        console.log(`📋 Text-to-video task created with ID: ${taskId}`);

        const completedJob = await pollWanJob(taskId);

        // Normalize response
        const normalizedResponse = normalizeVideoResponse(completedJob);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process video response');
        }

        const creditCost = req.videoCreditCost;
        usageLogged = await deductCreditAndTrack(req, startTime, 'text-to-video', creditCost);

        res.json({
            success: true,
            videoUrl: normalizedResponse.videoUrl,
            processingTime: Date.now() - startTime,
            creditsUsed: creditCost,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        console.error('Error generating text-to-video with Wan:', error);

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'text-to-video', 0, false, error.message);
        }

        res.status(500).json({
            error: 'Failed to generate video',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get video credit pricing table (no auth required)
router.get('/pricing', (req, res) => {
    res.json({
        success: true,
        pricing: VIDEO_CREDIT_TABLE
    });
});

module.exports = router;
