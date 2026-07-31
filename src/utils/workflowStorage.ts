/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workflow persistence using IndexedDB (100% client-side storage).
 * Images never leave the user's device - this is purely local browser storage.
 */

import {
  extractVideoThumbnailFrame,
  isImageBlobNearlyBlack,
} from './videoFrameExtraction';

const DB_NAME = 'veilpix-workflow';
const DB_VERSION = 2;
const STORE_NAME = 'workflow';
const GALLERY_STORE_NAME = 'gallery';
const WORKFLOW_KEY = 'current';
const MAX_GALLERY_IMAGES = 20;

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
  provider?: 'wan' | 'seedance';
  seedanceInputMode?: 'frames' | 'references';
  referenceImages?: StoredGalleryFile[];
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
  provider?: 'wan' | 'seedance';
  prompt?: string;
}

export interface GalleryImageDetails {
  file: File;
  prompt: string;
}

interface StoredGalleryFile {
  blob: Blob;
  name: string;
  type: string;
  lastModified?: number;
}

export interface GalleryVideoDetails {
  videoUrl: string;
  videoFile: File | null;
  referenceImage: File | null;
  referenceImages: File[];
  videoDuration?: number;
  provider?: 'wan' | 'seedance';
  seedanceInputMode?: 'frames' | 'references';
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
export async function saveToGallery(image: File, prompt = ''): Promise<void> {
  try {
    const db = await openDB();
    const thumbnail = await createThumbnail(image);

    const galleryImage: GalleryImage = {
      blob: image,
      thumbnail,
      createdAt: Date.now(),
      name: image.name,
      prompt,
    };

    return new Promise((resolve, reject) => {
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
        resolve();
      };
    });
  } catch (error) {
    console.error('Failed to save to gallery:', error);
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
          resolve({ file, prompt: image.prompt || '' });
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
          // Older gallery records did not persist the Seedance mode. Treat a
          // two-image legacy record as the likely first/end-frame workflow.
          seedanceInputMode: entry.seedanceInputMode
            ?? (entry.provider === 'seedance' && referenceImages.length === 2 ? 'frames' : undefined),
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
  provider?: 'wan' | 'seedance';
  referenceImage?: File | null;
  referenceImages?: File[];
  referenceVideoFile?: File | null;
  referenceVideoUrl?: string | null;
  videoDuration?: number;
  seedanceInputMode?: 'frames' | 'references';
  prompt?: string;
}

/**
 * Save a video to the gallery
 * Stores the video URL and a thumbnail generated from a video frame when possible.
 */
export async function saveVideoToGallery(options: SaveVideoToGalleryOptions): Promise<void> {
  try {
    const {
      videoUrl,
      provider,
      referenceImage = null,
      referenceImages = [],
      referenceVideoFile = null,
      referenceVideoUrl = null,
      videoDuration,
      seedanceInputMode,
      prompt = ''
    } = options;
    const maxStoredReferenceImages = provider === 'seedance' ? 9 : 5;
    const db = await openDB();
    const storedReferenceImages = referenceImages.length > 0
      ? referenceImages.slice(0, maxStoredReferenceImages)
      : referenceImage
        ? [referenceImage]
        : [];
    const videoBlob = await fetchVideoBlob(videoUrl);
    const generatedVideoThumbnail = videoBlob
      ? await createVideoFrameThumbnail(new File([videoBlob], `video-${Date.now()}.mp4`, { type: videoBlob.type || 'video/mp4' }))
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
      name: `video-${Date.now()}.mp4`,
      type: 'video',
      videoUrl,
      videoBlob: videoBlob || undefined,
      videoDuration,
      hasReferenceImage: storedReferenceImages.length > 0,
      provider,
      seedanceInputMode,
      referenceImages: storedReferenceImages.map(toStoredGalleryFile),
      prompt,
    };

    return new Promise((resolve, reject) => {
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
        resolve();
      };
    });
  } catch (error) {
    console.error('Failed to save video to gallery:', error);
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
