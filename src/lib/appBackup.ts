import type JSZip from "jszip";

const BACKUP_FORMAT = "alleviate-app-backup";
const BACKUP_VERSION = 1;
const BLOB_MARKER = "__alleviateBackupBlob";

const DATABASES = [
  { name: "alleviate-books-v1", stores: [{ name: "pdf-files", keyPath: "id" }] },
  { name: "alleviate-canvas-files-v1", stores: [{ name: "files", keyPath: "key" }] },
] as const;

type DatabaseEntry = { name: string; stores: Array<{ name: string; recordsPath: string; recordCount: number }> };
type BackupManifest = { format: string; version: number; createdAt: string; localStoragePath: string; databases: DatabaseEntry[] };
type ImportedBackup = { manifest: BackupManifest; localStorage: Record<string, string>; records: Map<string, Map<string, unknown[]>> };

function getDatabaseNames(): Promise<Set<string>> {
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (!factory.databases) return Promise.resolve(new Set());
  return factory.databases().then((databases) => new Set(databases.map((database) => database.name).filter((name): name is string => Boolean(name))));
}

function openExistingDatabase(name: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      reject(new Error(`The ${name} database changed while the backup was being read.`));
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(`Could not read ${name}.`));
    request.onblocked = () => reject(new Error(`The ${name} database is busy. Close other app windows and try again.`));
  });
}

async function readStore(databaseName: string, storeName: string): Promise<unknown[]> {
  const database = await openExistingDatabase(databaseName);
  if (!database.objectStoreNames.contains(storeName)) { database.close(); return []; }
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error || new Error(`Could not read ${storeName}.`));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error(`Could not read ${storeName}.`)); };
  });
}

async function serializeValue(value: unknown, zip: JSZip, folder: string, counter: { value: number }): Promise<unknown> {
  if (value instanceof Blob) {
    const path = `${folder}/blobs/${counter.value++}.bin`;
    zip.file(path, value);
    return { [BLOB_MARKER]: path, mimeType: value.type };
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const path = `${folder}/blobs/${counter.value++}.bin`;
    const bytes = value instanceof ArrayBuffer ? value : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    zip.file(path, bytes);
    return { [BLOB_MARKER]: path, binary: "array-buffer" };
  }
  if (Array.isArray(value)) return Promise.all(value.map((item) => serializeValue(item, zip, folder, counter)));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = await serializeValue(item, zip, folder, counter);
    return result;
  }
  return value;
}

async function deserializeValue(value: unknown, zip: JSZip): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => deserializeValue(item, zip)));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record[BLOB_MARKER] === "string") {
      const entry = zip.file(record[BLOB_MARKER] as string);
      if (!entry) throw new Error("A file inside this backup is missing.");
      const bytes = await entry.async("uint8array");
      return record.binary === "array-buffer" ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new Blob([bytes.slice().buffer as ArrayBuffer], { type: typeof record.mimeType === "string" ? record.mimeType : "" });
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) result[key] = await deserializeValue(item, zip);
    return result;
  }
  return value;
}

function readLocalStorageSnapshot(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null) snapshot[key] = localStorage.getItem(key) ?? "";
  }
  return snapshot;
}

export async function createAppBackup(): Promise<Blob> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable in this browser.");
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const localStoragePath = "data/localStorage.json";
  zip.file(localStoragePath, JSON.stringify(readLocalStorageSnapshot()));
  const databaseNames = await getDatabaseNames();
  const databaseEntries: DatabaseEntry[] = [];

  for (const database of DATABASES) {
    const stores: DatabaseEntry["stores"] = [];
    for (const store of database.stores) {
      const rows = databaseNames.has(database.name) ? await readStore(database.name, store.name) : [];
      const folder = `data/indexeddb/${database.name}/${store.name}`;
      const recordsPath = `${folder}/records.json`;
      const counter = { value: 0 };
      const serialized = await Promise.all(rows.map((row) => serializeValue(row, zip, folder, counter)));
      zip.file(recordsPath, JSON.stringify(serialized));
      stores.push({ name: store.name, recordsPath, recordCount: rows.length });
    }
    databaseEntries.push({ name: database.name, stores });
  }

  const manifest: BackupManifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), localStoragePath, databases: databaseEntries };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "DEFLATE", compressionOptions: { level: 4 } });
}

