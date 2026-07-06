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
        'text-to-image': ['2K', '4K'],
        'image-to-image': ['2K', '4K']
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
        '2K': 6.5,
        '4K': 6.5
    },
    wanimage: {
        '1K': 4.8,
        '2K': 4.8,
        '4K': 12
    }
};

function normalizeImageProvider(provider) {
    return Object.prototype.hasOwnProperty.call(IMAGE_KIE_CREDIT_PRICING, provider) ? provider : 'seedream';
}

function normalizeImageWorkflow(workflow) {
    return workflow === IMAGE_WORKFLOWS.IMAGE_TO_IMAGE ? IMAGE_WORKFLOWS.IMAGE_TO_IMAGE : IMAGE_WORKFLOWS.TEXT_TO_IMAGE;
}

function getAllowedImageResolutions(provider, workflow) {
    const selectedProvider = normalizeImageProvider(provider);
    const selectedWorkflow = normalizeImageWorkflow(workflow);
    return IMAGE_ALLOWED_RESOLUTIONS[selectedProvider][selectedWorkflow];
}

function normalizeImageResolution(provider, resolution, workflow) {
    const selectedProvider = normalizeImageProvider(provider);
    const allowed = getAllowedImageResolutions(selectedProvider, workflow);
    return allowed.includes(resolution) ? resolution : DEFAULT_RESOLUTIONS[selectedProvider];
}

function veilpixCreditsFromUsd(usdCost) {
    return Math.max(1, Math.ceil((Number(usdCost) || 0) / BILLABLE_USD_PER_VEILPIX_CREDIT));
}

function veilpixCreditsFromKieCredits(kieCredits) {
    return veilpixCreditsFromUsd((Number(kieCredits) || 0) * KIE_CREDIT_USD);
}

function getImageKieCreditCost(provider, resolution, workflow = IMAGE_WORKFLOWS.TEXT_TO_IMAGE) {
    const selectedProvider = normalizeImageProvider(provider);
    const selectedResolution = normalizeImageResolution(selectedProvider, resolution, workflow);
    return IMAGE_KIE_CREDIT_PRICING[selectedProvider][selectedResolution];
}

function getImageCreditCost(provider, resolution, workflow = IMAGE_WORKFLOWS.TEXT_TO_IMAGE) {
    return veilpixCreditsFromKieCredits(getImageKieCreditCost(provider, resolution, workflow));
}

function getImageCreditDetails(provider, resolution, workflow = IMAGE_WORKFLOWS.TEXT_TO_IMAGE) {
    const selectedProvider = normalizeImageProvider(provider);
    const selectedWorkflow = normalizeImageWorkflow(workflow);
    const selectedResolution = normalizeImageResolution(selectedProvider, resolution, selectedWorkflow);
    const kieCredits = getImageKieCreditCost(selectedProvider, selectedResolution, selectedWorkflow);
    const credits = veilpixCreditsFromKieCredits(kieCredits);

    return {
        provider: selectedProvider,
        workflow: selectedWorkflow,
        resolution: selectedResolution,
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
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
};
