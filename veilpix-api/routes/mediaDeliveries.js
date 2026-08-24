const express = require('express');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const {
    listPendingDeliveries,
    createDeliveryDownloadUrl,
    acknowledgeDelivery,
    acknowledgeDeliveryByGeneration,
    cleanupExpiredDeliveries
} = require('../utils/mediaDelivery');
const { normalizeGenerationId } = require('../utils/videoGenerationJob');

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use(getUser, requireAuth, requireAllowedEmail);

router.get('/', async (req, res) => {
    try {
        await cleanupExpiredDeliveries();
        const deliveries = await listPendingDeliveries(req.user.userId);
        const response = await Promise.all(deliveries.map(async (delivery) => ({
            id: delivery.id,
            generationId: delivery.generation_id,
            artifactType: delivery.artifact_type,
            provider: delivery.provider,
            mimeType: delivery.mime_type,
            fileName: delivery.file_name,
            sizeBytes: delivery.size_bytes,
            createdAt: delivery.created_at,
            expiresAt: delivery.expires_at,
            downloadUrl: await createDeliveryDownloadUrl(delivery)
        })));
        res.set('Cache-Control', 'no-store');
        return res.json({ deliveries: response });
    } catch (error) {
        console.error('Failed to list media deliveries:', error);
        return res.status(500).json({ error: 'Failed to load pending creations' });
    }
});

router.post('/:deliveryId/ack', async (req, res) => {
    if (!UUID_PATTERN.test(String(req.params.deliveryId || ''))) {
        return res.status(400).json({ error: 'Invalid delivery ID' });
    }
    try {
        return res.json(await acknowledgeDelivery(req.user.userId, req.params.deliveryId));
    } catch (error) {
        console.error('Failed to acknowledge media delivery:', error);
        return res.status(500).json({ error: 'Failed to confirm local delivery' });
    }
});

router.post('/generation/:generationId/ack', async (req, res) => {
    const generationId = normalizeGenerationId(req.params.generationId);
    if (!generationId) return res.status(400).json({ error: 'Invalid generation ID' });
    try {
        return res.json(await acknowledgeDeliveryByGeneration(req.user.userId, generationId));
    } catch (error) {
        console.error('Failed to acknowledge generation delivery:', error);
        return res.status(500).json({ error: 'Failed to confirm local delivery' });
    }
});

module.exports = router;
