const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { db, supabase } = require('../utils/database');
const { getUser, requireAuth } = require('../middleware/auth');
const { 
    validateImageGeneration, 
    validateFilterGeneration, 
    validateAdjustmentGeneration, 
    validateImageFile 
} = require('../middleware/validation');

const router = express.Router();

// Configure multer for image uploads
const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Configure multer for multiple images with fields
const uploadMultiple = multer({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
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

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to convert file buffer to Google AI format
function bufferToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString('base64'),
            mimeType
        }
    };
}

// Helper function to report usage to Stripe meter
async function reportStripeUsage(clerkUserId) {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('stripe_customer_id')
            .eq('clerk_user_id', clerkUserId)
            .single();

        if (user?.stripe_customer_id) {
            await stripe.billing.meterEvents.create({
                event_name: 'gemini-image-call',
                payload: {
                    stripe_customer_id: user.stripe_customer_id,
                    value: '1'
                },
                timestamp: Math.floor(Date.now() / 1000)
            });
            console.log(`Usage reported to Stripe for customer ${user.stripe_customer_id}`);
        }
    } catch (error) {
        console.error('Error reporting usage to Stripe:', error);
    }
}

// Helper function to handle credit deduction and usage tracking
async function deductCreditAndTrack(req, startTime, requestType, result, success = true, errorMessage = null) {
    const { user } = req;

    console.log('🔍 CREDIT DEDUCT: Starting credit deduction and tracking', {
        userId: user?.userId,
        requestType,
        success
    });

    try {
        // Log the usage first
        const usageResult = await db.logUsage({
            userId: user.id,
            clerkUserId: user.userId,
            requestType,
            geminiRequestId: result?.id || 'unknown',
            imageSize: req.file?.size > 1024 * 1024 ? 'large' : 'medium',
            processingTimeMs: Date.now() - startTime,
            success,
            errorMessage
        });
        
        console.log('✅ CREDIT DEDUCT: Successfully logged usage');
        
        // Only deduct credits on successful requests
        if (success) {
            console.log('🔍 CREDIT DEDUCT: Deducting 1 credit for user:', user.userId);
            const deductResult = await db.deductUserCredit(user.userId);
            
            if (!deductResult.success) {
                console.error('🚨 CREDIT DEDUCT: Failed to deduct credit:', deductResult.error);
                // This shouldn't happen since we checked credits earlier, but handle gracefully
                return false;
            }
            
            console.log('✅ CREDIT DEDUCT: Successfully deducted 1 credit');
            
            // Update the credits info for the response
            if (req.creditsInfo) {
                req.creditsInfo.remaining = Math.max(0, req.creditsInfo.remaining - 1);
            }
        }
        
        console.log('✅ CREDIT DEDUCT: Credit deduction and tracking completed successfully');
        return true;
    } catch (error) {
        console.error('🚨 CREDIT DEDUCT: Exception in credit deduction and tracking:', error);
        console.error('🚨 CREDIT DEDUCT: Stack trace:', error.stack);
        return false;
    }
}

// Helper function to process Gemini response
function processGeminiResponse(response) {
    if (!response || !response.candidates || response.candidates.length === 0) {
        throw new Error('No response generated from Gemini API');
    }

    const parts = response.candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
        throw new Error('No content parts in response');
    }
    
    // Look for any part with inlineData
    const imagePart = parts.find(part => part.inlineData);
    if (!imagePart || !imagePart.inlineData) {
        throw new Error('No image data in response');
    }
    
    return imagePart;
}

// Helper function to handle endpoint errors
async function handleEndpointError(error, req, startTime, requestType, usageLogged) {
    console.error(`Error generating ${requestType}:`, error);

    if (!usageLogged) {
        await deductCreditAndTrack(req, startTime, requestType, null, false, error.message);
    }

    return {
        error: `Failed to generate ${requestType}`,
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
}

// Check user credits
async function checkUserCredits(req, res, next) {
    try {
        const { user } = req;

        console.log('🔍 CREDITS: Checking user credits for:', user.userId);

        try {
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

            // Store credits info for response
            req.creditsInfo = { remaining: credits };
            console.log('✅ CREDITS: User has sufficient credits:', credits);
            
        } catch (dbError) {
            console.error('🚨 CREDITS: Exception checking user credits:', dbError);
            return res.status(500).json({
                error: 'Failed to check credits',
                message: 'Please try again in a moment.'
            });
        }

        next();
    } catch (error) {
        console.error('🚨 CREDITS: Unexpected error checking credits:', error);
        console.error('🚨 CREDITS: Stack trace:', error.stack);
        
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

    try {
        const { prompt, x, y } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!prompt) {
            return res.status(400).json({ error: 'No prompt provided' });
        }

        const imagePart = bufferToGenerativePart(req.file.buffer, req.file.mimetype);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image-preview' });

        const enhancedPrompt = `You are an expert photo editor AI. Your task is to perform a natural, localized edit on the provided image based on the user's request.
User Request: "${prompt}"
Edit Location: ${x && y ? `Focus on the area around pixel coordinates (x: ${x}, y: ${y}).` : 'Apply edit to the most relevant area of the image.'}

Editing Guidelines:
- The edit must be realistic and blend seamlessly with the surrounding area
- The rest of the image (outside the immediate edit area) must remain identical to the original`;

        const result = await model.generateContent([enhancedPrompt, imagePart]);
        const response = await result.response;
        const generatedImage = processGeminiResponse(response);

        usageLogged = await deductCreditAndTrack(req, startTime, 'retouch', result);

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        const errorResponse = await handleEndpointError(error, req, startTime, 'edited image', usageLogged);
        res.status(500).json(errorResponse);
    }
});

