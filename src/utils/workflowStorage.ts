/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Browser-local workflow and Album persistence using IndexedDB.
 * Generation inputs/outputs may use the API's temporary provider and delivery
 * storage, but this module keeps the user's durable Album in the browser.
 */

import {
  extractVideoThumbnailFrame,
  isImageBlobNearlyBlack,
} from './videoFrameExtraction';

const DB_NAME = 'veilpix-workflow';
const DB_VERSION = 3;
const STORE_NAME = 'workflow';
const GALLERY_STORE_NAME = 'gallery';
const PENDING_VIDEO_INPUTS_STORE_NAME = 'pending-video-inputs';
const WORKFLOW_KEY = 'current';
const MAX_GALLERY_IMAGES = 20;
const DELIVERY_RECEIPT_STORAGE_KEY = 'veilpix-media-delivery-receipts';
const DELIVERY_RECEIPT_TTL_MS = 48 * 60 * 60 * 1000;
const PENDING_VIDEO_INPUT_TTL_MS = 48 * 60 * 60 * 1000;

type LocalDeliveryReceipts = Record<string, number>;

function readLocalDeliveryReceipts(now = Date.now()): LocalDeliveryReceipts {
  try {
    const raw = localStorage.getItem(DELIVERY_RECEIPT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as LocalDeliveryReceipts : {};
    const active = Object.fromEntries(
      Object.entries(parsed).filter(([generationId, expiresAt]) => (
        generationId.length > 0 && Number.isFinite(expiresAt) && expiresAt > now
      ))
    );
    if (Object.keys(active).length !== Object.keys(parsed).length) {
      localStorage.setItem(DELIVERY_RECEIPT_STORAGE_KEY, JSON.stringify(active));
    }
    return active;
  } catch {
    return {};
  }
}

/**
 * Record that this browser has verified a delivery in its local Album. The
 * receipt outlives Album deletion or eviction so a temporary account delivery
 * does not re-add an item that was deliberately removed in this browser.
 */
export function markLocalDeliveryReceipt(generationId: string, expiresAt?: string): void {
  if (!generationId) return;
  try {
    const receipts = readLocalDeliveryReceipts();
    const parsedExpiry = expiresAt ? Date.parse(expiresAt) : NaN;
    receipts[generationId] = Number.isFinite(parsedExpiry)
      ? parsedExpiry
      : Date.now() + DELIVERY_RECEIPT_TTL_MS;
    localStorage.setItem(DELIVERY_RECEIPT_STORAGE_KEY, JSON.stringify(receipts));
  } catch {
    // IndexedDB verification still prevents duplication during this page load.
  }
}

/** Whether this browser has already accepted this temporary account delivery. */
export function hasLocalDeliveryReceipt(generationId: string): boolean {
  return Boolean(generationId && readLocalDeliveryReceipts()[generationId]);
}

interface StoredWorkflow {
  images: Array<{
    blob: Blob;
    name: string;
    type: string;
    prompt?: string;
  }>;
  historyIndex: number;
  savedAt: number;
}

export interface GalleryImage {
  id?: number;
  blob: Blob;
  thumbnail: Blob;
  createdAt: number;
  name: string;
  type?: 'image' | 'video'; // undefined treated as 'image' for backward compat
  videoUrl?: string;         // External URL for video entries
  videoBlob?: Blob;          // Local copy for video entries when the provider URL is temporary
  videoDuration?: number;
  hasReferenceImage?: boolean;
  provider?: 'wan' | 'wan3' | 'seedance';
  generationId?: string;
  wan3InputMode?: 'frames' | 'references' | 'file' | 'link';
  wan3Variant?: 'standard' | 'prime';
  seedanceInputMode?: 'frames' | 'references';
  seedanceVariant?: 'v2_5' | 'regular' | 'fast' | 'mini';
  videoOutputFormat?: 'mp4' | 'mov';
  referenceImages?: StoredGalleryFile[];
  imageProvider?: 'nanobanana2' | 'seedream' | 'wanimage' | 'zimage';
  imageResolution?: '1K' | '2K' | '4K';
  imageAspectRatio?: string;
  imageSeedreamTier?: 'lite' | 'pro';
  imageOutputFormat?: 'png' | 'jpeg';
  styleImage?: StoredGalleryFile;
  prompt?: string;
}

export interface GalleryThumbnail {
  id: number;
  thumbnail: Blob;
  createdAt: number;
  name: string;
  type: 'image' | 'video';
  videoUrl?: string;
  videoDuration?: number;
  hasReferenceImage?: boolean;
  provider?: 'wan' | 'wan3' | 'seedance';
  prompt?: string;
}

export interface GalleryImageDetails {
  file: File;
  prompt: string;
  imageProvider?: 'nanobanana2' | 'seedream' | 'wanimage' | 'zimage';
  imageResolution?: '1K' | '2K' | '4K';
  imageAspectRatio?: string;
  imageSeedreamTier?: 'lite' | 'pro';
  imageOutputFormat?: 'png' | 'jpeg';
  styleImage: File | null;
}

export interface SaveImageToGalleryContext {
  imageProvider?: 'nanobanana2' | 'seedream' | 'wanimage' | 'zimage';
  imageResolution?: '1K' | '2K' | '4K';
  imageAspectRatio?: string;
  imageSeedreamTier?: 'lite' | 'pro';
  imageOutputFormat?: 'png' | 'jpeg';
  styleImage?: File | null;
}

function mergeImageGenerationContext(
  entry: GalleryImage,
  prompt: string,
  context: SaveImageToGalleryContext,
): GalleryImage {
  return {
    ...entry,
    prompt: prompt || entry.prompt || '',
    imageProvider: context.imageProvider ?? entry.imageProvider,
    imageResolution: context.imageResolution ?? entry.imageResolution,
    imageAspectRatio: context.imageAspectRatio ?? entry.imageAspectRatio,
    imageSeedreamTier: context.imageSeedreamTier ?? entry.imageSeedreamTier,
    imageOutputFormat: context.imageOutputFormat ?? entry.imageOutputFormat,
    styleImage: context.styleImage === undefined
      ? entry.styleImage
      : context.styleImage
        ? toStoredGalleryFile(context.styleImage)
        : undefined,
  };
}

interface StoredGalleryFile {
  blob: Blob;
  name: string;
  type: string;
  lastModified?: number;
}

interface StoredPendingVideoInputs {
  generationId: string;
  referenceImages: StoredGalleryFile[];
  savedAt: number;
}

export interface GalleryVideoDetails {
  videoUrl: string;
  videoFile: File | null;
  referenceImage: File | null;
  referenceImages: File[];
  videoDuration?: number;
  provider?: 'wan' | 'wan3' | 'seedance';
  wan3InputMode?: 'frames' | 'references' | 'file' | 'link';
  wan3Variant?: 'standard' | 'prime';
  seedanceInputMode?: 'frames' | 'references';
  seedanceVariant?: 'v2_5' | 'regular' | 'fast' | 'mini';
  videoOutputFormat?: 'mp4' | 'mov';
  prompt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 * Handles version upgrades by closing existing connections
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      dbPromise = null; // Reset so we can retry
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;

      // Handle connection being blocked or version change
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };

      // Verify all required stores exist, otherwise force upgrade
      if (!db.objectStoreNames.contains(GALLERY_STORE_NAME)) {
        console.log('Gallery store missing, forcing database upgrade...');
        db.close();
        dbPromise = null;
        // Delete and recreate the database
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => {
          // Re-open with fresh database
          openDB().then(resolve).catch(reject);
        };
        deleteRequest.onerror = () => {
          reject(new Error('Failed to upgrade database'));
        };
        return;
      }

      if (db.objectStoreNames.contains(PENDING_VIDEO_INPUTS_STORE_NAME)) {
        const transaction = db.transaction(PENDING_VIDEO_INPUTS_STORE_NAME, 'readwrite');
        const savedAtIndex = transaction.objectStore(PENDING_VIDEO_INPUTS_STORE_NAME).index('savedAt');
        const expiredCursor = savedAtIndex.openCursor(
          IDBKeyRange.upperBound(Date.now() - PENDING_VIDEO_INPUT_TTL_MS)
        );
        expiredCursor.onsuccess = () => {
          const cursor = expiredCursor.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
        transaction.onerror = () => {
          console.warn('Could not clean up expired pending video reference images:', transaction.error);
        };
      }

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      // v2: Add gallery store with auto-increment id
      if (!db.objectStoreNames.contains(GALLERY_STORE_NAME)) {
        const galleryStore = db.createObjectStore(GALLERY_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        galleryStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      // v3: Keep active video reference images in the browser so an async
      // delivery can preserve them after a reload or suspended tab.
      if (!db.objectStoreNames.contains(PENDING_VIDEO_INPUTS_STORE_NAME)) {
        const pendingVideoInputsStore = db.createObjectStore(PENDING_VIDEO_INPUTS_STORE_NAME, {
          keyPath: 'generationId',
        });
        pendingVideoInputsStore.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };

    request.onblocked = () => {
      console.warn('Database upgrade blocked. Please close other tabs using this app.');
      dbPromise = null;
    };
  });

  return dbPromise;
}

/**
 * Save workflow to IndexedDB
 * Converts File objects to storable format
 */
export async function saveWorkflow(history: File[], historyIndex: number, prompts: string[] = []): Promise<void> {
  if (history.length === 0) {
    // Don't save empty workflows, but clear any existing one
    await clearWorkflow();
    return;
  }

  try {
    const db = await openDB();

    // Convert Files to storable format (keeping blob data, name, and type)
    const images = history.map((file, index) => ({
      blob: file as Blob,
      name: file.name,
      type: file.type,
      prompt: prompts[index] || '',
    }));

    const workflow: StoredWorkflow = {
      images,
      historyIndex,
      savedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(workflow, WORKFLOW_KEY);

      request.onerror = () => {
        console.error('Failed to save workflow:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.error('Failed to save workflow to IndexedDB:', error);
    // Don't throw - persistence failure shouldn't break the app
  }
}

/**
 * Load workflow from IndexedDB
 * Converts stored format back to File objects
 */
export async function loadWorkflow(): Promise<{ history: File[]; historyIndex: number; prompts: string[] } | null> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(WORKFLOW_KEY);

      request.onerror = () => {
        console.error('Failed to load workflow:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const workflow = request.result as StoredWorkflow | undefined;

        if (!workflow || !workflow.images || workflow.images.length === 0) {
          resolve(null);
          return;
        }

        // Convert stored blobs back to File objects
        const history = workflow.images.map(({ blob, name, type }) =>
          new File([blob], name, { type })
        );

        resolve({
          history,
          historyIndex: workflow.historyIndex,
          prompts: workflow.images.map(image => image.prompt || ''),
        });
      };
    });
  } catch (error) {
    console.error('Failed to load workflow from IndexedDB:', error);
    return null;
  }
}

/**
 * Clear stored workflow from IndexedDB
 */
export async function clearWorkflow(): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(WORKFLOW_KEY);

      request.onerror = () => {
        console.error('Failed to clear workflow:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.error('Failed to clear workflow from IndexedDB:', error);
  }
}

// Debounce helper for saving
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced save - waits 500ms after last call before actually saving
 * This prevents excessive writes during rapid edits
 */
export function debouncedSaveWorkflow(history: File[], historyIndex: number, prompts: string[] = []): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveWorkflow(history, historyIndex, prompts);
    saveTimeout = null;
  }, 500);
}

