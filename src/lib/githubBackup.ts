/** Modular, content-hashed GitHub backup files for Alleviate. */
import { loadCanvasDocuments, saveCanvasDocuments } from "./canvasDocumentStore";
import { createAppBackup, parseAppBackup, restoreAppBackup } from "./appBackup";
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
const isSensitiveStorageKey = (key: string) => /(?:access|refresh|id|auth|github)[_-]?token|password|secret|credential|api[_-]?key|oauth/i.test(key);
export function isSensitiveGitHubBackupPath(path: string) {
  const parts = path.split("/");
  try {
    if (parts[0] === "app-data" && parts[1]?.endsWith(".json")) return isSensitiveStorageKey(fromPathId(parts[1].slice(0, -5)));
    if (parts[0] === "mind-maps" && parts[1] === "state" && parts[2]?.endsWith(".json")) return isSensitiveStorageKey(fromPathId(parts[2].slice(0, -5)));
  } catch { return false; }
  return false;
}
const textBlob = (value: string) => new Blob([value], { type: "application/json;charset=utf-8" });
export async function isValidMindMapBackupRecord(blob: Blob | undefined): Promise<boolean> {
  if (!blob) return false;
  try {
    const value = JSON.parse(await blob.text());
    if (!value || typeof value !== "object" || typeof value.map?.id !== "string" || !value.map.id.trim() || typeof value.map.title !== "string" || !value.map.title.trim() || typeof value.xml !== "string" || !value.xml.trim()) return false;
    if (typeof DOMParser !== "undefined") {
      const xml = new DOMParser().parseFromString(value.xml, "application/xml");
      if (xml.querySelector("parsererror") || xml.documentElement?.localName !== "map") return false;
    }
    return true;
  } catch { return false; }
}
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
function storageKeyFromBackupPath(path: string) {
  const parts = path.split("/");
  if (parts[0] === "app-data" && parts[1]?.endsWith(".json")) return fromPathId(parts[1].slice(0, -5));
  if (parts[0] === "mind-maps" && parts[1] === "state" && parts[2]?.endsWith(".json")) return fromPathId(parts[2].slice(0, -5));
  throw new Error(`GitHub sync stopped: ${path} has an invalid storage path.`);
}
async function readStorageBackupEntry(path: string, blob: Blob) {
  const key = storageKeyFromBackupPath(path);
  const raw = await blob.text();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, "value")) {
      const value = typeof parsed.value === "string" ? parsed.value : JSON.stringify(parsed.value);
      if (typeof value === "string") return { key, value };
    }
  } catch { /* Older backups stored the raw localStorage value instead of an envelope. */ }
  // The path identifies the storage key. Keep legacy raw data intact, including
  // JSON values that older app versions wrote without the { key, value } wrapper.
  return { key, value: raw };
}
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

export async function saveGitHubCheckpointBatch(entries: Array<{ path: string; blob?: Blob; acknowledge?: boolean }>) {
  // Persist the verified baseline only after the whole sync and manifest commit.
  // A failed mid-upload attempt must leave prior checkpoints intact so retries
  // still recognize every unsynced local edit.
  const timestamp = new Date().toISOString();
  const prepared = await Promise.all(entries.map(async (entry) => ({
    checkpointKey: syncRecordKey("checkpoint", entry.path),
    checkpoint: entry.blob ? { key: syncRecordKey("checkpoint", entry.path), blob: entry.blob, hash: await hashBlob(entry.blob), updatedAt: timestamp } satisfies SyncRecord : undefined,
    acknowledge: entry.acknowledge ?? true,
    outboxKey: syncRecordKey("outbox", entry.path),
    conflictKey: syncRecordKey("conflict", entry.path),
  })));
  const db = await openSyncDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_STORE);
    for (const entry of prepared) {
      if (entry.checkpoint) store.put(entry.checkpoint);
      else store.delete(entry.checkpointKey);
      if (entry.acknowledge) {
        store.delete(entry.outboxKey);
        store.delete(entry.conflictKey);
      }
    }
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Could not save sync checkpoints.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Saving sync checkpoints was interrupted.")); };
  });
}

