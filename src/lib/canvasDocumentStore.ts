/** Asynchronous persistence for canvas documents. */
const DATABASE_NAME = "alleviate-canvas-documents-v2";
const STORE_NAME = "documents";
const LEGACY_KEY = "alleviate-canvas-documents-v1";
const MIGRATED_KEY = "alleviate-canvas-documents-v2-migrated";
let writeQueue: Promise<void> = Promise.resolve();
let lastSavedDocuments = new Map<string, unknown>();

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open canvas document storage."));
  });
}

export async function loadCanvasDocuments<T extends { id: string }>(): Promise<T[]> {
  const database = await openDatabase();
  const documents = await new Promise<T[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []) as T[]);
    request.onerror = () => reject(request.error || new Error("Could not read canvas documents."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Could not read canvas documents.")); };
  });
  if (documents.length) {
    lastSavedDocuments = new Map(documents.map((document) => [document.id, document]));
    // IndexedDB already has the current documents, so any leftover legacy payload is redundant
    // and can keep the browser quota full for imports from older app builds.
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* IndexedDB remains usable if cleanup is blocked. */ }
    return documents;
  }
  if (localStorage.getItem(MIGRATED_KEY) === "1") return [];

  // Migrate existing localStorage data once, without blocking subsequent saves.
  let legacy: T[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    if (Array.isArray(parsed)) legacy = parsed.filter((item) => item && typeof item.id === "string");
  } catch { /* Ignore malformed legacy data. */ }
  if (legacy.length) {
    await saveCanvasDocuments(legacy);
    // Once the complete legacy payload is safely in IndexedDB, release its localStorage quota.
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* Keep the migrated copy in IndexedDB. */ }
  }
  try { localStorage.setItem(MIGRATED_KEY, "1"); } catch {
    // IndexedDB is the source of truth; do not block canvas loading if localStorage is full.
  }
  return legacy;
}

export function saveCanvasDocuments<T extends { id: string }>(documents: T[]): Promise<void> {
  const snapshot = [...documents];
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const current = new Map(snapshot.map((document) => [document.id, document]));
      const keysRequest = store.getAllKeys();
      keysRequest.onsuccess = () => {
        for (const id of keysRequest.result as string[]) if (!current.has(id)) store.delete(id);
        for (const document of snapshot) if (lastSavedDocuments.get(document.id) !== document) store.put(document);
      };
      keysRequest.onerror = () => { try { transaction.abort(); } catch { /* transaction may have completed */ } };
      transaction.oncomplete = () => { database.close(); lastSavedDocuments = current; resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Could not save canvas documents.")); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Saving canvas documents was interrupted.")); };
    });
  });
  return writeQueue;
}
