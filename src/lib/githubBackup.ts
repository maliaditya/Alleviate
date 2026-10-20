/** Modular, content-hashed GitHub backup files for Alleviate. */
import { loadCanvasDocuments, saveCanvasDocuments } from "./canvasDocumentStore";
export type GitHubBackupFile = { path: string; blob: Blob; hash: string };
export type GitHubBackupManifest = { format: "alleviate-github-backup"; version: 1; updatedAt: string; files: Record<string, string>; deleted?: string[] };

type SyncRecord = { key: string; blob?: Blob; hash?: string; baseHash?: string; updatedAt: string; lastSyncAt?: number; base?: Blob; local?: Blob; remote?: Blob; message?: string; deviceId?: string; changeId?: string; status?: "pending" };
export type GitHubMergeResult = { blob?: Blob; conflict: boolean; reason?: string };
const SYNC_DB = "alleviate-github-sync-v2";
const SYNC_STORE = "records";
let syncScope = "default";
export function setGitHubSyncScope(scope: string) { syncScope = scope || "default"; }
const syncRecordKey = (kind: string, path: string) => `${kind}:${syncScope}:${path}`;

const CANVAS_KEY = "alleviate-canvas-documents-v1";
const WORKSPACE_KEY = "alleviate-canvas-workspace-v1";
const MAPS_KEY = "alleviate-wisemapping-maps-v1";
const SYNC_STATE_KEY = "alleviate-github-sync-state-v1";
const ignoredKeys = new Set([CANVAS_KEY, WORKSPACE_KEY, MAPS_KEY, SYNC_STATE_KEY, "alleviate_current_user", "alleviate-auto-backup-settings-v1"]);
const textBlob = (value: string) => new Blob([value], { type: "application/json;charset=utf-8" });
const pathId = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const fromPathId = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
};
const safeExt = (mime: string) => mime === "application/pdf" ? "pdf" : mime.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/gi, "") || "bin";

function openStore(databaseName: string, storeName: string, keyPath: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(`Could not open ${databaseName}.`));
  });
}

async function readAll(databaseName: string, storeName: string, keyPath: string): Promise<any[]> {
  const database = await openStore(databaseName, storeName, keyPath);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error(`Could not read ${storeName}.`));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error(`Could not read ${storeName}.`)); };
  });
}

async function writeRecords(databaseName: string, storeName: string, keyPath: string, records: any[], clear = false) {
  const database = await openStore(databaseName, storeName, keyPath);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    if (clear) store.clear();
    records.forEach((record) => store.put(record));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error(`Could not save ${storeName}.`)); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error(`Saving ${storeName} was interrupted.`)); };
  });
}

async function removeRecord(databaseName: string, storeName: string, keyPath: string, key: string) {
  const database = await openStore(databaseName, storeName, keyPath);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error(`Could not remove ${storeName} entry.`)); };
  });
}

export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openSyncDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(SYNC_STORE)) request.result.createObjectStore(SYNC_STORE, { keyPath: "key" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open sync storage."));
  });
}

async function readSyncRecord(key: string): Promise<SyncRecord | undefined> {
  const db = await openSyncDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readonly").objectStore(SYNC_STORE).get(key);
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function saveSyncRecord(record: SyncRecord) {
  const db = await openSyncDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE, "readwrite");
    transaction.objectStore(SYNC_STORE).put(record);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Could not save sync state.")); };
  });
}

async function deleteSyncRecord(key: string) {
  const db = await openSyncDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE, "readwrite");
    transaction.objectStore(SYNC_STORE).delete(key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Could not clear sync state.")); };
  });
}

export async function getGitHubCheckpoint(path: string) { return (await readSyncRecord(syncRecordKey("checkpoint", path)))?.blob; }

export async function getGitHubLastSyncAt(): Promise<number> { return (await readSyncRecord(syncRecordKey("last-sync", "at")))?.lastSyncAt || 0; }

export async function saveGitHubLastSyncAt(timestamp = Date.now()) {
  await saveSyncRecord({ key: syncRecordKey("last-sync", "at"), lastSyncAt: timestamp, updatedAt: new Date(timestamp).toISOString() });
}

