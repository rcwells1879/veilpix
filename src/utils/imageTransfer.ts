import { getGalleryImage, getGalleryVideoDetails } from './workflowStorage';

export const VEILPIX_GALLERY_IMAGE_TYPE = 'application/x-veilpix-gallery-image';
export const VEILPIX_GALLERY_IMAGE_PREFIX = 'veilpix-gallery-image:';
export const VEILPIX_GALLERY_VIDEO_TYPE = 'application/x-veilpix-gallery-video';
export const VEILPIX_GALLERY_VIDEO_PREFIX = 'veilpix-gallery-video:';

/** Resolve a gallery video drag payload to its gallery id, if present. */
export function getGalleryVideoDragId(dataTransfer: DataTransfer): number | null {
  const customValue = dataTransfer.getData(VEILPIX_GALLERY_VIDEO_TYPE);
  const plainValue = dataTransfer.getData('text/plain');
  const rawId = customValue || (plainValue.startsWith(VEILPIX_GALLERY_VIDEO_PREFIX)
    ? plainValue.slice(VEILPIX_GALLERY_VIDEO_PREFIX.length)
    : '');
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const IMAGE_FILE_EXTENSION = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;
const HEIC_FILE_EXTENSION = /\.(heic|heif)$/i;
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);
const VIDEO_FILE_EXTENSION = /\.(m4v|mkv|mov|mp4|webm)$/i;

export type ClipboardMediaKind = 'image' | 'video';

const CLIPBOARD_URL_PROTOCOL = /^(https?:|data:|blob:)/i;

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_FILE_EXTENSION.test(file.name);
}

function isLikelyHEICFile(file: File): boolean {
  return HEIC_MIME_TYPES.has(file.type.toLowerCase()) || HEIC_FILE_EXTENSION.test(file.name);
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_FILE_EXTENSION.test(file.name);
}

function getClipboardFileName(kind: ClipboardMediaKind, mimeType: string, index: number): string {
  const subtype = mimeType.split('/')[1]?.split(';')[0]?.toLowerCase();
  const extension = subtype === 'jpeg'
    ? 'jpg'
    : subtype === 'quicktime'
      ? 'mov'
      : subtype?.replace(/[^a-z0-9]/g, '') || (kind === 'image' ? 'png' : 'mp4');
  return `clipboard-${kind}${index > 0 ? `-${index + 1}` : ''}.${extension}`;
}

/**
 * Read binary media after a user gesture. Mobile Safari/Chrome can expose copied
 * media through this API, while browsers that do not can still use a paste event
 * or the device file picker.
 */
export async function readClipboardMediaFiles(kind: ClipboardMediaKind): Promise<File[]> {
  const clipboard = navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>;
  };
  if (!clipboard?.read) {
    throw new Error('Clipboard media access is unavailable in this browser.');
  }

  const items = await clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    const mimeType = item.types.find((type) => type.toLowerCase().startsWith(`${kind}/`));
    if (!mimeType) continue;
    const blob = await item.getType(mimeType);
    files.push(blob instanceof File && blob.name
      ? blob
      : new File([blob], getClipboardFileName(kind, mimeType, files.length), {
          type: blob.type || mimeType,
          lastModified: Date.now(),
        }));
  }
  if (files.length > 0) return files;

  // Copy Image in a browser often places HTML or a URL on the clipboard instead
  // of a binary image. Resolve those representations before reporting an empty
  // clipboard, while still requiring the fetched response to be actual media.
  const sourceUrls: string[] = [];
  for (const item of items) {
    const htmlType = item.types.find((type) => type.toLowerCase() === 'text/html');
    if (htmlType && kind === 'image') {
      const html = await (await item.getType(htmlType)).text();
      const document = new DOMParser().parseFromString(html, 'text/html');
      document.querySelectorAll('img').forEach((image) => {
        const sourceUrl = image.currentSrc || image.src;
        if (CLIPBOARD_URL_PROTOCOL.test(sourceUrl)) sourceUrls.push(sourceUrl);
      });
    }

    const urlType = item.types.find((type) => type.toLowerCase() === 'text/uri-list');
    const plainType = item.types.find((type) => type.toLowerCase() === 'text/plain');
    const textType = urlType || plainType;
    if (textType) {
      const text = await (await item.getType(textType)).text();
      const sourceUrl = text.split('\n').map((line) => line.trim()).find((line) => (
        line.length > 0 && !line.startsWith('#') && CLIPBOARD_URL_PROTOCOL.test(line)
      ));
      if (sourceUrl) sourceUrls.push(sourceUrl);
    }
  }

  const uniqueUrls = [...new Set(sourceUrls)];
  for (const sourceUrl of uniqueUrls) {
    try {
      files.push(kind === 'image'
        ? await getImageFileFromUrl(sourceUrl)
        : await getVideoFileFromUrl(sourceUrl));
    } catch {
      // A copied page may include inaccessible or non-media URLs. Try the next
      // clipboard representation before falling back to native paste/upload.
    }
  }
  return files;
}

