const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { db, supabase } = require('../utils/database');
const { getUser } = require('../middleware/auth');
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
        const { data: user } = await supabase()
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

// Helper function to handle usage tracking
async function trackUsage(req, startTime, requestType, result, success = true, errorMessage = null) {
    const { user } = req;
    const sessionId = req.headers['x-session-id'];
    const ipAddress = req.ip;

    console.log('🔍 TRACK USAGE: Starting usage tracking', {
        hasUser: !!user,
        sessionId,
        ipAddress,
        requestType,
        success
    });

    try {
        if (user) {
            console.log('🔍 TRACK USAGE: Logging usage for authenticated user:', user.userId);
            
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
            
            console.log('✅ TRACK USAGE: Successfully logged authenticated usage');
            
            if (success) {
                console.log('🔍 TRACK USAGE: Reporting to Stripe for user:', user.userId);
                await reportStripeUsage(user.userId);
                console.log('✅ TRACK USAGE: Successfully reported to Stripe');
            }
        } else {
            if (!sessionId) {
                console.warn('⚠️ TRACK USAGE: No session ID provided for anonymous user');
                return false;
            }
            
            console.log('🔍 TRACK USAGE: Updating anonymous usage for session:', sessionId);
            const updateResult = await db.updateAnonymousUsage(sessionId, ipAddress);
            
            if (updateResult.error) {
                console.error('🚨 TRACK USAGE: Failed to update anonymous usage:', updateResult.error);
                return false;
            }
            
            console.log('✅ TRACK USAGE: Successfully updated anonymous usage, new count:', updateResult.data?.request_count);
        }
        
        console.log('✅ TRACK USAGE: Usage tracking completed successfully');
        return true;
    } catch (error) {
        console.error('🚨 TRACK USAGE: Exception in usage tracking:', error);
        console.error('🚨 TRACK USAGE: Stack trace:', error.stack);
        
        // Try to log the failure for debugging
        try {
            console.log('🔍 TRACK USAGE: Attempting to log tracking failure...');
            // Could implement a fallback logging mechanism here
        } catch (fallbackError) {
            console.error('🚨 TRACK USAGE: Fallback logging also failed:', fallbackError);
        }
        
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
        await trackUsage(req, startTime, requestType, null, false, error.message);
    }

    return {
        error: `Failed to generate ${requestType}`,
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
}

// Check usage limits
async function checkUsageLimits(req, res, next) {
    try {
        const { user } = req;
        const sessionId = req.headers['x-session-id'];
        const ipAddress = req.ip;

        console.log('🔍 USAGE LIMITS: Checking usage limits', {
            hasUser: !!user,
            sessionId,
            ipAddress
        });

        if (user) {
            console.log('🔍 USAGE LIMITS: Checking authenticated user usage for:', user.userId);
            
            try {
                const usageCount = await db.getUserUsageCount(user.userId);
                console.log('✅ USAGE LIMITS: Authenticated user usage count:', usageCount);
                
                // For now, authenticated users have unlimited usage (will be billed)
                // You could add plan-based limits here
                req.usageInfo = { type: 'authenticated', count: usageCount };
            } catch (dbError) {
                console.error('🚨 USAGE LIMITS: Database error for authenticated user:', dbError);
                // Continue with caution - could implement fallback logic here
                req.usageInfo = { type: 'authenticated', count: 0 };
            }
        } else {
            if (!sessionId) {
                console.warn('⚠️ USAGE LIMITS: No session ID provided for anonymous user');
                return res.status(400).json({
                    error: 'Session required',
                    message: 'Please refresh the page and try again.',
                    requiresSessionId: true
                });
            }

            console.log('🔍 USAGE LIMITS: Checking anonymous usage for session:', sessionId);
            
            try {
                const { data: anonymousUsage, error: fetchError } = await db.getAnonymousUsage(sessionId, ipAddress);
                
                if (fetchError) {
                    console.error('🚨 USAGE LIMITS: Error fetching anonymous usage:', fetchError);
                    // On error, allow the request but with conservative limits
                    req.usageInfo = { type: 'anonymous', count: 0 };
                    return next();
                }
                
                const currentCount = anonymousUsage?.request_count || 0;
                console.log('🔍 USAGE LIMITS: Anonymous user current count:', currentCount);
                
                if (currentCount >= 20) {
                    console.log('🚨 USAGE LIMITS: Anonymous user limit exceeded:', currentCount);
                    return res.status(429).json({
                        error: 'Free tier limit exceeded',
                        message: 'You have reached the limit of 20 free requests. Please sign in to continue.',
                        limit: 20,
                        used: currentCount,
                        remaining: 0,
                        requiresAuth: true
                    });
                }
                
                req.usageInfo = { 
                    type: 'anonymous', 
                    count: currentCount,
                    remaining: 20 - currentCount 
                };
                
                console.log('✅ USAGE LIMITS: Anonymous user within limits:', {
                    used: currentCount,
                    remaining: 20 - currentCount
                });
            } catch (dbError) {
                console.error('🚨 USAGE LIMITS: Database error for anonymous user:', dbError);
                // On database error, be conservative and allow the request
                req.usageInfo = { type: 'anonymous', count: 0 };
            }
        }

        next();
    } catch (error) {
        console.error('🚨 USAGE LIMITS: Unexpected error checking usage limits:', error);
        console.error('🚨 USAGE LIMITS: Stack trace:', error.stack);
        
        res.status(500).json({ 
            error: 'Failed to check usage limits',
            message: 'Please try again in a moment.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// Apply user middleware to all routes
router.use(getUser);

// Generate edited image endpoint
router.post('/generate-edit', upload.single('image'), validateImageFile, validateImageGeneration, checkUsageLimits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const { prompt, hotspotX, hotspotY } = req.body;

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
Edit Location: ${hotspotX && hotspotY ? `Focus on the area around pixel coordinates (x: ${hotspotX}, y: ${hotspotY}).` : 'Apply edit to the most relevant area of the image.'}

Editing Guidelines:
- The edit must be realistic and blend seamlessly with the surrounding area
- The rest of the image (outside the immediate edit area) must remain identical to the original

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final edited image. Do not return text.`;

        const result = await model.generateContent([enhancedPrompt, imagePart]);
        const response = await result.response;
        const generatedImage = processGeminiResponse(response);

        usageLogged = await trackUsage(req, startTime, 'retouch', result);

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            usage: req.usageInfo
        });

    } catch (error) {
        const errorResponse = await handleEndpointError(error, req, startTime, 'edited image', usageLogged);
        res.status(500).json(errorResponse);
    }
});

// Generate filtered image endpoint
router.post('/generate-filter', upload.single('image'), validateImageFile, validateFilterGeneration, checkUsageLimits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const { style } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        if (!style) {
            return res.status(400).json({ error: 'No style provided' });
        }

        const imagePart = bufferToGenerativePart(req.file.buffer, req.file.mimetype);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image-preview' });

        const filterPrompt = `You are an expert photo editor AI. Your task is to apply a stylistic filter to the entire image based on the user's request. Do not change the composition or content, only apply the style.
Filter Request: "${style}"

Safety & Ethics Policy:
- Filters may subtly shift colors, but you MUST ensure they do not alter a person's fundamental race or ethnicity.
- You MUST REFUSE any request that explicitly asks to change a person's race (e.g., 'apply a filter to make me look Chinese').

Output: Return ONLY the final filtered image. Do not return text.`;

        const result = await model.generateContent([filterPrompt, imagePart]);
        const response = await result.response;
        const generatedImage = processGeminiResponse(response);

        usageLogged = await trackUsage(req, startTime, 'filter', result);

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            usage: req.usageInfo
        });

    } catch (error) {
        const errorResponse = await handleEndpointError(error, req, startTime, 'filtered image', usageLogged);
        res.status(500).json(errorResponse);
    }
});

// Generate adjusted image endpoint
router.post('/generate-adjust', upload.single('image'), validateImageFile, validateAdjustmentGeneration, checkUsageLimits, async (req, res) => {
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
- The result must be photorealistic

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final adjusted image. Do not return text.`;

        const result = await model.generateContent([adjustmentPrompt, imagePart]);
        const response = await result.response;
        const generatedImage = processGeminiResponse(response);

        usageLogged = await trackUsage(req, startTime, 'adjust', result);

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            usage: req.usageInfo
        });

    } catch (error) {
        const errorResponse = await handleEndpointError(error, req, startTime, 'adjusted image', usageLogged);
        res.status(500).json(errorResponse);
    }
});

// Generate combined image endpoint for multi-image mode
router.post('/combine-photos', uploadMultiple, checkUsageLimits, async (req, res) => {
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

        usageLogged = await trackUsage(req, startTime, 'combine', result);

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            usage: req.usageInfo
        });

    } catch (error) {
        const errorResponse = await handleEndpointError(error, req, startTime, 'combined image', usageLogged);
        res.status(500).json(errorResponse);
    }
});

module.exports = router;