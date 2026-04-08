/** @odoo-module **/

const DB_NAME = "odoo_offline_sync";
const DB_VERSION = 1;

const STORE_PENDING = "pending_records";
const STORE_SYNC_LOG = "sync_log";

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_PENDING)) {
                const store = db.createObjectStore(STORE_PENDING, {
                    keyPath: "id",
                    autoIncrement: true,
                });
                store.createIndex("localId", "localId", { unique: true });
                store.createIndex("modelName", "modelName", { unique: false });
                store.createIndex("status", "status", { unique: false });
                store.createIndex("createdAt", "createdAt", { unique: false });
            }
            if (!db.objectStoreNames.contains(STORE_SYNC_LOG)) {
                const store = db.createObjectStore(STORE_SYNC_LOG, {
                    keyPath: "id",
                    autoIncrement: true,
                });
                store.createIndex("localId", "localId", { unique: false });
                store.createIndex("syncedAt", "syncedAt", { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function _tx(db, storeName, mode) {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    return { tx, store };
}

function _request(idbRequest) {
    return new Promise((resolve, reject) => {
        idbRequest.onsuccess = () => resolve(idbRequest.result);
        idbRequest.onerror = () => reject(idbRequest.error);
    });
}

export async function putRecord(storeName, record) {
    const db = await openDB();
    const { store } = _tx(db, storeName, "readwrite");
    const id = await _request(store.put(record));
    db.close();
    return id;
}

export async function getByIndex(storeName, indexName, value) {
    const db = await openDB();
    const { store } = _tx(db, storeName, "readonly");
    const index = store.index(indexName);
    const result = await _request(index.getAll(value));
    db.close();
    return result;
}

export async function getAll(storeName) {
    const db = await openDB();
    const { store } = _tx(db, storeName, "readonly");
    const result = await _request(store.getAll());
    db.close();
    return result;
}

export async function getByKey(storeName, key) {
    const db = await openDB();
    const { store } = _tx(db, storeName, "readonly");
    const result = await _request(store.get(key));
    db.close();
    return result;
}

export async function deleteByKey(storeName, key) {
    const db = await openDB();
    const { store } = _tx(db, storeName, "readwrite");
    await _request(store.delete(key));
    db.close();
}

export async function countByIndex(storeName, indexName, value) {
    const db = await openDB();
    const { store } = _tx(db, storeName, "readonly");
    const index = store.index(indexName);
    const count = await _request(index.count(value));
    db.close();
    return count;
}

export async function countAll(storeName) {
    const db = await openDB();
    const { store } = _tx(db, storeName, "readonly");
    const count = await _request(store.count());
    db.close();
    return count;
}

export async function clearStore(storeName) {
    const db = await openDB();
    const { store } = _tx(db, storeName, "readwrite");
    await _request(store.clear());
    db.close();
}

export async function updateRecord(storeName, key, updates) {
    const db = await openDB();
    const { store } = _tx(db, storeName, "readwrite");
    const record = await _request(store.get(key));
    if (record) {
        Object.assign(record, updates);
        await _request(store.put(record));
    }
    db.close();
    return record;
}

export { STORE_PENDING, STORE_SYNC_LOG };
