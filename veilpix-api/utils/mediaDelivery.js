const crypto = require('crypto');
const path = require('path');
const { getSupabaseClient } = require('./database');

const DELIVERY_BUCKET = 'media-deliveries';
const DELIVERY_TTL_HOURS = 48;
const SIGNED_DOWNLOAD_TTL_SECONDS = 10 * 60;

const MIME_EXTENSIONS = {
    'image/avif': 'avif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'application/pdf': 'pdf'
};

function normalizeMimeType(value, artifactType = 'file') {
    const mimeType = String(value || '').split(';')[0].trim().toLowerCase();
    if (mimeType) return mimeType;
    if (artifactType === 'image') return 'image/png';
    if (artifactType === 'video') return 'video/mp4';
    if (artifactType === 'audio') return 'audio/mpeg';
    return 'application/octet-stream';
}

function extensionForMimeType(mimeType, sourceUrl = '') {
    const known = MIME_EXTENSIONS[mimeType];
    if (known) return known;
    try {
        const extension = path.extname(new URL(sourceUrl).pathname).slice(1).toLowerCase();
        if (/^[a-z0-9]{1,8}$/.test(extension)) return extension;
    } catch {
        // Fall through to a safe binary extension.
    }
    return 'bin';
}

function artifactTypeFromResult(result) {
    if (typeof result?.videoUrl === 'string') return { artifactType: 'video', sourceUrl: result.videoUrl };
    if (typeof result?.imageUrl === 'string') return { artifactType: 'image', sourceUrl: result.imageUrl };
    if (typeof result?.audioUrl === 'string') return { artifactType: 'audio', sourceUrl: result.audioUrl };
    if (typeof result?.fileUrl === 'string') return { artifactType: 'file', sourceUrl: result.fileUrl };
    return null;
}

function parseSerializedGenerationResult(value) {
    if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
    try {
        const result = JSON.parse(value);
        const artifact = artifactTypeFromResult(result);
        return artifact ? { ...artifact, result } : null;
    } catch {
        return null;
    }
}

function safeProvider(value) {
    return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 64) || 'unknown';
}