async function getVideoFileFromUrl(sourceUrl: string): Promise<File> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Video request failed with status ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('video/') && !blob.size) throw new Error('The dropped link does not point to a video');
  let fileName = 'reference-video.mp4';
  try {
    const candidate = decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop() || '');
    if (VIDEO_FILE_EXTENSION.test(candidate)) fileName = candidate;
  } catch {
    // Keep the safe default name.
  }
  return new File([blob], fileName, { type: blob.type || 'video/mp4' });
}

export async function getDroppedVideoFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const galleryVideoId = getGalleryVideoDragId(dataTransfer);
  if (galleryVideoId) {
    const details = await getGalleryVideoDetails(galleryVideoId);
    if (!details) throw new Error('The original Album video could not be loaded');
    if (details.videoFile) return [details.videoFile];
    if (details.videoUrl) return [await getVideoFileFromUrl(details.videoUrl)];
    return [];
  }

  const droppedFiles = Array.from(dataTransfer.files).filter(isVideoFile);
  if (droppedFiles.length > 0) return droppedFiles;
  const itemFiles = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file) && isVideoFile(file));
  if (itemFiles.length > 0) return itemFiles;

  const sourceUrl = dataTransfer.getData('text/uri-list')
    .split('\n')
    .find((line) => line && !line.startsWith('#'))
    || dataTransfer.getData('text/plain').trim();
  if (!sourceUrl || !/^https?:/i.test(sourceUrl)) return [];
  return [await getVideoFileFromUrl(sourceUrl)];
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

async function waitForPastedImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('The pasted image took too long to load.'));
    }, 10_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
    };
    const onLoad = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('The pasted image could not be decoded.')); };
    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
  });
}

async function pastedImageElementToFile(image: HTMLImageElement, index: number): Promise<File> {
  const sourceUrl = image.currentSrc || image.src;
  if (CLIPBOARD_URL_PROTOCOL.test(sourceUrl)) {
    try {
      return await getImageFileFromUrl(sourceUrl);
    } catch {
      // WebKit can render pasteboard-backed URLs that fetch() cannot read. Draw
      // the already-decoded element below as a final fallback.
    }
  }

  await waitForPastedImage(image);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The pasted image could not be converted.');
  return new File([blob], getClipboardFileName('image', 'image/png', index), {
    type: 'image/png',
    lastModified: Date.now(),
  });
}

/** Extract images that WebKit inserted into a native contenteditable paste target. */
export async function getPastedImageFilesFromElement(element: HTMLElement): Promise<File[]> {
  const images = Array.from(element.querySelectorAll('img'));
  const settled = await Promise.allSettled(images.map(pastedImageElementToFile));
  return settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
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

  // Album images and normal browser uploads are already provider-ready. Avoid
  // fetching the optional HEIC conversion chunk unless a file may need it.
  if (!imageFiles.some(isLikelyHEICFile)) return imageFiles;

  const { processFileForUpload } = await import('./heicConverter');
  return Promise.all(imageFiles.map((file) => (
    isLikelyHEICFile(file) ? processFileForUpload(file) : file
  )));
}

export function getClipboardVideoFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];

  const itemFiles = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file) && isVideoFile(file));
  return itemFiles.length > 0 ? itemFiles : Array.from(dataTransfer.files).filter(isVideoFile);
}
