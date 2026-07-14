import { getGalleryImage } from './workflowStorage';

export const VEILPIX_GALLERY_IMAGE_TYPE = 'application/x-veilpix-gallery-image';
export const VEILPIX_GALLERY_IMAGE_PREFIX = 'veilpix-gallery-image:';

const IMAGE_FILE_EXTENSION = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_FILE_EXTENSION.test(file.name);
}

function getFileNameFromUrl(url: string, mimeType: string): string {
  try {
    const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'dropped-image');
    if (IMAGE_FILE_EXTENSION.test(fileName)) return fileName;
  } catch {
    // Data URLs and malformed source URLs fall through to a generated name.
  }

  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  return `dropped-image.${extension}`;
}

function getGalleryImageId(dataTransfer: DataTransfer): number | null {
  const customValue = dataTransfer.getData(VEILPIX_GALLERY_IMAGE_TYPE);
  const plainValue = dataTransfer.getData('text/plain');
  const rawId = customValue || (plainValue.startsWith(VEILPIX_GALLERY_IMAGE_PREFIX)
    ? plainValue.slice(VEILPIX_GALLERY_IMAGE_PREFIX.length)
    : '');
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function getImageFileFromUrl(sourceUrl: string): Promise<File> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Image request failed with status ${response.status}`);

  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('The dropped link does not point to an image');

  return new File([blob], getFileNameFromUrl(sourceUrl, blob.type), { type: blob.type });
}

export function getClipboardImageFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];

  const itemFiles = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file) && isImageFile(file));
  return itemFiles.length > 0 ? itemFiles : Array.from(dataTransfer.files).filter(isImageFile);
}

export async function getDroppedImageFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const galleryImageId = getGalleryImageId(dataTransfer);
  if (galleryImageId) {
    const details = await getGalleryImage(galleryImageId);
    if (!details) throw new Error('The original gallery image could not be loaded');
    return [details.file];
  }

  const droppedFiles = Array.from(dataTransfer.files).filter(isImageFile);
  if (droppedFiles.length > 0) return droppedFiles;

  const itemFiles = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file) && isImageFile(file));
  if (itemFiles.length > 0) return itemFiles;

  const html = dataTransfer.getData('text/html');
  const htmlImageUrl = html
    ? new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.src
    : null;
  const plainValue = dataTransfer.getData('text/uri-list')
    .split('\n')
    .find((line) => line && !line.startsWith('#'))
    || dataTransfer.getData('text/plain');
  const sourceUrl = htmlImageUrl || plainValue.trim();

  if (!sourceUrl || !/^(https?:|data:|blob:)/i.test(sourceUrl)) return [];
  return [await getImageFileFromUrl(sourceUrl)];
}

export async function prepareImageFiles(files: File[]): Promise<File[]> {
  const imageFiles = files.filter(isImageFile);
  if (imageFiles.length === 0) return [];

  const { processFileForUpload } = await import('./heicConverter');
  return Promise.all(imageFiles.map(processFileForUpload));
}