export async function stageGitHubOutbox(path: string, local?: Blob) {
  const base = await getGitHubCheckpoint(path);
  const baseHash = base ? await hashBlob(base) : undefined;
  if (local && base && await hashBlob(local) === baseHash) return;
  if (!local && !base) return;
  const key = syncRecordKey("outbox", path);
  const previous = await readSyncRecord(key);
  const [deviceRecord, localHash] = await Promise.all([readSyncRecord(syncRecordKey("device", "id")), local ? hashBlob(local) : undefined]);
  const deviceId = deviceRecord?.deviceId || crypto.randomUUID();
  if (!deviceRecord?.deviceId) await saveSyncRecord({ key: syncRecordKey("device", "id"), deviceId, updatedAt: new Date().toISOString() });
  const changeId = previous?.hash === localHash && previous?.baseHash === baseHash ? previous?.changeId : crypto.randomUUID();
  await saveSyncRecord({ key, base, baseHash, local, hash: localHash, deviceId, changeId, status: "pending", updatedAt: previous?.updatedAt || new Date().toISOString() });
}

export async function saveGitHubCheckpoint(path: string, blob?: Blob, acknowledge = true) {
  if (blob) await saveSyncRecord({ key: syncRecordKey("checkpoint", path), blob, hash: await hashBlob(blob), updatedAt: new Date().toISOString() });
  else await deleteSyncRecord(syncRecordKey("checkpoint", path));
  if (acknowledge) {
    await deleteSyncRecord(syncRecordKey("outbox", path));
    await deleteSyncRecord(syncRecordKey("conflict", path));
  }
}

export async function saveGitHubConflict(path: string, base: Blob | undefined, local: Blob | undefined, remote: Blob | undefined, reason: string) {
  await saveSyncRecord({ key: syncRecordKey("conflict", path), base, local, remote, message: reason, updatedAt: new Date().toISOString() });
}

export async function listGitHubConflicts(): Promise<Array<{ path: string; message: string; local?: Blob; remote?: Blob }>> {
  const db = await openSyncDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readonly").objectStore(SYNC_STORE).getAll();
    request.onsuccess = () => { db.close(); const prefix = `conflict:${syncScope}:`; resolve((request.result as SyncRecord[]).filter((record) => record.key.startsWith(prefix)).map((record) => ({ path: record.key.slice(prefix.length), message: record.message || "Conflicting edits need review.", local: record.local, remote: record.remote }))); };
    request.onerror = () => { db.close(); reject(request.error || new Error("Could not read sync conflicts.")); };
  });
}

export async function clearGitHubConflict(path: string) { await deleteSyncRecord(syncRecordKey("conflict", path)); }

function sameJson(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function hasIdArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string");
}

function mergeJson(base: any, local: any, remote: any, location: string, conflicts: string[]): any {
  if (sameJson(local, remote)) return local;
  if (sameJson(local, base)) return remote;
  if (sameJson(remote, base)) return local;
  if (typeof base === "string" && typeof local === "string" && typeof remote === "string") {
    try {
      const parsedBase = JSON.parse(base); const parsedLocal = JSON.parse(local); const parsedRemote = JSON.parse(remote);
      if (typeof parsedBase !== "string" || typeof parsedLocal !== "string" || typeof parsedRemote !== "string") {
        return JSON.stringify(mergeJson(parsedBase, parsedLocal, parsedRemote, location, conflicts));
      }
    } catch { /* Plain text values are compared as a single field. */ }
  }
  if (base && local && remote && typeof base === "object" && typeof local === "object" && typeof remote === "object" && !Array.isArray(base) && !Array.isArray(local) && !Array.isArray(remote)) {
    const merged: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeJson(base[key], local[key], remote[key], `${location}.${key}`, conflicts);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  if (hasIdArray(base) && hasIdArray(local) && hasIdArray(remote)) {
    const baseById = new Map(base.map((item) => [String(item.id), item]));
    const localById = new Map(local.map((item) => [String(item.id), item]));
    const remoteById = new Map(remote.map((item) => [String(item.id), item]));
    const ids = new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()]);
    const merged = new Map<string, Record<string, unknown>>();
    for (const id of ids) {
      const item = mergeJson(baseById.get(id), localById.get(id), remoteById.get(id), `${location}[${id}]`, conflicts);
      if (item !== undefined) merged.set(id, item);
    }
    // Keep the local ordering, followed by remote-only additions, so separate additions survive deterministically.
    const order = [...local.map((item) => String(item.id)), ...remote.map((item) => String(item.id)).filter((id) => !localById.has(id))];
    return order.map((id) => merged.get(id)).filter((item): item is Record<string, unknown> => Boolean(item));
  }
  conflicts.push(location);
  return local;
}

