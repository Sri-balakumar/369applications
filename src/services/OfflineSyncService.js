// src/services/OfflineSyncService.js
//
// Auto-flushes the on-device offline queue directly to Odoo when online.
//
// Instead of routing through /offline_sync/api/submit, we call Odoo's
// standard /web/dataset/call_kw directly — the same endpoint the online
// check-in uses. This avoids any dependency on the offline_sync Odoo module
// being correctly configured.

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { AppState } from 'react-native';
import offlineQueue from '@utils/offlineQueue';
import networkStatus from '@utils/networkStatus';
import { getOdooBaseUrl } from '@api/config/odooConfig';

let started = false;
let unsubscribe = null;
let appStateSub = null;
let flushing = false;
let retryTimer = null;

const OFFLINE_ID_MAP_KEY = '@offline_id_map';

const getAuthHeaders = async () => {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const cookie = await AsyncStorage.getItem('odoo_cookie');
        if (cookie) headers.Cookie = cookie;
    } catch (_) {}
    return headers;
};

// Persistent map of offline placeholder ids ("offline_<queueItemId>") to real
// Odoo ids. Used so that a product queued offline that references a newly
// created offline category can resolve the category's real id once the
// category has itself been synced.
const readOfflineIdMap = async () => {
    try {
        const raw = await AsyncStorage.getItem(OFFLINE_ID_MAP_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
};

const saveOfflineIdMapping = async (offlineId, realId) => {
    try {
        const map = await readOfflineIdMap();
        map[offlineId] = realId;
        await AsyncStorage.setItem(OFFLINE_ID_MAP_KEY, JSON.stringify(map));
    } catch (_) {}
};

// Resolve any "offline_<id>" references inside a product's values to their
// real Odoo ids. Throws if a reference has no mapping yet — the queue will
// retry after the dependency syncs.
const resolveOfflineCategoryRefs = async (values) => {
    const map = await readOfflineIdMap();
    const resolve = (val) => {
        if (typeof val !== 'string' || !val.startsWith('offline_')) return val;
        const real = map[val];
        if (real === undefined) throw new Error(`Dependency ${val} not yet synced`);
        return real;
    };
    const out = { ...values };
    if (typeof out.categ_id === 'string' && out.categ_id.startsWith('offline_')) {
        out.categ_id = resolve(out.categ_id);
    }
    if (Array.isArray(out.pos_categ_ids)) {
        out.pos_categ_ids = out.pos_categ_ids.map((cmd) => {
            if (Array.isArray(cmd) && cmd[0] === 6 && Array.isArray(cmd[2])) {
                return [6, 0, cmd[2].map((id) => resolve(id))];
            }
            return cmd;
        });
    }
    return out;
};

// After a category syncs, replace any offline placeholder entry in the cached
// category list with the real id so the form dropdown stops showing it twice.
// Also rename the category-keyed product cache so filter still finds products
// that were queued under the offline id.
const replaceOfflineCategoryInCache = async (offlineId, realId) => {
    try {
        const raw = await AsyncStorage.getItem('@cache:categories');
        if (raw) {
            const list = JSON.parse(raw);
            let changed = false;
            const next = list.map((c) => {
                if (c._id === offlineId || c.id === offlineId) {
                    changed = true;
                    return { ...c, _id: realId, id: realId, offline: false };
                }
                return c;
            });
            if (changed) await AsyncStorage.setItem('@cache:categories', JSON.stringify(next));
        }

        // Rename @cache:products:cat:<offlineId> -> @cache:products:cat:<realId>
        const oldKey = `@cache:products:cat:${offlineId}`;
        const newKey = `@cache:products:cat:${realId}`;
        const oldProducts = await AsyncStorage.getItem(oldKey);
        if (oldProducts) {
            await AsyncStorage.setItem(newKey, oldProducts);
            await AsyncStorage.removeItem(oldKey);
        }
    } catch (_) {}
};

// After a product syncs, update its placeholder in the cached product lists
// so the real id replaces the offline id and downstream navigation works.
const replaceOfflineProductInCache = async (offlineId, realId) => {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const productKeys = keys.filter((k) => k.startsWith('@cache:products'));
        for (const key of productKeys) {
            try {
                const raw = await AsyncStorage.getItem(key);
                if (!raw) continue;
                const list = JSON.parse(raw);
                let changed = false;
                const next = list.map((p) => {
                    if (p.id === offlineId) {
                        changed = true;
                        return { ...p, id: realId, offline: false };
                    }
                    return p;
                });
                if (changed) await AsyncStorage.setItem(key, JSON.stringify(next));
            } catch (_) {}
        }
    } catch (_) {}
};

// Log a completed sync into Odoo's offline.sync.queue as 'synced' so the
// history appears in Odoo's Sync Queue view and app's dashboard stats update.
// Fire-and-forget — if logging fails, the actual record is still created.
const logSyncHistory = async (baseUrl, headers, { model, operation, values, syncedRecordId }) => {
    try {
        // Find ir.model id for the target model
        const modelResp = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0', method: 'call',
                params: {
                    model: 'ir.model', method: 'search_read',
                    args: [[['model', '=', model]]],
                    kwargs: { fields: ['id'], limit: 1 },
                },
            },
            { headers, timeout: 8000 }
        );
        const modelId = modelResp.data?.result?.[0]?.id;
        if (!modelId) return;

        // Format synced_at for Odoo (YYYY-MM-DD HH:MM:SS UTC)
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const syncedAt = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;

        await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0', method: 'call',
                params: {
                    model: 'offline.sync.queue', method: 'create',
                    args: [{
                        model_id: modelId,
                        record_data: JSON.stringify(values || {}),
                        operation: operation || 'create',
                        state: 'synced',
                        synced_record_id: syncedRecordId || 0,
                        synced_at: syncedAt,
                    }],
                    kwargs: {},
                },
            },
            { headers, timeout: 8000 }
        );
        console.log('[OfflineSyncService] Logged sync history for', model, 'recordId:', syncedRecordId);
    } catch (e) {
        // Non-fatal — the actual record was already created successfully
        console.warn('[OfflineSyncService] history log failed:', e?.message);
    }
};