// ============================================================================
// Gallery Functions
// ============================================================================

/**
 * Create a thumbnail from an image file (200px max dimension)
 */
async function createThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const maxSize = 200;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create thumbnail blob'));
          }
        },
        'image/jpeg',
        0.8
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail'));
    };

    img.src = url;
  });
}

/**
 * Save an image to the gallery
 * Creates a thumbnail and stores both the full image and thumbnail
 * Enforces MAX_GALLERY_IMAGES limit by removing oldest
 */
export async function saveToGallery(
  image: File,
  prompt = '',
  generationId?: string,
  context: SaveImageToGalleryContext = {},
): Promise<boolean> {
  try {
    const db = await openDB();
    if (generationId) {
      const existingEntry = await new Promise<GalleryImage | undefined>((resolve, reject) => {
        const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
        const request = transaction.objectStore(GALLERY_STORE_NAME).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(
          (request.result as GalleryImage[]).find(entry => entry.generationId === generationId)
        );
      });
      if (existingEntry?.id !== undefined) {
        const mergedEntry = mergeImageGenerationContext(existingEntry, prompt, context);
        return new Promise<boolean>((resolve, reject) => {
          const transaction = db.transaction(GALLERY_STORE_NAME, 'readwrite');
          transaction.objectStore(GALLERY_STORE_NAME).put(mergedEntry);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      }
    }
    const thumbnail = await createThumbnail(image);

    const galleryImage: GalleryImage = {
      blob: image,
      thumbnail,
      createdAt: Date.now(),
      name: image.name,
      prompt,
      generationId,
      imageProvider: context.imageProvider,
      imageResolution: context.imageResolution,
      imageAspectRatio: context.imageAspectRatio,
      imageSeedreamTier: context.imageSeedreamTier,
      imageOutputFormat: context.imageOutputFormat,
      styleImage: context.styleImage ? toStoredGalleryFile(context.styleImage) : undefined,
    };

    return new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(GALLERY_STORE_NAME);

      // Add the new image
      const addRequest = store.add(galleryImage);

      addRequest.onerror = () => {
        console.error('Failed to save to gallery:', addRequest.error);
        reject(addRequest.error);
      };

      addRequest.onsuccess = () => {
        // Check count and remove oldest if over limit
        const countRequest = store.count();
        countRequest.onsuccess = () => {
          const count = countRequest.result;
          if (count > MAX_GALLERY_IMAGES) {
            // Get oldest entries to delete
            const deleteCount = count - MAX_GALLERY_IMAGES;
            const index = store.index('createdAt');
            const cursorRequest = index.openCursor();
            let deleted = 0;

            cursorRequest.onsuccess = (event) => {
              const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor && deleted < deleteCount) {
                store.delete(cursor.primaryKey);
                deleted++;
                cursor.continue();
              }
            };
          }
        };
        resolve(true);
      };
    });
  } catch (error) {
    console.error('Failed to save to gallery:', error);
    return false;
  }
}

