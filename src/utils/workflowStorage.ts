/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workflow persistence using IndexedDB (100% client-side storage).
 * Images never leave the user's device - this is purely local browser storage.
 */

const DB_NAME = 'veilpix-workflow';
const DB_VERSION = 1;
const STORE_NAME = 'workflow';
const WORKFLOW_KEY = 'current';

interface StoredWorkflow {
  images: Array<{
    blob: Blob;
    name: string;
    type: string;
  }>;
  historyIndex: number;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
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
