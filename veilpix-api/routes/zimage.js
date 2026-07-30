const express = require('express');
const { db } = require('../utils/database');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    IMAGE_WORKFLOWS,
    getImageCreditDetails
} = require('../utils/imageCreditPricing');
const {
    createKieApiError,
    getKieErrorHttpResponse
} = require('../utils/kieApiError');
const {
    buildTextToImageRequest,
    isSupportedZImageAspectRatio,
    normalizeResponse,
    urlToBase64
} = require('../utils/zImageAdapter');

const router = express.Router();

const ZIMAGE_API_KEY = process.env.SEEDREAM_API_KEY;
const ZIMAGE_API_URL = process.env.SEEDREAM_API_BASE_URL || 'https://api.kie.ai';
const ZIMAGE_MODEL = 'z-image';
const ZIMAGE_MAX_POLL_ATTEMPTS = 300;
const ZIMAGE_POLL_INTERVAL_MS = 1000;

function getCreditDetails() {
    const details = getImageCreditDetails('zimage', '1K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE);
    return { ...details, required: details.credits };
}

function sendZImageError(res, error) {
    const response = getKieErrorHttpResponse(error, 'Failed to generate image with Z-Image');
    const body = process.env.NODE_ENV === 'development' && response.status !== 400
        ? { ...response.body, details: error.stack }
        : response.body;
    return res.status(response.status).json(body);
}

async function createZImageTask(input) {
    const response = await fetch(`${ZIMAGE_API_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${ZIMAGE_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: ZIMAGE_MODEL,
            input
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw createKieApiError(
            `Z-Image API error: ${response.status} ${response.statusText}`,
            response.status,
            errorText
        );
    }

    const result = await response.json();
    if (result.code !== 200 || !result.data?.taskId) {
        throw createKieApiError(
            'Z-Image task creation failed',
            result.code,
            result.message || result.msg || 'Unknown error'
        );
    }

    return result.data.taskId;
}

async function pollZImageTask(taskId) {
    for (let attempt = 0; attempt < ZIMAGE_MAX_POLL_ATTEMPTS; attempt++) {
        const response = await fetch(`${ZIMAGE_API_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            headers: {
                'Authorization': `Bearer ${ZIMAGE_API_KEY}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw createKieApiError(
                `Z-Image task status check failed: ${response.status}`,
                response.status,
                errorText
            );
        }

        const result = await response.json();
        if (result.code !== 200) {
            throw createKieApiError(
                'Z-Image task query failed',
                result.code,
                result.message || result.msg || 'Unknown error'
            );
        }

        const taskData = result.data;
        if (attempt === 0 || (attempt + 1) % 30 === 0 || taskData.state === 'success' || taskData.state === 'fail') {
            console.log(`Z-Image task status (attempt ${attempt + 1}/${ZIMAGE_MAX_POLL_ATTEMPTS}): ${taskData.state}`);
        }

        if (taskData.state === 'success') {
            return JSON.parse(taskData.resultJson);
        }

        if (taskData.state === 'fail') {
            throw createKieApiError(
                'Z-Image task failed',
                taskData.failCode,
                taskData.failMsg || taskData.failCode || 'Unknown error'
            );
        }

        await new Promise(resolve => setTimeout(resolve, ZIMAGE_POLL_INTERVAL_MS));
    }

    throw new Error('Z-Image task polling timeout - exceeded maximum attempts');
}

async function checkUserCredits(req, res, next) {
    try {
        const creditDetails = getCreditDetails();
        const { credits, error } = await db.getUserCredits(req.user.userId);

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

async function trackUsage(req, startTime, success, errorMessage = null) {
    const creditDetails = req.creditsInfo || getCreditDetails();

    if (success) {
        const deduction = await db.deductUserCredits(req.user.userId, creditDetails.required);
        if (!deduction.success) {
            throw new Error('Unable to deduct image credits');
        }
        req.creditsInfo.remaining = Math.max(
            0,
            Math.round((req.creditsInfo.remaining - creditDetails.required) * 100) / 100
        );
    }

    try {
        await db.logUsage({
            userId: req.user.id,
            clerkUserId: req.user.userId,
            requestType: 'z-image text-to-image',
            costUsd: success ? creditDetails.costUsd : 0,
            chargedAmountUsd: success ? creditDetails.chargedAmountUsd : 0,
            geminiRequestId: `zimage-${Date.now()}`,
            imageSize: 'standard',
            processingTimeMs: Date.now() - startTime,
            success,
            errorMessage
        });
    } catch (logError) {
        console.error('Failed to log Z-Image usage:', logError);
    }
}

router.use(getUser, requireAuth, requireAllowedEmail);

router.post('/generate-text-to-image', express.json({ limit: '50kb' }), checkUserCredits, async (req, res) => {
    const startTime = Date.now();
    let usageLogged = false;

    try {
        const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
        const aspectRatio = req.body?.aspectRatio || '1:1';
        const nsfwFilter = req.body?.nsfwFilterEnabled !== false;

        if (prompt.length < 3 || prompt.length > 1000) {
            return res.status(400).json({
                error: 'Invalid prompt',
                message: 'Z-Image prompts must be between 3 and 1000 characters.'
            });
        }

        if (!isSupportedZImageAspectRatio(aspectRatio)) {
            return res.status(400).json({
                error: 'Invalid aspect ratio',
                message: 'Z-Image supports 1:1, 4:3, 3:4, 16:9, and 9:16.'
            });
        }

        const input = buildTextToImageRequest(prompt, aspectRatio, nsfwFilter);
        const taskId = await createZImageTask(input);
        const completedTask = await pollZImageTask(taskId);
        const normalizedResponse = normalizeResponse(completedTask);

        if (!normalizedResponse.success || !normalizedResponse.imageUrl) {
            throw new Error(normalizedResponse.error || 'Failed to process Z-Image response');
        }

        const conversionResult = await urlToBase64(normalizedResponse.imageUrl);
        if (!conversionResult.success) {
            throw new Error(`Failed to convert image: ${conversionResult.error}`);
        }

        await trackUsage(req, startTime, true);
        usageLogged = true;

        res.json({
            success: true,
            image: {
                data: conversionResult.data,
                mimeType: conversionResult.mimeType
            },
            processingTime: Date.now() - startTime,
            creditsRemaining: req.creditsInfo.remaining,
            creditsUsed: req.creditsInfo.required
        });
    } catch (error) {
        console.error('Error generating text-to-image with Z-Image:', error);

        if (!usageLogged) {
            await trackUsage(req, startTime, false, error.message);
        }

        sendZImageError(res, error);
    }
});

module.exports = router;
