/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workflow persistence using IndexedDB (100% client-side storage).
 * Images never leave the user's device - this is purely local browser storage.
 */

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
}

export interface GalleryThumbnail {
  id: number;
  thumbnail: Blob;
  createdAt: number;
  name: string;
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
export async function saveWorkflow(history: File[], historyIndex: number): Promise<void> {
  if (history.length === 0) {
    // Don't save empty workflows, but clear any existing one
    await clearWorkflow();
    return;
  }

  try {
    const db = await openDB();

    // Convert Files to storable format (keeping blob data, name, and type)
    const images = history.map(file => ({
      blob: file as Blob,
      name: file.name,
      type: file.type,
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
export async function loadWorkflow(): Promise<{ history: File[]; historyIndex: number } | null> {
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
export function debouncedSaveWorkflow(history: File[], historyIndex: number): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveWorkflow(history, historyIndex);
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
export async function saveToGallery(image: File): Promise<void> {
  try {
    const db = await openDB();
    const thumbnail = await createThumbnail(image);

    const galleryImage: GalleryImage = {
      blob: image,
      thumbnail,
      createdAt: Date.now(),
      name: image.name,
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
          const { id, thumbnail, createdAt, name } = cursor.value as GalleryImage;
          thumbnails.push({ id: id!, thumbnail, createdAt, name });
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
 */
export async function getGalleryImage(id: number): Promise<File | null> {
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
        if (image) {
          const file = new File([image.blob], image.name, { type: image.blob.type });
          resolve(file);
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