/**
 * Get all gallery images (thumbnails only, for fast loading)
 * Returns most recent first
 */
export async function getGalleryImages(): Promise<GalleryThumbnail[]> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(GALLERY_STORE_NAME);
      const index = store.index('createdAt');
      const request = index.openCursor(null, 'prev'); // Newest first

      const thumbnails: GalleryThumbnail[] = [];

      request.onerror = () => {
        console.error('Failed to get gallery images:', request.error);
        reject(request.error);
      };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const { id, thumbnail, createdAt, name, type, videoUrl, videoDuration, hasReferenceImage, provider, prompt } = cursor.value as GalleryImage;
          thumbnails.push({ id: id!, thumbnail, createdAt, name, type: type || 'image', videoUrl, videoDuration, hasReferenceImage, provider, prompt });
          cursor.continue();
        } else {
          resolve(thumbnails);
        }
      };
    });
  } catch (error) {
    console.error('Failed to get gallery images:', error);
    return [];
  }
}

/**
 * Get a full-size gallery image by ID for re-editing
 * Returns File for images, or { videoUrl, referenceImage } for videos
 */
export async function getGalleryImage(id: number): Promise<GalleryImageDetails | null> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(GALLERY_STORE_NAME);
      const request = store.get(id);

      request.onerror = () => {
        console.error('Failed to get gallery image:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const image = request.result as GalleryImage | undefined;
        if (image?.blob) {
          const file = new File([image.blob], image.name, { type: image.blob.type || 'image/png' });
          resolve({
            file,
            prompt: image.prompt || '',
            imageProvider: image.imageProvider,
            imageResolution: image.imageResolution,
            imageAspectRatio: image.imageAspectRatio,
            imageSeedreamTier: image.imageSeedreamTier,
            imageOutputFormat: image.imageOutputFormat,
            styleImage: image.styleImage
              ? fromStoredGalleryFile(image.styleImage, 'style-reference.png')
              : null,
          });
        } else {
          resolve(null);
        }
      };
    });
  } catch (error) {
    console.error('Failed to get gallery image:', error);
    return null;
  }
}

