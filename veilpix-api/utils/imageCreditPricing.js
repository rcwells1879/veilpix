const VEILPIX_CREDIT_USD = 6.99 / 100;
const TARGET_MARGIN = 0.12;
const BILLABLE_USD_PER_VEILPIX_CREDIT = VEILPIX_CREDIT_USD * (1 - TARGET_MARGIN);
const KIE_CREDIT_USD = 0.005;

const IMAGE_WORKFLOWS = {
    TEXT_TO_IMAGE: 'text-to-image',
    IMAGE_TO_IMAGE: 'image-to-image'
};

const IMAGE_ALLOWED_RESOLUTIONS = {
    nanobanana2: {
        'text-to-image': ['1K', '2K', '4K'],
        'image-to-image': ['1K', '2K', '4K']
    },
    seedream: {
        'text-to-image': ['1K', '2K', '4K'],
        'image-to-image': ['1K', '2K', '4K']
    },
    wanimage: {
        'text-to-image': ['1K', '2K', '4K'],
        'image-to-image': ['1K', '2K']
    }
};

const DEFAULT_RESOLUTIONS = {
    nanobanana2: '2K',
    seedream: '2K',
    wanimage: '2K'
};

const IMAGE_KIE_CREDIT_PRICING = {
    nanobanana2: {
        '1K': 8,
        '2K': 12,
        '4K': 18
    },
    seedream: {
        '1K': 7,
        '2K': 5.5,
        '4K': 5.5
    },
    wanimage: {
        '1K': 4.8,
        '2K': 4.8,
        '4K': 12
    }
};

const SEEDREAM_KIE_CREDIT_PRICING = {
    lite: {
        '2K': 5.5,
        '4K': 5.5
    },
    pro: {
        '1K': 7,
        '2K': 14
    }
};

function normalizeSeedreamTier(tier) {
    return tier === 'pro' ? 'pro' : 'lite';
}

function normalizeImageProvider(provider) {
    return Object.prototype.hasOwnProperty.call(IMAGE_KIE_CREDIT_PRICING, provider) ? provider : 'seedream';
}

function normalizeImageWorkflow(workflow) {
    return workflow === IMAGE_WORKFLOWS.IMAGE_TO_IMAGE ? IMAGE_WORKFLOWS.IMAGE_TO_IMAGE : IMAGE_WORKFLOWS.TEXT_TO_IMAGE;
}

function getAllowedImageResolutions(provider, workflow, seedreamTier = 'lite') {
    const selectedProvider = normalizeImageProvider(provider);
    const selectedWorkflow = normalizeImageWorkflow(workflow);
    if (selectedProvider === 'seedream') {
        return normalizeSeedreamTier(seedreamTier) === 'pro' ? ['1K', '2K'] : ['2K', '4K'];
    }
    return IMAGE_ALLOWED_RESOLUTIONS[selectedProvider][selectedWorkflow];
}

function normalizeImageResolution(provider, resolution, workflow, seedreamTier = 'lite') {
    const selectedProvider = normalizeImageProvider(provider);
    const allowed = getAllowedImageResolutions(selectedProvider, workflow, seedreamTier);
    return allowed.includes(resolution) ? resolution : allowed[0] || DEFAULT_RESOLUTIONS[selectedProvider];
}

function veilpixCreditsFromUsd(usdCost) {
    const rawCredits = Math.max(0, (Number(usdCost) || 0) / BILLABLE_USD_PER_VEILPIX_CREDIT);
    if (rawCredits <= 0) return 0;
    if (rawCredits < 1) return Math.ceil(rawCredits * 100) / 100;
    return Math.ceil(rawCredits);
}

function veilpixCreditsFromKieCredits(kieCredits) {
    return veilpixCreditsFromUsd((Number(kieCredits) || 0) * KIE_CREDIT_USD);
}

function getImageKieCreditCost(provider, resolution, workflow = IMAGE_WORKFLOWS.TEXT_TO_IMAGE, seedreamTier = 'lite', imageCount = 0) {
    const selectedProvider = normalizeImageProvider(provider);
    const selectedTier = normalizeSeedreamTier(seedreamTier);
    const selectedResolution = normalizeImageResolution(selectedProvider, resolution, workflow, selectedTier);
    if (selectedProvider === 'seedream') {
        const baseCost = SEEDREAM_KIE_CREDIT_PRICING[selectedTier][selectedResolution];
        const extraInputCost = normalizeImageWorkflow(workflow) === IMAGE_WORKFLOWS.IMAGE_TO_IMAGE
            ? Math.max(0, Number(imageCount) - 1) * 0.5
            : 0;
        return baseCost + extraInputCost;
    }
    return IMAGE_KIE_CREDIT_PRICING[selectedProvider][selectedResolution];
}

function getImageCreditCost(provider, resolution, workflow = IMAGE_WORKFLOWS.TEXT_TO_IMAGE, seedreamTier = 'lite', imageCount = 0) {
    return veilpixCreditsFromKieCredits(getImageKieCreditCost(provider, resolution, workflow, seedreamTier, imageCount));
}

function getImageCreditDetails(provider, resolution, workflow = IMAGE_WORKFLOWS.TEXT_TO_IMAGE, seedreamTier = 'lite', imageCount = 0) {
    const selectedProvider = normalizeImageProvider(provider);
    const selectedWorkflow = normalizeImageWorkflow(workflow);
    const selectedTier = normalizeSeedreamTier(seedreamTier);
    const selectedResolution = normalizeImageResolution(selectedProvider, resolution, selectedWorkflow, selectedTier);
    const kieCredits = getImageKieCreditCost(selectedProvider, selectedResolution, selectedWorkflow, selectedTier, imageCount);
    const credits = veilpixCreditsFromKieCredits(kieCredits);

    return {
        provider: selectedProvider,
        workflow: selectedWorkflow,
        resolution: selectedResolution,
        seedreamTier: selectedProvider === 'seedream' ? selectedTier : undefined,
        kieCredits,
        credits,
        costUsd: Number((kieCredits * KIE_CREDIT_USD).toFixed(4)),
        chargedAmountUsd: Number((credits * VEILPIX_CREDIT_USD).toFixed(4))
    };
}

function getWanImageModel(resolution, workflow = IMAGE_WORKFLOWS.TEXT_TO_IMAGE) {
    const selectedResolution = normalizeImageResolution('wanimage', resolution, workflow);
    const selectedWorkflow = normalizeImageWorkflow(workflow);
    return selectedWorkflow === IMAGE_WORKFLOWS.TEXT_TO_IMAGE && selectedResolution === '4K'
        ? 'wan/2-7-image-pro'
        : 'wan/2-7-image';
}

module.exports = {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    DEFAULT_RESOLUTIONS,
    IMAGE_ALLOWED_RESOLUTIONS,
    IMAGE_KIE_CREDIT_PRICING,
    SEEDREAM_KIE_CREDIT_PRICING,
    IMAGE_WORKFLOWS,
    KIE_CREDIT_USD,
    TARGET_MARGIN,
    VEILPIX_CREDIT_USD,
    getAllowedImageResolutions,
    getImageCreditCost,
    getImageCreditDetails,
    getImageKieCreditCost,
    getWanImageModel,
    normalizeImageProvider,
    normalizeImageResolution,
    normalizeImageWorkflow,
    normalizeSeedreamTier,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
};
