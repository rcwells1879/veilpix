/**
 * Temporary Supabase Storage uploads for URL-based AI providers.
 *
 * Uploads use Supabase's resumable TUS endpoint instead of standard uploads.
 * The 6 MB chunk size and resumable retries avoid restarting an entire media
 * transfer when the Storage edge drops a request.
 */

const { getSupabaseClient } = require('./database');
const crypto = require('crypto');
const tus = require('tus-js-client');

const TEMP_IMAGE_BUCKET = 'temp-images';
const CLEANUP_HOURS = 2;
const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_RETRY_DELAYS_MS = [0, 1000, 3000, 5000];

function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class TimedHttpRequest {
    constructor(request, timeoutMs) {
        this.request = request;
        this.timeoutMs = timeoutMs;
    }

    getMethod() {
        return this.request.getMethod();
    }

    getURL() {
        return this.request.getURL();
    }

    setHeader(header, value) {
        this.request.setHeader(header, value);
    }

    getHeader(header) {
        return this.request.getHeader(header);
    }

    setProgressHandler(handler) {
        this.request.setProgressHandler(handler);
    }

    send(body) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                callback(value);
            };
            const timeout = setTimeout(() => {
                const error = new Error(`Storage upload request timed out after ${this.timeoutMs}ms`);
                error.code = 'TEMPORARY_STORAGE_TIMEOUT';
                Promise.resolve(this.request.abort())
                    .catch(() => {})
                    .finally(() => finish(reject, error));
            }, this.timeoutMs);

            this.request.send(body).then(
                response => finish(resolve, response),
                error => finish(reject, error)
            );
        });
    }

    abort() {
        return this.request.abort();
    }

    getUnderlyingObject() {
        return this.request.getUnderlyingObject();
    }
}

class TimedHttpStack {
    constructor(timeoutMs, requestOptions = {}) {
        this.timeoutMs = timeoutMs;
        this.stack = new tus.DefaultHttpStack(requestOptions);
    }

    createRequest(method, url) {
        return new TimedHttpRequest(this.stack.createRequest(method, url), this.timeoutMs);
    }

    getName() {
        return 'VeilPixTimedNodeHttpStack';
    }
}

