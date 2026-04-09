// src/utils/offlineQueue.js
//
// On-device offline write queue.
//
// When the device cannot reach Odoo (no internet OR Odoo unreachable), screens
// can stash a write here instead of crashing. The OfflineSyncService flushes
// the queue to /offline_sync/api/submit when connectivity returns.
//
// Storage shape (single AsyncStorage key):
//   @offline_queue_v1 -> JSON array of items
//
// Item shape:
//   { id, model, operation, values, createdAt, retryCount, lastError }

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@offline_queue_v1';

// Generate a stable id without pulling in uuid (no native dep needed).
const generateId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const readAll = async () => {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('[offlineQueue] read failed:', e?.message);
        return [];
    }
};

const writeAll = async (items) => {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.warn('[offlineQueue] write failed:', e?.message);
    }
};

/**
 * Add a new item to the queue.
 * @param {object} payload - { model, operation, values }
 * @returns {Promise<string>} the assigned id
 */
export const enqueue = async ({ model, operation, values }) => {
    if (!model || !operation) {
        throw new Error('offlineQueue.enqueue: model and operation are required');
    }
    const items = await readAll();
    const id = generateId();
    items.push({
        id,
        model,
        operation,
        values: values || {},
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: null,
    });
    await writeAll(items);
    return id;
};

export const getAll = async () => readAll();

export const getPendingCount = async () => {
    const items = await readAll();
    return items.length;
};

export const removeById = async (id) => {
    const items = await readAll();
    const next = items.filter((it) => it.id !== id);
    await writeAll(next);
};

export const markFailed = async (id, errorMessage) => {
    const items = await readAll();
    const next = items.map((it) =>
        it.id === id
            ? { ...it, retryCount: (it.retryCount || 0) + 1, lastError: errorMessage || 'unknown' }
            : it
    );
    await writeAll(next);
};

export const clear = async () => {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn('[offlineQueue] clear failed:', e?.message);
    }
};

export default {
    enqueue,
    getAll,
    getPendingCount,
    removeById,
    markFailed,
    clear,
};
