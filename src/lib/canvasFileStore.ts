export type CanvasFileMeta = {
  mimeType: string;
  created?: number;
  lastRetrieved?: number;
  checksum?: string;
  byteLength?: number;
};

export type CanvasFileMetaMap = Record<string, CanvasFileMeta>;
type CanvasFileRecord = {
  key: string;
  blob: Blob;
  mimeType: string;
  created?: number;
  lastRetrieved?: number;
};

const DATABASE_NAME = "alleviate-canvas-files-v1";
const STORE_NAME = "files";
let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = null; };
      resolve(database);
    };
    request.onerror = () => { databasePromise = null; reject(request.error || new Error("Could not open canvas image storage.")); };
  });
  return databasePromise;
}

function hashDataUrl(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return `${value.length.toString(36)}:${hash.toString(36)}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid canvas image data.");
  const header = dataUrl.slice(0, comma);
  const mimeType = /^data:([^;,]+)/i.exec(header)?.[1] || "application/octet-stream";
  const body = dataUrl.slice(comma + 1);
  const binary = header.includes(";base64") ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid image data."));
    reader.onerror = () => reject(reader.error || new Error("Could not read canvas image."));
    reader.readAsDataURL(blob);
  });
}

async function getRecord(key: string): Promise<CanvasFileRecord | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as CanvasFileRecord | undefined);
    request.onerror = () => reject(request.error || new Error("Could not read canvas image."));
    transaction.onerror = () => { reject(transaction.error || new Error("Could not read canvas image.")); };
  });
}

async function putRecord(record: CanvasFileRecord): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => { resolve(); };
    transaction.onerror = () => { reject(transaction.error || new Error("Could not save canvas image.")); };
    transaction.onabort = () => { reject(transaction.error || new Error("Canvas image save was interrupted.")); };
  });
}

export async function saveCanvasFiles(
  canvasId: string,
  files: Record<string, any>,
  previousMeta?: CanvasFileMetaMap,
): Promise<CanvasFileMetaMap> {
  const result: CanvasFileMetaMap = {};
  await Promise.all(Object.entries(files || {}).map(async ([fileId, file]) => {
    if (!file || typeof file.dataURL !== "string" || !file.dataURL) return;
    const mimeType = file.mimeType || "application/octet-stream";
    const checksum = hashDataUrl(file.dataURL);
    const old = previousMeta?.[fileId];
    const key = `${canvasId}:${fileId}`;
    if (old?.checksum !== checksum || old.mimeType !== mimeType || !(await getRecord(key))) {
      await putRecord({
        key,
        blob: dataUrlToBlob(file.dataURL),
        mimeType,
        created: file.created,
        lastRetrieved: file.lastRetrieved,
      });
    }
    result[fileId] = { mimeType, created: file.created, lastRetrieved: file.lastRetrieved, checksum, byteLength: file.dataURL.length };
  }));
  return result;
}

export async function loadCanvasFiles(
  canvasId: string,
  filesMeta?: CanvasFileMetaMap,
  legacyFiles?: Record<string, any>,
): Promise<Record<string, any>> {
  const files: Record<string, any> = {};
  const fileIds = new Set([...Object.keys(filesMeta || {}), ...Object.keys(legacyFiles || {})]);
  await Promise.all(Array.from(fileIds).map(async (fileId) => {
    const meta = filesMeta?.[fileId];
    try {
      const record = await getRecord(`${canvasId}:${fileId}`);
      let dataURL = record ? await blobToDataUrl(record.blob) : legacyFiles?.[fileId]?.dataURL;
      if (!dataURL) return;
      const legacy = legacyFiles?.[fileId];
      if (!record && legacy) {
        try {
          await putRecord({
            key: `${canvasId}:${fileId}`,
            blob: dataUrlToBlob(dataURL),
            mimeType: legacy.mimeType || meta?.mimeType || "application/octet-stream",
            created: legacy.created ?? meta?.created,
            lastRetrieved: legacy.lastRetrieved ?? meta?.lastRetrieved,
          });
        } catch {
          // The legacy inline copy remains available for this session if migration fails.
        }
      }
      files[fileId] = {
        id: fileId,
        dataURL,
        mimeType: record?.mimeType || legacy?.mimeType || meta?.mimeType || "application/octet-stream",
        created: record?.created ?? legacy?.created ?? meta?.created,
        lastRetrieved: record?.lastRetrieved ?? legacy?.lastRetrieved ?? meta?.lastRetrieved,
      };
    } catch {
      const legacy = legacyFiles?.[fileId];
      if (legacy?.dataURL) files[fileId] = { ...legacy, id: fileId };
    }
  }));
  return files;
}