export async function saveGitHubConflict(path: string, base: Blob | undefined, local: Blob | undefined, remote: Blob | undefined, reason: string) {
  await saveSyncRecord({ key: syncRecordKey("conflict", path), base, local, remote, message: reason, updatedAt: new Date().toISOString() });
}

export async function saveGitHubRecoveryCopy(path: string, base: Blob | undefined, local: Blob | undefined, remote: Blob | undefined, reason: string) {
  await saveSyncRecord({ key: syncRecordKey("recovery", path), base, local, remote, message: reason, updatedAt: new Date().toISOString() });
}

const safetyBackupKey = () => syncRecordKey("safety-backup", "latest");
export async function saveGitHubSafetyBackup(blob: Blob) {
  await saveSyncRecord({ key: safetyBackupKey(), blob, updatedAt: new Date().toISOString() });
}
export async function getGitHubSafetyBackup() {
  return (await readSyncRecord(safetyBackupKey()))?.blob;
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

function mergeJson(base: any, local: any, remote: any, location: string, conflicts: string[], prefer: "local" | "remote"): any {
  if (sameJson(local, remote)) return local;
  if (sameJson(local, base)) return remote;
  if (sameJson(remote, base)) return local;
  if (typeof base === "string" && typeof local === "string" && typeof remote === "string") {
    try {
      const parsedBase = JSON.parse(base); const parsedLocal = JSON.parse(local); const parsedRemote = JSON.parse(remote);
      if (typeof parsedBase !== "string" || typeof parsedLocal !== "string" || typeof parsedRemote !== "string") {
        return JSON.stringify(mergeJson(parsedBase, parsedLocal, parsedRemote, location, conflicts, prefer));
      }
    } catch { /* Plain text values are compared as a single field. */ }
  }
  if (["$.canvasIds", "$.keys"].includes(location) && Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)
    && [...base, ...local, ...remote].every((item) => typeof item === "string")) {
    const allValues = [...new Set([...local, ...remote])];
    return allValues.filter((item) => {
      const wasInBase = base.includes(item);
      const inLocal = local.includes(item);
      const inRemote = remote.includes(item);
      if (inLocal === wasInBase) return inRemote;
      if (inRemote === wasInBase) return inLocal;
      return inLocal;
    });
  }
  if (base && local && remote && typeof base === "object" && typeof local === "object" && typeof remote === "object" && !Array.isArray(base) && !Array.isArray(local) && !Array.isArray(remote)) {
    const merged: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeJson(base[key], local[key], remote[key], `${location}.${key}`, conflicts, prefer);
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
      const item = mergeJson(baseById.get(id), localById.get(id), remoteById.get(id), `${location}[${id}]`, conflicts, prefer);
      if (item !== undefined) merged.set(id, item);
    }
    // Keep the local ordering, followed by remote-only additions, so separate additions survive deterministically.
    const order = [...local.map((item) => String(item.id)), ...remote.map((item) => String(item.id)).filter((id) => !localById.has(id))];
    return order.map((id) => merged.get(id)).filter((item): item is Record<string, unknown> => Boolean(item));
  }
  conflicts.push(location);
  return prefer === "remote" ? remote : local;
}