export async function mergeGitHubFile(path: string, base: Blob | undefined, local: Blob | undefined, remote: Blob | undefined): Promise<GitHubMergeResult> {
  if (!local && !remote) return { conflict: false };
  if (!local) {
    if (!base) return { blob: remote, conflict: false };
    if (!remote || await hashBlob(remote) === await hashBlob(base)) return { conflict: false };
    return { conflict: true, reason: "This device deleted the file while GitHub had newer changes." };
  }
  if (!remote) {
    if (!base || await hashBlob(local) === await hashBlob(base)) return { conflict: false };
    return { conflict: true, reason: "Remote file was deleted while this device had local changes." };
  }
  const localHash = await hashBlob(local); const remoteHash = await hashBlob(remote);
  if (localHash === remoteHash) return { blob: local, conflict: false };
  if (!base) return { conflict: true, reason: "Both this device and GitHub created the file independently." };
  const baseHash = await hashBlob(base);
  if (localHash === baseHash) return { blob: remote, conflict: false };
  if (remoteHash === baseHash) return { blob: local, conflict: false };
  try {
    const [baseJson, localJson, remoteJson] = await Promise.all([base.text(), local.text(), remote.text()]).then((values) => values.map((value) => JSON.parse(value)));
    const conflicts: string[] = [];
    const merged = mergeJson(baseJson, localJson, remoteJson, "$", conflicts);
    if (conflicts.length) return { conflict: true, reason: `Both devices changed the same data (${conflicts.slice(0, 4).join(", ")}).` };
    return { blob: new Blob([JSON.stringify(merged, null, 2)], { type: "application/json;charset=utf-8" }), conflict: false };
  } catch {
    return { conflict: true, reason: `Both devices changed ${path}; this file cannot be merged safely.` };
  }
}