export async function parseAppBackup(file: File): Promise<ImportedBackup> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("This is not an Alleviate backup. The manifest is missing.");
  const manifest = JSON.parse(await manifestEntry.async("string")) as BackupManifest;
  if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION || !Array.isArray(manifest.databases) || typeof manifest.localStoragePath !== "string") {
    throw new Error("This Alleviate backup version is not supported.");
  }
  const localStorageEntry = zip.file(manifest.localStoragePath);
  if (!localStorageEntry) throw new Error("The backup does not contain app data.");
  const localStorageData = JSON.parse(await localStorageEntry.async("string"));
  if (!localStorageData || typeof localStorageData !== "object" || Array.isArray(localStorageData) || Object.values(localStorageData).some((value) => typeof value !== "string")) {
    throw new Error("The backup's app data is invalid.");
  }
  const allowedDatabases = new Map<string, Set<string>>(DATABASES.map((database) => [database.name, new Set<string>(database.stores.map((store) => store.name))]));
  const records = new Map<string, Map<string, unknown[]>>();
  for (const database of manifest.databases) {
    const allowedStores = allowedDatabases.get(database.name);
    if (!allowedStores || !Array.isArray(database.stores)) throw new Error("The backup contains an unrecognized data store.");
    const storeMap = new Map<string, unknown[]>();
    records.set(database.name, storeMap);
    for (const store of database.stores) {
      if (!allowedStores.has(store.name) || typeof store.recordsPath !== "string") throw new Error("The backup contains an unrecognized data store.");
      const entry = zip.file(store.recordsPath);
      if (!entry) throw new Error(`The backup is missing ${store.name} data.`);
      const serialized = JSON.parse(await entry.async("string"));
      if (!Array.isArray(serialized)) throw new Error(`The ${store.name} backup data is invalid.`);
      storeMap.set(store.name, await Promise.all(serialized.map((row) => deserializeValue(row, zip))));
    }
  }
  return { manifest, localStorage: localStorageData as Record<string, string>, records };
}

function openDatabaseForRestore(databaseName: string, stores: readonly { name: string; keyPath: string }[]) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onupgradeneeded = () => {
      for (const store of stores) if (!request.result.objectStoreNames.contains(store.name)) request.result.createObjectStore(store.name, { keyPath: store.keyPath });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(`Could not open ${databaseName} for restore.`));
    request.onblocked = () => reject(new Error(`The ${databaseName} database is busy. Close other app windows and try again.`));
  });
}

async function restoreStore(databaseName: string, storeName: string, keyPath: string, rows: unknown[]) {
  const database = await openDatabaseForRestore(databaseName, [{ name: storeName, keyPath }]);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const objectStore = transaction.objectStore(storeName);
    objectStore.clear();
    for (const row of rows) objectStore.put(row);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error(`Could not restore ${storeName}.`)); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error(`Restoring ${storeName} was interrupted.`)); };
  });
}

export async function restoreAppBackup(backup: ImportedBackup): Promise<{ localStorageKeys: number; records: number }> {
  const snapshot = readLocalStorageSnapshot();
  const existingDatabaseNames = await getDatabaseNames();
  const previousRecords = new Map<string, Map<string, unknown[]>>();
  for (const database of DATABASES) {
    const storeRecords = new Map<string, unknown[]>();
    previousRecords.set(database.name, storeRecords);
    for (const store of database.stores) storeRecords.set(store.name, existingDatabaseNames.has(database.name) ? await readStore(database.name, store.name) : []);
  }
  try {
    let recordCount = 0;
    for (const database of DATABASES) {
      const storeRecords = backup.records.get(database.name);
      for (const store of database.stores) {
        const rows = storeRecords?.get(store.name) ?? [];
        await restoreStore(database.name, store.name, store.keyPath, rows);
        recordCount += rows.length;
      }
    }
    localStorage.clear();
    for (const [key, value] of Object.entries(backup.localStorage)) localStorage.setItem(key, value);
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("alleviate-data-restored"));
    return { localStorageKeys: Object.keys(backup.localStorage).length, records: recordCount };
  } catch (error) {
    let rollbackFailed = false;
    for (const database of DATABASES) {
      for (const store of database.stores) {
        try { await restoreStore(database.name, store.name, store.keyPath, previousRecords.get(database.name)?.get(store.name) ?? []); }
        catch { rollbackFailed = true; }
      }
    }
    try {
      localStorage.clear();
      for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value);
    } catch { rollbackFailed = true; }
    if (rollbackFailed) throw new Error("Import failed and Alleviate could not fully restore the data that was present before the import.");
    throw error;
  }
}

export function downloadAppBackup(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Alleviate-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
