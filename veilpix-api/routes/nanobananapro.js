/**
 * Nano Banana Pro (Google Gemini 3 Pro Image) API Routes
 *
 * Uses Kie.ai API infrastructure with the nano-banana-pro model.
 * Costs 2 credits per generation.
 */

const express = require('express');
const multer = require('multer');
const { db, supabase } = require('../utils/database');
const { getUser, requireAuth } = require('../middleware/auth');
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
    normalizeResponse,
    urlToBase64
} = require('../utils/nanobananaproAdapter');

const router = express.Router();

// Configure multer for image uploads
const upload = multer({
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit (supports 4K images)
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Configure multer for multiple images (Nano Banana Pro supports up to 8)
const uploadMultiple = multer({
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
}).fields([
    { name: 'images', maxCount: 8 },
    { name: 'prompt', maxCount: 1 },
    { name: 'style', maxCount: 1 }
]);

// API configuration (uses same key as SeeDream)
const API_KEY = process.env.SEEDREAM_API_KEY;
const API_URL = process.env.SEEDREAM_API_BASE_URL || 'https://api.kie.ai';
const CREDITS_PER_GENERATION = 2;

// Helper function to create Nano Banana Pro task
async function createNanoBananaProTask(requestBody) {
    try {
        // Kie.ai expects parameters nested inside "input" object
        const payload = {
            model: 'nano-banana-pro',
            input: requestBody
        };

        const response = await fetch(`${API_URL}/api/v1/jobs/createTask`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Nano Banana Pro API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();

        // Kie.ai response format: { code: 200, message: "success", data: { taskId: "..." } }
        if (result.code !== 200 || !result.data || !result.data.taskId) {
            throw new Error(`Task creation failed: ${result.msg || result.message || 'Unknown error'}`);
        }

        return result;

    } catch (error) {
        console.error('Nano Banana Pro task creation failed:', error);
        throw error;
    }
}

// Helper function to poll job status
// Timeout: 5 minutes (300 attempts) - Nano Banana Pro image editing takes ~2-3 minutes
async function pollJobStatus(taskId, maxAttempts = 300, intervalMs = 1000) {
    try {
        console.log(`Polling Nano Banana Pro task: ${taskId}`);

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const response = await fetch(`${API_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Task status check failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            if (result.code !== 200) {
                throw new Error(`Task query failed: ${result.msg || result.message || 'Unknown error'}`);
            }

            const taskData = result.data;
            const state = taskData.state;

            // Log progress every 30 seconds
            if (attempt % 30 === 0) {
                console.log(`Task ${taskId} status: ${state} (${attempt}s elapsed)`);
            }

            if (state === 'success') {
                console.log(`Task ${taskId} completed successfully`);
                const resultData = JSON.parse(taskData.resultJson);
                return resultData;
            }

            if (state === 'fail') {
                console.error(`Task ${taskId} failed:`, taskData.failMsg || taskData.failCode);
                throw new Error(`Task failed: ${taskData.failMsg || taskData.failCode || 'Unknown error'}`);
            }

            // States: waiting, queuing, generating - continue polling
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

        throw new Error('Task polling timeout - exceeded maximum attempts');

    } catch (error) {
        console.error('Task polling failed:', error);
        throw error;
    }
}

// Helper function to call API with full async flow
async function callNanoBananaProAPI(requestBody) {
    try {
        const taskResponse = await createNanoBananaProTask(requestBody);
        const taskId = taskResponse.data.taskId;
        console.log(`Nano Banana Pro task created: ${taskId}`);

        const completedJob = await pollJobStatus(taskId);
        return completedJob;

    } catch (error) {
        console.error('Nano Banana Pro API call failed:', error);
        throw error;
    }
}

// Helper function to deduct 2 credits and track usage
async function deductCreditsAndTrack(req, startTime, requestType, result, success = true, errorMessage = null) {
    const { user } = req;

    console.log('CREDIT DEDUCT: Starting credit deduction (2 credits) and tracking', {
        userId: user?.userId,
        requestType,
        success
    });

    try {
        const usageResult = await db.logUsage({
            userId: user.id,
            clerkUserId: user.userId,
            requestType,
            geminiRequestId: 'nanobananapro-' + Date.now(),
            imageSize: req.file?.size > 1024 * 1024 ? 'large' : 'medium',
            processingTimeMs: Date.now() - startTime,
            success,
            errorMessage
        });

        console.log('CREDIT DEDUCT: Successfully logged usage');

        if (success) {
            console.log('CREDIT DEDUCT: Deducting 2 credits for user:', user.userId);

            // Deduct 2 credits by calling the function twice
            const deductResult1 = await db.deductUserCredit(user.userId);
            if (!deductResult1.success) {
                console.error('CREDIT DEDUCT: Failed to deduct first credit:', deductResult1.error);
                return false;
            }

            const deductResult2 = await db.deductUserCredit(user.userId);
            if (!deductResult2.success) {
                console.error('CREDIT DEDUCT: Failed to deduct second credit:', deductResult2.error);
                return false;
            }

            console.log('CREDIT DEDUCT: Successfully deducted 2 credits');

            if (req.creditsInfo) {
                req.creditsInfo.remaining = Math.max(0, req.creditsInfo.remaining - CREDITS_PER_GENERATION);
            }
        }

        console.log('CREDIT DEDUCT: Credit deduction and tracking completed successfully');
        return true;
    } catch (error) {
        console.error('CREDIT DEDUCT: Exception in credit deduction and tracking:', error);
        return false;
    }
}

// Check user has at least 2 credits (Nano Banana Pro requirement)
async function checkUserCredits(req, res, next) {
    try {
        const { user } = req;

        console.log('CREDITS: Checking user credits for Nano Banana Pro:', user.userId);

        const { credits, error } = await db.getUserCredits(user.userId);

        if (error) {
            console.error('CREDITS: Database error getting user credits:', error);
            return res.status(500).json({
                error: 'Failed to check credits',
                message: 'Please try again in a moment.'
            });
        }

        console.log('CREDITS: User has credits:', credits);

        // Nano Banana Pro requires at least 2 credits
        if (credits < CREDITS_PER_GENERATION) {
            console.log('CREDITS: User has insufficient credits for Nano Banana Pro (needs 2)');
            return res.status(402).json({
                error: 'Insufficient credits',
                message: `Nano Banana Pro requires ${CREDITS_PER_GENERATION} credits per image. You have ${credits} credit(s) remaining.`,
                creditsRemaining: credits,
                creditsRequired: CREDITS_PER_GENERATION,
                requiresPayment: true
            });
        }

        req.creditsInfo = { remaining: credits };
        console.log('CREDITS: User has sufficient credits:', credits);

        next();
    } catch (error) {
        console.error('CREDITS: Unexpected error checking credits:', error);

        res.status(500).json({
            error: 'Failed to check credits',
            message: 'Please try again in a moment.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// Apply authentication middleware to all routes below
router.use(getUser, requireAuth);

// Generate edited image endpoint
router.post('/generate-edit', upload.single('image'), validateImageFile, validateImageGeneration, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;
    let uploadedFilename = null;

    try {
        const { prompt, x, y, resolution = '2K', aspectRatio = '1:1' } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!prompt) {
            return res.status(400).json({ error: 'No prompt provided' });
        }

        // Upload image to Supabase and get public URL
        const uploadResult = await uploadTemporaryImage(
            req.file.buffer,
            req.file.mimetype,
            req.user.userId
        );

        if (!uploadResult.success) {
            throw new Error(`Failed to upload image: ${uploadResult.error}`);
        }

        uploadedFilename = uploadResult.filename;
        console.log(`Image uploaded for Nano Banana Pro: ${uploadResult.url}`);

        // Build API request
        const apiRequest = buildEditRequest(
            [uploadResult.url],
            prompt,
            resolution,
            x ? parseInt(x) : null,
            y ? parseInt(y) : null,
            aspectRatio
        );

        // Call API
        const apiResponse = await callNanoBananaProAPI(apiRequest);

        // Normalize response
        const normalizedResponse = normalizeResponse(apiResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process response');
        }

        // Convert URL to base64 if needed
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

        // Clean up uploaded image
        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        usageLogged = await deductCreditsAndTrack(req, startTime, 'retouch', apiResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0,
            creditsUsed: CREDITS_PER_GENERATION
        });

    } catch (error) {
        console.error('Error generating edit with Nano Banana Pro:', error);

        // Clean up uploaded image on error
        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditsAndTrack(req, startTime, 'edited image', null, false, error.message);
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
        const { filterType, resolution = '2K', aspectRatio = '1:1' } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!filterType) {
            return res.status(400).json({ error: 'No filter type provided' });
        }

        // Upload image to Supabase
        const uploadResult = await uploadTemporaryImage(
            req.file.buffer,
            req.file.mimetype,
            req.user.userId
        );

        if (!uploadResult.success) {
            throw new Error(`Failed to upload image: ${uploadResult.error}`);
        }

        uploadedFilename = uploadResult.filename;

        // Build and call API
        const apiRequest = buildFilterRequest([uploadResult.url], filterType, resolution, aspectRatio);
        const apiResponse = await callNanoBananaProAPI(apiRequest);

        // Normalize response
        const normalizedResponse = normalizeResponse(apiResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process response');
        }

        // Convert URL to base64 if needed
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

        // Clean up
        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        usageLogged = await deductCreditsAndTrack(req, startTime, 'filter', apiResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0,
            creditsUsed: CREDITS_PER_GENERATION
        });

    } catch (error) {
        console.error('Error generating filter with Nano Banana Pro:', error);

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditsAndTrack(req, startTime, 'filtered image', null, false, error.message);
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
        const { adjustment, resolution = '2K', aspectRatio = '1:1' } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!adjustment) {
            return res.status(400).json({ error: 'No adjustment specified' });
        }

        // Upload image to Supabase
        const uploadResult = await uploadTemporaryImage(
            req.file.buffer,
            req.file.mimetype,
            req.user.userId
        );

        if (!uploadResult.success) {
            throw new Error(`Failed to upload image: ${uploadResult.error}`);
        }

        uploadedFilename = uploadResult.filename;

        console.log(`Aspect ratio requested: ${aspectRatio}`);

        // Build and call API
        const apiRequest = buildAdjustRequest([uploadResult.url], adjustment, resolution, aspectRatio);
        const apiResponse = await callNanoBananaProAPI(apiRequest);

        // Normalize response
        const normalizedResponse = normalizeResponse(apiResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process response');
        }

        // Convert URL to base64 if needed
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

        // Clean up
        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        usageLogged = await deductCreditsAndTrack(req, startTime, 'adjust', apiResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0,
            creditsUsed: CREDITS_PER_GENERATION
        });

    } catch (error) {
        console.error('Error generating adjustment with Nano Banana Pro:', error);

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditsAndTrack(req, startTime, 'adjusted image', null, false, error.message);
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
        const aspectRatio = req.body?.aspectRatio || '1:1';
        const imageFiles = req.files?.images || [];

        if (!imageFiles || imageFiles.length < 2) {
            return res.status(400).json({ error: 'At least 2 image files must be provided' });
        }
        if (imageFiles.length > 8) {
            return res.status(400).json({ error: 'Maximum 8 images allowed for Nano Banana Pro' });
        }
        if (!prompt) {
            return res.status(400).json({ error: 'No prompt provided' });
        }

        // Upload all images to Supabase
        const imagesToUpload = imageFiles.map(file => ({
            buffer: file.buffer,
            mimeType: file.mimetype
        }));

        const uploadResult = await uploadMultipleImages(imagesToUpload, req.user.userId);

        if (!uploadResult.success) {
            throw new Error(`Failed to upload images: ${uploadResult.errors?.join(', ')}`);
        }

        uploadedFilenames = uploadResult.filenames;

        // Build and call API
        const apiRequest = buildCombineRequest(uploadResult.urls, prompt, resolution, aspectRatio);
        const apiResponse = await callNanoBananaProAPI(apiRequest);

        // Normalize response
        const normalizedResponse = normalizeResponse(apiResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process response');
        }

        // Convert URL to base64 if needed
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

        // Clean up
        if (uploadedFilenames.length > 0) {
            await deleteMultipleImages(uploadedFilenames);
        }

        usageLogged = await deductCreditsAndTrack(req, startTime, 'combine', apiResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0,
            creditsUsed: CREDITS_PER_GENERATION
        });

    } catch (error) {
        console.error('Error generating combined image with Nano Banana Pro:', error);

        if (uploadedFilenames.length > 0) {
            await deleteMultipleImages(uploadedFilenames);
        }

        if (!usageLogged) {
            await deductCreditsAndTrack(req, startTime, 'combined image', null, false, error.message);
        }

        res.status(500).json({
            error: 'Failed to generate combined image',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;
