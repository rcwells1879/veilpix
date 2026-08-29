const {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    KIE_CREDIT_USD,
    MIN_GROSS_USD_PER_VEILPIX_CREDIT,
    MIN_NET_USD_PER_VEILPIX_CREDIT,
    TARGET_MARGIN,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
} = require('./creditEconomics');

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
    },
    zimage: {
        'text-to-image': ['1K'],
        'image-to-image': []
    }
};

const DEFAULT_RESOLUTIONS = {
    nanobanana2: '2K',
    seedream: '2K',
    wanimage: '2K',
    zimage: '1K'
};

// Verified against Kie's live pricing table on 2026-08-29.
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
    },
    zimage: {
        '1K': 0.8
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

// Registered only for older clients; it is not exposed in the current UI.
const NANOBANANA_PRO_KIE_CREDIT_PRICING = {
    '1K': 18,
    '2K': 18,
    '4K': 24
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
    const selectedProvider = normalizeImageProvider(provider);
    const calculatedCredits = veilpixCreditsFromKieCredits(
        getImageKieCreditCost(selectedProvider, resolution, workflow, seedreamTier, imageCount)
    );
    return calculatedCredits;
}

function getNanoBananaProCreditCost(resolution = '2K') {
    const selectedResolution = resolution === '4K' ? '4K' : resolution === '1K' ? '1K' : '2K';
    return veilpixCreditsFromKieCredits(NANOBANANA_PRO_KIE_CREDIT_PRICING[selectedResolution]);
}

function getImageCreditDetails(provider, resolution, workflow = IMAGE_WORKFLOWS.TEXT_TO_IMAGE, seedreamTier = 'lite', imageCount = 0) {
    const selectedProvider = normalizeImageProvider(provider);
    const selectedWorkflow = normalizeImageWorkflow(workflow);
    const selectedTier = normalizeSeedreamTier(seedreamTier);
    const selectedResolution = normalizeImageResolution(selectedProvider, resolution, selectedWorkflow, selectedTier);
    const kieCredits = getImageKieCreditCost(selectedProvider, selectedResolution, selectedWorkflow, selectedTier, imageCount);
    const credits = getImageCreditCost(
        selectedProvider,
        selectedResolution,
        selectedWorkflow,
        selectedTier,
        imageCount
    );

    return {
        provider: selectedProvider,
        workflow: selectedWorkflow,
        resolution: selectedResolution,
        seedreamTier: selectedProvider === 'seedream' ? selectedTier : undefined,
        kieCredits,
        credits,
        costUsd: Number((kieCredits * KIE_CREDIT_USD).toFixed(4)),
        chargedAmountUsd: Number((credits * MIN_GROSS_USD_PER_VEILPIX_CREDIT).toFixed(4)),
        estimatedNetRevenueUsd: Number((credits * MIN_NET_USD_PER_VEILPIX_CREDIT).toFixed(4))
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
    NANOBANANA_PRO_KIE_CREDIT_PRICING,
    SEEDREAM_KIE_CREDIT_PRICING,
    IMAGE_WORKFLOWS,
    KIE_CREDIT_USD,
    MIN_GROSS_USD_PER_VEILPIX_CREDIT,
    MIN_NET_USD_PER_VEILPIX_CREDIT,
    TARGET_MARGIN,
    getAllowedImageResolutions,
    getImageCreditCost,
    getImageCreditDetails,
    getImageKieCreditCost,
    getNanoBananaProCreditCost,
    getWanImageModel,
    normalizeImageProvider,
    normalizeImageResolution,
    normalizeImageWorkflow,
    normalizeSeedreamTier,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
};