function storageSettings(options = {}) {
    const supabaseUrl = (options.supabaseUrl || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const serviceRoleKey = options.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
    }

    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    const timeoutMs = positiveInteger(
        options.timeoutMs || process.env.SUPABASE_STORAGE_UPLOAD_TIMEOUT_MS,
        DEFAULT_REQUEST_TIMEOUT_MS
    );

    return {
        supabaseUrl,
        serviceRoleKey,
        endpoint: options.endpoint
            || `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
        UploadClass: options.UploadClass || tus.Upload,
        httpStack: options.httpStack || new TimedHttpStack(timeoutMs, {
            agent: false
        }),
        retryDelays: options.retryDelays || DEFAULT_RETRY_DELAYS_MS
    };
}

function uploadStorageObject(fileBuffer, mimeType, filename, options = {}) {
    const {
        supabaseUrl,
        serviceRoleKey,
        endpoint,
        UploadClass,
        httpStack,
        retryDelays
    } = storageSettings(options);

    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const upload = new UploadClass(fileBuffer, {
            endpoint,
            headers: {
                apikey: serviceRoleKey,
                authorization: `Bearer ${serviceRoleKey}`,
                'x-upsert': 'true'
            },
            metadata: {
                bucketName: TEMP_IMAGE_BUCKET,
                objectName: filename,
                contentType: mimeType,
                cacheControl: '3600'
            },
            chunkSize: TUS_CHUNK_SIZE_BYTES,
            retryDelays,
            uploadDataDuringCreation: true,
            storeFingerprintForResuming: false,
            removeFingerprintOnSuccess: true,
            httpStack,
            onError: reject,
            onSuccess: () => resolve({
                url: `${supabaseUrl}/storage/v1/object/public/${TEMP_IMAGE_BUCKET}/${encodeURIComponent(filename)}`,
                elapsedMs: Date.now() - startedAt
            })
        });

        try {
            upload.start();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Upload a media buffer to Supabase Storage and return a public URL.
 *
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @param {string} _userId Accepted for caller compatibility
 * @param {string} label
 * @returns {Promise<{success: boolean, url?: string, filename?: string, error?: string, errorCode?: string}>}
 */
async function uploadTemporaryFile(fileBuffer, mimeType, _userId = 'anonymous', label = 'file', options = {}) {
    try {
        if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
            throw new Error(`The ${label} is empty`);
        }

        const timestamp = Date.now();
        const randomId = crypto.randomBytes(8).toString('hex');
        const extension = mimeType.split('/')[1] || 'bin';
        const filename = `${timestamp}_${randomId}.${extension}`;

        console.log(`Uploading temporary ${label} (${fileBuffer.length} bytes)`);
        const uploadResult = await uploadStorageObject(fileBuffer, mimeType, filename, options);
        console.log(`Temporary ${label} uploaded in ${uploadResult.elapsedMs}ms`);

        return {
            success: true,
            url: uploadResult.url,
            filename
        };
    } catch (error) {
        console.error(`Temporary ${label} upload failed:`, error);
        return {
            success: false,
            error: 'Temporary storage is unavailable. Please try again.',
            errorCode: 'TEMPORARY_STORAGE_UNAVAILABLE'
        };
    }
}

async function uploadTemporaryImage(imageBuffer, mimeType, userId = 'anonymous') {
    return uploadTemporaryFile(imageBuffer, mimeType, userId, 'image');
}

async function uploadTemporaryVideo(videoBuffer, mimeType, userId = 'anonymous') {
    return uploadTemporaryFile(videoBuffer, mimeType, userId, 'video');
}

async function uploadMultipleImages(images, userId = 'anonymous') {
    try {
        const results = await Promise.all(images.map(image =>
            uploadTemporaryImage(image.buffer, image.mimeType, userId)
        ));
        const failures = results.filter(result => !result.success);

        if (failures.length > 0) {
            await deleteMultipleImages(
                results.filter(result => result.success).map(result => result.filename)
            );
            return {
                success: false,
                errors: failures.map(failure => failure.error)
            };
        }

        return {
            success: true,
            urls: results.map(result => result.url),
            filenames: results.map(result => result.filename)
        };
    } catch (error) {
        console.error('Temporary multi-image upload failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function deleteTemporaryImage(filename) {
    try {
        const supabase = getSupabaseClient();
        const { error } = await supabase.storage
            .from(TEMP_IMAGE_BUCKET)
            .remove([filename]);

        if (error) {
            return {
                success: false,
                error: error.message
            };
        }

        return { success: true };
    } catch (error) {
        console.error('Temporary image deletion failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function deleteMultipleImages(filenames) {
    if (filenames.length === 0) return { success: true };

    try {
        const supabase = getSupabaseClient();
        const { error } = await supabase.storage
            .from(TEMP_IMAGE_BUCKET)
            .remove(filenames);

        if (error) {
            return {
                success: false,
                error: error.message
            };
        }

        return { success: true };
    } catch (error) {
        console.error('Temporary image deletion failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function cleanupOldImages() {
    try {
        const supabase = getSupabaseClient();
        const { data: files, error: listError } = await supabase.storage
            .from(TEMP_IMAGE_BUCKET)
            .list();

        if (listError) {
            return {
                success: false,
                error: listError.message
            };
        }

        const cutoffTime = Date.now() - (CLEANUP_HOURS * 60 * 60 * 1000);
        const oldFiles = files.filter(file => {
            const match = file.name.match(/(\d+)_/);
            return match && Number.parseInt(match[1], 10) < cutoffTime;
        });

        if (oldFiles.length === 0) {
            return {
                success: true,
                deletedCount: 0
            };
        }

        const deleteResult = await deleteMultipleImages(oldFiles.map(file => file.name));
        if (!deleteResult.success) return deleteResult;

        return {
            success: true,
            deletedCount: oldFiles.length
        };
    } catch (error) {
        console.error('Temporary image cleanup failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    uploadTemporaryImage,
    uploadTemporaryVideo,
    uploadTemporaryFile,
    uploadStorageObject,
    uploadMultipleImages,
    deleteTemporaryImage,
    deleteMultipleImages,
    cleanupOldImages,
    TimedHttpStack,
    TUS_CHUNK_SIZE_BYTES,
    TEMP_IMAGE_BUCKET
};