export async function collectAlleviateGitHubFiles(): Promise<GitHubBackupFile[]> {
  const files = new Map<string, Blob>();
  const putJson = (path: string, data: unknown) => files.set(path, textBlob(JSON.stringify(data, null, 2)));
  const localEntries = Array.from({ length: localStorage.length }, (_, index) => {
    const key = localStorage.key(index);
    return key ? [key, localStorage.getItem(key) ?? ""] as const : null;
  }).filter((entry): entry is readonly [string, string] => Boolean(entry));
  const values = new Map(localEntries);

  const canvasDocuments = await loadCanvasDocuments<any>().catch(() => {
    try { const value = JSON.parse(values.get(CANVAS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
  });
  const imageIndexes = new Map<string, any[]>();
  putJson("canvases/index.json", { version: 1, canvasIds: canvasDocuments.map((canvas) => String(canvas.id)) });
  for (const canvas of canvasDocuments as any[]) {
    if (!canvas?.id) continue;
    const { files: legacyFiles, ...document } = canvas;
    putJson(`canvases/${pathId(String(canvas.id))}/canvas.json`, document);
    for (const [fileId, file] of Object.entries(legacyFiles || {}) as Array<[string, any]>) {
      if (!file?.dataURL) continue;
      try {
        const blob = await fetch(file.dataURL).then((response) => response.blob());
        const mimeType = file.mimeType || blob.type || "application/octet-stream";
        const path = `canvases/${pathId(String(canvas.id))}/images/${pathId(fileId)}.${safeExt(mimeType)}`;
        files.set(path, blob);
        const index = imageIndexes.get(String(canvas.id)) || [];
        index.push({ fileId, path, mimeType, created: file.created, lastRetrieved: file.lastRetrieved });
        imageIndexes.set(String(canvas.id), index);
      } catch { /* Skip a malformed legacy inline image while backing up the other files. */ }
    }
  }
  putJson("canvases/workspace.json", (() => { try { return JSON.parse(values.get(WORKSPACE_KEY) || "{}"); } catch { return {}; } })());

  const maps = (() => { try { const value = JSON.parse(values.get(MAPS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } })();
  putJson("mind-maps/index.json", { version: 1, mapIds: maps.map((map: any) => String(map.id)) });
  maps.forEach((map: any) => {
    if (!map?.id) return;
    putJson(`mind-maps/maps/${pathId(String(map.id))}.json`, { map, xml: values.get(`${map.id}-xml`) || "" });
  });
  const mindMapStateKeys = localEntries.map(([key]) => key).filter((key) => key.startsWith("alleviate-wisemapping-") || key.startsWith("alleviate-resources-default-"));
  putJson("mind-maps/state-index.json", { keys: mindMapStateKeys });
  mindMapStateKeys.forEach((key) => putJson(`mind-maps/state/${pathId(key)}.json`, { key, value: values.get(key) ?? "" }));

  for (const [key, value] of localEntries) {
    if (ignoredKeys.has(key) || key === MAPS_KEY || key.startsWith("alleviate-wisemapping-") || key.startsWith("alleviate-resources-default-") || /^.+-xml$/.test(key) && maps.some((map: any) => `${map.id}-xml` === key)) continue;
    putJson(`app-data/${pathId(key)}.json`, { key, value });
  }

  const canvasImageRecords = await readAll("alleviate-canvas-files-v1", "files", "key");
  for (const record of canvasImageRecords) {
    const separator = String(record.key || "").indexOf(":");
    if (separator < 1 || !(record.blob instanceof Blob)) continue;
    const canvasId = record.key.slice(0, separator);
    const fileId = record.key.slice(separator + 1);
    const path = `canvases/${pathId(canvasId)}/images/${pathId(fileId)}.${safeExt(record.mimeType || record.blob.type)}`;
    files.set(path, record.blob);
    const index = imageIndexes.get(canvasId) || [];
    const existingIndex = index.findIndex((entry) => entry.fileId === fileId);
    const metadata = { fileId, path, mimeType: record.mimeType || record.blob.type || "application/octet-stream", created: record.created, lastRetrieved: record.lastRetrieved };
    if (existingIndex >= 0) index[existingIndex] = metadata; else index.push(metadata);
    imageIndexes.set(canvasId, index);
  }
  for (const [canvasId, images] of imageIndexes) putJson(`canvases/${pathId(canvasId)}/images/index.json`, { canvasId, images });
  putJson("canvases/images-index.json", { canvasIds: Array.from(imageIndexes.keys()) });

  const pdfRecords = await readAll("alleviate-books-v1", "pdf-files", "id");
  const pdfIndex: Array<{ id: string; path: string; mimeType: string }> = [];
  for (const record of pdfRecords) {
    if (!record?.id || !(record.file instanceof Blob)) continue;
    const path = `books/pdfs/${pathId(String(record.id))}.pdf`;
    files.set(path, record.file);
    pdfIndex.push({ id: String(record.id), path, mimeType: record.file.type || "application/pdf" });
  }
  putJson("books/pdfs/index.json", { pdfs: pdfIndex });

  const result: GitHubBackupFile[] = [];
  for (const [path, blob] of files) result.push({ path, blob, hash: await hashBlob(blob) });
  return result;
}

const readBlobText = async (blob: Blob) => blob.text();

export async function applyAlleviateGitHubChanges(downloads: Array<{ path: string; blob: Blob }>, deletedPaths: string[] = []) {
  const localStorageWrites = new Map<string, string>();
  const canvasWrites = new Map<string, any>();
  const mindMapWrites = new Map<string, any>();
  const imageIndexes: any[] = [];
  const imageBlobs = new Map<string, Blob>();
  const pdfBlobs = new Map<string, Blob>();
  let pdfIndex: any[] = [];
  const removedCanvasIds = new Set<string>();
  const removedMindMapIds = new Set<string>();
  const removedStorageKeys = new Set<string>();
  const removedPdfIds = new Set<string>();
  const removedCanvasImageKeys = new Set<string>();

  for (const item of downloads) {
    if (item.path.endsWith(".json")) {
      let parsed: any;
      try { parsed = JSON.parse(await item.blob.text()); }
      catch { throw new Error(`GitHub sync stopped: ${item.path} is not valid JSON. Local data was left unchanged.`); }
      if (!parsed || typeof parsed !== "object") throw new Error(`GitHub sync stopped: ${item.path} has an invalid data shape. Local data was left unchanged.`);
      if (item.path.startsWith("canvases/") && item.path.endsWith("/canvas.json") && (typeof parsed.id !== "string" || !Array.isArray(parsed.elements))) throw new Error(`GitHub sync stopped: ${item.path} is not a valid canvas document.`);
      if (item.path.startsWith("mind-maps/maps/") && item.path.endsWith(".json") && (typeof parsed.map?.id !== "string" || typeof parsed.xml !== "string")) throw new Error(`GitHub sync stopped: ${item.path} is not a valid mind map file.`);
      if ((item.path.startsWith("app-data/") || item.path.startsWith("mind-maps/state/")) && (typeof parsed.key !== "string" || typeof parsed.value !== "string")) throw new Error(`GitHub sync stopped: ${item.path} has invalid storage data.`);
    }
  }

  for (const item of downloads) {
    if (item.path.startsWith("canvases/") && item.path.endsWith("/canvas.json")) {
      const parts = item.path.split("/"); const canvasId = fromPathId(parts[1]); canvasWrites.set(canvasId, JSON.parse(await readBlobText(item.blob)));
    } else if (item.path === "canvases/workspace.json") {
      localStorageWrites.set("alleviate-canvas-workspace-v1", await readBlobText(item.blob));
    } else if (item.path.includes("/images/index.json")) {
      imageIndexes.push(JSON.parse(await readBlobText(item.blob)));
    } else if (item.path.startsWith("canvases/") && item.path.includes("/images/")) {
      imageBlobs.set(item.path, item.blob);
    } else if (item.path.startsWith("mind-maps/maps/") && item.path.endsWith(".json")) {
      const value = JSON.parse(await readBlobText(item.blob));
      if (value?.map?.id) mindMapWrites.set(String(value.map.id), value);
    } else if (item.path.startsWith("mind-maps/state/") && item.path.endsWith(".json")) {
      const value = JSON.parse(await readBlobText(item.blob));
      if (typeof value?.key === "string" && typeof value?.value === "string") localStorageWrites.set(value.key, value.value);
    } else if (item.path.startsWith("app-data/") && item.path.endsWith(".json")) {
      const value = JSON.parse(await readBlobText(item.blob));
      if (typeof value?.key === "string" && typeof value?.value === "string") localStorageWrites.set(value.key, value.value);
    } else if (item.path === "books/pdfs/index.json") {
      pdfIndex = JSON.parse(await readBlobText(item.blob)).pdfs || [];
    } else if (item.path.startsWith("books/pdfs/") && item.path.endsWith(".pdf")) {
      const filename = item.path.split("/").pop() || "";
      pdfBlobs.set(fromPathId(filename.slice(0, -4)), item.blob);
    }
  }

  for (const path of deletedPaths) {
    const parts = path.split("/");
    if (parts[0] === "app-data" && parts[1]?.endsWith(".json")) { try { removedStorageKeys.add(fromPathId(parts[1].slice(0, -5))); } catch { /* Ignore unknown path encodings. */ } }
    if (parts[0] === "canvases" && parts[1] && parts[2] === "canvas.json") { try { removedCanvasIds.add(fromPathId(parts[1])); } catch { /* Ignore malformed IDs. */ } }
    if (parts[0] === "mind-maps" && parts[1] === "maps" && parts[2]?.endsWith(".json")) { try { removedMindMapIds.add(fromPathId(parts[2].slice(0, -5))); } catch { /* Ignore malformed IDs. */ } }
    if (parts[0] === "books" && parts[1] === "pdfs" && parts[2]?.endsWith(".pdf")) { try { removedPdfIds.add(fromPathId(parts[2].slice(0, -4))); } catch { /* Ignore malformed IDs. */ } }
    if (parts[0] === "canvases" && parts[2] === "images" && parts[3] && parts[3] !== "index.json") {
      try { const filename = parts[3]; const extensionAt = filename.lastIndexOf("."); if (extensionAt > 0) removedCanvasImageKeys.add(`${fromPathId(parts[1])}:${fromPathId(filename.slice(0, extensionAt))}`); } catch { /* Ignore malformed IDs. */ }
    }
    if (parts[0] === "mind-maps" && parts[1] === "state" && parts[2]?.endsWith(".json")) { try { removedStorageKeys.add(fromPathId(parts[2].slice(0, -5))); } catch { /* Ignore malformed keys. */ } }
  }

  const currentCanvases = await loadCanvasDocuments<any>().catch(() => {
    try { const value = JSON.parse(localStorage.getItem(CANVAS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
  });
  const canvasMap = new Map<string, any>(currentCanvases.map((canvas: any) => [String(canvas.id), canvas]));
  canvasWrites.forEach((canvas, id) => canvasMap.set(id, canvas));
  removedCanvasIds.forEach((id) => canvasMap.delete(id));
  if (canvasWrites.size || removedCanvasIds.size) await saveCanvasDocuments(Array.from(canvasMap.values()));

  const currentMaps = (() => { try { const value = JSON.parse(localStorage.getItem(MAPS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } })();
  const mapMap = new Map<string, any>(currentMaps.map((map: any) => [String(map.id), map]));
  mindMapWrites.forEach((entry, id) => { mapMap.set(id, entry.map); localStorageWrites.set(`${id}-xml`, String(entry.xml || "")); });
  removedMindMapIds.forEach((id) => { mapMap.delete(id); localStorageWrites.delete(`${id}-xml`); });
  if (mindMapWrites.size || removedMindMapIds.size) localStorageWrites.set(MAPS_KEY, JSON.stringify(Array.from(mapMap.values())));
  for (const key of removedStorageKeys) localStorageWrites.delete(key);
  for (const [key, value] of localStorageWrites) localStorage.setItem(key, value);
  for (const key of removedStorageKeys) localStorage.removeItem(key);

  const dbImageRecords = new Map<string, any>();
  for (const index of imageIndexes) for (const image of index.images || []) {
    const blob = imageBlobs.get(image.path);
    if (blob && index.canvasId && image.fileId) dbImageRecords.set(`${index.canvasId}:${image.fileId}`, { key: `${index.canvasId}:${image.fileId}`, blob, mimeType: image.mimeType || blob.type, created: image.created, lastRetrieved: image.lastRetrieved });
  }
  for (const [path, blob] of imageBlobs) {
    const parts = path.split("/");
    if (parts[0] !== "canvases" || parts[2] !== "images" || parts[3] === "index.json") continue;
    const filename = parts[3] || "";
    const extensionAt = filename.lastIndexOf(".");
    if (extensionAt < 0) continue;
    const canvasId = fromPathId(parts[1]);
    const fileId = fromPathId(filename.slice(0, extensionAt));
    const key = `${canvasId}:${fileId}`;
    const existing = dbImageRecords.get(key);
    dbImageRecords.set(key, { key, blob, mimeType: existing?.mimeType || blob.type || "application/octet-stream", created: existing?.created, lastRetrieved: existing?.lastRetrieved });
  }
  if (dbImageRecords.size) await writeRecords("alleviate-canvas-files-v1", "files", "key", Array.from(dbImageRecords.values()));
  for (const key of removedCanvasImageKeys) await removeRecord("alleviate-canvas-files-v1", "files", "key", key);

  const pdfRecords = new Map<string, any>();
  for (const pdf of pdfIndex) {
    const blob = pdfBlobs.get(pdf.id);
    if (blob && pdf.id) pdfRecords.set(pdf.id, { id: pdf.id, file: blob });
  }
  pdfBlobs.forEach((file, id) => pdfRecords.set(id, { id, file }));
  if (pdfRecords.size) await writeRecords("alleviate-books-v1", "pdf-files", "id", Array.from(pdfRecords.values()));
  for (const id of removedPdfIds) await removeRecord("alleviate-books-v1", "pdf-files", "id", id);
  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new Event("alleviate-data-restored"));
}

export function encodeBlobBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    return btoa(binary);
  });
}

export function decodeBase64Blob(content: string, mimeType = "application/octet-stream") {
  const binary = atob(content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

export const GITHUB_SYNC_STATE_KEY = SYNC_STATE_KEY;
export const encodeGitHubPathId = pathId;
export const decodeGitHubPathId = fromPathId;