/**
 * Get the video URL for a video gallery entry
 */
export async function getGalleryVideoUrl(id: number): Promise<string | null> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(GALLERY_STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = request.result as GalleryImage | undefined;
        resolve(entry?.videoUrl || null);
      };
    });
  } catch (error) {
    console.error('Failed to get gallery video URL:', error);
    return null;
  }
}

function toStoredGalleryFile(file: File): StoredGalleryFile {
  return {
    blob: file,
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
  };
}

function fromStoredGalleryFile(file: StoredGalleryFile, fallbackName: string): File {
  return new File([file.blob], file.name || fallbackName, {
    type: file.type || file.blob.type || 'image/png',
    lastModified: file.lastModified,
  });
}

/**
 * Persist active video reference images locally until the generated video has
 * been verified in this browser's Album. This store is never synchronized to
 * the account delivery outbox or any server-side database.
 */
export async function savePendingVideoReferenceImages(
  generationId: string,
  referenceImages: File[],
): Promise<void> {
  if (!generationId) return;
  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PENDING_VIDEO_INPUTS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PENDING_VIDEO_INPUTS_STORE_NAME);
    store.put({
      generationId,
      referenceImages: referenceImages.map(toStoredGalleryFile),
      savedAt: Date.now(),
    } satisfies StoredPendingVideoInputs);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getPendingVideoReferenceImages(generationId: string): Promise<File[]> {
  if (!generationId) return [];
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PENDING_VIDEO_INPUTS_STORE_NAME, 'readonly');
    const request = transaction.objectStore(PENDING_VIDEO_INPUTS_STORE_NAME).get(generationId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const entry = request.result as StoredPendingVideoInputs | undefined;
      resolve(entry?.referenceImages.map((file, index) => (
        fromStoredGalleryFile(file, `pending-video-reference-${index + 1}.png`)
      )) ?? []);
    };
  });
}

