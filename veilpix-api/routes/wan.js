const express = require('express');
const multer = require('multer');
const { db } = require('../utils/database');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    uploadTemporaryImage,
    uploadTemporaryVideo,
    deleteTemporaryImage
} = require('../utils/imageUpload');
const {
    buildImageToVideoRequest,
    buildTextToVideoRequest,
    buildReferenceToVideoRequest
} = require('../utils/wanAdapter');
const {
    getVideoGenerationId
} = require('../utils/videoGenerationJob');
const { queuePendingKieVideoJob } = require('../utils/kieVideoJobRecovery');

const router = express.Router();

// Configure multer for image/video uploads (reference media)
const upload = multer({
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit for reference videos
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed'));
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
async function createWanTask(requestBody, model = 'wan/2-6-flash-image-to-video') {
    console.log(`🎬 Creating Wan task (${model})`);

    const payload = {
        model,
        input: requestBody
    };

    console.log('📤 Wan request summary:', {
        model,
        imageCount: Array.isArray(requestBody.image_urls) ? requestBody.image_urls.length : 0,
        hasVideoReference: Boolean(requestBody.video_url),
        duration: requestBody.duration,
        resolution: requestBody.resolution
    });

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
    console.log('✅ Wan task created:', result.data?.taskId);

    if (result.code !== 200 || !result.data || !result.data.taskId) {
        throw new Error(`Task creation failed: ${result.message || result.msg || JSON.stringify(result)}`);
    }

    return result;
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
    const generationId = getVideoGenerationId(req);
    let providerTaskId = null;
    let pendingJob = null;
    let uploadedFilename = null;

    try {
        if (!generationId) {
            return res.status(400).json({ error: 'A valid generation ID is required' });
        }
        const { prompt, duration = '5', resolution = '1080p', nsfwFilterEnabled = 'true', audio = 'true', multiShots = 'false' } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No reference image provided' });
        }
        if (!req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'Reference image must be an image file' });
        }
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'No video description provided' });
        }
        if (prompt.length > 1500) {
            return res.status(400).json({ error: 'Prompt must be 1500 characters or less' });
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
        console.log('✅ Reference image uploaded for Wan');

        // Build Wan 2.6 Flash API request
        const wanRequest = buildImageToVideoRequest(
            uploadResult.url,
            prompt.trim(),
            {
                duration: parseInt(duration),
                resolution,
                nsfwFilterEnabled: nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true,
                audio: audio === 'true' || audio === true,
                multiShots: multiShots === 'true' || multiShots === true
            }
        );

        const creditCost = req.videoCreditCost;
        const taskResponse = await createWanTask(wanRequest);
        providerTaskId = taskResponse.data.taskId;
        pendingJob = await db.createPendingVideoGenerationJob({
            userId: req.user.id,
            clerkUserId: req.user.userId,
            requestType: 'video',
            generationId,
            providerState: {
                provider: 'wan',
                providerTaskId,
                estimatedCredits: creditCost,
                duration: parseInt(duration),
                cleanup: {
                    kind: 'temporary-media',
                    filenames: uploadedFilename ? [uploadedFilename] : []
                }
            }
        });
        queuePendingKieVideoJob(pendingJob);

        return res.status(202).json({
            success: true,
            pending: true,
            generationId,
            processingTime: Date.now() - startTime,
            creditsUsed: creditCost,
            creditsRemaining: req.creditsInfo?.remaining ?? 0
        });

    } catch (error) {
        console.error('Error generating video with Wan:', error);

        if (!providerTaskId && uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!pendingJob && generationId) {
            await db.logUsage({
                userId: req.user.id,
                clerkUserId: req.user.userId,
                requestType: 'video',
                geminiRequestId: generationId,
                imageSize: 'video',
                processingTimeMs: Date.now() - startTime,
                success: false,
                errorMessage: error.message
            }).catch(() => {});
        }

        const isNsfwError = error.message?.toLowerCase().includes('nsfw') || error.message?.toLowerCase().includes('review') || error.message?.toLowerCase().includes('content');

        res.status(isNsfwError ? 400 : 500).json({
            error: isNsfwError ? 'Content policy violation' : 'Failed to generate video',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Generate reference-to-video with optional reference image and/or reference video
router.post('/generate-reference-to-video', upload.fields([
    { name: 'image', maxCount: 5 },
    { name: 'video', maxCount: 1 }
]), checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    const generationId = getVideoGenerationId(req);
    let providerTaskId = null;
    let pendingJob = null;
    const uploadedFilenames = [];

    try {
        if (!generationId) {
            return res.status(400).json({ error: 'A valid generation ID is required' });
        }
        const { prompt, duration = '5', resolution = '1080p', ratio = '16:9', nsfwFilterEnabled = 'true', referenceVideoUrl } = req.body;
        const imageFiles = req.files?.image || [];
        const videoFile = req.files?.video?.[0];

        if (imageFiles.length === 0 && !videoFile && !referenceVideoUrl) {
            return res.status(400).json({ error: 'Provide at least one reference image, reference video, or generated reference video URL' });
        }
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'No video description provided' });
        }
        if (prompt.length > 5000) {
            return res.status(400).json({ error: 'Prompt must be 5000 characters or less' });
        }

        const referenceImages = [];
        const referenceVideos = [];

        for (const imageFile of imageFiles) {
            if (!imageFile.mimetype.startsWith('image/')) {
                return res.status(400).json({ error: 'Reference images must be image files' });
            }
            const imageUpload = await uploadTemporaryImage(imageFile.buffer, imageFile.mimetype, req.user.userId);
            if (!imageUpload.success) {
                throw new Error(`Failed to upload image: ${imageUpload.error}`);
            }
            uploadedFilenames.push(imageUpload.filename);
            referenceImages.push(imageUpload.url);
            console.log('✅ Reference image uploaded for Wan R2V');
        }

        if (videoFile) {
            if (!videoFile.mimetype.startsWith('video/')) {
                return res.status(400).json({ error: 'Reference video must be a video file' });
            }
            const videoUpload = await uploadTemporaryVideo(videoFile.buffer, videoFile.mimetype, req.user.userId);
            if (!videoUpload.success) {
                throw new Error(`Failed to upload video: ${videoUpload.error}`);
            }
            uploadedFilenames.push(videoUpload.filename);
            referenceVideos.push(videoUpload.url);
            console.log('✅ Reference video uploaded for Wan R2V');
        } else if (referenceVideoUrl) {
            try {
                const parsed = new URL(referenceVideoUrl);
                if (!['http:', 'https:'].includes(parsed.protocol)) {
                    throw new Error('Invalid URL protocol');
                }
                referenceVideos.push(referenceVideoUrl);
            } catch {
                return res.status(400).json({ error: 'Invalid reference video URL' });
            }
        }

        if (referenceImages.length + referenceVideos.length > 5) {
            return res.status(400).json({ error: 'Reference images and videos cannot exceed 5 total' });
        }

        const validRatios = ['16:9', '9:16', '1:1', '4:3', '3:4'];
        const selectedRatio = validRatios.includes(ratio) ? ratio : '16:9';

        const wanRequest = buildReferenceToVideoRequest(prompt.trim(), {
            referenceImages,
            referenceVideos,
            duration: parseInt(duration),
            resolution,
            ratio: selectedRatio,
            nsfwFilterEnabled: nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true || nsfwFilterEnabled === undefined
        });

        const taskResponse = await createWanTask(wanRequest, 'wan/2-7-r2v');
        providerTaskId = taskResponse.data.taskId;

        const creditCost = req.videoCreditCost;
        pendingJob = await db.createPendingVideoGenerationJob({
            userId: req.user.id,
            clerkUserId: req.user.userId,
            requestType: 'reference-to-video',
            generationId,
            providerState: {
                provider: 'wan',
                providerTaskId,
                estimatedCredits: creditCost,
                duration: parseInt(duration),
                cleanup: {
                    kind: 'temporary-media',
                    filenames: uploadedFilenames
                }
            }
        });
        queuePendingKieVideoJob(pendingJob);

        return res.status(202).json({
            success: true,
            pending: true,
            generationId,
            processingTime: Date.now() - startTime,
            creditsUsed: creditCost,
            creditsRemaining: req.creditsInfo?.remaining ?? 0
        });
    } catch (error) {
        console.error('Error generating reference-to-video with Wan:', error);

        if (!providerTaskId) {
            for (const filename of uploadedFilenames) {
                await deleteTemporaryImage(filename);
            }
        }

        if (!pendingJob && generationId) {
            await db.logUsage({
                userId: req.user.id,
                clerkUserId: req.user.userId,
                requestType: 'reference-to-video',
                geminiRequestId: generationId,
                imageSize: 'video',
                processingTimeMs: Date.now() - startTime,
                success: false,
                errorMessage: error.message
            }).catch(() => {});
        }

        const isNsfwError = error.message?.toLowerCase().includes('nsfw') || error.message?.toLowerCase().includes('review') || error.message?.toLowerCase().includes('content');

        res.status(isNsfwError ? 400 : 500).json({
            error: isNsfwError ? 'Content policy violation' : 'Failed to generate video',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Generate video from text prompt (no image required)
router.post('/generate-text-to-video', express.json({ limit: '1mb' }), checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    const generationId = getVideoGenerationId(req);
    let providerTaskId = null;
    let pendingJob = null;

    try {
        if (!generationId) {
            return res.status(400).json({ error: 'A valid generation ID is required' });
        }
        const { prompt, duration = 5, resolution = '1080p', ratio = '16:9', multiShots = false, nsfwFilterEnabled = true } = req.body;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'No video description provided' });
        }
        if (prompt.length > 5000) {
            return res.status(400).json({ error: 'Prompt must be 5000 characters or less' });
        }

        const validRatios = ['16:9', '9:16', '1:1', '4:3', '3:4'];
        const selectedRatio = validRatios.includes(ratio) ? ratio : '16:9';

        // Build Wan 2.6 text-to-video API request
        const wanRequest = buildTextToVideoRequest(
            prompt.trim(),
            {
                duration: typeof duration === 'number' ? duration : parseInt(duration),
                resolution,
                ratio: selectedRatio,
                multiShots: multiShots === 'true' || multiShots === true,
                nsfwFilterEnabled: nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true || nsfwFilterEnabled === undefined
            }
        );

        // Call Wan 2.6 API for text-to-video
        const taskResponse = await createWanTask(wanRequest, 'wan/2-6-text-to-video');
        providerTaskId = taskResponse.data.taskId;

        const creditCost = req.videoCreditCost;
        pendingJob = await db.createPendingVideoGenerationJob({
            userId: req.user.id,
            clerkUserId: req.user.userId,
            requestType: 'text-to-video',
            generationId,
            providerState: {
                provider: 'wan',
                providerTaskId,
                estimatedCredits: creditCost,
                duration: typeof duration === 'number' ? duration : parseInt(duration),
                cleanup: { kind: 'temporary-media', filenames: [] }
            }
        });
        queuePendingKieVideoJob(pendingJob);

        return res.status(202).json({
            success: true,
            pending: true,
            generationId,
            processingTime: Date.now() - startTime,
            creditsUsed: creditCost,
            creditsRemaining: req.creditsInfo?.remaining ?? 0
        });

    } catch (error) {
        console.error('Error generating text-to-video with Wan:', error);

        if (!pendingJob && generationId) {
            await db.logUsage({
                userId: req.user.id,
                clerkUserId: req.user.userId,
                requestType: 'text-to-video',
                geminiRequestId: generationId,
                imageSize: 'video',
                processingTimeMs: Date.now() - startTime,
                success: false,
                errorMessage: error.message
            }).catch(() => {});
        }

        const isNsfwError = error.message?.toLowerCase().includes('nsfw') || error.message?.toLowerCase().includes('review') || error.message?.toLowerCase().includes('content');

        res.status(isNsfwError ? 400 : 500).json({
            error: isNsfwError ? 'Content policy violation' : 'Failed to generate video',
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
