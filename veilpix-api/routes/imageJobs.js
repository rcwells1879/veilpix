const express = require('express');
const { db } = require('../utils/database');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    normalizeGenerationId,
    imageGenerationJobResponse
} = require('../utils/imageGenerationJob');

const router = express.Router();

router.use(getUser, requireAuth, requireAllowedEmail);

router.get('/:generationId', async (req, res) => {
    const generationId = normalizeGenerationId(req.params.generationId);
    if (!generationId) {
        return res.status(400).json({ error: 'Invalid image generation ID' });
    }

    try {
        const { job, error } = await db.getImageGenerationJob(req.user.userId, generationId);
        if (error) throw error;

        const status = imageGenerationJobResponse(job);
        res.set('Cache-Control', 'no-store');
        if (status.status !== 'succeeded' || !status.imageUrl) {
            return res.json(status);
        }

        const imageResponse = await fetch(status.imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Generated image download returned ${imageResponse.status}`);
        }
        const data = Buffer.from(await imageResponse.arrayBuffer()).toString('base64');
        return res.json({
            status: 'succeeded',
            image: {
                data,
                mimeType: imageResponse.headers.get('content-type') || 'image/png'
            },
            creditsUsed: status.creditsUsed,
            processingTime: status.processingTime
        });
    } catch (error) {
        console.error('Failed to recover image generation:', error);
        return res.status(500).json({
            error: 'Failed to check image generation',
            message: 'We could not check that image yet. VeilPix will try again.'
        });
    }
});

module.exports = router;
