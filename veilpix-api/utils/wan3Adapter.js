const VEILPIX_CREDIT_USD = 6.99 / 100;
const TARGET_MARGIN = 0.12;
const BILLABLE_USD_PER_VEILPIX_CREDIT = VEILPIX_CREDIT_USD * (1 - TARGET_MARGIN);
const KIE_CREDIT_USD = 0.005;

const WAN3_MODELS = {
    standard: 'wan/3-0-video',
    prime: 'wan/3-0-video-prime'
};

// Current Kie pricing endpoint rates, in Kie credits per generated second.
const WAN3_PRICING = {
    standard: { '480P': 8, '720P': 16, '1080P': 32 },
    prime: { '480P': 12.2, '720P': 25.2, '1080P': 50.4 }
};

const WAN3_RATIOS = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'];
const WAN3_INPUT_MODES = ['frames', 'references', 'file', 'link'];

function normalizeWan3Variant(value) {
    return value === 'prime' ? 'prime' : 'standard';
}

function normalizeWan3Resolution(value) {
    const normalized = String(value || '').toUpperCase();
    return ['480P', '720P', '1080P'].includes(normalized) ? normalized : '1080P';
}

function normalizeWan3Ratio(value) {
    return WAN3_RATIOS.includes(value) ? value : 'adaptive';
}

function normalizeWan3Duration(value, hasVideoReference = false) {
    const parsed = Number.parseInt(value, 10);
    if (parsed === -1) return -1;
    const minimum = hasVideoReference ? 1 : 2;
    return Number.isFinite(parsed) ? Math.max(minimum, Math.min(30, parsed)) : 5;
}

function veilpixCreditsFromKieCredits(kieCredits) {
    return Math.max(1, Math.ceil((Number(kieCredits || 0) * KIE_CREDIT_USD) / BILLABLE_USD_PER_VEILPIX_CREDIT));
}

function estimateWan3KieCredits({ variant = 'standard', resolution = '1080P', duration = 5 } = {}) {
    const selectedVariant = normalizeWan3Variant(variant);
    const selectedResolution = normalizeWan3Resolution(resolution);
    const selectedDuration = Number(duration) === -1 ? 30 : Math.max(1, Number(duration) || 5);
    return WAN3_PRICING[selectedVariant][selectedResolution] * selectedDuration;
}

function estimateWan3VeilPixCredits(options) {
    return veilpixCreditsFromKieCredits(estimateWan3KieCredits(options));
}

function buildWan3Request(prompt, options = {}) {
    const {
        variant = 'standard',
        inputMode = 'references',
        duration = 5,
        resolution = '1080P',
        aspectRatio = 'adaptive',
        firstFrameUrl,
        lastFrameUrl,
        referenceImages = [],
        referenceVideos = [],
        referenceAudios = [],
        referenceFileUrl,
        referenceLink,
        audio = true,
        seed,
        nsfwFilterEnabled = true
    } = options;
    if (!WAN3_INPUT_MODES.includes(inputMode)) throw new Error('Invalid Wan 3.0 input mode');
    if (lastFrameUrl && !firstFrameUrl) throw new Error('A last frame requires a first frame');
    if (referenceImages.length > 10 || referenceVideos.length > 5 || referenceAudios.length > 5) {
        throw new Error('Wan 3.0 reference count exceeded');
    }

    const inputsPresent = {
        frames: Boolean(firstFrameUrl || lastFrameUrl),
        references: referenceImages.length + referenceVideos.length + referenceAudios.length > 0,
        file: Boolean(referenceFileUrl),
        link: Boolean(referenceLink)
    };
    for (const [mode, present] of Object.entries(inputsPresent)) {
        if (mode !== inputMode && present) throw new Error(`Wan 3.0 ${inputMode} mode cannot be combined with ${mode} inputs`);
    }
    if (inputMode === 'frames' && !firstFrameUrl) throw new Error('Frame mode requires a first frame');
    if (inputMode === 'file' && !referenceFileUrl) throw new Error('File mode requires a reference file');
    if (inputMode === 'link' && !referenceLink) throw new Error('Link mode requires a public webpage URL');

    const hasVideoReference = referenceVideos.length > 0;
    const input = {
        prompt,
        resolution: normalizeWan3Resolution(resolution),
        aspect_ratio: normalizeWan3Ratio(aspectRatio),
        duration: normalizeWan3Duration(duration, hasVideoReference),
        audio: Boolean(audio),
        nsfw_checker: Boolean(nsfwFilterEnabled)
    };
    if (Number.isInteger(Number(seed)) && Number(seed) >= 0) input.seed = Number(seed);
    if (firstFrameUrl) input.first_frame_url = firstFrameUrl;
    if (lastFrameUrl) input.last_frame_url = lastFrameUrl;
    if (referenceImages.length) input.reference_image_urls = referenceImages;
    if (referenceVideos.length) input.reference_video_urls = referenceVideos;
    if (referenceAudios.length) input.reference_audio_urls = referenceAudios;
    if (referenceFileUrl) input.reference_file_urls = [referenceFileUrl];
    if (referenceLink) input.reference_link_urls = [referenceLink];

    return { model: WAN3_MODELS[normalizeWan3Variant(variant)], input };
}

function normalizeWan3Response(resultJson) {
    const result = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
    const urls = Array.isArray(result?.resultUrls) ? result.resultUrls : [];
    const videoUrl = result?.videoUrl || result?.url || urls.find(url => /\.(?:mp4|mov)(?:$|[?#])/i.test(url)) || urls[0];
    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) throw new Error('Wan 3.0 response did not include a video URL');
    return { success: true, videoUrl };
}

module.exports = {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    KIE_CREDIT_USD,
    WAN3_INPUT_MODES,
    WAN3_MODELS,
    WAN3_PRICING,
    WAN3_RATIOS,
    buildWan3Request,
    estimateWan3KieCredits,
    estimateWan3VeilPixCredits,
    normalizeWan3Duration,
    normalizeWan3Ratio,
    normalizeWan3Resolution,
    normalizeWan3Response,
    normalizeWan3Variant,
    veilpixCreditsFromKieCredits
};
