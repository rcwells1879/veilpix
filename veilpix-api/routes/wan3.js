const express = require('express');
const { db } = require('../utils/database');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    copyProviderInputToKie,
    createProviderInputUploads,
    deleteProviderInputs
} = require('../utils/providerInput');
const {
    buildWan3Request,
    estimateWan3KieCredits,
    estimateWan3VeilPixCredits,
    normalizeWan3Response,
    normalizeWan3Resolution,
    normalizeWan3Variant,
    veilpixCreditsFromKieCredits
} = require('../utils/wan3Adapter');
const {
    getVideoGenerationId,
    serializeVideoGenerationResult
} = require('../utils/videoGenerationJob');

const router = express.Router();
const WAN_API_KEY = process.env.SEEDREAM_API_KEY;
const WAN_API_URL = process.env.SEEDREAM_API_BASE_URL || 'https://api.kie.ai';

function boolValue(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
}

function flattenUploads(uploads = {}) {
    return [
        uploads.firstFrame,
        uploads.lastFrame,
        ...(Array.isArray(uploads.referenceImages) ? uploads.referenceImages : []),
        ...(Array.isArray(uploads.referenceVideos) ? uploads.referenceVideos : []),
        ...(Array.isArray(uploads.referenceAudios) ? uploads.referenceAudios : []),
        uploads.referenceFile
    ].filter(Boolean);
}

function validatePublicLink(value) {
    if (!value) return null;
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Reference link must use HTTP or HTTPS');
    return parsed.toString();
}

async function createWan3Task(payload) {
    const response = await fetch(`${WAN_API_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${WAN_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.code !== 200 || !result?.data?.taskId) {
        throw new Error(`Wan 3.0 task creation failed (${response.status}): ${result?.message || result?.msg || 'unknown error'}`);
    }
    return result.data.taskId;
}

async function pollWan3Task(taskId, maxAttempts = 900, intervalMs = 2000) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const response = await fetch(`${WAN_API_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
            headers: { Authorization: `Bearer ${WAN_API_KEY}` }
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.code !== 200 || !result?.data) {
            throw new Error(`Wan 3.0 task query failed (${response.status}): ${result?.message || result?.msg || 'unknown error'}`);
        }
        if (attempt % 15 === 0) console.log(`Wan 3.0 task ${taskId} state: ${result.data.state}`);
        if (result.data.state === 'success') return result.data;
        if (result.data.state === 'fail') {
            throw new Error(`Wan 3.0 generation failed: ${result.data.failMsg || result.data.failCode || 'unknown error'}`);
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('Wan 3.0 generation exceeded the 30 minute recovery window');
}

async function logAndDeduct(req, startTime, generationId, credits, videoUrl) {
    await db.logUsage({
        userId: req.user.id,
        clerkUserId: req.user.userId,
        requestType: 'wan3-video',
        geminiRequestId: generationId || `wan3-${Date.now()}`,
        imageSize: 'video',
        processingTimeMs: Date.now() - startTime,
        success: true,
        errorMessage: serializeVideoGenerationResult(videoUrl, credits)
    });
    const result = await db.deductUserCredits(req.user.userId, credits);
    if (!result.success) throw new Error(`Wan 3.0 credit deduction failed: ${result.error}`);
}

router.use(getUser, requireAuth, requireAllowedEmail);

router.post('/inputs/sign', async (req, res) => {
    try {
        const generationId = getVideoGenerationId(req);
        if (!generationId) return res.status(400).json({ error: 'A valid generation ID is required' });
        const uploads = await createProviderInputUploads(req.user.userId, generationId, req.body?.files);
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, uploads });
    } catch (error) {
        return res.status(400).json({ error: 'Could not prepare reference uploads', message: error.message });
    }
});

