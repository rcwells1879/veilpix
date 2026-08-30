const express = require('express');
const multer = require('multer');
const { db } = require('../utils/database');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    uploadTemporaryImage,
    uploadTemporaryVideo,
    uploadTemporaryFile,
    deleteTemporaryImage
} = require('../utils/imageUpload');
const {
    ASPECT_RATIOS,
    SEEDANCE_DURATION_LIMITS,
    SEEDANCE_PRICING,
    buildSeedanceRequest,
    clampDuration,
    estimateSeedanceKieCredits,
    estimateSeedanceVeilPixCredits,
    exceedsSeedanceMediaDurationLimit,
    normalizeResolution,
    normalizeVariant,
    getSeedanceReferenceLimits,
    resolveSeedanceInputMode
} = require('../utils/seedanceAdapter');
const {
    getVideoGenerationId
} = require('../utils/videoGenerationJob');
const { queuePendingKieVideoJob } = require('../utils/kieVideoJobRecovery');
const {
    CONTENT_POLICY_ERROR_CODE,
    buildOpenRouterSeedanceRequest,
    createOpenRouterSeedanceTask,
    selectSeedanceUpstream
} = require('../utils/openRouterSeedance');

const router = express.Router();

const SEEDANCE_API_KEY = process.env.KIE_API_KEY || process.env.SEEDREAM_API_KEY;
const SEEDANCE_API_URL = process.env.KIE_API_BASE_URL || process.env.SEEDREAM_API_BASE_URL || 'https://api.kie.ai';

const MAX_REFERENCE_IMAGES = 30;
const MAX_REFERENCE_VIDEOS = 10;
const MAX_REFERENCE_AUDIOS = 10;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

const upload = multer({
    limits: {
        fileSize: 200 * 1024 * 1024,
        files: MAX_REFERENCE_IMAGES + MAX_REFERENCE_VIDEOS + MAX_REFERENCE_AUDIOS + 2
    },
    fileFilter: (req, file, cb) => {
        if (
            file.mimetype.startsWith('image/') ||
            file.mimetype.startsWith('video/') ||
            file.mimetype.startsWith('audio/')
        ) {
            cb(null, true);
        } else {
            cb(new Error('Only image, video, and audio files are allowed'));
        }
    }
});

function boolValue(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return value === true || value === 'true';
}

function validateFileSize(file, maxBytes, label) {
    if (file.size > maxBytes) {
        throw new Error(`${label} must be ${Math.floor(maxBytes / 1024 / 1024)}MB or smaller`);
    }
}

function parseMp4DurationSeconds(buffer) {
    const containerTypes = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

    function readAtoms(start, end) {
        let offset = start;
        while (offset + 8 <= end) {
            let size = buffer.readUInt32BE(offset);
            const type = buffer.toString('ascii', offset + 4, offset + 8);
            let headerSize = 8;

            if (size === 1 && offset + 16 <= end) {
                const high = buffer.readUInt32BE(offset + 8);
                const low = buffer.readUInt32BE(offset + 12);
                size = high * 2 ** 32 + low;
                headerSize = 16;
            } else if (size === 0) {
                size = end - offset;
            }

            if (size < headerSize || offset + size > end) {
                break;
            }

            if (type === 'mvhd') {
                const version = buffer.readUInt8(offset + headerSize);
                const timescaleOffset = offset + headerSize + (version === 1 ? 20 : 12);
                const durationOffset = timescaleOffset + 4;

                if (durationOffset + (version === 1 ? 8 : 4) <= offset + size) {
                    const timescale = buffer.readUInt32BE(timescaleOffset);
                    if (timescale > 0) {
                        const duration = version === 1
                            ? buffer.readUInt32BE(durationOffset + 4)
                            : buffer.readUInt32BE(durationOffset);
                        return duration / timescale;
                    }
                }
            }

            if (containerTypes.has(type)) {
                const nested = readAtoms(offset + headerSize, offset + size);
                if (nested) return nested;
            }

            offset += size;
        }

        return null;
    }

    return readAtoms(0, buffer.length);
}