// Directly create/write an hr.attendance record in Odoo — same as
// checkInByEmployeeId does online.
const syncItemDirectly = async (item) => {
    const baseUrl = (getOdooBaseUrl() || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('No Odoo URL configured');

    const headers = await getAuthHeaders();
    const values = item.values || {};

    if (item.model === 'hr.attendance' && item.operation === 'create') {
        // Standard attendance create with check_in (and optionally check_out)
        const response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'hr.attendance',
                    method: 'create',
                    args: [{
                        employee_id: values.employee_id,
                        check_in: values.check_in,
                        ...(values.check_out ? { check_out: values.check_out } : {}),
                    }],
                    kwargs: {},
                },
            },
            { headers, timeout: 15000 }
        );

        if (response.data?.error) {
            const msg = response.data.error?.data?.message || response.data.error?.message || 'Odoo error';
            throw new Error(msg);
        }

        const recordId = response.data?.result;
        console.log('[OfflineSyncService] Created hr.attendance id:', recordId);
        logSyncHistory(baseUrl, headers, { model: 'hr.attendance', operation: 'create', values, syncedRecordId: recordId }).catch(() => {});
        return recordId;
    }

    // Banner create
    if (item.model === 'app.banner' && item.operation === 'create') {
        const response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'app.banner',
                    method: 'create',
                    args: [{
                        name: values.name || `banner_${Date.now()}`,
                        image: values.image,
                    }],
                    kwargs: {},
                },
            },
            { headers, timeout: 30000 }
        );
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Banner create failed');
        }
        const recordId = response.data?.result;
        console.log('[OfflineSyncService] Created app.banner id:', recordId);
        logSyncHistory(baseUrl, headers, { model: 'app.banner', operation: 'create', values, syncedRecordId: recordId }).catch(() => {});
        return recordId;
    }

    // Banner delete
    if (item.model === 'app.banner' && item.operation === 'delete') {
        const bannerId = values.id;
        if (!bannerId) throw new Error('Banner delete: no id');
        const response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'app.banner',
                    method: 'unlink',
                    args: [[bannerId]],
                    kwargs: {},
                },
            },
            { headers, timeout: 15000 }
        );
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Banner delete failed');
        }
        console.log('[OfflineSyncService] Deleted app.banner id:', bannerId);
        logSyncHistory(baseUrl, headers, { model: 'app.banner', operation: 'delete', values, syncedRecordId: bannerId }).catch(() => {});
        return bannerId;
    }

    // Product create (sale_ok/purchase_ok and category already in values)
    if (item.model === 'product.product' && item.operation === 'create') {
        // Resolve any offline_<id> category refs to the real ids we got from
        // earlier queue items. If an offline category ref is still unresolved,
        // this throws and keeps the item in the queue for retry.
        const resolvedValues = await resolveOfflineCategoryRefs(values);
        const response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'product.product',
                    method: 'create',
                    args: [resolvedValues],
                    kwargs: {},
                },
            },
            { headers, timeout: 30000 }
        );
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Product create failed');
        }
        const recordId = response.data?.result;
        console.log('[OfflineSyncService] Created product.product id:', recordId);
        await replaceOfflineProductInCache(`offline_${item.id}`, recordId);
        logSyncHistory(baseUrl, headers, { model: 'product.product', operation: 'create', values: resolvedValues, syncedRecordId: recordId }).catch(() => {});
        return recordId;
    }

    // POS category create (with product.category fallback)
    if ((item.model === 'pos.category' || item.model === 'product.category') && item.operation === 'create') {
        // Idempotency: if we already synced this queue item but failed to
        // removeById (e.g. app killed between the two), the mapping is still
        // persisted — return that real id instead of creating a duplicate.
        const offlineId = `offline_${item.id}`;
        const existingMap = await readOfflineIdMap();
        if (existingMap[offlineId] !== undefined) {
            console.log('[OfflineSyncService] category already synced, reusing id:', existingMap[offlineId]);
            return existingMap[offlineId];
        }

        let model = item.model;
        let response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0',
                method: 'call',
                params: { model, method: 'create', args: [values], kwargs: {} },
            },
            { headers, timeout: 15000 }
        );
        // If pos.category doesn't exist, fall back to product.category
        if (response.data?.error && model === 'pos.category') {
            console.log('[OfflineSyncService] pos.category unavailable, trying product.category');
            model = 'product.category';
            response = await axios.post(
                `${baseUrl}/web/dataset/call_kw`,
                {
                    jsonrpc: '2.0',
                    method: 'call',
                    params: { model, method: 'create', args: [values], kwargs: {} },
                },
                { headers, timeout: 15000 }
            );
        }
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Category create failed');
        }
        const recordId = response.data?.result;
        console.log('[OfflineSyncService] Created', model, 'id:', recordId);
        await saveOfflineIdMapping(offlineId, recordId);
        await replaceOfflineCategoryInCache(offlineId, recordId);
        logSyncHistory(baseUrl, headers, { model, operation: 'create', values, syncedRecordId: recordId }).catch(() => {});
        return recordId;
    }

    // Sale order create (quotation). Supports an optional _confirmAfterCreate
    // flag which chains action_confirm after the order is created.
    if (item.model === 'sale.order' && item.operation === 'create') {
        const offlineId = `offline_${item.id}`;
        const existingMap = await readOfflineIdMap();
        if (existingMap[offlineId] !== undefined) {
            console.log('[OfflineSyncService] sale.order already synced, reusing id:', existingMap[offlineId]);
            return existingMap[offlineId];
        }
        const { _confirmAfterCreate, ...rest } = values;
        const createResp = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0', method: 'call',
                params: { model: 'sale.order', method: 'create', args: [rest], kwargs: {} },
            },
            { headers, timeout: 30000 }
        );
        if (createResp.data?.error) {
            throw new Error(createResp.data.error?.data?.message || 'Sale order create failed');
        }
        const recordId = createResp.data?.result;
        console.log('[OfflineSyncService] Created sale.order id:', recordId);
        await saveOfflineIdMapping(offlineId, recordId);

        // Swap offline placeholder in cached list/detail with real id.
        try {
            const raw = await AsyncStorage.getItem('@cache:saleOrders');
            if (raw) {
                const list = JSON.parse(raw);
                let changed = false;
                const next = list.map((o) => {
                    if (String(o.id) === offlineId) { changed = true; return { ...o, id: recordId, offline: false }; }
                    return o;
                });
                if (changed) await AsyncStorage.setItem('@cache:saleOrders', JSON.stringify(next));
            }
        } catch (_) {}
        try {
            const rawD = await AsyncStorage.getItem(`@cache:saleOrderDetail:${offlineId}`);
            if (rawD) {
                const prev = JSON.parse(rawD);
                await AsyncStorage.setItem(`@cache:saleOrderDetail:${recordId}`, JSON.stringify({ ...prev, id: recordId, offline: false }));
                await AsyncStorage.removeItem(`@cache:saleOrderDetail:${offlineId}`);
            }
        } catch (_) {}

        // Chain action_confirm if requested.
        if (_confirmAfterCreate) {
            try {
                const confirmResp = await axios.post(
                    `${baseUrl}/web/dataset/call_kw`,
                    {
                        jsonrpc: '2.0', method: 'call',
                        params: { model: 'sale.order', method: 'action_confirm', args: [[recordId]], kwargs: {} },
                    },
                    { headers, timeout: 30000 }
                );
                if (confirmResp.data?.error) {
                    console.warn('[OfflineSyncService] sale.order confirm failed:', confirmResp.data.error?.data?.message);
                } else {
                    console.log('[OfflineSyncService] Confirmed sale.order id:', recordId);
                }
            } catch (e) { console.warn('[OfflineSyncService] confirm chain error:', e?.message); }
        }

        logSyncHistory(baseUrl, headers, { model: 'sale.order', operation: 'create', values: rest, syncedRecordId: recordId }).catch(() => {});
        return recordId;
    }

    // Sale order confirm (action_confirm on an already-synced order)
    if (item.model === 'sale.order' && item.operation === 'action_confirm') {
        const { _recordId } = values;
        let realRecordId = _recordId;
        if (typeof realRecordId === 'string' && realRecordId.startsWith('offline_')) {
            const map = await readOfflineIdMap();
            if (map[realRecordId] === undefined) throw new Error(`Record ${realRecordId} not yet synced`);
            realRecordId = map[realRecordId];
        }
        const response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0', method: 'call',
                params: { model: 'sale.order', method: 'action_confirm', args: [[Number(realRecordId)]], kwargs: {} },
            },
            { headers, timeout: 30000 }
        );
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Sale order confirm failed');
        }
        console.log('[OfflineSyncService] Confirmed sale.order id:', realRecordId);
        logSyncHistory(baseUrl, headers, { model: 'sale.order', operation: 'action_confirm', values: { id: realRecordId }, syncedRecordId: realRecordId }).catch(() => {});
        return realRecordId;
    }

    // Contact (res.partner) create
    if (item.model === 'res.partner' && item.operation === 'create') {
        const offlineId = `offline_${item.id}`;
        const existingMap = await readOfflineIdMap();
        if (existingMap[offlineId] !== undefined) {
            console.log('[OfflineSyncService] contact already synced, reusing id:', existingMap[offlineId]);
            return existingMap[offlineId];
        }
        const response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0', method: 'call',
                params: { model: 'res.partner', method: 'create', args: [values], kwargs: {} },
            },
            { headers, timeout: 30000 }
        );
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Contact create failed');
        }
        const recordId = response.data?.result;
        console.log('[OfflineSyncService] Created res.partner id:', recordId);
        await saveOfflineIdMapping(offlineId, recordId);
        // Swap offline placeholder in the cached contact list with the real id.
        try {
            const raw = await AsyncStorage.getItem('@cache:contacts');
            if (raw) {
                const list = JSON.parse(raw);
                let changed = false;
                const next = list.map((c) => {
                    if (String(c.id) === offlineId) { changed = true; return { ...c, id: recordId, offline: false }; }
                    return c;
                });
                if (changed) await AsyncStorage.setItem('@cache:contacts', JSON.stringify(next));
            }
        } catch (_) {}
        logSyncHistory(baseUrl, headers, { model: 'res.partner', operation: 'create', values, syncedRecordId: recordId }).catch(() => {});
        return recordId;
    }

    // Contact (res.partner) write
    if (item.model === 'res.partner' && item.operation === 'write') {
        const { _recordId, ...rest } = values;
        let realRecordId = _recordId;
        if (typeof realRecordId === 'string' && realRecordId.startsWith('offline_')) {
            const map = await readOfflineIdMap();
            if (map[realRecordId] === undefined) throw new Error(`Record ${realRecordId} not yet synced`);
            realRecordId = map[realRecordId];
        }
        const response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0', method: 'call',
                params: { model: 'res.partner', method: 'write', args: [[Number(realRecordId)], rest], kwargs: {} },
            },
            { headers, timeout: 30000 }
        );
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Contact write failed');
        }
        console.log('[OfflineSyncService] Updated res.partner id:', realRecordId);
        logSyncHistory(baseUrl, headers, { model: 'res.partner', operation: 'write', values: rest, syncedRecordId: realRecordId }).catch(() => {});
        return realRecordId;
    }

    // Product write (edit)
    if (item.model === 'product.product' && item.operation === 'write') {
        const { _recordId, ...rest } = values;
        // Resolve if the record itself was offline-created but is now synced.
        let realRecordId = _recordId;
        if (typeof realRecordId === 'string' && realRecordId.startsWith('offline_')) {
            const map = await readOfflineIdMap();
            if (map[realRecordId] === undefined) {
                throw new Error(`Record ${realRecordId} not yet synced`);
            }
            realRecordId = map[realRecordId];
        }
        // Any category refs inside the edit values may also be offline_<id>.
        const resolvedValues = await resolveOfflineCategoryRefs(rest);
        const response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'product.product',
                    method: 'write',
                    args: [[Number(realRecordId)], resolvedValues],
                    kwargs: {},
                },
            },
            { headers, timeout: 30000 }
        );
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Product write failed');
        }
        console.log('[OfflineSyncService] Updated product.product id:', realRecordId);
        logSyncHistory(baseUrl, headers, { model: 'product.product', operation: 'write', values: resolvedValues, syncedRecordId: realRecordId }).catch(() => {});
        return realRecordId;
    }

    // Category write (edit) — same fallback shape as create handler
    if ((item.model === 'pos.category' || item.model === 'product.category') && item.operation === 'write') {
        const { _recordId, ...rest } = values;
        let realRecordId = _recordId;
        if (typeof realRecordId === 'string' && realRecordId.startsWith('offline_')) {
            const map = await readOfflineIdMap();
            if (map[realRecordId] === undefined) {
                throw new Error(`Record ${realRecordId} not yet synced`);
            }
            realRecordId = map[realRecordId];
        }
        let model = item.model;
        let response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            {
                jsonrpc: '2.0', method: 'call',
                params: { model, method: 'write', args: [[Number(realRecordId)], rest], kwargs: {} },
            },
            { headers, timeout: 15000 }
        );
        if (response.data?.error && model === 'pos.category') {
            console.log('[OfflineSyncService] pos.category unavailable on write, trying product.category');
            model = 'product.category';
            response = await axios.post(
                `${baseUrl}/web/dataset/call_kw`,
                {
                    jsonrpc: '2.0', method: 'call',
                    params: { model, method: 'write', args: [[Number(realRecordId)], rest], kwargs: {} },
                },
                { headers, timeout: 15000 }
            );
        }
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Category write failed');
        }
        console.log('[OfflineSyncService] Updated', model, 'id:', realRecordId);
        logSyncHistory(baseUrl, headers, { model, operation: 'write', values: rest, syncedRecordId: realRecordId }).catch(() => {});
        return realRecordId;
    }

    // Fallback: try the offline_sync submit endpoint for non-attendance models
    const { submitOfflineRecord } = require('@api/services/offlineSyncApi');
    return await submitOfflineRecord({
        model: item.model,
        operation: item.operation,
        values: item.values,
    });
};