export async function mergeGitHubFile(path: string, base: Blob | undefined, local: Blob | undefined, remote: Blob | undefined, prefer: "local" | "remote" = "local"): Promise<GitHubMergeResult> {
  const isMindMapRecord = path.startsWith("mind-maps/maps/") && path.endsWith(".json");
  if (isMindMapRecord) {
    const [localValid, remoteValid] = await Promise.all([isValidMindMapBackupRecord(local), isValidMindMapBackupRecord(remote)]);
    if (localValid && !remoteValid) return { blob: local, conflict: true, reason: "The GitHub mind map record was invalid; kept the intact local map." };
    if (!localValid && remoteValid) return { blob: remote, conflict: true, reason: "The local mind map record was invalid; kept the intact GitHub map." };
    if (!localValid && !remoteValid) return { blob: prefer === "local" ? local : remote, conflict: true, reason: "Both copies of this mind map are invalid; kept the selected copy for recovery." };
  }
  if (!local && !remote) return { conflict: false };
  if (!local) {
    if (!base) return { blob: remote, conflict: false };
    if (!remote || await hashBlob(remote) === await hashBlob(base)) return { conflict: false };
    return { blob: prefer === "remote" ? remote : undefined, conflict: true, reason: "This device deleted the file while GitHub had newer changes." };
  }
  if (!remote) {
    // A missing remote file cannot be used as the merged result. When there is
    // no checkpoint, or the local file still matches the checkpoint, restore
    // that known local version to GitHub. If both sides changed independently,
    // keep the existing conflict protection.
    if (!base || await hashBlob(local) === await hashBlob(base)) return { blob: local, conflict: false };
    return { blob: prefer === "local" ? local : undefined, conflict: true, reason: "Remote file was deleted while this device had local changes." };
  }
  const localHash = await hashBlob(local); const remoteHash = await hashBlob(remote);
  if (localHash === remoteHash) return { blob: local, conflict: false };
  // A mind-map file is an envelope containing two coupled values (metadata and
  // XML). Generic recursive JSON merging can combine fields from different
  // versions into an envelope that passes JSON parsing but is not restorable.
  // Treat it as one record and preserve the selected side intact instead.
  if (isMindMapRecord) {
    if (base) {
      const baseHash = await hashBlob(base);
      if (localHash === baseHash) return { blob: remote, conflict: false };
      if (remoteHash === baseHash) return { blob: local, conflict: false };
    }
    return { blob: prefer === "local" ? local : remote, conflict: true, reason: "Both devices changed this mind map; kept the selected complete map record." };
  }
  if (!base) {
    const indexField = path === "canvases/index.json" ? "canvasIds" : path === "mind-maps/state-index.json" ? "keys" : "";
    if (indexField) {
      try {
        const [localIndex, remoteIndex] = await Promise.all([local.text(), remote.text()]).then((values) => values.map((value) => JSON.parse(value)));
        if (Array.isArray(localIndex?.[indexField]) && Array.isArray(remoteIndex?.[indexField])
          && [...localIndex[indexField], ...remoteIndex[indexField]].every((item) => typeof item === "string")) {
          const merged = { ...remoteIndex, ...localIndex, [indexField]: [...new Set([...localIndex[indexField], ...remoteIndex[indexField]])] };
          return { blob: new Blob([JSON.stringify(merged, null, 2)], { type: "application/json;charset=utf-8" }), conflict: false };
        }
      } catch { /* Invalid indexes remain conflicts for manual review. */ }
    }
    return { blob: prefer === "local" ? local : remote, conflict: true, reason: "Both this device and GitHub created the file independently." };
  }
  const baseHash = await hashBlob(base);
  if (localHash === baseHash) return { blob: remote, conflict: false };
  if (remoteHash === baseHash) return { blob: local, conflict: false };
  try {
    const [baseJson, localJson, remoteJson] = await Promise.all([base.text(), local.text(), remote.text()]).then((values) => values.map((value) => JSON.parse(value)));
    const conflicts: string[] = [];
    const merged = mergeJson(baseJson, localJson, remoteJson, "$", conflicts, prefer);
    return { blob: new Blob([JSON.stringify(merged, null, 2)], { type: "application/json;charset=utf-8" }), conflict: conflicts.length > 0, reason: conflicts.length ? `Both devices changed the same data (${conflicts.slice(0, 4).join(", ")}); kept the ${prefer === "local" ? "device" : "GitHub"} version.` : undefined };
  } catch {
    return { blob: prefer === "local" ? local : remote, conflict: true, reason: `Both devices changed ${path}; kept the ${prefer === "local" ? "device" : "GitHub"} version.` };
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

  const canvasDocuments = await loadCanvasDocuments<any>();
  const imageIndexes = new Map<string, any[]>();
  putJson("canvases/index.json", { version: 1, canvasIds: canvasDocuments.map((canvas) => String(canvas.id)) });
  for (const canvas of canvasDocuments as any[]) {
    if (!canvas || typeof canvas.id !== "string" || !canvas.id.trim() || !Array.isArray(canvas.elements)) {
      throw new Error("GitHub sync stopped because a local canvas document is unreadable. Local data was left unchanged.");
    }
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
  let canvasWorkspace: unknown = {};
  try { canvasWorkspace = JSON.parse(values.get(WORKSPACE_KEY) || "{}"); }
  catch { throw new Error("GitHub sync stopped because the local canvas workspace is unreadable. Local data was left unchanged."); }
  putJson("canvases/workspace.json", canvasWorkspace);

  let maps: any[];
  try {
    const value = JSON.parse(values.get(MAPS_KEY) || "[]");
    if (!Array.isArray(value) || value.some((map) => !map || typeof map.id !== "string" || !map.id.trim() || typeof map.title !== "string" || !map.title.trim())) throw new Error();
    maps = value;
  } catch { throw new Error("GitHub sync stopped because the local mind map list is unreadable. Local data was left unchanged."); }
  putJson("mind-maps/index.json", { version: 1, mapIds: maps.map((map: any) => String(map.id)) });
  for (const map of maps) {
    const xml = values.get(`${map.id}-xml`);
    if (typeof xml !== "string" || !xml.trim()) throw new Error(`GitHub sync stopped because the local mind map “${map.title}” has no saved map data. Local data was left unchanged.`);
    const record = textBlob(JSON.stringify({ map, xml }, null, 2));
    if (!await isValidMindMapBackupRecord(record)) throw new Error(`GitHub sync stopped because the local mind map “${map.title}” is invalid. Local data was left unchanged.`);
    files.set(`mind-maps/maps/${pathId(String(map.id))}.json`, record);
  }
  const mindMapStateKeys = localEntries.map(([key]) => key).filter((key) => key.startsWith("alleviate-wisemapping-") || key.startsWith("alleviate-resources-default-"));
  putJson("mind-maps/state-index.json", { keys: mindMapStateKeys });
  mindMapStateKeys.forEach((key) => putJson(`mind-maps/state/${pathId(key)}.json`, { key, value: values.get(key) ?? "" }));

  for (const [key, value] of localEntries) {
    if (ignoredKeys.has(key) || key.startsWith("alleviate-github-auto-sync-paused-v1:") || isSensitiveStorageKey(key) || key === MAPS_KEY || key.startsWith("alleviate-wisemapping-") || key.startsWith("alleviate-resources-default-") || /^.+-xml$/.test(key) && maps.some((map: any) => `${map.id}-xml` === key)) continue;
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

async function applyAlleviateGitHubChangesUnchecked(downloads: Array<{ path: string; blob: Blob }>, deletedPaths: string[] = []) {
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
    if (isSensitiveGitHubBackupPath(item.path)) continue;
    if (item.path.endsWith(".json")) {
      let parsed: any;
      const isStorageEntry = item.path.startsWith("app-data/") || item.path.startsWith("mind-maps/state/");
      try { parsed = JSON.parse(await item.blob.text()); }
      catch {
        if (isStorageEntry) { storageKeyFromBackupPath(item.path); continue; }
        throw new Error(`GitHub sync stopped: ${item.path} is not valid JSON. Local data was left unchanged.`);
      }
      if (isStorageEntry) { storageKeyFromBackupPath(item.path); continue; }
      if (!parsed || typeof parsed !== "object") throw new Error(`GitHub sync stopped: ${item.path} has an invalid data shape. Local data was left unchanged.`);
      if (item.path.startsWith("canvases/") && item.path.endsWith("/canvas.json") && (typeof parsed.id !== "string" || !Array.isArray(parsed.elements))) throw new Error(`GitHub sync stopped: ${item.path} is not a valid canvas document.`);
      if (item.path.startsWith("mind-maps/maps/") && item.path.endsWith(".json")) {
        const id = parsed.map?.id;
        const xml = parsed.xml;
        if (typeof id !== "string" || !id.trim() || typeof xml !== "string" || !xml.trim() || !await isValidMindMapBackupRecord(item.blob)) {
          const missing = [typeof id !== "string" || !id.trim() ? "map.id" : "", typeof xml !== "string" || !xml.trim() ? "xml" : ""].filter(Boolean).join(" and ");
          throw new Error(`GitHub sync stopped: ${item.path} has an invalid mind map record (${missing} ${missing.includes(" and ") ? "are" : "is"} missing or empty). Local data was left unchanged.`);
        }
      }
    }
  }

  for (const item of downloads) {
    if (isSensitiveGitHubBackupPath(item.path)) continue;
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
      const value = await readStorageBackupEntry(item.path, item.blob);
      if (!isSensitiveStorageKey(value.key)) localStorageWrites.set(value.key, value.value);
    } else if (item.path.startsWith("app-data/") && item.path.endsWith(".json")) {
      const value = await readStorageBackupEntry(item.path, item.blob);
      if (!isSensitiveStorageKey(value.key)) localStorageWrites.set(value.key, value.value);
    } else if (item.path === "books/pdfs/index.json") {
      pdfIndex = JSON.parse(await readBlobText(item.blob)).pdfs || [];
    } else if (item.path.startsWith("books/pdfs/") && item.path.endsWith(".pdf")) {
      const filename = item.path.split("/").pop() || "";
      pdfBlobs.set(fromPathId(filename.slice(0, -4)), item.blob);
    }
  }

  for (const path of deletedPaths) {
    const parts = path.split("/");
    if (parts[0] === "app-data" && parts[1]?.endsWith(".json")) { try { const key = fromPathId(parts[1].slice(0, -5)); if (!isSensitiveStorageKey(key)) removedStorageKeys.add(key); } catch { /* Ignore unknown path encodings. */ } }
    if (parts[0] === "canvases" && parts[1] && parts[2] === "canvas.json") { try { removedCanvasIds.add(fromPathId(parts[1])); } catch { /* Ignore malformed IDs. */ } }
    if (parts[0] === "mind-maps" && parts[1] === "maps" && parts[2]?.endsWith(".json")) { try { removedMindMapIds.add(fromPathId(parts[2].slice(0, -5))); } catch { /* Ignore malformed IDs. */ } }
    if (parts[0] === "books" && parts[1] === "pdfs" && parts[2]?.endsWith(".pdf")) { try { removedPdfIds.add(fromPathId(parts[2].slice(0, -4))); } catch { /* Ignore malformed IDs. */ } }
    if (parts[0] === "canvases" && parts[2] === "images" && parts[3] && parts[3] !== "index.json") {
      try { const filename = parts[3]; const extensionAt = filename.lastIndexOf("."); if (extensionAt > 0) removedCanvasImageKeys.add(`${fromPathId(parts[1])}:${fromPathId(filename.slice(0, extensionAt))}`); } catch { /* Ignore malformed IDs. */ }
    }
    if (parts[0] === "mind-maps" && parts[1] === "state" && parts[2]?.endsWith(".json")) { try { const key = fromPathId(parts[2].slice(0, -5)); if (!isSensitiveStorageKey(key)) removedStorageKeys.add(key); } catch { /* Ignore malformed keys. */ } }
  }

  const currentCanvases = await loadCanvasDocuments<any>();
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

export async function applyAlleviateGitHubChanges(downloads: Array<{ path: string; blob: Blob }>, deletedPaths: string[] = [], rollbackSnapshot?: Blob) {
  const backup = rollbackSnapshot || await createAppBackup();
  try {
    await applyAlleviateGitHubChangesUnchecked(downloads, deletedPaths);
  } catch (error) {
    try {
      const archive = new File([backup], "alleviate-pre-sync-recovery.zip", { type: "application/zip" });
      await restoreAppBackup(await parseAppBackup(archive));
    } catch (rollbackError) {
      const original = error instanceof Error ? error.message : "GitHub changes could not be applied.";
      const rollback = rollbackError instanceof Error ? rollbackError.message : "The local snapshot could not be restored.";
      throw new Error(`${original} Automatic local rollback also failed: ${rollback}. Use your downloaded local backup to recover.`);
    }
    const message = error instanceof Error ? error.message : "GitHub changes could not be applied.";
    throw new Error(`${message} The device was restored from its pre-sync snapshot.`);
  }
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

