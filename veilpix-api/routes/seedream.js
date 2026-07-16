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
    urlToBase64,
    mapAspectRatioFileToSeedreamSize
} = require('../utils/seedreamAdapter');
const {
    IMAGE_WORKFLOWS,
    getImageCreditDetails,
    normalizeSeedreamTier
} = require('../utils/imageCreditPricing');
const {
    createKieApiError,
    getKieErrorHttpResponse
} = require('../utils/kieApiError');

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

// Configure multer for multiple images
const uploadMultiple = multer({
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
}).fields([
    { name: 'images', maxCount: 5 },
    { name: 'prompt', maxCount: 1 },
    { name: 'style', maxCount: 1 }
]);

// SeeDream API configuration
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY;
const SEEDREAM_API_URL = process.env.SEEDREAM_API_BASE_URL || 'https://api.kie.ai';
const IMAGE_PROVIDER = 'seedream';

function getWorkflowForRequest(req) {
    return req.path === '/generate-text-to-image' ? IMAGE_WORKFLOWS.TEXT_TO_IMAGE : IMAGE_WORKFLOWS.IMAGE_TO_IMAGE;
}

function getCreditDetailsForRequest(req) {
    const imageCount = req.files?.images?.length || (req.file ? 1 : 0);
    const details = getImageCreditDetails(
        IMAGE_PROVIDER,
        req.body?.resolution,
        getWorkflowForRequest(req),
        req.body?.seedreamTier,
        imageCount
    );
    return { ...details, required: details.credits };
}

function getSeedreamModel(seedreamTier, workflow) {
    const tier = normalizeSeedreamTier(seedreamTier);
    const mode = workflow === IMAGE_WORKFLOWS.TEXT_TO_IMAGE ? 'text-to-image' : 'image-to-image';
    return `seedream/5-${tier}-${mode}`;
}

function sendSeedreamError(res, error, fallbackError) {
    const response = getKieErrorHttpResponse(error, fallbackError);
    const body = process.env.NODE_ENV === 'development' && response.status !== 400
        ? { ...response.body, details: error.stack }
        : response.body;

    return res.status(response.status).json(body);
}

// Helper function to create SeeDream task
async function createSeedreamTask(requestBody, model) {
    try {
        console.log('🌐 Creating SeeDream task');
        console.log('📝 SeeDream request summary:', {
            model,
            imageCount: Array.isArray(requestBody.image_urls) ? requestBody.image_urls.length : 0,
            resolution: requestBody.resolution,
            aspectRatio: requestBody.aspect_ratio
        });

        // Kie.ai expects parameters nested inside "input" object
        const payload = {
            model,
            input: requestBody
        };

        const response = await fetch(`${SEEDREAM_API_URL}/api/v1/jobs/createTask`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw createKieApiError(
                `SeeDream API error: ${response.status} ${response.statusText}`,
                response.status,
                errorText
            );
        }

        const result = await response.json();
        console.log('✅ SeeDream task created:', result.data?.taskId);

        // Kie.ai response format: { code: 200, message: "success", data: { taskId: "..." } }
        if (result.code !== 200 || !result.data || !result.data.taskId) {
            throw createKieApiError(
                'Task creation failed',
                result.code,
                result.message || result.msg || 'Unknown error'
            );
        }

        return result;

    } catch (error) {
        console.error('❌ SeeDream task creation failed:', error);
        throw error;
    }
}