function getReferenceVideoDuration(file) {
    if (!file) return null;

    if (file.mimetype === 'video/mp4' || file.mimetype === 'video/quicktime') {
        try {
            const parsed = parseMp4DurationSeconds(file.buffer);
            if (parsed && Number.isFinite(parsed)) {
                return Math.max(0, Math.round(parsed * 1000) / 1000);
            }
        } catch (error) {
            console.warn('Unable to parse video duration from uploaded file:', error.message);
        }
    }

    return null;
}

async function createKieSeedanceTask(payload) {
    console.log(`Creating Seedance task (${payload.model})`);

    const response = await fetch(`${SEEDANCE_API_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${SEEDANCE_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Seedance API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    if (result.code !== 200 || !result.data?.taskId) {
        throw new Error(`Seedance task creation failed: ${result.message || result.msg || JSON.stringify(result)}`);
    }

    console.log(`Seedance task accepted with ID ${result.data.taskId}`);
    return result.data.taskId;
}

function referenceUploadError(uploadResult, mediaType) {
    const error = new Error(
        uploadResult.error || `Failed to upload ${mediaType}. Please try again.`
    );
    error.code = uploadResult.errorCode || 'TEMPORARY_STORAGE_UNAVAILABLE';
    return error;
}

async function uploadReferenceFile(file, userId, uploadedFilenames) {
    if (file.mimetype.startsWith('image/')) {
        validateFileSize(file, MAX_IMAGE_BYTES, 'Reference image');
        const uploadResult = await uploadTemporaryImage(file.buffer, file.mimetype, userId);
        if (!uploadResult.success) throw referenceUploadError(uploadResult, 'image');
        uploadedFilenames.push(uploadResult.filename);
        return uploadResult.url;
    }

    if (file.mimetype.startsWith('video/')) {
        validateFileSize(file, MAX_VIDEO_BYTES, 'Reference video');
        const uploadResult = await uploadTemporaryVideo(file.buffer, file.mimetype, userId);
        if (!uploadResult.success) throw referenceUploadError(uploadResult, 'video');
        uploadedFilenames.push(uploadResult.filename);
        return uploadResult.url;
    }

    if (file.mimetype.startsWith('audio/')) {
        validateFileSize(file, MAX_AUDIO_BYTES, 'Reference audio');
        const uploadResult = await uploadTemporaryFile(file.buffer, file.mimetype, userId, 'audio');
        if (!uploadResult.success) throw referenceUploadError(uploadResult, 'audio');
        uploadedFilenames.push(uploadResult.filename);
        return uploadResult.url;
    }

    throw new Error('Unsupported reference file type');
}

router.use(getUser, requireAuth, requireAllowedEmail);

router.post('/generate-video', upload.fields([
    { name: 'referenceImages', maxCount: MAX_REFERENCE_IMAGES },
    { name: 'referenceVideo', maxCount: MAX_REFERENCE_VIDEOS },
    { name: 'referenceAudio', maxCount: MAX_REFERENCE_AUDIOS },
    { name: 'firstFrame', maxCount: 1 },
    { name: 'lastFrame', maxCount: 1 }
]), async (req, res) => {
    const startTime = Date.now();
    const generationId = getVideoGenerationId(req);
    const uploadedFilenames = [];
    let providerTaskId = null;
    let pendingJob = null;

    try {
        if (!generationId) {
            return res.status(400).json({ error: 'A valid generation ID is required' });
        }

        const {
            prompt,
            variant = 'regular',
            duration = '5',
            resolution = '720p',
            aspectRatio = '16:9',
            referenceVideoUrl,
            referenceVideoDuration = '',
            referenceAudioDuration = '',
            inputMode = '',
            generateAudio = 'false',
            webSearch = 'false',
            returnLastFrame = 'false',
            outputFormat = 'mp4',
            nsfwFilterEnabled = 'true'
        } = req.body;
        const safetyFilterEnabled = boolValue(nsfwFilterEnabled, true);
        const upstreamProvider = selectSeedanceUpstream(
            process.env.SEEDANCE_PROVIDER,
            safetyFilterEnabled
        );
        if (upstreamProvider === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
            return res.status(500).json({ error: 'OpenRouter API key is not configured' });
        }
        if (upstreamProvider === 'kie' && !SEEDANCE_API_KEY) {
            return res.status(500).json({ error: 'Kie Seedance API key is not configured' });
        }

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'No video description provided' });
        }
        const selectedVariant = normalizeVariant(variant);
        const referenceLimits = getSeedanceReferenceLimits(selectedVariant);
        const maxPromptLength = selectedVariant === 'v2_5' ? 30000 : 5000;
        if (prompt.length > maxPromptLength) {
            return res.status(400).json({ error: `Prompt must be ${maxPromptLength} characters or less` });
        }
        const selectedResolution = normalizeResolution(selectedVariant, resolution);
        const selectedDuration = clampDuration(duration, selectedVariant);
        if (upstreamProvider === 'openrouter') {
            try {
                // Validate model-specific OpenRouter capabilities before any
                // reference upload or paid provider request begins.
                buildOpenRouterSeedanceRequest(prompt.trim(), {
                    variant: selectedVariant,
                    duration: selectedDuration,
                    resolution: selectedResolution,
                    aspectRatio
                });
            } catch (capabilityError) {
                if (capabilityError instanceof RangeError) {
                    return res.status(400).json({
                        error: 'Unsupported Seedance option',
                        message: capabilityError.message
                    });
                }
                throw capabilityError;
            }
        }
        const imageFiles = req.files?.referenceImages || [];
        const videoFiles = req.files?.referenceVideo || [];
        const audioFiles = req.files?.referenceAudio || [];
        const firstFrameFile = req.files?.firstFrame?.[0];
        const lastFrameFile = req.files?.lastFrame?.[0];
        const hasMultimodalReferences = imageFiles.length > 0 || videoFiles.length > 0 || audioFiles.length > 0 || Boolean(referenceVideoUrl);
        let resolvedInputMode;

        if (imageFiles.length > referenceLimits.images) {
            return res.status(400).json({ error: `This Seedance model supports up to ${referenceLimits.images} reference images` });
        }
        if (videoFiles.length + (referenceVideoUrl ? 1 : 0) > referenceLimits.videos) {
            return res.status(400).json({ error: `This Seedance model supports up to ${referenceLimits.videos} reference videos` });
        }
        if (audioFiles.length > referenceLimits.audios) {
            return res.status(400).json({ error: `This Seedance model supports up to ${referenceLimits.audios} reference audio files` });
        }
        if (lastFrameFile && !firstFrameFile) {
            return res.status(400).json({ error: 'A last frame requires a first frame' });
        }
        try {
            resolvedInputMode = resolveSeedanceInputMode(inputMode, {
                hasFirstFrame: Boolean(firstFrameFile),
                hasLastFrame: Boolean(lastFrameFile),
                hasMultimodalReferences
            });
        } catch (modeError) {
            return res.status(400).json({
                error: 'Invalid Seedance references',
                message: modeError.message
            });
        }

        console.log('Seedance input summary:', {
            requestedMode: inputMode || null,
            resolvedMode: resolvedInputMode,
            firstFrameBytes: firstFrameFile?.size || 0,
            lastFrameBytes: lastFrameFile?.size || 0,
            referenceImageCount: imageFiles.length,
            referenceVideoCount: videoFiles.length + (referenceVideoUrl ? 1 : 0),
            referenceAudioCount: audioFiles.length
        });

        const hasVideoReference = videoFiles.length > 0 || Boolean(referenceVideoUrl);
        const parsedVideoDurations = videoFiles.map(getReferenceVideoDuration);
        const clientVideoDuration = Number(referenceVideoDuration);
        const measuredVideoDuration = hasVideoReference
            ? parsedVideoDurations.every(durationValue => durationValue !== null) && !referenceVideoUrl
                ? parsedVideoDurations.reduce((total, durationValue) => total + durationValue, 0)
                : Number.isFinite(clientVideoDuration) && clientVideoDuration > 0
                    ? clientVideoDuration
                    : referenceLimits.mediaSeconds
            : 0;
        const clientAudioDuration = Number(referenceAudioDuration);
        if (exceedsSeedanceMediaDurationLimit(measuredVideoDuration, referenceLimits.mediaSeconds)) {
            return res.status(400).json({ error: `Reference videos must total ${referenceLimits.mediaSeconds} seconds or less` });
        }
        if (audioFiles.length > 0 && exceedsSeedanceMediaDurationLimit(clientAudioDuration, referenceLimits.mediaSeconds)) {
            return res.status(400).json({ error: `Reference audio must total ${referenceLimits.mediaSeconds} seconds or less` });
        }
        const seedancePricingContext = {
            variant: selectedVariant,
            resolution: selectedResolution,
            duration: selectedDuration,
            hasVideoReference,
            referenceVideoDuration: measuredVideoDuration
        };
        const estimatedKieCredits = estimateSeedanceKieCredits(seedancePricingContext);
        const estimatedCredits = estimateSeedanceVeilPixCredits(seedancePricingContext);
        const { credits, error } = await db.getUserCredits(req.user.userId);

        if (error) {
            return res.status(500).json({ error: 'Failed to check credits', message: 'Please try again in a moment.' });
        }
        if (credits < estimatedCredits) {
            return res.status(402).json({
                error: 'Insufficient credits',
                message: `This Seedance video requires about ${estimatedCredits} credits. You have ${credits}.`,
                creditsRemaining: credits,
                creditsRequired: estimatedCredits,
                requiresPayment: true
            });
        }

        req.creditsInfo = { remaining: credits };

        const referenceImages = [];
        const referenceVideos = [];
        const referenceAudios = [];

        for (const file of imageFiles) {
            if (!file.mimetype.startsWith('image/')) {
                return res.status(400).json({ error: 'Reference images must be image files' });
            }
            referenceImages.push(await uploadReferenceFile(file, req.user.userId, uploadedFilenames));
        }

        for (const videoFile of videoFiles) {
            if (!videoFile.mimetype.startsWith('video/')) {
                return res.status(400).json({ error: 'Reference videos must be video files' });
            }
            validateFileSize(videoFile, referenceLimits.videoBytes, 'Reference video');
            referenceVideos.push(await uploadReferenceFile(videoFile, req.user.userId, uploadedFilenames));
        }
        if (referenceVideoUrl) {
            try {
                const parsed = new URL(referenceVideoUrl);
                if (!['http:', 'https:'].includes(parsed.protocol)) {
                    throw new Error('Invalid URL protocol');
                }
                referenceVideos.push(referenceVideoUrl);
            } catch {
                return res.status(400).json({ error: 'Invalid reference video URL' });
            }
        }

        for (const audioFile of audioFiles) {
            if (!audioFile.mimetype.startsWith('audio/')) {
                return res.status(400).json({ error: 'Reference audio files must be audio files' });
            }
            validateFileSize(audioFile, referenceLimits.audioBytes, 'Reference audio');
            referenceAudios.push(await uploadReferenceFile(audioFile, req.user.userId, uploadedFilenames));
        }

        const firstFrameUrl = firstFrameFile
            ? await uploadReferenceFile(firstFrameFile, req.user.userId, uploadedFilenames)
            : null;
        const lastFrameUrl = lastFrameFile
            ? await uploadReferenceFile(lastFrameFile, req.user.userId, uploadedFilenames)
            : null;

        const commonProviderOptions = {
            variant: selectedVariant,
            duration: selectedDuration,
            resolution: selectedResolution,
            aspectRatio,
            referenceImages,
            referenceVideos,
            referenceAudios,
            firstFrameUrl,
            lastFrameUrl,
            generateAudio: boolValue(generateAudio, false),
            webSearch: boolValue(webSearch, false),
            returnLastFrame: boolValue(returnLastFrame, false),
            outputFormat,
            nsfwFilterEnabled: safetyFilterEnabled
        };
        const seedancePayload = upstreamProvider === 'openrouter'
            ? buildOpenRouterSeedanceRequest(prompt.trim(), commonProviderOptions)
            : buildSeedanceRequest(prompt.trim(), commonProviderOptions);

        const providerTask = upstreamProvider === 'openrouter'
            ? await createOpenRouterSeedanceTask(seedancePayload)
            : { taskId: await createKieSeedanceTask(seedancePayload), pollingUrl: null };
        providerTaskId = providerTask.taskId;
        pendingJob = await db.createPendingVideoGenerationJob({
            userId: req.user.id,
            clerkUserId: req.user.userId,
            requestType: 'seedance-video',
            generationId,
            providerState: {
                provider: 'seedance',
                variant: selectedVariant,
                upstreamProvider,
                providerTaskId,
                providerPollingUrl: providerTask.pollingUrl,
                estimatedCredits,
                duration: selectedDuration,
                cleanup: {
                    kind: 'temporary-media',
                    filenames: uploadedFilenames
                }
            }
        });
        console.log('Seedance job accepted for durable recovery:', {
            generationId,
            providerTaskId,
            upstreamProvider,
            safetyFilterEnabled,
            variant: selectedVariant,
            resolution: selectedResolution,
            outputSeconds: selectedDuration,
            hasVideoReference,
            referenceVideoSeconds: measuredVideoDuration,
            estimatedKieCredits,
            estimatedVeilPixCredits: estimatedCredits
        });
        queuePendingKieVideoJob(pendingJob);

        return res.status(202).json({
            success: true,
            pending: true,
            generationId,
            outputFormat: selectedVariant === 'v2_5' ? outputFormat : 'mp4',
            processingTime: Date.now() - startTime,
            creditsUsed: estimatedCredits,
            creditsRemaining: req.creditsInfo?.remaining ?? credits
        });
    } catch (error) {
        console.error('Error generating video with Seedance:', error);

        if (!providerTaskId) {
            for (const filename of uploadedFilenames) {
                await deleteTemporaryImage(filename);
            }
        }

        if (!pendingJob && generationId) {
            await db.logUsage({
                userId: req.user.id,
                clerkUserId: req.user.userId,
                requestType: 'seedance-video',
                geminiRequestId: generationId,
                imageSize: 'video',
                processingTimeMs: Date.now() - startTime,
                success: false,
                errorMessage: error.message
            }).catch(() => {});
        }

        const isNsfwError = error.code === CONTENT_POLICY_ERROR_CODE ||
            error.message?.toLowerCase().includes('nsfw') ||
            error.message?.toLowerCase().includes('review') ||
            error.message?.toLowerCase().includes('content') ||
            error.message?.toLowerCase().includes('safety') ||
            error.message?.toLowerCase().includes('sensitive');
        const isTemporaryStorageError = error.code === 'TEMPORARY_STORAGE_UNAVAILABLE';

        res.status(isNsfwError ? 400 : isTemporaryStorageError ? 503 : 500).json({
            error: isNsfwError
                ? 'Content policy violation'
                : isTemporaryStorageError
                    ? 'Temporary reference upload unavailable'
                    : 'Failed to generate Seedance video',
            code: isNsfwError ? CONTENT_POLICY_ERROR_CODE : undefined,
            message: isNsfwError
                ? 'This request was flagged by the content moderation provider.'
                : isTemporaryStorageError
                    ? 'We could not prepare the attached references. They are still selected, so please try again.'
                    : error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

router.get('/pricing', (req, res) => {
    res.json({
        success: true,
        pricing: SEEDANCE_PRICING,
        aspectRatios: ASPECT_RATIOS,
        durationLimits: SEEDANCE_DURATION_LIMITS
    });
});

module.exports = router;
