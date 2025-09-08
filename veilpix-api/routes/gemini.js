const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { db } = require('../utils/database');
const { supabase } = require('../utils/database');
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
        // Get user's Stripe customer ID
        const { data: user } = await supabase
            .from('users')
            .select('stripe_customer_id')
            .eq('clerk_user_id', clerkUserId)
            .single();

        if (user?.stripe_customer_id) {
            // Report usage to Stripe meter
            await stripe.billing.meterEvents.create({
                event_name: 'gemini-image-call',
                payload: {
                    stripe_customer_id: user.stripe_customer_id,
                    value: '1' // Count each API call as 1 unit
                },
                timestamp: Math.floor(Date.now() / 1000)
            });
            console.log(`Usage reported to Stripe for customer ${user.stripe_customer_id}`);
        }
    } catch (error) {
        console.error('Error reporting usage to Stripe:', error);
        // Don't fail the request if Stripe reporting fails
    }
}

// Check usage limits
async function checkUsageLimits(req, res, next) {
    try {
        const { user } = req;
        const sessionId = req.headers['x-session-id'];
        const ipAddress = req.ip;

        if (user) {
            // Authenticated user - check monthly usage
            const usageCount = await db.getUserUsageCount(user.userId);
            // For now, authenticated users have unlimited usage (will be billed)
            // You could add plan-based limits here
            req.usageInfo = { type: 'authenticated', count: usageCount };
        } else {
            // Anonymous user - check free tier limit
            const { data: anonymousUsage } = await db.getAnonymousUsage(sessionId, ipAddress);
            const currentCount = anonymousUsage?.request_count || 0;
            
            if (currentCount >= 20) {
                return res.status(429).json({
                    error: 'Free tier limit exceeded',
                    message: 'You have reached the limit of 20 free requests. Please sign in to continue.',
                    limit: 20,
                    used: currentCount,
                    requiresAuth: true
                });
            }
            
            req.usageInfo = { type: 'anonymous', count: currentCount };
        }

        next();
    } catch (error) {
        console.error('Error checking usage limits:', error);
        res.status(500).json({ error: 'Failed to check usage limits' });
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
        const { user } = req;
        const sessionId = req.headers['x-session-id'];
        const ipAddress = req.ip;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        if (!prompt) {
            return res.status(400).json({ error: 'No prompt provided' });
        }

        // Convert image to Google AI format
        const imagePart = bufferToGenerativePart(req.file.buffer, req.file.mimetype);

        // Get Gemini model
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        // Enhanced prompt for localized editing
        const enhancedPrompt = `
        You are an advanced image editing AI. Please edit this image based on the user's request: "${prompt}"
        
        ${hotspotX && hotspotY ? `Focus the edit around the coordinates (${hotspotX}, ${hotspotY}) which the user clicked on the image.` : ''}
        
        Guidelines:
        - Make precise, localized edits that enhance the image
        - Maintain the overall composition and lighting
        - Ensure natural-looking results
        - If removing objects, fill the space naturally
        - If adding objects, ensure they fit the scene contextually
        - Preserve image quality and resolution
        
        Return only the edited image without any text response.
        `;

        // Generate content
        const result = await model.generateContent([enhancedPrompt, imagePart]);
        const response = await result.response;
        
        if (!response || !response.candidates || response.candidates.length === 0) {
            throw new Error('No response generated from Gemini API');
        }

        // Update usage tracking
        if (user) {
            await db.logUsage({
                userId: user.id,
                clerkUserId: user.userId,
                requestType: 'retouch',
                geminiRequestId: result.id || 'unknown',
                imageSize: req.file.size > 1024 * 1024 ? 'large' : 'medium',
                processingTimeMs: Date.now() - startTime,
                success: true
            });
            
            // Report usage to Stripe meter for billing
            await reportStripeUsage(user.userId);
            usageLogged = true;
        } else {
            // Update anonymous usage
            await db.updateAnonymousUsage(sessionId, ipAddress);
            usageLogged = true;
        }

        // Extract image data from response
        const generatedImage = response.candidates[0]?.content?.parts?.[0];
        
        if (!generatedImage || !generatedImage.inlineData) {
            throw new Error('No image data in response');
        }

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            usage: req.usageInfo
        });

    } catch (error) {
        console.error('Error generating edited image:', error);

        // Log failed usage
        if (!usageLogged) {
            try {
                if (req.user) {
                    await db.logUsage({
                        userId: req.user.id,
                        clerkUserId: req.user.userId,
                        requestType: 'retouch',
                        processingTimeMs: Date.now() - startTime,
                        success: false,
                        errorMessage: error.message
                    });
                }
            } catch (logError) {
                console.error('Error logging failed usage:', logError);
            }
        }

        res.status(500).json({
            error: 'Failed to generate edited image',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Generate filtered image endpoint
router.post('/generate-filter', upload.single('image'), validateImageFile, validateFilterGeneration, checkUsageLimits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const { style } = req.body;
        const { user } = req;
        const sessionId = req.headers['x-session-id'];
        const ipAddress = req.ip;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        if (!style) {
            return res.status(400).json({ error: 'No style provided' });
        }

        // Convert image to Google AI format
        const imagePart = bufferToGenerativePart(req.file.buffer, req.file.mimetype);

        // Get Gemini model
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        // Enhanced prompt for filtering
        const filterPrompt = `
        Apply a ${style} style/filter to this image. 
        
        Guidelines:
        - Apply the filter effect consistently across the entire image
        - Maintain image quality and sharpness
        - Preserve important details while applying the style
        - Ensure the result looks professional and polished
        - Do not add or remove objects, only apply the visual style
        
        Return only the filtered image without any text response.
        `;

        // Generate content
        const result = await model.generateContent([filterPrompt, imagePart]);
        const response = await result.response;
        
        if (!response || !response.candidates || response.candidates.length === 0) {
            throw new Error('No response generated from Gemini API');
        }

        // Update usage tracking
        if (user) {
            await db.logUsage({
                userId: user.id,
                clerkUserId: user.userId,
                requestType: 'filter',
                geminiRequestId: result.id || 'unknown',
                imageSize: req.file.size > 1024 * 1024 ? 'large' : 'medium',
                processingTimeMs: Date.now() - startTime,
                success: true
            });
            
            // Report usage to Stripe meter for billing
            await reportStripeUsage(user.userId);
            usageLogged = true;
        } else {
            await db.updateAnonymousUsage(sessionId, ipAddress);
            usageLogged = true;
        }

        // Extract image data from response
        const generatedImage = response.candidates[0]?.content?.parts?.[0];
        
        if (!generatedImage || !generatedImage.inlineData) {
            throw new Error('No image data in response');
        }

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            usage: req.usageInfo
        });

    } catch (error) {
        console.error('Error generating filtered image:', error);

        // Log failed usage
        if (!usageLogged) {
            try {
                if (req.user) {
                    await db.logUsage({
                        userId: req.user.id,
                        clerkUserId: req.user.userId,
                        requestType: 'filter',
                        processingTimeMs: Date.now() - startTime,
                        success: false,
                        errorMessage: error.message
                    });
                }
            } catch (logError) {
                console.error('Error logging failed usage:', logError);
            }
        }

        res.status(500).json({
            error: 'Failed to generate filtered image',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Generate adjusted image endpoint
router.post('/generate-adjust', upload.single('image'), validateImageFile, validateAdjustmentGeneration, checkUsageLimits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const { adjustment } = req.body;
        const { user } = req;
        const sessionId = req.headers['x-session-id'];
        const ipAddress = req.ip;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        if (!adjustment) {
            return res.status(400).json({ error: 'No adjustment specified' });
        }

        // Convert image to Google AI format
        const imagePart = bufferToGenerativePart(req.file.buffer, req.file.mimetype);

        // Get Gemini model
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        // Enhanced prompt for adjustments
        const adjustmentPrompt = `
        Apply the following adjustment to this image: ${adjustment}
        
        Guidelines:
        - Make professional photo adjustments
        - Maintain natural colors and lighting
        - Preserve image details and sharpness
        - Apply adjustments consistently across the image
        - Ensure the result looks realistic and well-balanced
        
        Return only the adjusted image without any text response.
        `;

        // Generate content
        const result = await model.generateContent([adjustmentPrompt, imagePart]);
        const response = await result.response;
        
        if (!response || !response.candidates || response.candidates.length === 0) {
            throw new Error('No response generated from Gemini API');
        }

        // Update usage tracking
        if (user) {
            await db.logUsage({
                userId: user.id,
                clerkUserId: user.userId,
                requestType: 'adjust',
                geminiRequestId: result.id || 'unknown',
                imageSize: req.file.size > 1024 * 1024 ? 'large' : 'medium',
                processingTimeMs: Date.now() - startTime,
                success: true
            });
            
            // Report usage to Stripe meter for billing
            await reportStripeUsage(user.userId);
            usageLogged = true;
        } else {
            await db.updateAnonymousUsage(sessionId, ipAddress);
            usageLogged = true;
        }

        // Extract image data from response
        const generatedImage = response.candidates[0]?.content?.parts?.[0];
        
        if (!generatedImage || !generatedImage.inlineData) {
            throw new Error('No image data in response');
        }

        res.json({
            success: true,
            image: generatedImage.inlineData,
            processingTime: Date.now() - startTime,
            usage: req.usageInfo
        });

    } catch (error) {
        console.error('Error generating adjusted image:', error);

        // Log failed usage
        if (!usageLogged) {
            try {
                if (req.user) {
                    await db.logUsage({
                        userId: req.user.id,
                        clerkUserId: req.user.userId,
                        requestType: 'adjust',
                        processingTimeMs: Date.now() - startTime,
                        success: false,
                        errorMessage: error.message
                    });
                }
            } catch (logError) {
                console.error('Error logging failed usage:', logError);
            }
        }

        res.status(500).json({
            error: 'Failed to generate adjusted image',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;