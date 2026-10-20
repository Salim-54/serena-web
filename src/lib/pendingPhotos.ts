// Photos picked for a ticket that doesn't exist yet. They can't be named
// with the ticket number until it's saved, so they wait here (IndexedDB —
// survives a refresh or the page reloading after the camera) and are
// uploaded right after the ticket is created.

const DB = 'rm-portal';
const STORE = 'pending-photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // private mode / blocked storage: photos just aren't kept across reloads
  }
}

export const loadPending = async (key: string) => ((await run<Blob[]>('readonly', (s) => s.get(key))) ?? []) as Blob[];
export const savePending = (key: string, blobs: Blob[]) => run('readwrite', (s) => s.put(blobs, key));
export const clearPending = (key: string) => run('readwrite', (s) => s.delete(key));
