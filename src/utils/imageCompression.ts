/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Image Compression Utility
 *
 * Compresses images client-side using Canvas API to reduce file size
 * for API providers with strict size limits (e.g., SeeDream 20MB limit)
 */

const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

/**
 * Compresses an image file using Canvas API if it exceeds the size limit
 *
 * @param file - The image file to potentially compress
 * @param maxSizeMB - Maximum allowed size in MB (default: 20MB)
 * @returns Promise resolving to the original or compressed file
 */
export async function compressImageIfNeeded(
  file: File,
  maxSizeMB: number = MAX_SIZE_MB
): Promise<File> {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  // If file is already under the limit, return it as-is
  if (file.size <= maxSizeBytes) {
    console.log(`✅ Image size (${(file.size / 1024 / 1024).toFixed(2)}MB) is within limit, no compression needed`);
    return file;
  }

  console.log(`🗜️ Image size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds ${maxSizeMB}MB limit, compressing...`);

  try {
    const compressedFile = await compressImage(file, maxSizeBytes);
    console.log(`✅ Compression complete: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
    return compressedFile;
  } catch (error) {
    console.error('❌ Compression failed:', error);
    throw new Error('Failed to compress image. Please try a smaller image.');
  }
}

/**
 * Compresses an image using Canvas API with iterative quality reduction
 *
 * @param file - The image file to compress
 * @param targetSizeBytes - Target size in bytes
 * @returns Promise resolving to compressed file
 */
async function compressImage(file: File, targetSizeBytes: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    img.onload = () => {
      // Start with original dimensions
      let width = img.width;
      let height = img.height;

      // Calculate scale factor if image is extremely large
      const maxDimension = 4096; // Max 4K resolution
      if (width > maxDimension || height > maxDimension) {
        const scale = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        console.log(`📏 Resizing dimensions: ${img.width}x${img.height} → ${width}x${height}`);
      }

      canvas.width = width;
      canvas.height = height;

      // Draw image to canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels to meet size requirement
      compressWithQuality(canvas, file.name, file.type, targetSizeBytes)
        .then(resolve)
        .catch(reject);

      // Clean up
      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
      URL.revokeObjectURL(img.src);
    };

    // Load image from file
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Iteratively compress with different quality settings until target size is met
 *
 * @param canvas - Canvas containing the image
 * @param fileName - Original file name
 * @param mimeType - Image MIME type
 * @param targetSizeBytes - Target size in bytes
 * @returns Promise resolving to compressed file
 */
async function compressWithQuality(
  canvas: HTMLCanvasElement,
  fileName: string,
  mimeType: string,
  targetSizeBytes: number
): Promise<File> {
  // Ensure we're using a format that supports quality parameter
  const outputType = mimeType === 'image/png' ? 'image/jpeg' : mimeType;

  // Try quality levels from 0.9 down to 0.5
  const qualityLevels = [0.9, 0.8, 0.7, 0.6, 0.5];

  for (const quality of qualityLevels) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), outputType, quality);
    });

    if (!blob) {
      continue;
    }

    console.log(`🔍 Trying quality ${quality}: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);

    // If this quality level meets our target, use it
    if (blob.size <= targetSizeBytes) {
      const extension = outputType.split('/')[1];
      const newFileName = fileName.replace(/\.[^.]+$/, `.${extension}`);
      return new File([blob], newFileName, { type: outputType });
    }
  }

  // If we still haven't met the target, try reducing dimensions
  return await compressWithResize(canvas, fileName, outputType, targetSizeBytes);
}

/**
 * Compress by reducing image dimensions if quality reduction wasn't enough
 *
 * @param canvas - Canvas containing the image
 * @param fileName - Original file name
 * @param mimeType - Image MIME type
 * @param targetSizeBytes - Target size in bytes
 * @returns Promise resolving to compressed file
 */
async function compressWithResize(
  canvas: HTMLCanvasElement,
  fileName: string,
  mimeType: string,
  targetSizeBytes: number
): Promise<File> {
  console.log('📐 Quality reduction insufficient, reducing dimensions...');

  const scaleFactors = [0.9, 0.8, 0.7, 0.6, 0.5];

  for (const scale of scaleFactors) {
    const newWidth = Math.round(canvas.width * scale);
    const newHeight = Math.round(canvas.height * scale);

    const resizedCanvas = document.createElement('canvas');
    const ctx = resizedCanvas.getContext('2d');

    if (!ctx) continue;

    resizedCanvas.width = newWidth;
    resizedCanvas.height = newHeight;
    ctx.drawImage(canvas, 0, 0, newWidth, newHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      resizedCanvas.toBlob((blob) => resolve(blob), mimeType, 0.85);
    });

    if (!blob) continue;

    console.log(`🔍 Trying scale ${scale} (${newWidth}x${newHeight}): ${(blob.size / 1024 / 1024).toFixed(2)}MB`);

    if (blob.size <= targetSizeBytes) {
      const extension = mimeType.split('/')[1];
      const newFileName = fileName.replace(/\.[^.]+$/, `.${extension}`);
      return new File([blob], newFileName, { type: mimeType });
    }
  }

  // If we still can't compress enough, throw an error
  throw new Error(`Unable to compress image below ${(targetSizeBytes / 1024 / 1024).toFixed(0)}MB. Please use a smaller image.`);
}

/**
 * Compress multiple images concurrently
 *
 * @param files - Array of image files to compress
 * @param maxSizeMB - Maximum allowed size in MB (default: 20MB)
 * @returns Promise resolving to array of original or compressed files
 */
export async function compressMultipleImages(
  files: File[],
  maxSizeMB: number = MAX_SIZE_MB
): Promise<File[]> {
  console.log(`🗜️ Compressing ${files.length} images if needed...`);

  const compressionPromises = files.map(file => compressImageIfNeeded(file, maxSizeMB));

  try {
    const compressedFiles = await Promise.all(compressionPromises);
    console.log(`✅ All images processed`);
    return compressedFiles;
  } catch (error) {
    console.error('❌ Failed to compress multiple images:', error);
    throw error;
  }
}