// Helper function to poll SeeDream job status
async function pollSeedreamJob(taskId, maxAttempts = 120, intervalMs = 1000) {
    try {
        console.log(`⏳ Polling SeeDream task: ${taskId}`);

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const response = await fetch(`${SEEDREAM_API_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${SEEDREAM_API_KEY}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw createKieApiError(
                    `Task status check failed: ${response.status}`,
                    response.status,
                    errorText
                );
            }

            const result = await response.json();

            // Kie.ai response: { code: 200, message: "success", data: { state: "...", resultJson: "..." } }
            if (result.code !== 200) {
                throw createKieApiError(
                    'Task query failed',
                    result.code,
                    result.message || result.msg || 'Unknown error'
                );
            }

            const taskData = result.data;
            const state = taskData.state;

            console.log(`📊 Task status (attempt ${attempt + 1}/${maxAttempts}): ${state}`);

            if (state === 'success') {
                console.log('✅ Task completed successfully');

                // Parse resultJson string to get resultUrls
                const resultData = JSON.parse(taskData.resultJson);
                return resultData;
            }

            if (state === 'fail') {
                throw createKieApiError(
                    'Task failed',
                    taskData.failCode,
                    taskData.failMsg || taskData.failCode || 'Unknown error'
                );
            }

            // States: waiting, queuing, generating - continue polling
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

        throw new Error('Task polling timeout - exceeded maximum attempts');

    } catch (error) {
        console.error('❌ Task polling failed:', error);
        throw error;
    }
}

// Helper function to call SeeDream API with full async flow
async function callSeedreamAPI(requestBody, model) {
    try {
        // Step 1: Create task
        const taskResponse = await createSeedreamTask(requestBody, model);

        // Extract taskId from Kie.ai response
        const taskId = taskResponse.data.taskId;
        console.log(`📋 Task created with ID: ${taskId}`);

        // Step 2: Poll for completion
        const completedJob = await pollSeedreamJob(taskId);

        // Step 3: Return result
        return completedJob;

    } catch (error) {
        console.error('❌ SeeDream API call failed:', error);
        throw error;
    }
}

// Helper function to deduct the selected image credits and track usage
async function deductCreditAndTrack(req, startTime, requestType, result, success = true, errorMessage = null) {
    const { user } = req;
    const creditDetails = req.creditsInfo || getCreditDetailsForRequest(req);
    const creditsToDeduct = creditDetails.required || creditDetails.credits || 1;

    try {
        if (success) {
            const deductResult = await db.deductUserCredits(user.userId, creditsToDeduct);
            if (!deductResult.success) {
                throw new Error('Unable to deduct image credits');
            }

            if (req.creditsInfo) {
                req.creditsInfo.remaining = Math.max(0, Math.round((req.creditsInfo.remaining - creditsToDeduct) * 100) / 100);
            }
        }

        try {
            await db.logUsage({
            userId: user.id,
            clerkUserId: user.userId,
            requestType,
            costUsd: success ? creditDetails.costUsd : 0,
            chargedAmountUsd: success ? creditDetails.chargedAmountUsd : 0,
            geminiRequestId: 'seedream-' + Date.now(),
            imageSize: req.file?.size > 1024 * 1024 ? 'large' : 'medium',
            processingTimeMs: Date.now() - startTime,
            success,
            errorMessage
            });
        } catch (logError) {
            console.error('Failed to log Seedream usage:', logError);
        }

        return true;
    } catch (error) {
        console.error('Exception in image credit deduction and tracking:', error);
        throw error;
    }
}

// Check user credits
async function checkUserCredits(req, res, next) {
    try {
        const { user } = req;
        const creditDetails = getCreditDetailsForRequest(req);
        const { credits, error } = await db.getUserCredits(user.userId);

        if (error) {
            return res.status(500).json({
                error: 'Failed to check credits',
                message: 'Please try again in a moment.'
            });
        }

        if (credits < creditDetails.required) {
            return res.status(402).json({
                error: 'Insufficient credits',
                message: `${creditDetails.required} credit(s) required for this image generation. You have ${credits} credit(s) remaining.`,
                creditsRemaining: credits,
                creditsRequired: creditDetails.required,
                requiresPayment: true
            });
        }

        if (req.body) {
            req.body.resolution = creditDetails.resolution;
            req.body.seedreamTier = creditDetails.seedreamTier;
        }
        req.creditsInfo = { remaining: credits, ...creditDetails };
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
        const { prompt, x, y, resolution = '2K', aspectRatio = '1:1', seedreamTier = 'lite', outputFormat = 'png', nsfwFilterEnabled = 'true' } = req.body;
        const nsfwFilter = nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true;

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
        console.log('✅ Image uploaded for SeeDream');

        // Build SeeDream API request
        const seedreamRequest = buildEditRequest(
            [uploadResult.url],
            prompt,
            resolution,
            x ? parseInt(x) : null,
            y ? parseInt(y) : null,
            aspectRatio,
            nsfwFilter,
            seedreamTier,
            outputFormat
        );

        // Call Seedream 5 image-to-image API
        const seedreamResponse = await callSeedreamAPI(
            seedreamRequest,
            getSeedreamModel(seedreamTier, IMAGE_WORKFLOWS.IMAGE_TO_IMAGE)
        );

        // Normalize response to match Gemini format
        const normalizedResponse = normalizeResponse(seedreamResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process SeeDream response');
        }

        // If response needs URL-to-base64 conversion
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

        usageLogged = await deductCreditAndTrack(req, startTime, 'retouch', seedreamResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0,
            creditsUsed: req.creditsInfo?.required || 1
        });

    } catch (error) {
        console.error('Error generating edit with SeeDream:', error);

        // Clean up uploaded image on error
        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'edited image', null, false, error.message);
        }

        sendSeedreamError(res, error, 'Failed to generate edited image');
    }
});

// Generate filtered image endpoint
router.post('/generate-filter', upload.single('image'), validateImageFile, validateFilterGeneration, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;
    let uploadedFilename = null;

    try {
        const { filterType, resolution = '2K', aspectRatio = '1:1', seedreamTier = 'lite', outputFormat = 'png', nsfwFilterEnabled = 'true' } = req.body;
        const nsfwFilter = nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true;

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

        // Build and call SeeDream API
        const seedreamRequest = buildFilterRequest([uploadResult.url], filterType, resolution, aspectRatio, nsfwFilter, seedreamTier, outputFormat);
        const seedreamResponse = await callSeedreamAPI(seedreamRequest, getSeedreamModel(seedreamTier, IMAGE_WORKFLOWS.IMAGE_TO_IMAGE));

        // Normalize response
        const normalizedResponse = normalizeResponse(seedreamResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process SeeDream response');
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

        usageLogged = await deductCreditAndTrack(req, startTime, 'filter', seedreamResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0,
            creditsUsed: req.creditsInfo?.required || 1
        });

    } catch (error) {
        console.error('Error generating filter with SeeDream:', error);

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'filtered image', null, false, error.message);
        }

        sendSeedreamError(res, error, 'Failed to generate filtered image');
    }
});

// Generate adjusted image endpoint
router.post('/generate-adjust', upload.single('image'), validateImageFile, validateAdjustmentGeneration, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;
    let uploadedFilename = null;

    try {
        const { adjustment, resolution = '2K', aspectRatio, aspectRatioFile, seedreamTier = 'lite', outputFormat = 'png', nsfwFilterEnabled = 'true' } = req.body;
        const nsfwFilter = nsfwFilterEnabled === 'true' || nsfwFilterEnabled === true;

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

        // Map an older template filename when a direct Seedream 5 ratio was not supplied.
        let imageSize = aspectRatio || '1:1';
        if (aspectRatioFile && !aspectRatio) {
            imageSize = mapAspectRatioFileToSeedreamSize(aspectRatioFile);
            console.log(`📐 Aspect ratio requested: ${aspectRatioFile} → ${imageSize}`);
        } else if (aspectRatio) {
            console.log(`📐 Aspect ratio requested: ${aspectRatio}`);
        }

        // Build and call SeeDream API
        const seedreamRequest = buildAdjustRequest([uploadResult.url], adjustment, resolution, imageSize, nsfwFilter, seedreamTier, outputFormat);
        const seedreamResponse = await callSeedreamAPI(seedreamRequest, getSeedreamModel(seedreamTier, IMAGE_WORKFLOWS.IMAGE_TO_IMAGE));

        // Normalize response
        const normalizedResponse = normalizeResponse(seedreamResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process SeeDream response');
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

        usageLogged = await deductCreditAndTrack(req, startTime, 'adjust', seedreamResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0,
            creditsUsed: req.creditsInfo?.required || 1
        });

    } catch (error) {
        console.error('Error generating adjustment with SeeDream:', error);

        if (uploadedFilename) {
            await deleteTemporaryImage(uploadedFilename);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'adjusted image', null, false, error.message);
        }

        sendSeedreamError(res, error, 'Failed to generate adjusted image');
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
        const seedreamTier = req.body?.seedreamTier || 'lite';
        const outputFormat = req.body?.outputFormat || 'png';
        const nsfwFilterRaw = req.body?.nsfwFilterEnabled ?? 'true';
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

        // Build and call SeeDream API
        const seedreamRequest = buildCombineRequest(uploadResult.urls, prompt, resolution, aspectRatio, nsfwFilter, seedreamTier, outputFormat);
        const seedreamResponse = await callSeedreamAPI(
            seedreamRequest,
            getSeedreamModel(seedreamTier, IMAGE_WORKFLOWS.IMAGE_TO_IMAGE)
        );

        // Normalize response
        const normalizedResponse = normalizeResponse(seedreamResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process SeeDream response');
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

        usageLogged = await deductCreditAndTrack(req, startTime, 'combine', seedreamResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0,
            creditsUsed: req.creditsInfo?.required || 1
        });

    } catch (error) {
        console.error('Error generating combined image with SeeDream:', error);

        if (uploadedFilenames.length > 0) {
            await deleteMultipleImages(uploadedFilenames);
        }

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'combined image', null, false, error.message);
        }

        sendSeedreamError(res, error, 'Failed to generate combined image');
    }
});

// Text-to-image generation endpoint
router.post('/generate-text-to-image', express.json(), checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const {
            prompt,
            resolution = '2K',
            aspectRatio = '1:1',
            seedreamTier = 'lite',
            outputFormat = 'png',
            nsfwFilterEnabled = true
        } = req.body;
        const nsfwFilter = nsfwFilterEnabled === true || nsfwFilterEnabled === 'true';

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return res.status(400).json({
                error: 'Prompt is required and must be a non-empty string'
            });
        }

        if (prompt.length > 2000) {
            return res.status(400).json({
                error: 'Prompt must be 2000 characters or less'
            });
        }

        const seedreamRequest = buildTextToImageRequest(
            prompt.trim(),
            resolution,
            aspectRatio,
            nsfwFilter,
            seedreamTier,
            outputFormat
        );

        const seedreamResponse = await callSeedreamAPI(
            seedreamRequest,
            getSeedreamModel(seedreamTier, IMAGE_WORKFLOWS.TEXT_TO_IMAGE)
        );

        const normalizedResponse = normalizeResponse(seedreamResponse);

        if (!normalizedResponse.success) {
            throw new Error(normalizedResponse.error || 'Failed to process SeeDream response');
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

        usageLogged = await deductCreditAndTrack(req, startTime, 'text-to-image', seedreamResponse);

        res.json({
            success: true,
            image: normalizedResponse.image,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0,
            creditsUsed: req.creditsInfo?.required || 1
        });

    } catch (error) {
        console.error('Error generating text-to-image with SeeDream:', error);

        if (!usageLogged) {
            await deductCreditAndTrack(req, startTime, 'text-to-image', null, false, error.message);
        }

        sendSeedreamError(res, error, 'Failed to generate image from text');
    }
});

module.exports = router;
