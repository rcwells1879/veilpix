const express = require('express');
const { db } = require('../utils/database');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    createProviderInputRelayUrl,
    createProviderInputUploads,
    deleteProviderInputs
} = require('../utils/providerInput');
const {
    buildWan3Request,
    estimateWan3KieCredits,
    estimateWan3VeilPixCredits,
    normalizeWan3Resolution,
    normalizeWan3Variant
} = require('../utils/wan3Adapter');
const {
    getVideoGenerationId
} = require('../utils/videoGenerationJob');
const { queuePendingKieVideoJob } = require('../utils/kieVideoJobRecovery');

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
    console.log(`Wan 3.0 task accepted with ID ${result.data.taskId}`);
    return result.data.taskId;
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
    let providerTaskId = null;
    let pendingJob = null;
    let reservedCredits = 0;

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
        const hasVideoReference = Array.isArray(uploads.referenceVideos) && uploads.referenceVideos.length > 0;
        const billableReferenceVideoDuration = hasVideoReference
            ? referenceVideoDuration > 0 ? referenceVideoDuration : 15
            : 0;
        const outputSeconds = duration === -1 ? 30 : Math.max(1, duration || 5);
        if (referenceVideoDuration > 15.25) return res.status(400).json({ error: 'Reference videos must total 15 seconds or less' });
        if (referenceAudioDuration > 15.25) return res.status(400).json({ error: 'Reference audio must total 15 seconds or less' });
        if (billableReferenceVideoDuration > 0 && billableReferenceVideoDuration + outputSeconds > 30.25) {
            return res.status(400).json({ error: 'Reference video duration plus output duration must be 30 seconds or less' });
        }

        const pricingContext = {
            variant,
            resolution,
            duration,
            hasVideoReference,
            referenceVideoDuration: billableReferenceVideoDuration
        };
        const estimatedKieCredits = estimateWan3KieCredits(pricingContext);
        const estimatedCredits = estimateWan3VeilPixCredits(pricingContext);
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

        const reservation = await db.deductUserCredits(req.user.userId, estimatedCredits);
        if (reservation.error) throw new Error('Failed to reserve video credits');
        if (!reservation.success) {
            if (objectPaths.length) {
                await deleteProviderInputs(req.user.userId, objectPaths).catch(() => {});
            }
            const currentBalance = await db.getUserCredits(req.user.userId);
            return res.status(402).json({
                error: 'Insufficient credits',
                message: `This Wan 3.0 video requires about ${estimatedCredits} credits. You have ${currentBalance.credits}.`,
                creditsRemaining: currentBalance.credits,
                creditsRequired: estimatedCredits,
                requiresPayment: true
            });
        }
        reservedCredits = estimatedCredits;
        const reservedBalance = await db.getUserCredits(req.user.userId);

        const kieUrls = allUploads.map(upload => createProviderInputRelayUrl(req.user.userId, upload));
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
        providerTaskId = await createWan3Task(payload);
        pendingJob = await db.createPendingVideoGenerationJob({
            userId: req.user.id,
            clerkUserId: req.user.userId,
            requestType: 'wan3-video',
            generationId,
            providerState: {
                provider: 'wan3',
                variant,
                providerTaskId,
                estimatedCredits,
                reservedCredits,
                duration,
                cleanup: {
                    kind: 'provider-input',
                    objectPaths
                }
            }
        });
        console.log('Wan 3.0 job accepted for durable recovery:', {
            generationId,
            providerTaskId,
            variant,
            resolution,
            duration,
            referenceVideoSeconds: billableReferenceVideoDuration,
            estimatedKieCredits,
            estimatedVeilPixCredits: estimatedCredits
        });
        queuePendingKieVideoJob(pendingJob);

        return res.status(202).json({
            success: true,
            pending: true,
            generationId,
            outputFormat: 'mp4',
            processingTime: Date.now() - startTime,
            creditsUsed: estimatedCredits,
            creditsRemaining: reservedBalance.credits
        });
    } catch (error) {
        console.error('Wan 3.0 generation error:', error);
        if (!providerTaskId && objectPaths.length) {
            await deleteProviderInputs(req.user.userId, objectPaths).catch(() => {});
        }
        if (!providerTaskId && reservedCredits > 0) {
            await db.addUserCredits(req.user.userId, reservedCredits).catch(() => {});
            reservedCredits = 0;
        }
        if (!pendingJob && generationId) {
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