function storageObjectUrl(bucket, objectPath) {
    const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    if (!supabaseUrl) throw new Error('SUPABASE_URL is unavailable');
    return `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
}

async function uploadResponseStream(response, bucket, objectPath, mimeType) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is unavailable');
    if (!response.body) throw new Error('Generated media response did not contain a body');

    const headers = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true'
    };
    const contentLength = response.headers.get('content-length');
    if (contentLength && /^\d+$/.test(contentLength)) headers['Content-Length'] = contentLength;

    const uploadResponse = await fetch(storageObjectUrl(bucket, objectPath), {
        method: 'POST',
        headers,
        body: response.body,
        duplex: 'half',
        signal: AbortSignal.timeout(10 * 60 * 1000)
    });
    if (!uploadResponse.ok) {
        throw new Error(`Delivery storage upload failed with HTTP ${uploadResponse.status}`);
    }
    return contentLength ? Number(contentLength) : null;
}

async function stageMediaDelivery({ clerkUserId, generationId, artifactType, provider, sourceUrl }) {
    if (!clerkUserId || !generationId || !artifactType || !sourceUrl) {
        throw new Error('Incomplete media delivery details');
    }

    const existing = await getDeliveryByGeneration(clerkUserId, generationId, artifactType);
    if (existing) return existing;

    const downloadResponse = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(5 * 60 * 1000)
    });
    if (!downloadResponse.ok) {
        throw new Error(`Generated media download failed with HTTP ${downloadResponse.status}`);
    }

    const mimeType = normalizeMimeType(downloadResponse.headers.get('content-type'), artifactType);
    const extension = extensionForMimeType(mimeType, sourceUrl);
    const id = crypto.randomUUID();
    const userPartition = crypto.createHash('sha256').update(clerkUserId).digest('hex').slice(0, 24);
    const objectPath = `${userPartition}/${generationId}/${id}.${extension}`;
    const fileName = `${artifactType}-${generationId}.${extension}`;
    const sizeBytes = await uploadResponseStream(downloadResponse, DELIVERY_BUCKET, objectPath, mimeType);
    const expiresAt = new Date(Date.now() + DELIVERY_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('media_deliveries')
        .insert({
            id,
            generation_id: generationId,
            clerk_user_id: clerkUserId,
            artifact_type: artifactType,
            provider: safeProvider(provider),
            storage_bucket: DELIVERY_BUCKET,
            storage_path: objectPath,
            mime_type: mimeType,
            file_name: fileName,
            size_bytes: sizeBytes,
            expires_at: expiresAt
        })
        .select()
        .single();

    if (error) {
        await supabase.storage.from(DELIVERY_BUCKET).remove([objectPath]);
        throw error;
    }
    return data;
}

async function getDeliveryByGeneration(clerkUserId, generationId, artifactType = null) {
    const supabase = getSupabaseClient();
    let query = supabase
        .from('media_deliveries')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .eq('generation_id', generationId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .limit(1);
    if (artifactType) query = query.eq('artifact_type', artifactType);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
}

async function listPendingDeliveries(clerkUserId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('media_deliveries')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function createDeliveryDownloadUrl(delivery) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
        .from(delivery.storage_bucket)
        .createSignedUrl(delivery.storage_path, SIGNED_DOWNLOAD_TTL_SECONDS);
    if (error || !data?.signedUrl) throw error || new Error('Could not create delivery URL');
    return data.signedUrl;
}

async function acknowledgeDelivery(clerkUserId, deliveryId) {
    const supabase = getSupabaseClient();
    const { data: delivery, error } = await supabase
        .from('media_deliveries')
        .select('*')
        .eq('id', deliveryId)
        .eq('clerk_user_id', clerkUserId)
        .maybeSingle();
    if (error) throw error;
    if (!delivery) return { acknowledged: true, alreadyRemoved: true };

    const { error: storageError } = await supabase.storage
        .from(delivery.storage_bucket)
        .remove([delivery.storage_path]);
    if (storageError) throw storageError;

    const { error: deleteError } = await supabase
        .from('media_deliveries')
        .delete()
        .eq('id', delivery.id)
        .eq('clerk_user_id', clerkUserId);
    if (deleteError) throw deleteError;

    await supabase
        .from('usage_logs')
        .update({ error_message: JSON.stringify({ delivered: true }) })
        .eq('clerk_user_id', clerkUserId)
        .eq('gemini_request_id', delivery.generation_id)
        .eq('success', true);

    return { acknowledged: true, alreadyRemoved: false };
}

async function acknowledgeDeliveryByGeneration(clerkUserId, generationId) {
    const delivery = await getDeliveryByGeneration(clerkUserId, generationId);
    if (!delivery) return { acknowledged: true, alreadyRemoved: true };
    return acknowledgeDelivery(clerkUserId, delivery.id);
}

async function cleanupExpiredDeliveries() {
    const supabase = getSupabaseClient();
    const { data: expired, error } = await supabase
        .from('media_deliveries')
        .select('*')
        .lt('expires_at', new Date().toISOString())
        .limit(100);
    if (error) throw error;
    for (const delivery of expired || []) {
        await supabase.storage.from(delivery.storage_bucket).remove([delivery.storage_path]);
        await supabase.from('media_deliveries').delete().eq('id', delivery.id);
        await supabase
            .from('usage_logs')
            .update({ error_message: JSON.stringify({ expired: true }) })
            .eq('clerk_user_id', delivery.clerk_user_id)
            .eq('gemini_request_id', delivery.generation_id)
            .eq('success', true);
    }
    return expired?.length || 0;
}

module.exports = {
    DELIVERY_BUCKET,
    DELIVERY_TTL_HOURS,
    artifactTypeFromResult,
    parseSerializedGenerationResult,
    stageMediaDelivery,
    getDeliveryByGeneration,
    listPendingDeliveries,
    createDeliveryDownloadUrl,
    acknowledgeDelivery,
    acknowledgeDeliveryByGeneration,
    cleanupExpiredDeliveries
};