export async function clearPendingVideoReferenceImages(generationId: string): Promise<void> {
  if (!generationId) return;
  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PENDING_VIDEO_INPUTS_STORE_NAME, 'readwrite');
    transaction.objectStore(PENDING_VIDEO_INPUTS_STORE_NAME).delete(generationId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * Image and video generations share the same browser-only 48-hour input
 * snapshot store. Generation UUIDs are unique, so the image style reference
 * can use the established durable path without another IndexedDB migration.
 */
export async function savePendingImageStyleImage(
  generationId: string,
  styleImage: File | null,
): Promise<void> {
  return savePendingVideoReferenceImages(generationId, styleImage ? [styleImage] : []);
}

export async function getPendingImageStyleImage(generationId: string): Promise<File | null> {
  return (await getPendingVideoReferenceImages(generationId))[0] ?? null;
}

export async function clearPendingImageStyleImage(generationId: string): Promise<void> {
  return clearPendingVideoReferenceImages(generationId);
}

export async function getGalleryVideoDetails(id: number): Promise<GalleryVideoDetails | null> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(GALLERY_STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = async () => {
        const entry = request.result as GalleryImage | undefined;
        if (!entry?.videoUrl) {
          resolve(null);
          return;
        }
        const referenceImages = entry.referenceImages?.length
          ? entry.referenceImages.map((file, index) => fromStoredGalleryFile(file, `video-reference-${index + 1}.png`))
          : entry.hasReferenceImage && entry.blob
            ? [new File([entry.blob], entry.name.replace(/\.mp4$/i, '-reference.jpg'), { type: entry.blob.type || 'image/jpeg' })]
            : [];
        const downloadedVideoBlob = entry.videoBlob ? null : await fetchVideoBlob(entry.videoUrl);
        const videoBlob = entry.videoBlob || downloadedVideoBlob;
        const videoFile = videoBlob
          ? new File([videoBlob], entry.name || `video-${id}.mp4`, { type: videoBlob.type || 'video/mp4' })
          : null;
        resolve({
          videoUrl: entry.videoUrl,
          videoFile,
          referenceImage: referenceImages[0] ?? null,
          referenceImages,
          videoDuration: entry.videoDuration,
          provider: entry.provider,
          wan3InputMode: entry.wan3InputMode,
          wan3Variant: entry.wan3Variant,
          // Older gallery records did not persist the Seedance mode. Treat a
          // two-image legacy record as the likely first/end-frame workflow.
          seedanceInputMode: entry.seedanceInputMode
            ?? (entry.provider === 'seedance' && referenceImages.length === 2 ? 'frames' : undefined),
          seedanceVariant: entry.seedanceVariant,
          videoOutputFormat: entry.videoOutputFormat,
          prompt: entry.prompt || '',
        });
      };
    });
  } catch (error) {
    console.error('Failed to get gallery video details:', error);
    return null;
  }
}

