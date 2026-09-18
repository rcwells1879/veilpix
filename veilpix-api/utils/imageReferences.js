// Kie input-array limits, verified 2026-09-18. See docs/image-references.md.
const IMAGE_REFERENCE_LIMITS = Object.freeze({ nanobanana2: 14, seedream: 14, wanimage: 9, zimage: 0 });

function getImageReferenceLimit(provider, seedreamTier = 'lite') {
    return provider === 'seedream' && seedreamTier === 'pro' ? 10 : (IMAGE_REFERENCE_LIMITS[provider] ?? 0);
}

function validateImageReferences(provider) {
    return (req, res, next) => {
        const count = req.files?.images?.length ?? 0;
        const limit = getImageReferenceLimit(provider, req.body?.seedreamTier);
        if (count < 2 || count > limit) {
            return res.status(400).json({ error: `Provide between 2 and ${limit} images in prompt order.` });
        }
        next();
    };
}

function withImageUploadErrors(upload) {
    return (req, res, next) => upload(req, res, error => {
        if (error?.name === 'MulterError') {
            return res.status(400).json({ error: 'Too many input images or an image exceeds the upload size limit.' });
        }
        next(error);
    });
}

// These APIs accept ordered image arrays, not named base/style slots. Ground
// the UI's labels in that order without assigning a creative role to any image.
function buildReferencePrompt(prompt, imageCount, x = null, y = null) {
    const order = `The ${imageCount} input images are numbered Image 1 through Image ${imageCount} in the order provided.`;
    const point = x !== null && y !== null
        ? ` Focus the edit on Image 1 around coordinates (${x}, ${y}).`
        : '';
    return `${order}\n${prompt}${point}`;
}

module.exports = { IMAGE_REFERENCE_LIMITS, getImageReferenceLimit, validateImageReferences, withImageUploadErrors, buildReferencePrompt };