// Generate filtered image endpoint
router.post('/generate-filter', upload.single('image'), validateImageFile, validateFilterGeneration, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const { filterType } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!filterType) {
            return res.status(400).json({ error: 'No filter type provided' });
        }

        const imagePart = bufferToGenerativePart(req.file.buffer, req.file.mimetype);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image-preview' });

        const filterPrompt = `You are an expert photo editor AI. Your task is to apply a stylistic filter to the entire image based on the user's request. Do not change the composition or content, only apply the style.
Filter Request: "${filterType}"`;

        const result = await model.generateContent([filterPrompt, imagePart]);
        const response = await result.response;
        const generatedImage = processGeminiResponse(response);

        usageLogged = await deductCreditAndTrack(req, startTime, 'filter', result);

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        const errorResponse = await handleEndpointError(error, req, startTime, 'filtered image', usageLogged);
        res.status(500).json(errorResponse);
    }
});

// Generate adjusted image endpoint
router.post('/generate-adjust', upload.single('image'), validateImageFile, validateAdjustmentGeneration, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const { adjustment } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!adjustment) {
            return res.status(400).json({ error: 'No adjustment specified' });
        }

        const imagePart = bufferToGenerativePart(req.file.buffer, req.file.mimetype);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image-preview' });

        const adjustmentPrompt = `You are an expert photo editor AI. Your task is to perform a natural, global adjustment to the entire image based on the user's request.
User Request: "${adjustment}"

Editing Guidelines:
- The adjustment must be applied across the entire image
- The result must be photorealistic`;

        const result = await model.generateContent([adjustmentPrompt, imagePart]);
        const response = await result.response;
        const generatedImage = processGeminiResponse(response);

        usageLogged = await deductCreditAndTrack(req, startTime, 'adjust', result);

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        const errorResponse = await handleEndpointError(error, req, startTime, 'adjusted image', usageLogged);
        res.status(500).json(errorResponse);
    }
});

// Generate combined image endpoint for multi-image mode
router.post('/combine-photos', uploadMultiple, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        // Debug logging
        console.log('req.files:', req.files);
        console.log('req.body:', req.body);
        console.log('req.body type:', typeof req.body);
        console.log('All req fields:', Object.keys(req));
        
        // Extract fields from req.body, which should be populated by multer
        const prompt = req.body?.prompt;
        const style = req.body?.style;

        // Get files from the images field
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

        // Validate each uploaded file
        for (const file of imageFiles) {
            if (file.size > 10 * 1024 * 1024) {
                return res.status(413).json({ error: 'One or more files exceed 10MB limit' });
            }
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!allowedTypes.includes(file.mimetype)) {
                return res.status(400).json({ error: 'Only JPEG, PNG, WebP, and GIF images are allowed' });
            }
        }

        // Convert all images to Gemini format
        const imageParts = imageFiles.map(file => 
            bufferToGenerativePart(file.buffer, file.mimetype)
        );

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image-preview' });

        const combinePrompt = `Combine these images into a single creative composition. ${prompt}${style ? ` Apply ${style} style.` : ''} Create a seamless, natural-looking result that blends the images harmoniously.`;

        console.log('📝 Sending request to Gemini with prompt:', combinePrompt);
        console.log('🖼️ Number of image parts:', imageParts.length);

        const result = await model.generateContent([combinePrompt, ...imageParts]);
        console.log('📥 Received response from Gemini');
        
        const response = await result.response;
        console.log('🔍 Processing Gemini response');
        
        const generatedImage = processGeminiResponse(response);
        console.log('✨ Generated image processed successfully');

        usageLogged = await deductCreditAndTrack(req, startTime, 'combine', result);

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        const errorResponse = await handleEndpointError(error, req, startTime, 'combined image', usageLogged);
        res.status(500).json(errorResponse);
    }
});

// Text-to-image generation endpoint using Imagen 4 Fast
router.post('/generate-text-to-image', express.json(), requireAuth, checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const { prompt } = req.body;

        console.log('🎨 Starting text-to-image generation');
        console.log('💬 Prompt:', prompt);

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

        // Use Imagen 4 Fast model for text-to-image generation via REST API
        const imagegenRequest = {
            instances: [{
                prompt: prompt.trim()
            }],
            parameters: {
                sampleCount: 1 // Generate only 1 image
            }
        };

        console.log('📝 Sending text-to-image request to Imagen 4 Fast');
        console.log('🎨 Prompt:', prompt.trim());

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict`, {
            method: 'POST',
            headers: {
                'x-goog-api-key': process.env.GEMINI_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(imagegenRequest)
        });

        if (!response.ok) {
            throw new Error(`Imagen API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('📥 Received response from Imagen 4 Fast');

        // Extract image data from Imagen response
        if (!result.predictions || !result.predictions[0] || !result.predictions[0].bytesBase64Encoded) {
            throw new Error('Invalid response from Imagen API - no image data found');
        }

        const imageBase64 = result.predictions[0].bytesBase64Encoded;
        console.log('✨ Generated image processed successfully');

        usageLogged = await deductCreditAndTrack(req, startTime, 'text-to-image', result);

        res.json({
            success: true,
            image: {
                data: imageBase64,
                mimeType: 'image/png'
            },
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo?.remaining || 0
        });

    } catch (error) {
        const errorResponse = await handleEndpointError(error, req, startTime, 'text-to-image', usageLogged);
        res.status(500).json(errorResponse);
    }
});

module.exports = router;