async function createVideoPlaceholderThumbnail(): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 320, 180);
      gradient.addColorStop(0, '#111827');
      gradient.addColorStop(1, '#0ea5e9');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(140, 65);
      ctx.lineTo(140, 115);
      ctx.lineTo(185, 90);
      ctx.closePath();
      ctx.fill();
    }
    canvas.toBlob((blob) => resolve(blob || new Blob()), 'image/jpeg', 0.8);
  });
}

async function createVideoFrameThumbnail(source: File | string): Promise<Blob | null> {
  try {
    return await extractVideoThumbnailFrame(source);
  } catch (error) {
    console.warn('Could not extract a usable video thumbnail:', error);
    return null;
  }
}

async function fetchVideoBlob(videoUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.type.startsWith('video/') || blob.size > 0 ? blob : null;
  } catch (error) {
    console.warn('Could not save local copy of generated video:', error);
    return null;
  }
}

let galleryVideoThumbnailRepairPromise: Promise<number> | null = null;

async function updateGalleryThumbnail(entry: GalleryImage, thumbnail: Blob): Promise<void> {
  if (entry.id === undefined) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(GALLERY_STORE_NAME, 'readwrite');
    const request = transaction.objectStore(GALLERY_STORE_NAME).put({ ...entry, thumbnail });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Repairs previously saved black video thumbnails in the background. Existing
 * local video blobs are preferred, while a non-black placeholder is used when
 * the old video can no longer be decoded or downloaded.
 */
export function repairBlackVideoThumbnails(): Promise<number> {
  if (galleryVideoThumbnailRepairPromise) return galleryVideoThumbnailRepairPromise;

  galleryVideoThumbnailRepairPromise = (async () => {
    try {
      const db = await openDB();
      const entries = await new Promise<GalleryImage[]>((resolve, reject) => {
        const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
        const request = transaction.objectStore(GALLERY_STORE_NAME).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as GalleryImage[]);
      });

      let repaired = 0;
      for (const entry of entries) {
        if (entry.type !== 'video') continue;

        let isBlack = false;
        try {
          isBlack = await isImageBlobNearlyBlack(entry.thumbnail);
        } catch {
          // An unreadable thumbnail should be repaired just like a black one.
          isBlack = true;
        }
        if (!isBlack) continue;

        const source = entry.videoBlob
          ? new File([entry.videoBlob], entry.name || 'gallery-video.mp4', {
              type: entry.videoBlob.type || 'video/mp4',
            })
          : entry.videoUrl;
        const extracted = source ? await createVideoFrameThumbnail(source) : null;
        const replacement = extracted || await createVideoPlaceholderThumbnail();
        await updateGalleryThumbnail(entry, replacement);
        repaired += 1;
      }

      return repaired;
    } catch (error) {
      console.warn('Could not repair old video thumbnails:', error);
      return 0;
    }
  })();

  return galleryVideoThumbnailRepairPromise;
}

export interface SaveVideoToGalleryOptions {
  videoUrl: string;
  videoFile?: File | null;
  generationId?: string;
  provider?: 'wan' | 'wan3' | 'seedance';
  referenceImage?: File | null;
  referenceImages?: File[];
  referenceVideoFile?: File | null;
  referenceVideoUrl?: string | null;
  videoDuration?: number;
  wan3InputMode?: 'frames' | 'references' | 'file' | 'link';
  wan3Variant?: 'standard' | 'prime';
  seedanceInputMode?: 'frames' | 'references';
  seedanceVariant?: 'v2_5' | 'regular' | 'fast' | 'mini';
  videoOutputFormat?: 'mp4' | 'mov';
  prompt?: string;
}

/**
 * Save a video blob to the browser-local Album, retaining the URL only as
 * compatibility metadata and generating a thumbnail when possible.
 */
