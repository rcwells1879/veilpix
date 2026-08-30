const OPENROUTER_DEFAULT_API_URL = 'https://openrouter.ai';

const OPENROUTER_SEEDANCE_MODELS = {
    v2_5: 'bytedance/seedance-2.5',
    regular: 'bytedance/seedance-2.0',
    fast: 'bytedance/seedance-2.0-fast',
    mini: 'bytedance/seedance-2.0-mini'
};

const OPENROUTER_ACTIVE_STATES = new Set(['pending', 'queued', 'processing', 'in_progress']);
const OPENROUTER_FAILED_STATES = new Set(['failed', 'canceled', 'cancelled', 'expired']);

const OPENROUTER_SEEDANCE_RESOLUTIONS = {
    v2_5: new Set(['480p', '720p']),
    regular: new Set(['480p', '720p', '1080p', '4K']),
    fast: new Set(['480p', '720p']),
    mini: new Set(['480p', '720p'])
};

function openRouterApiUrl() {
    return String(process.env.OPENROUTER_API_BASE_URL || OPENROUTER_DEFAULT_API_URL).replace(/\/+$/, '');
}

function imageReference(url, frameType = null) {
    const reference = {
        type: 'image_url',
        image_url: { url }
    };
    if (frameType) reference.frame_type = frameType;
    return reference;
}

function mediaReference(type, url) {
    return {
        type: `${type}_url`,
        [`${type}_url`]: { url }
    };
}

function buildOpenRouterSeedanceRequest(prompt, options = {}) {
    const {
        variant = 'regular',
        duration = 5,
        resolution = '720p',
        aspectRatio = '16:9',
        referenceImages = [],
        referenceVideos = [],
        referenceAudios = [],
        firstFrameUrl,
        lastFrameUrl,
        generateAudio = false,
        outputFormat = 'mp4'
    } = options;
    const supportedResolutions = OPENROUTER_SEEDANCE_RESOLUTIONS[variant]
        || OPENROUTER_SEEDANCE_RESOLUTIONS.regular;
    if (!supportedResolutions.has(resolution)) {
        throw new RangeError(`OpenRouter Seedance ${variant} does not support ${resolution}; choose ${[...supportedResolutions].join(' or ')}`);
    }
    const model = OPENROUTER_SEEDANCE_MODELS[variant] || OPENROUTER_SEEDANCE_MODELS.regular;
    const payload = {
        model,
        prompt,
        duration: duration === -1 ? 30 : duration,
        resolution,
        generate_audio: Boolean(generateAudio)
    };

    // OpenRouter's Seedance endpoints do not list "adaptive" as a supported
    // ratio. Omitting it lets the provider choose instead of returning a 400.
    if (aspectRatio && aspectRatio !== 'adaptive') payload.aspect_ratio = aspectRatio;

    const frameImages = [];
    if (firstFrameUrl) frameImages.push(imageReference(firstFrameUrl, 'first_frame'));
    if (lastFrameUrl) frameImages.push(imageReference(lastFrameUrl, 'last_frame'));
    if (frameImages.length > 0) payload.frame_images = frameImages;

    const inputReferences = [
        ...referenceImages.map(url => imageReference(url)),
        ...referenceVideos.map(url => mediaReference('video', url)),
        ...referenceAudios.map(url => mediaReference('audio', url))
    ];
    if (inputReferences.length > 0) payload.input_references = inputReferences;

    if (variant === 'v2_5' && outputFormat) {
        payload.provider = {
            options: {
                seed: {
                    parameters: { output_format: outputFormat }
                }
            }
        };
    }

    // Intentionally do not send nsfw_checker during the OpenRouter trial. It
    // is not listed as an allowed passthrough parameter for these endpoints.
    return payload;
}

function safeOpenRouterPollingUrl(value, taskId) {
    const apiUrl = openRouterApiUrl();
    const fallback = `${apiUrl}/api/v1/videos/${encodeURIComponent(taskId)}`;
    if (!value) return fallback;
    const parsed = new URL(value, apiUrl);
    const allowedOrigin = new URL(apiUrl).origin;
    if (parsed.origin !== allowedOrigin || !parsed.pathname.startsWith('/api/v1/videos/')) {
        throw new Error('OpenRouter returned an invalid polling URL');
    }
    return parsed.toString();
}

async function createOpenRouterSeedanceTask(payload) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OpenRouter API key is not configured');

    const response = await fetch(`${openRouterApiUrl()}/api/v1/videos`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://veilstudio.io/veilpix/',
            'X-Title': 'VeilPix'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30 * 1000)
    });
    const result = await response.json().catch(async () => ({ error: await response.text().catch(() => '') }));
    if (!response.ok || !result?.id) {
        const detail = result?.error?.message || result?.error || result?.message || JSON.stringify(result);
        throw new Error(`OpenRouter Seedance task creation failed (${response.status}): ${detail}`);
    }

    return {
        taskId: result.id,
        pollingUrl: safeOpenRouterPollingUrl(result.polling_url, result.id)
    };
}

async function getOpenRouterSeedanceTask(state) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OpenRouter API key is unavailable');
    const pollingUrl = safeOpenRouterPollingUrl(state.providerPollingUrl, state.providerTaskId);
    const response = await fetch(pollingUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30 * 1000)
    });
    const result = await response.json().catch(async () => ({ error: await response.text().catch(() => '') }));
    if (!response.ok) {
        const detail = result?.error?.message || result?.error || result?.message || 'unknown error';
        throw new Error(`OpenRouter Seedance task query failed (${response.status}): ${detail}`);
    }
    return result;
}

function normalizeOpenRouterCompletedVideo(taskData) {
    const taskId = taskData?.id;
    const sourceUrl = taskData?.unsigned_urls?.[0]
        || (taskId ? `${openRouterApiUrl()}/api/v1/videos/${encodeURIComponent(taskId)}/content?index=0` : null);
    if (!sourceUrl) throw new Error('OpenRouter Seedance output was unavailable');
    const parsed = new URL(sourceUrl, openRouterApiUrl());
    const openRouterOrigin = new URL(openRouterApiUrl()).origin;
    return {
        videoUrl: parsed.toString(),
        sourceHeaders: parsed.origin === openRouterOrigin
            ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
            : undefined
    };
}

module.exports = {
    OPENROUTER_ACTIVE_STATES,
    OPENROUTER_FAILED_STATES,
    OPENROUTER_SEEDANCE_MODELS,
    OPENROUTER_SEEDANCE_RESOLUTIONS,
    buildOpenRouterSeedanceRequest,
    createOpenRouterSeedanceTask,
    getOpenRouterSeedanceTask,
    normalizeOpenRouterCompletedVideo,
    safeOpenRouterPollingUrl
};
