/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts a HEIC file to JPEG format using dynamic import to avoid bundle bloat
 */
export async function convertHEICToJPEG(file: File): Promise<File> {
  console.log('🔄 Starting HEIC conversion:', {
    originalFile: file.name,
    originalSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    originalType: file.type
  });

  try {
    // Dynamic import to avoid adding heic-to to main bundle
    console.log('📦 Loading heic-to library...');
    const { heicTo, isHeic } = await import('heic-to');
    console.log('✅ heic-to library loaded successfully');

    // Double-check that this is actually a HEIC file
    const isHeicFile = await isHeic(file);
    if (!isHeicFile) {
      throw new Error('File is not a valid HEIC/HEIF image');
    }

    const convertedBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.85 // High quality JPEG conversion
    });

    // Create new File object with JPEG extension
    const originalName = file.name.replace(/\.(heic|heif)$/i, '');
    const jpegFile = new File([convertedBlob], `${originalName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });

    console.log('✅ HEIC conversion successful:', {
      convertedFile: jpegFile.name,
      convertedSize: `${(jpegFile.size / 1024 / 1024).toFixed(2)} MB`,
      convertedType: jpegFile.type,
      sizeReduction: `${((1 - jpegFile.size / file.size) * 100).toFixed(1)}%`
    });

    return jpegFile;
  } catch (error) {
    console.error('❌ HEIC conversion failed:', error);
    throw new Error(`Failed to convert HEIC image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks if a file is a HEIC/HEIF format using both local detection and heic-to library
 */
export async function isHEIC(file: File): Promise<boolean> {
  const heicMimeTypes = ['image/heic', 'image/heif'];
  const heicExtensions = ['.heic', '.heif'];

  // Quick local check first
  const fileName = file.name.toLowerCase();
  const hasHeicExtension = heicExtensions.some(ext => fileName.endsWith(ext));
  const hasHeicMimeType = heicMimeTypes.includes(file.type);

  if (hasHeicExtension || hasHeicMimeType) {
    try {
      // Use heic-to library for more accurate detection
      console.log('🔍 Performing HEIC format validation...');
      const { isHeic } = await import('heic-to');
      return await isHeic(file);
    } catch (error) {
      console.warn('Could not validate HEIC format, falling back to extension check:', error);
      return hasHeicExtension;
    }
  }

  return false;
}

/**
 * Processes a file and converts it to JPEG if it's HEIC, otherwise returns the original file
 */
export async function processFileForUpload(file: File): Promise<File> {
  if (await isHEIC(file)) {
    console.log('📸 HEIC file detected, converting to JPEG...');
    return await convertHEICToJPEG(file);
  }

  console.log('📁 Regular image file, no conversion needed:', {
    file: file.name,
    type: file.type,
    size: `${(file.size / 1024 / 1024).toFixed(2)} MB`
  });

  return file;
}