export async function saveVideoToGallery(options: SaveVideoToGalleryOptions): Promise<boolean> {
  try {
    const {
      videoUrl,
      videoFile = null,
      generationId,
      provider,
      referenceImage = null,
      referenceImages = [],
      referenceVideoFile = null,
      referenceVideoUrl = null,
      videoDuration,
      wan3InputMode,
      wan3Variant,
      seedanceInputMode,
      seedanceVariant,
      videoOutputFormat,
      prompt = ''
    } = options;
    const resolvedVideoOutputFormat = videoOutputFormat ?? 'mp4';
    const maxStoredReferenceImages = provider === 'seedance'
      ? seedanceVariant === 'v2_5' ? 30 : 9
      : provider === 'wan3' ? 10 : 5;
    const storedReferenceImages = referenceImages.length > 0
      ? referenceImages.slice(0, maxStoredReferenceImages)
      : referenceImage
        ? [referenceImage]
        : [];
    const db = await openDB();
    if (generationId) {
      const existingEntry = await new Promise<GalleryImage | undefined>((resolve, reject) => {
        const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
        const request = transaction.objectStore(GALLERY_STORE_NAME).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(
          (request.result as GalleryImage[]).find(entry => entry.generationId === generationId)
        );
      });
      if (existingEntry?.id !== undefined) {
        const incomingReferenceImages = storedReferenceImages.map(toStoredGalleryFile);
        const mergedReferenceImages = incomingReferenceImages.length > 0
          ? incomingReferenceImages
          : existingEntry.referenceImages ?? [];
        const mergedEntry: GalleryImage = {
          ...existingEntry,
          videoUrl: existingEntry.videoUrl || videoUrl,
          videoBlob: existingEntry.videoBlob || videoFile || undefined,
          videoDuration: videoDuration ?? existingEntry.videoDuration,
          hasReferenceImage: mergedReferenceImages.length > 0 || existingEntry.hasReferenceImage,
          provider: provider ?? existingEntry.provider,
          wan3InputMode: wan3InputMode ?? existingEntry.wan3InputMode,
          wan3Variant: wan3Variant ?? existingEntry.wan3Variant,
          seedanceInputMode: seedanceInputMode ?? existingEntry.seedanceInputMode,
          seedanceVariant: seedanceVariant ?? existingEntry.seedanceVariant,
          videoOutputFormat: videoOutputFormat ?? existingEntry.videoOutputFormat ?? 'mp4',
          referenceImages: mergedReferenceImages,
          prompt: prompt || existingEntry.prompt || '',
        };

        return new Promise<boolean>((resolve, reject) => {
          const transaction = db.transaction(GALLERY_STORE_NAME, 'readwrite');
          transaction.objectStore(GALLERY_STORE_NAME).put(mergedEntry);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      }
    }
    const videoBlob = videoFile || await fetchVideoBlob(videoUrl);
    if (!videoBlob) {
      throw new Error('The generated video could not be stored in this browser.');
    }
    const generatedVideoThumbnail = videoBlob
      ? await createVideoFrameThumbnail(new File([videoBlob], `video-${Date.now()}.${resolvedVideoOutputFormat}`, { type: videoBlob.type || `video/${resolvedVideoOutputFormat === 'mov' ? 'quicktime' : 'mp4'}` }))
      : await createVideoFrameThumbnail(videoUrl);
    const referenceVideoThumbnail = generatedVideoThumbnail
      ? null
      : referenceVideoFile
        ? await createVideoFrameThumbnail(referenceVideoFile)
        : referenceVideoUrl
          ? await createVideoFrameThumbnail(referenceVideoUrl)
          : null;
    const thumbnail =
      generatedVideoThumbnail ||
      referenceVideoThumbnail ||
      (storedReferenceImages[0] ? await createThumbnail(storedReferenceImages[0]) : await createVideoPlaceholderThumbnail());
    const storedBlob = storedReferenceImages[0] || thumbnail;

    const galleryEntry: GalleryImage = {
      blob: storedBlob,
      thumbnail,
      createdAt: Date.now(),
      name: `video-${Date.now()}.${resolvedVideoOutputFormat}`,
      type: 'video',
      videoUrl,
      videoBlob: videoBlob || undefined,
      videoDuration,
      hasReferenceImage: storedReferenceImages.length > 0,
      provider,
      generationId,
      wan3InputMode,
      wan3Variant,
      seedanceInputMode,
      seedanceVariant,
      videoOutputFormat: resolvedVideoOutputFormat,
      referenceImages: storedReferenceImages.map(toStoredGalleryFile),
      prompt,
    };

    return new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(GALLERY_STORE_NAME);

      const addRequest = store.add(galleryEntry);

      addRequest.onerror = () => {
        console.error('Failed to save video to gallery:', addRequest.error);
        reject(addRequest.error);
      };

      addRequest.onsuccess = () => {
        // Enforce max gallery size
        const countRequest = store.count();
        countRequest.onsuccess = () => {
          const count = countRequest.result;
          if (count > MAX_GALLERY_IMAGES) {
            const deleteCount = count - MAX_GALLERY_IMAGES;
            const index = store.index('createdAt');
            const cursorRequest = index.openCursor();
            let deleted = 0;

            cursorRequest.onsuccess = (event) => {
              const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor && deleted < deleteCount) {
                store.delete(cursor.primaryKey);
                deleted++;
                cursor.continue();
              }
            };
          }
        };
        resolve(true);
      };
    });
  } catch (error) {
    console.error('Failed to save video to gallery:', error);
    return false;
  }
}