const flushOnce = async () => {
    if (flushing) return { skipped: true };
    flushing = true;
    let synced = 0;
    let failed = 0;
    try {
        const items = await offlineQueue.getAll();
        if (items.length === 0) return { synced: 0, failed: 0, total: 0 };

        const online = await networkStatus.isOnline();
        if (!online) return { synced: 0, failed: 0, total: items.length, offline: true };

        for (const item of items) {
            // Auto-remove poison pills (failed 5+ times)
            if ((item.retryCount || 0) >= 5) {
                console.warn('[OfflineSyncService] removing poison-pill:', item.id);
                await offlineQueue.removeById(item.id);
                failed += 1;
                continue;
            }
            try {
                await syncItemDirectly(item);
                await offlineQueue.removeById(item.id);
                synced += 1;
                console.log('[OfflineSyncService] synced item:', item.id, item.model);
            } catch (e) {
                console.error('[OfflineSyncService] item failed:', item.id, e?.message);
                await offlineQueue.markFailed(item.id, e?.message || 'sync failed');
                failed += 1;
            }
        }
        return { synced, failed, total: items.length };
    } finally {
        flushing = false;
    }
};

/**
 * Manually trigger a flush.
 */
export const flush = async () => flushOnce();

/**
 * Start the auto-flush service. Called once from App.js on boot.
 */
