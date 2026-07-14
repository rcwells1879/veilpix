/**
 * Image Upload Utility for Temporary Supabase Storage
 *
 * Uploads image buffers to Supabase Storage and returns public URLs
 * for use with image-URL-based APIs like SeeDream
 *
 * NOTE: Nano Banana (Gemini) uses in-memory buffers with base64 encoding.
 * SeeDream requires image URLs, so we temporarily store in Supabase Storage
 * to avoid overloading the VPS filesystem.
 */

const { getSupabaseClient } = require('./database');
const crypto = require('crypto');

// Supabase Storage bucket name for temporary images
const TEMP_IMAGE_BUCKET = 'temp-images';

// Auto-cleanup time for temporary images (2 hours - enough for API processing)
const CLEANUP_HOURS = 2;

/**
 * Upload an image buffer to Supabase Storage and return a public URL
 *
 * @param {Buffer} imageBuffer - The image file buffer
 * @param {string} mimeType - The MIME type of the image (e.g., 'image/png')
 * @param {string} userId - Accepted for caller compatibility; never written into the public object key
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
async function uploadTemporaryFile(fileBuffer, mimeType, _userId = 'anonymous', label = 'file') {
    try {
        const supabase = getSupabaseClient();

        // Generate unique filename with timestamp for auto-cleanup
        const timestamp = Date.now();
        const randomId = crypto.randomBytes(8).toString('hex');
        const extension = mimeType.split('/')[1] || 'bin';
        const filename = `${timestamp}_${randomId}.${extension}`;

        console.log(`📤 Uploading temporary ${label}`);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from(TEMP_IMAGE_BUCKET)
            .upload(filename, fileBuffer, {
                contentType: mimeType,
                cacheControl: '3600', // 1 hour cache
                upsert: false
            });

        if (error) {
            console.error(`❌ Failed to upload ${label} to storage:`, error);
            return {
                success: false,
                error: error.message
            };
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(TEMP_IMAGE_BUCKET)
            .getPublicUrl(filename);

        if (!urlData || !urlData.publicUrl) {
            console.error(`❌ Failed to get public URL for uploaded ${label}`);
            return {
                success: false,
                error: 'Failed to generate public URL'
            };
        }

        console.log(`✅ Temporary ${label} uploaded successfully`);

        return {
            success: true,
            url: urlData.publicUrl,
            filename: filename
        };

    } catch (error) {
        console.error(`❌ Exception during ${label} upload:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function uploadTemporaryImage(imageBuffer, mimeType, userId = 'anonymous') {
    return uploadTemporaryFile(imageBuffer, mimeType, userId, 'image');
}

async function uploadTemporaryVideo(videoBuffer, mimeType, userId = 'anonymous') {
    return uploadTemporaryFile(videoBuffer, mimeType, userId, 'video');
}

/**
 * Upload multiple image buffers to Supabase Storage
 *
 * @param {Array<{buffer: Buffer, mimeType: string}>} images - Array of image data
 * @param {string} userId - Optional user ID for organizing uploads
 * @returns {Promise<{success: boolean, urls?: string[], errors?: string[]}>}
 */
async function uploadMultipleImages(images, userId = 'anonymous') {
    try {
        console.log(`📤 Uploading ${images.length} temporary images`);

        const uploadPromises = images.map(img =>
            uploadTemporaryImage(img.buffer, img.mimeType, userId)
        );

        const results = await Promise.all(uploadPromises);

        // Check if all uploads succeeded
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
            console.error(`❌ ${failures.length}/${images.length} uploads failed`);
            return {
                success: false,
                errors: failures.map(f => f.error)
            };
        }

        const urls = results.map(r => r.url);
        console.log(`✅ Successfully uploaded ${urls.length} images`);

        return {
            success: true,
            urls,
            filenames: results.map(r => r.filename)
        };

    } catch (error) {
        console.error('❌ Exception during multiple image upload:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Delete a temporary image from storage
 *
 * @param {string} filename - The filename to delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteTemporaryImage(filename) {
    try {
        const supabase = getSupabaseClient();

        console.log('🗑️ Deleting temporary image');

        const { error } = await supabase.storage
            .from(TEMP_IMAGE_BUCKET)
            .remove([filename]);

        if (error) {
            console.error('❌ Failed to delete image:', error);
            return {
                success: false,
                error: error.message
            };
        }

        console.log('✅ Temporary image deleted successfully');
        return { success: true };

    } catch (error) {
        console.error('❌ Exception during image deletion:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Delete multiple temporary images from storage
 *
 * @param {string[]} filenames - Array of filenames to delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteMultipleImages(filenames) {
    try {
        const supabase = getSupabaseClient();

        console.log(`🗑️ Deleting ${filenames.length} temporary images`);

        const { error } = await supabase.storage
            .from(TEMP_IMAGE_BUCKET)
            .remove(filenames);

        if (error) {
            console.error('❌ Failed to delete images:', error);
            return {
                success: false,
                error: error.message
            };
        }

        console.log(`✅ ${filenames.length} images deleted successfully`);
        return { success: true };

    } catch (error) {
        console.error('❌ Exception during multiple image deletion:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Cleanup old temporary images (older than CLEANUP_HOURS)
 * This can be called periodically or via a cron job
 *
 * @returns {Promise<{success: boolean, deletedCount?: number, error?: string}>}
 */
async function cleanupOldImages() {
    try {
        const supabase = getSupabaseClient();

        console.log(`🧹 Starting cleanup of images older than ${CLEANUP_HOURS} hours`);

        // List all files in the bucket
        const { data: files, error: listError } = await supabase.storage
            .from(TEMP_IMAGE_BUCKET)
            .list();

        if (listError) {
            console.error('❌ Failed to list images for cleanup:', listError);
            return {
                success: false,
                error: listError.message
            };
        }

        // Filter files older than CLEANUP_HOURS
        const cutoffTime = Date.now() - (CLEANUP_HOURS * 60 * 60 * 1000);
        const oldFiles = files.filter(file => {
            // Extract timestamp from filename (format: timestamp_randomid.ext)
            const match = file.name.match(/(\d+)_/);
            if (match) {
                const fileTimestamp = parseInt(match[1]);
                return fileTimestamp < cutoffTime;
            }
            return false;
        });

        if (oldFiles.length === 0) {
            console.log('✅ No old images to cleanup');
            return {
                success: true,
                deletedCount: 0
            };
        }

        // Delete old files
        const filenames = oldFiles.map(f => f.name);
        const deleteResult = await deleteMultipleImages(filenames);

        if (!deleteResult.success) {
            return deleteResult;
        }

        console.log(`✅ Cleanup complete: deleted ${oldFiles.length} old images`);
        return {
            success: true,
            deletedCount: oldFiles.length
        };

    } catch (error) {
        console.error('❌ Exception during cleanup:', error);
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
    uploadMultipleImages,
    deleteTemporaryImage,
    deleteMultipleImages,
    cleanupOldImages,
    TEMP_IMAGE_BUCKET
};