/** Verify that a generated artifact is durably readable from local IndexedDB. */
export async function hasGalleryArtifact(
  generationId: string,
  artifactType: 'image' | 'video'
): Promise<boolean> {
  try {
    const db = await openDB();
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
      const request = transaction.objectStore(GALLERY_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = (request.result as GalleryImage[]).find(item => item.generationId === generationId);
        if (!entry) return resolve(false);
        if (artifactType === 'video') {
          return resolve(entry.type === 'video' && Boolean(entry.videoBlob?.size));
        }
        return resolve((entry.type || 'image') === 'image' && Boolean(entry.blob?.size));
      };
    });
  } catch (error) {
    console.warn('Could not verify local gallery delivery:', error);
    return false;
  }
}

/** Verify that a saved video also contains its reusable image-reference context. */
export async function hasGalleryVideoReferences(
  generationId: string,
  expectedReferenceCount: number,
): Promise<boolean> {
  if (expectedReferenceCount <= 0) return true;
  try {
    const db = await openDB();
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
      const request = transaction.objectStore(GALLERY_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = (request.result as GalleryImage[]).find(item => item.generationId === generationId);
        resolve(Boolean(entry && (entry.referenceImages?.length ?? 0) >= expectedReferenceCount));
      };
    });
  } catch (error) {
    console.warn('Could not verify saved video references:', error);
    return false;
  }
}

/** Merge replayable model/reference context into an image already in the Album. */
export async function updateGalleryImageGenerationContext(
  generationId: string,
  prompt: string,
  context: SaveImageToGalleryContext,
): Promise<boolean> {
  if (!generationId) return false;
  try {
    const db = await openDB();
    const existingEntry = await new Promise<GalleryImage | undefined>((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
      const request = transaction.objectStore(GALLERY_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(
        (request.result as GalleryImage[]).find(entry => entry.generationId === generationId)
      );
    });
    if (existingEntry?.id === undefined) return false;
    const mergedEntry = mergeImageGenerationContext(existingEntry, prompt, context);
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readwrite');
      transaction.objectStore(GALLERY_STORE_NAME).put(mergedEntry);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Failed to update gallery image generation context:', error);
    return false;
  }
}

/** Verify that a generated image retained its reusable style reference. */
export async function hasGalleryImageStyleReference(
  generationId: string,
  expected: boolean,
): Promise<boolean> {
  if (!expected) return true;
  try {
    const db = await openDB();
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readonly');
      const request = transaction.objectStore(GALLERY_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = (request.result as GalleryImage[]).find(item => item.generationId === generationId);
        resolve(Boolean(entry?.styleImage?.blob?.size));
      };
    });
  } catch (error) {
    console.warn('Could not verify saved image style reference:', error);
    return false;
  }
}

/**
 * Delete a single gallery image by ID
 */
export async function deleteGalleryImage(id: number): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(GALLERY_STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => {
        console.error('Failed to delete gallery image:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.error('Failed to delete gallery image:', error);
  }
}

/**
 * Clear all gallery images
 */
export async function clearGallery(): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(GALLERY_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(GALLERY_STORE_NAME);
      const request = store.clear();

      request.onerror = () => {
        console.error('Failed to clear gallery:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.error('Failed to clear gallery:', error);
  }
}
