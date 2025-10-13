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
    urlToBase64,
    mapAspectRatioFileToSeedreamSize
} = require('../utils/seedreamAdapter');

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

// Helper function to create SeeDream task
async function createSeedreamTask(requestBody) {
    try {
        console.log('🌐 Creating SeeDream task');
        console.log('📝 Input parameters:', JSON.stringify(requestBody, null, 2));

        // Kie.ai expects parameters nested inside "input" object
        const payload = {
            model: 'bytedance/seedream-v4-edit',
            input: requestBody
        };

        console.log('📤 Full request payload:', JSON.stringify(payload, null, 2));

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
            throw new Error(`SeeDream API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ SeeDream task created:', result);

        // Kie.ai response format: { code: 200, message: "success", data: { taskId: "..." } }
        if (result.code !== 200 || !result.data || !result.data.taskId) {
            throw new Error(`Task creation failed: ${result.message || 'Unknown error'}`);
        }

        return result;

    } catch (error) {
        console.error('❌ SeeDream task creation failed:', error);
        throw error;
    }
}

// Helper function to poll SeeDream job status
async function pollSeedreamJob(taskId, maxAttempts = 60, intervalMs = 1000) {
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
                throw new Error(`Task status check failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            // Kie.ai response: { code: 200, message: "success", data: { state: "...", resultJson: "..." } }
            if (result.code !== 200) {
                throw new Error(`Task query failed: ${result.message || 'Unknown error'}`);
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
                throw new Error(`Task failed: ${taskData.failMsg || taskData.failCode || 'Unknown error'}`);
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
async function callSeedreamAPI(requestBody) {
    try {
        // Step 1: Create task
        const taskResponse = await createSeedreamTask(requestBody);

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

// Helper function to deduct credit and track usage (same as Gemini)
async function deductCreditAndTrack(req, startTime, requestType, result, success = true, errorMessage = null) {
    const { user } = req;

    console.log('🔍 CREDIT DEDUCT: Starting credit deduction and tracking', {
        userId: user?.userId,
        requestType,
        success
    });

    try {
        const usageResult = await db.logUsage({
            userId: user.id,
            clerkUserId: user.userId,
            requestType,
            geminiRequestId: 'seedream-' + Date.now(),
            imageSize: req.file?.size > 1024 * 1024 ? 'large' : 'medium',
            processingTimeMs: Date.now() - startTime,
            success,
            errorMessage
        });

        console.log('✅ CREDIT DEDUCT: Successfully logged usage');

        if (success) {
            console.log('🔍 CREDIT DEDUCT: Deducting 1 credit for user:', user.userId);
            const deductResult = await db.deductUserCredit(user.userId);

            if (!deductResult.success) {
                console.error('🚨 CREDIT DEDUCT: Failed to deduct credit:', deductResult.error);
                return false;
            }

            console.log('✅ CREDIT DEDUCT: Successfully deducted 1 credit');

            if (req.creditsInfo) {
                req.creditsInfo.remaining = Math.max(0, req.creditsInfo.remaining - 1);
            }
        }

        console.log('✅ CREDIT DEDUCT: Credit deduction and tracking completed successfully');
        return true;
    } catch (error) {
        console.error('🚨 CREDIT DEDUCT: Exception in credit deduction and tracking:', error);
        return false;
    }
}

// Check user credits (same as Gemini)
async function checkUserCredits(req, res, next) {
    try {
        const { user } = req;

        console.log('🔍 CREDITS: Checking user credits for:', user.userId);

        const { credits, error } = await db.getUserCredits(user.userId);

        if (error) {
            console.error('🚨 CREDITS: Database error getting user credits:', error);
            return res.status(500).json({
                error: 'Failed to check credits',
                message: 'Please try again in a moment.'
            });
        }

        console.log('🔍 CREDITS: User has credits:', credits);

        if (credits <= 0) {
            console.log('🚨 CREDITS: User has no credits remaining');
            return res.status(402).json({
                error: 'No credits remaining',
                message: 'You have used all your credits. Please purchase more credits to continue.',
                creditsRemaining: 0,
                requiresPayment: true
            });
        }

        req.creditsInfo = { remaining: credits };
        console.log('✅ CREDITS: User has sufficient credits:', credits);

        next();
    } catch (error) {
        console.error('🚨 CREDITS: Unexpected error checking credits:', error);

        res.status(500).json({
            error: 'Failed to check credits',
            message: 'Please try again in a moment.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// Apply authentication middleware to all routes
router.use(getUser, requireAuth);

// Generate edited image endpoint
router.post('/generate-edit', upload.single('image'), validateImageFile, validateImageGeneration, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;
    let uploadedFilename = null;

    try {
        const { prompt, x, y, resolution = '2K' } = req.body;

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
        console.log(`✅ Image uploaded for SeeDream: ${uploadResult.url}`);

        // Build SeeDream API request
        const seedreamRequest = buildEditRequest(
            [uploadResult.url],
            prompt,
            resolution,
            x ? parseInt(x) : null,
            y ? parseInt(y) : null
        );

        // Call SeeDream API
        const seedreamResponse = await callSeedreamAPI(seedreamRequest);

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
            creditsRemaining: req.creditsInfo?.remaining || 0
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
        const { filterType, resolution = '2K' } = req.body;

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
        const seedreamRequest = buildFilterRequest([uploadResult.url], filterType, resolution);
        const seedreamResponse = await callSeedreamAPI(seedreamRequest);

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
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        console.error('Error generating filter with SeeDream:', error);

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
        const { adjustment, resolution = '2K', aspectRatioFile } = req.body;

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

        // Map aspect ratio if provided
        let imageSize = 'square_hd'; // Default
        if (aspectRatioFile) {
            imageSize = mapAspectRatioFileToSeedreamSize(aspectRatioFile);
            console.log(`📐 Aspect ratio requested: ${aspectRatioFile} → ${imageSize}`);
        }

        // Build and call SeeDream API
        const seedreamRequest = buildAdjustRequest([uploadResult.url], adjustment, resolution, imageSize);
        const seedreamResponse = await callSeedreamAPI(seedreamRequest);

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
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        console.error('Error generating adjustment with SeeDream:', error);

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
        const seedreamRequest = buildCombineRequest(uploadResult.urls, prompt, resolution);
        const seedreamResponse = await callSeedreamAPI(seedreamRequest);

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
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        console.error('Error generating combined image with SeeDream:', error);

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

module.exports = router;