router.post('/generate-video', async (req, res) => {
    const startTime = Date.now();
    const generationId = getVideoGenerationId(req);
    const uploads = req.body?.uploads || {};
    const allUploads = flattenUploads(uploads);
    const objectPaths = allUploads.map(upload => upload.objectPath);
    let successLogged = false;

    try {
        if (!WAN_API_KEY) return res.status(500).json({ error: 'Wan 3.0 API key is not configured' });
        if (!generationId) return res.status(400).json({ error: 'A valid generation ID is required' });
        const prompt = String(req.body?.prompt || '').trim();
        if (!prompt) return res.status(400).json({ error: 'No video description provided' });
        if (prompt.length > 20000) return res.status(400).json({ error: 'Wan 3.0 prompts must be 20,000 characters or less' });

        const variant = normalizeWan3Variant(req.body?.variant);
        const resolution = normalizeWan3Resolution(req.body?.resolution);
        const duration = Number.parseInt(req.body?.duration, 10);
        const inputMode = String(req.body?.inputMode || 'references');
        const referenceVideoDuration = Number(req.body?.referenceVideoDuration || 0);
        const referenceAudioDuration = Number(req.body?.referenceAudioDuration || 0);
        const outputSeconds = duration === -1 ? 30 : Math.max(1, duration || 5);
        if (referenceVideoDuration > 15.25) return res.status(400).json({ error: 'Reference videos must total 15 seconds or less' });
        if (referenceAudioDuration > 15.25) return res.status(400).json({ error: 'Reference audio must total 15 seconds or less' });
        if (referenceVideoDuration > 0 && referenceVideoDuration + outputSeconds > 30.25) {
            return res.status(400).json({ error: 'Reference video duration plus output duration must be 30 seconds or less' });
        }

        const estimatedKieCredits = estimateWan3KieCredits({ variant, resolution, duration });
        const estimatedCredits = estimateWan3VeilPixCredits({ variant, resolution, duration });
        const { credits, error: creditsError } = await db.getUserCredits(req.user.userId);
        if (creditsError) return res.status(500).json({ error: 'Failed to check credits' });
        if (credits < estimatedCredits) {
            return res.status(402).json({
                error: 'Insufficient credits',
                message: `This Wan 3.0 video requires about ${estimatedCredits} credits. You have ${credits}.`,
                creditsRemaining: credits,
                creditsRequired: estimatedCredits,
                requiresPayment: true
            });
        }

        const kieUrls = await Promise.all(allUploads.map(upload => copyProviderInputToKie(req.user.userId, upload)));
        const copiedUrl = upload => upload ? kieUrls[allUploads.indexOf(upload)] : null;
        const copiedUrls = values => (values || []).map(copiedUrl);
        const referenceLink = inputMode === 'link' ? validatePublicLink(req.body?.referenceLink) : null;
        const payload = buildWan3Request(prompt, {
            variant,
            inputMode,
            duration,
            resolution,
            aspectRatio: req.body?.aspectRatio,
            firstFrameUrl: copiedUrl(uploads.firstFrame),
            lastFrameUrl: copiedUrl(uploads.lastFrame),
            referenceImages: copiedUrls(uploads.referenceImages),
            referenceVideos: copiedUrls(uploads.referenceVideos),
            referenceAudios: copiedUrls(uploads.referenceAudios),
            referenceFileUrl: copiedUrl(uploads.referenceFile),
            referenceLink,
            audio: boolValue(req.body?.audio, true),
            seed: req.body?.seed,
            nsfwFilterEnabled: boolValue(req.body?.nsfwFilterEnabled, true)
        });

        console.log('Creating Wan 3.0 task:', {
            model: payload.model,
            inputMode,
            resolution: payload.input.resolution,
            duration: payload.input.duration,
            uploadedInputCount: allUploads.length
        });
        const taskId = await createWan3Task(payload);
        // Kie has taken ownership of temporary copies; the browser-uploaded
        // private source objects are no longer needed.
        await deleteProviderInputs(req.user.userId, objectPaths);
        objectPaths.length = 0;

        const taskData = await pollWan3Task(taskId);
        const normalized = normalizeWan3Response(taskData.resultJson);
        const providerKieCredits = Number(taskData.creditsConsumed);
        const providerCredits = Number.isFinite(providerKieCredits) && providerKieCredits > 0
            ? veilpixCreditsFromKieCredits(providerKieCredits)
            : 0;
        const actualCredits = duration === -1 && providerCredits > 0
            ? providerCredits
            : Math.max(estimatedCredits, providerCredits);

        console.log('Wan 3.0 billing summary:', {
            variant,
            resolution,
            duration,
            estimatedKieCredits,
            estimatedVeilPixCredits: estimatedCredits,
            providerKieCredits: providerKieCredits || null,
            chargedVeilPixCredits: actualCredits
        });
        await logAndDeduct(req, startTime, generationId, actualCredits, normalized.videoUrl);
        successLogged = true;

        return res.json({
            success: true,
            videoUrl: normalized.videoUrl,
            outputFormat: 'mp4',
            processingTime: Date.now() - startTime,
            creditsUsed: actualCredits,
            creditsRemaining: Math.max(0, credits - actualCredits)
        });
    } catch (error) {
        console.error('Wan 3.0 generation error:', error);
        if (objectPaths.length) await deleteProviderInputs(req.user.userId, objectPaths).catch(() => {});
        if (!successLogged && generationId) {
            await db.logUsage({
                userId: req.user.id,
                clerkUserId: req.user.userId,
                requestType: 'wan3-video',
                geminiRequestId: generationId,
                imageSize: 'video',
                processingTimeMs: Date.now() - startTime,
                success: false,
                errorMessage: error.message
            }).catch(() => {});
        }
        const safetyFailure = /nsfw|review|content|safety/i.test(error.message || '');
        return res.status(safetyFailure ? 400 : 500).json({
            error: safetyFailure ? 'Content policy violation' : 'Failed to generate Wan 3.0 video',
            code: safetyFailure ? 'CONTENT_POLICY_VIOLATION' : undefined,
            message: error.message
        });
    }
});

module.exports = router;
