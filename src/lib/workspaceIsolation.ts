type WorkspaceDatabase = { name: string; store: string; keyPath: string };
type WorkspaceSnapshot = { localStorage: Record<string, string>; databases: Record<string, unknown[]> };

const SNAPSHOT_DATABASE = "alleviate-account-workspaces-v1";
const SNAPSHOT_STORE = "workspaces";
const WORKSPACE_DATABASES: WorkspaceDatabase[] = [
  { name: "alleviate-books-v1", store: "pdf-files", keyPath: "id" },
  { name: "alleviate-canvas-files-v1", store: "files", keyPath: "key" },
  { name: "alleviate-canvas-documents-v2", store: "documents", keyPath: "id" },
];
const ACTIVE_USER_KEY = "alleviate_current_user";
const RESERVED_ACCOUNT = "__unassigned_legacy_workspace__";
const ACCOUNT_DATA_EXCLUSIONS = [/^alleviate_current_user$/, /^alleviate_access_token:/];

function normalizeUsername(value: unknown): string {
  return String(value || "").trim().toLocaleLowerCase();
}

function getActiveUsername(): string {
  try {
    return normalizeUsername(JSON.parse(localStorage.getItem(ACTIVE_USER_KEY) || "null")?.username);
  } catch {
    return "";
  }
}

async function getDatabaseNames(): Promise<Set<string>> {
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (!factory.databases) throw new Error("This app runtime cannot safely separate local workspaces. Update Alleviate and try again.");
  const databases = await factory.databases();
  return new Set(databases.map((database) => database.name).filter((name): name is string => Boolean(name)));
}

function openDatabase(name: string, store: string, keyPath: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(`Could not open ${name}.`));
    request.onblocked = () => reject(new Error(`Close other Alleviate windows before switching accounts.`));
  });
}

function readRecords(database: WorkspaceDatabase): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database.name);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      reject(new Error(`The ${database.name} database changed while switching accounts.`));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(database.store)) { db.close(); resolve([]); return; }
      const transaction = db.transaction(database.store, "readonly");
      const records = transaction.objectStore(database.store).getAll();
      records.onsuccess = () => resolve(records.result || []);
      records.onerror = () => reject(records.error || new Error(`Could not read ${database.store}.`));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error(`Could not read ${database.store}.`)); };
    };
    request.onerror = () => reject(request.error || new Error(`Could not read ${database.name}.`));
  });
}

async function captureWorkspace(): Promise<WorkspaceSnapshot> {
  const localStorageSnapshot: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && !ACCOUNT_DATA_EXCLUSIONS.some((pattern) => pattern.test(key))) {
      localStorageSnapshot[key] = localStorage.getItem(key) ?? "";
    }
  }

  const databases: Record<string, unknown[]> = {};
  const existing = await getDatabaseNames();
  for (const database of WORKSPACE_DATABASES) {
    databases[database.name] = existing.has(database.name) ? await readRecords(database) : [];
  }
  return { localStorage: localStorageSnapshot, databases };
}

function openSnapshotDatabase(): Promise<IDBDatabase> {
  return openDatabase(SNAPSHOT_DATABASE, SNAPSHOT_STORE, "username");
}

async function readWorkspace(username: string): Promise<WorkspaceSnapshot | null> {
  const database = await openSnapshotDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
    const request = transaction.objectStore(SNAPSHOT_STORE).get(username);
    request.onsuccess = () => resolve((request.result?.snapshot as WorkspaceSnapshot) || null);
    request.onerror = () => reject(request.error || new Error("Could not load this account's local workspace."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Could not load this account's local workspace.")); };
  });
}

async function saveWorkspace(username: string, snapshot: WorkspaceSnapshot): Promise<void> {
  const database = await openSnapshotDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
    transaction.objectStore(SNAPSHOT_STORE).put({ username, snapshot });
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Could not save this account's local workspace.")); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Saving this account's local workspace was interrupted.")); };
  });
}

async function writeWorkspace(snapshot: WorkspaceSnapshot | null): Promise<void> {
  const preserved = new Set<string>([ACTIVE_USER_KEY]);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && ACCOUNT_DATA_EXCLUSIONS.some((pattern) => pattern.test(key))) preserved.add(key);
  }
  const retained = new Map(Array.from(preserved, (key) => [key, localStorage.getItem(key) ?? ""]));
  localStorage.clear();
  for (const [key, value] of retained) localStorage.setItem(key, value);
  for (const [key, value] of Object.entries(snapshot?.localStorage || {})) localStorage.setItem(key, value);

  for (const database of WORKSPACE_DATABASES) {
    const db = await openDatabase(database.name, database.store, database.keyPath);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(database.store, "readwrite");
      const store = transaction.objectStore(database.store);
      store.clear();
      for (const row of snapshot?.databases[database.name] || []) store.put(row);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error(`Could not switch ${database.store} data.`)); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error(`Switching ${database.store} data was interrupted.`)); };
    });
  }
  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new Event("alleviate-data-restored"));
}

let switchQueue: Promise<void> = Promise.resolve();

/** Saves the current local workspace, then loads the target account's isolated workspace. */
export function switchWorkspaceAccount(targetUsername: string | null): Promise<void> {
  const target = normalizeUsername(targetUsername) || null;
  switchQueue = switchQueue.catch(() => undefined).then(async () => {
    const current = getActiveUsername();
    if ((current || null) === target) return;

    const databases = await getDatabaseNames();
    const hasCurrentWorkspace = localStorage.length > 0 || WORKSPACE_DATABASES.some((database) => databases.has(database.name));
    const outgoingWorkspace = current || hasCurrentWorkspace ? await captureWorkspace() : null;
    if (outgoingWorkspace) await saveWorkspace(current || RESERVED_ACCOUNT, outgoingWorkspace);

    const nextWorkspace = target ? await readWorkspace(target) : null;
    try {
      await writeWorkspace(nextWorkspace);
    } catch (error) {
      try { await writeWorkspace(outgoingWorkspace); }
      catch { throw new Error("Workspace switching failed, and Alleviate could not restore the previous local workspace. Close other app windows and reopen Alleviate."); }
      throw error;
    }
  });
  return switchQueue;
}
