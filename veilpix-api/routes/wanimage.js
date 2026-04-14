const express = require('express');
const multer = require('multer');
const { db, supabase } = require('../utils/database');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    validateImageGeneration,
    validateFilterGeneration,
    validateAdjustmentGeneration,
    validateImageFile
} = require('../middleware/validation');
const {
    uploadTemporaryImage,
    uploadMultipleImages,
    deleteTemporaryImage,
    deleteMultipleImages
} = require('../utils/imageUpload');
const {
    buildEditRequest,
    buildFilterRequest,
    buildAdjustRequest,
    buildCombineRequest,
    buildTextToImageRequest,
    normalizeResponse,
    urlToBase64
} = require('../utils/wanImageAdapter');

const router = express.Router();

// Configure multer for image uploads
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

// Configure multer for multiple images
const uploadMultiple = multer({
    limits: {
        fileSize: 50 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
}).fields([
    { name: 'images', maxCount: 5 },
    { name: 'prompt', maxCount: 1 },
    { name: 'style', maxCount: 1 }
]);

// Wan Image API configuration (same kie.ai key as other models)
const WAN_API_KEY = process.env.SEEDREAM_API_KEY;
const WAN_API_URL = process.env.SEEDREAM_API_BASE_URL || 'https://api.kie.ai';

// Helper function to create Wan Image task
async function createWanImageTask(requestBody) {
    try {
        console.log('🌐 Creating Wan Image task');
        console.log('📝 Input parameters:', JSON.stringify(requestBody, null, 2));

        const payload = {
            model: 'wan/2-7-image',
            input: requestBody
        };

        console.log('📤 Full request payload:', JSON.stringify(payload, null, 2));

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
            throw new Error(`Wan Image API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Wan Image task created:', result);

        if (result.code !== 200 || !result.data || !result.data.taskId) {
            throw new Error(`Task creation failed: ${result.message || 'Unknown error'}`);
        }

        return result;
    } catch (error) {
        console.error('❌ Wan Image task creation failed:', error);
        throw error;
    }
}

// Helper function to poll Wan Image job status
async function pollWanImageJob(taskId, maxAttempts = 150, intervalMs = 2000) {
    try {
        console.log(`⏳ Polling Wan Image task: ${taskId}`);

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

            console.log(`📊 Task status (attempt ${attempt + 1}/${maxAttempts}): ${state}`);

            if (state === 'success') {
                console.log('✅ Task completed successfully');
                const resultData = JSON.parse(taskData.resultJson);
                return resultData;
            }

            if (state === 'fail') {
                const failMsg = taskData.failMsg || taskData.failCode || 'Unknown error';
                // Check for NSFW-related failures
                if (failMsg.toLowerCase().includes('nsfw') || failMsg.toLowerCase().includes('content') || failMsg.toLowerCase().includes('safety')) {
                    throw new Error(`NSFW content detected: ${failMsg}`);
                }
                throw new Error(`Task failed: ${failMsg}`);
            }

            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

        throw new Error('Task polling timeout - exceeded maximum attempts');
    } catch (error) {
        console.error('❌ Task polling failed:', error);
        throw error;
    }
}

// Helper function to call Wan Image API with full async flow
async function callWanImageAPI(requestBody) {
    try {
        const taskResponse = await createWanImageTask(requestBody);
        const taskId = taskResponse.data.taskId;
        console.log(`📋 Task created with ID: ${taskId}`);
        const completedJob = await pollWanImageJob(taskId);
        return completedJob;
    } catch (error) {
        console.error('❌ Wan Image API call failed:', error);
        throw error;
    }
}

// Helper function to deduct credit and track usage (1 credit per generation)
async function deductCreditAndTrack(req, startTime, requestType, result, success = true, errorMessage = null) {
    const { user } = req;

    try {
        await db.logUsage({
            userId: user.id,
            clerkUserId: user.userId,
            requestType,
            geminiRequestId: 'wanimage-' + Date.now(),
            imageSize: req.file?.size > 1024 * 1024 ? 'large' : 'medium',
            processingTimeMs: Date.now() - startTime,
            success,
            errorMessage
        });

        if (success) {
            const deductResult = await db.deductUserCredit(user.userId);

            if (!deductResult.success) {
                console.error('🚨 Failed to deduct credit:', deductResult.error);
                return false;
            }

            if (req.creditsInfo) {
                req.creditsInfo.remaining = Math.max(0, req.creditsInfo.remaining - 1);
            }
        }

        return true;
    } catch (error) {
        console.error('🚨 Exception in credit deduction and tracking:', error);
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

        if (credits <= 0) {
            return res.status(402).json({
                error: 'No credits remaining',
                message: 'You have used all your credits. Please purchase more credits to continue.',
                creditsRemaining: 0,
                requiresPayment: true
            });
        }

        req.creditsInfo = { remaining: credits };
        next();
    } catch (error) {
        res.status(500).json({
            error: 'Failed to check credits',
            message: 'Please try again in a moment.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// Apply authentication middleware to all routes
router.use(getUser, requireAuth, requireAllowedEmail);

// Generate edited image endpoint
router.post('/generate-edit', upload.single('image'), validateImageFile, validateImageGeneration, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;
    let uploadedFilename = null;

    try {
        const { prompt, x, y, resolution = '2K', nsfwFilterEnabled = 'false' } = req.body;
        const nsfwFilter = nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!prompt) {
            return res.status(400).json({ error: 'No prompt provided' });
        }

        const uploadResult = await uploadTemporaryImage(
            req.file.buffer,
            req.file.mimetype,
            req.user.userId
        );

        if (!uploadResult.success) {
            throw new Error(`Failed to upload image: ${uploadResult.error}`);
        }

        uploadedFilename = uploadResult.filename;

        const wanRequest = buildEditRequest(
            [uploadResult.url],
            prompt,
            resolution,
            x ? parseInt(x) : null,
            y ? parseInt(y) : null,
            '1:1',
            nsfwFilter
        );

        const wanResponse = await callWanImageAPI(wanRequest);
        const normalizedResponse = normalizeResponse(wanResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process Wan Image response');
        }

        if (normalizedResponse.needsConversion && normalizedResponse.imageUrl) {
            const conversionResult = await urlToBase64(normalizedResponse.imageUrl);
            if (!conversionResult.success) {
                throw new Error(`Failed to convert image: ${conversionResult.error}`);
            }
            normalizedResponse.image = {
                data: conversionResult.data,
                mimeType: conversionResult.mimeType
            };
            delete normalizedResponse.imageUrl;
            delete normalizedResponse.needsConversion;
        }

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        usageLogged = await deductCreditAndTrack(req, startTime, 'retouch', wanResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });
    } catch (error) {
        console.error('Error generating edit with Wan Image:', error);

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'edited image', null, false, error.message);
        }

        res.status(500).json({
            error: 'Failed to generate edited image',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Generate filtered image endpoint
router.post('/generate-filter', upload.single('image'), validateImageFile, validateFilterGeneration, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;
    let uploadedFilename = null;

    try {
        const { filterType, resolution = '2K', nsfwFilterEnabled = 'false' } = req.body;
        const nsfwFilter = nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!filterType) {
            return res.status(400).json({ error: 'No filter type provided' });
        }

        const uploadResult = await uploadTemporaryImage(
            req.file.buffer,
            req.file.mimetype,
            req.user.userId
        );

        if (!uploadResult.success) {
            throw new Error(`Failed to upload image: ${uploadResult.error}`);
        }

        uploadedFilename = uploadResult.filename;

        const wanRequest = buildFilterRequest([uploadResult.url], filterType, resolution, '1:1', nsfwFilter);
        const wanResponse = await callWanImageAPI(wanRequest);
        const normalizedResponse = normalizeResponse(wanResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process Wan Image response');
        }

        if (normalizedResponse.needsConversion && normalizedResponse.imageUrl) {
            const conversionResult = await urlToBase64(normalizedResponse.imageUrl);
            if (!conversionResult.success) {
                throw new Error(`Failed to convert image: ${conversionResult.error}`);
            }
            normalizedResponse.image = {
                data: conversionResult.data,
                mimeType: conversionResult.mimeType
            };
        }

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        usageLogged = await deductCreditAndTrack(req, startTime, 'filter', wanResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });
    } catch (error) {
        console.error('Error generating filter with Wan Image:', error);

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'filtered image', null, false, error.message);
        }

        res.status(500).json({
            error: 'Failed to generate filtered image',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Generate adjusted image endpoint
router.post('/generate-adjust', upload.single('image'), validateImageFile, validateAdjustmentGeneration, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;
    let uploadedFilename = null;

    try {
        const { adjustment, resolution = '2K', aspectRatio, nsfwFilterEnabled = 'false' } = req.body;
        const nsfwFilter = nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!adjustment) {
            return res.status(400).json({ error: 'No adjustment specified' });
        }

        const uploadResult = await uploadTemporaryImage(
            req.file.buffer,
            req.file.mimetype,
            req.user.userId
        );

        if (!uploadResult.success) {
            throw new Error(`Failed to upload image: ${uploadResult.error}`);
        }

        uploadedFilename = uploadResult.filename;

        // Wan uses direct aspect ratio strings
        const imageSize = aspectRatio || '1:1';
        if (aspectRatio) {
            console.log(`📐 Aspect ratio requested: ${aspectRatio}`);
        }

        const wanRequest = buildAdjustRequest([uploadResult.url], adjustment, resolution, imageSize, nsfwFilter);
        const wanResponse = await callWanImageAPI(wanRequest);
        const normalizedResponse = normalizeResponse(wanResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process Wan Image response');
        }

        if (normalizedResponse.needsConversion && normalizedResponse.imageUrl) {
            const conversionResult = await urlToBase64(normalizedResponse.imageUrl);
            if (!conversionResult.success) {
                throw new Error(`Failed to convert image: ${conversionResult.error}`);
            }
            normalizedResponse.image = {
                data: conversionResult.data,
                mimeType: conversionResult.mimeType
            };
        }

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        usageLogged = await deductCreditAndTrack(req, startTime, 'adjust', wanResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });
    } catch (error) {
        console.error('Error generating adjustment with Wan Image:', error);

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'adjusted image', null, false, error.message);
        }

        res.status(500).json({
            error: 'Failed to generate adjusted image',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Generate combined image endpoint
router.post('/combine-photos', uploadMultiple, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;
    let uploadedFilenames = [];

    try {
        const prompt = req.body?.prompt;
        const resolution = req.body?.resolution || '2K';
        const nsfwFilterRaw = req.body?.nsfwFilterEnabled ?? 'false';
        const nsfwFilter = nsfwFilterRaw === 'true' || nsfwFilterRaw === true;
        const imageFiles = req.files?.images || [];

        if (!imageFiles || imageFiles.length < 2) {
            return res.status(400).json({ error: 'At least 2 image files must be provided' });
        }
        if (imageFiles.length > 5) {
            return res.status(400).json({ error: 'Maximum 5 images allowed' });
        }
        if (!prompt) {
            return res.status(400).json({ error: 'No prompt provided' });
        }

        const imagesToUpload = imageFiles.map(file => ({
            buffer: file.buffer,
            mimeType: file.mimetype
        }));

        const uploadResult = await uploadMultipleImages(imagesToUpload, req.user.userId);

        if (!uploadResult.success) {
            throw new Error(`Failed to upload images: ${uploadResult.errors?.join(', ')}`);
        }

        uploadedFilenames = uploadResult.filenames;

        const wanRequest = buildCombineRequest(uploadResult.urls, prompt, resolution, '1:1', nsfwFilter);
        const wanResponse = await callWanImageAPI(wanRequest);
        const normalizedResponse = normalizeResponse(wanResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process Wan Image response');
        }

        if (normalizedResponse.needsConversion && normalizedResponse.imageUrl) {
            const conversionResult = await urlToBase64(normalizedResponse.imageUrl);
            if (!conversionResult.success) {
                throw new Error(`Failed to convert image: ${conversionResult.error}`);
            }
            normalizedResponse.image = {
                data: conversionResult.data,
                mimeType: conversionResult.mimeType
            };
        }

        if (uploadedFilenames.length > 0) {
            await deleteMultipleImages(uploadedFilenames);
        }

        usageLogged = await deductCreditAndTrack(req, startTime, 'combine', wanResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });
    } catch (error) {
        console.error('Error generating combined image with Wan Image:', error);

        if (uploadedFilenames.length > 0) {
            await deleteMultipleImages(uploadedFilenames);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'combined image', null, false, error.message);
        }

        res.status(500).json({
            error: 'Failed to generate combined image',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Text-to-image generation endpoint (no reference image required)
router.post('/generate-text-to-image', express.json(), checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const { prompt, resolution = '2K', aspectRatio = '1:1', nsfwFilterEnabled = false } = req.body;
        const nsfwFilter = nsfwFilterEnabled === true || nsfwFilterEnabled === 'true';

        if (!prompt) {
            return res.status(400).json({ error: 'No prompt provided' });
        }

        const wanRequest = buildTextToImageRequest(prompt, resolution, aspectRatio, nsfwFilter);
        const wanResponse = await callWanImageAPI(wanRequest);
        const normalizedResponse = normalizeResponse(wanResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process Wan Image response');
        }

        if (normalizedResponse.needsConversion && normalizedResponse.imageUrl) {
            const conversionResult = await urlToBase64(normalizedResponse.imageUrl);
            if (!conversionResult.success) {
                throw new Error(`Failed to convert image: ${conversionResult.error}`);
            }
            normalizedResponse.image = {
                data: conversionResult.data,
                mimeType: conversionResult.mimeType
            };
            delete normalizedResponse.imageUrl;
            delete normalizedResponse.needsConversion;
        }

        usageLogged = await deductCreditAndTrack(req, startTime, 'text-to-image', wanResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });
    } catch (error) {
        console.error('Error generating text-to-image with Wan Image:', error);

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'text-to-image', null, false, error.message);
        }

        // Check for NSFW errors
        const isNsfwError = error.message?.toLowerCase().includes('nsfw') || error.message?.toLowerCase().includes('content');

        res.status(isNsfwError ? 400 : 500).json({
            error: isNsfwError ? 'Content policy violation' : 'Failed to generate image from text',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;
