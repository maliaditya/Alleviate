const DATABASE_NAME = "alleviate-books-v1";
const STORE_NAME = "pdf-files";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the Books library."));
  });
}

export async function saveBookPdf(id: string, file: Blob) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ id, file });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save the PDF."));
    transaction.onabort = () => reject(transaction.error || new Error("PDF storage was interrupted."));
  });
  database.close();
}

export async function loadBookPdf(id: string): Promise<Blob | null> {
  const database = await openDatabase();
  const file = await new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result?.file as Blob | undefined) || null);
    request.onerror = () => reject(request.error || new Error("Could not read the PDF."));
  });
  database.close();
  return file;
}

export async function deleteBookPdf(id: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not delete the PDF."));
  });
  database.close();
}
