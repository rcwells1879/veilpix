const express = require('express');
const { db } = require('../utils/database');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    normalizeVideoGenerationId,
    videoGenerationJobResponse
} = require('../utils/videoGenerationJob');

const router = express.Router();

router.use(getUser, requireAuth, requireAllowedEmail);

router.get('/:generationId', async (req, res) => {
    const generationId = normalizeVideoGenerationId(req.params.generationId);
    if (!generationId) {
        return res.status(400).json({ error: 'Invalid video generation ID' });
    }

    try {
        const { job, error } = await db.getVideoGenerationJob(req.user.userId, generationId);
        if (error) throw error;

        res.set('Cache-Control', 'no-store');
        return res.json(videoGenerationJobResponse(job));
    } catch (error) {
        console.error('Failed to recover video generation:', error);
        return res.status(500).json({
            error: 'Failed to check video generation',
            message: 'We could not check that video yet. VeilPix will try again.'
        });
    }
});

module.exports = router;