export const start = () => {
    if (started) return;
    started = true;

    // Flush on boot for leftover items from previous sessions.
    flushOnce().then((res) => {
        if (res && res.synced > 0) console.log('[OfflineSyncService] boot flush synced:', res.synced);
    }).catch((e) => console.warn('[OfflineSyncService] boot flush failed:', e?.message));

    // Auto-flush on offline→online transitions.
    unsubscribe = networkStatus.subscribe((online) => {
        if (online) {
            // Tiny delay so the OS finishes the transition, then flush immediately.
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
                flushOnce().then((res) => {
                    if (res && res.synced > 0) console.log('[OfflineSyncService] auto-flush synced:', res.synced);
                }).catch((e) => console.warn('[OfflineSyncService] auto-flush failed:', e?.message));
            }, 500);
        }
    });

    // Flush when the app returns to foreground — covers the case where the
    // user backgrounded the app offline and reopened it on Wi-Fi.
    appStateSub = AppState.addEventListener('change', (next) => {
        if (next !== 'active') return;
        (async () => {
            try {
                const count = await offlineQueue.getPendingCount();
                if (count === 0) return;
                const online = await networkStatus.isOnline();
                if (!online) return;
                const res = await flushOnce();
                if (res && res.synced > 0) console.log('[OfflineSyncService] foreground flush synced:', res.synced);
            } catch (e) { console.warn('[OfflineSyncService] foreground flush failed:', e?.message); }
        })();
    });

    // Periodic retry every 30 seconds while online — catches items that failed
    // on the first attempt (e.g. Odoo was restarting while device had internet).
    setInterval(async () => {
        try {
            const count = await offlineQueue.getPendingCount();
            if (count > 0) {
                const online = await networkStatus.isOnline();
                if (online) {
                    const res = await flushOnce();
                    if (res && res.synced > 0) console.log('[OfflineSyncService] periodic flush synced:', res.synced);
                }
            }
        } catch (_) {}
    }, 30000);
};

/**
 * Stop the service.
 */
export const stop = () => {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    if (appStateSub) {
        appStateSub.remove();
        appStateSub = null;
    }
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    started = false;
};

export default { start, stop, flush };
