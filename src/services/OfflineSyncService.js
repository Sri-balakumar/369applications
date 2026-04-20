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

// Resolves pending `waitForFlush()` callers the moment `flushing` flips
// back to false. Lets the pull-side auto-refresh (OfflineBanner onOnline,
// screen-level network subscribers) wait until offline-queued writes have
// been uploaded, so the subsequent fetch sees the real Odoo ids + names.
const _flushIdleWaiters = [];
const _notifyFlushIdle = () => {
    while (_flushIdleWaiters.length) {
        try { _flushIdleWaiters.shift()(); } catch (_) {}
    }
};

/**
 * Wait until the offline queue has drained AND no flush is in progress, or
 * resolve immediately if already idle. Bounded by `timeoutMs` so the UI can
 * never hang on a stuck flush. Polls every 250 ms because the scheduler's
 * own 500 ms debounce may start a flush AFTER the caller began waiting —
 * relying only on the `flushing` flag would let us resolve before the push
 * has even started.
 */
export const waitForFlush = async (timeoutMs = 8000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const pending = await offlineQueue.getPendingCount();
            if (pending === 0 && !flushing) return;
        } catch (_) { return; }
        // Tight 80ms poll — snappier reconnect wake-up than the original 250ms.
        await new Promise((r) => setTimeout(r, 80));
    }
};
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

    // Easy purchase create — mirrors easy.sales but for easy.purchase model.
    if (item.model === 'easy.purchase' && item.operation === 'create') {
        const offlineId = `offline_${item.id}`;
        const existingMap = await readOfflineIdMap();
        if (existingMap[offlineId] !== undefined) return existingMap[offlineId];
        const { _confirmAfterCreate, partnerId, warehouseId, warehouseCompanyId, paymentMethodId, vendorRef, orderLines } = values;
        const vals = { partner_id: partnerId };
        if (warehouseId) vals.warehouse_id = warehouseId;
        if (paymentMethodId) vals.payment_method_id = paymentMethodId;
        if (vendorRef) vals.reference = vendorRef;
        if (orderLines && orderLines.length > 0) {
            vals.line_ids = orderLines.map((l) => [0, 0, {
                product_id: l.product_id, quantity: l.qty || l.quantity || 1,
                price_unit: l.price_unit || l.price || 0,
                ...(l.discount ? { discount: l.discount } : {}),
            }]);
        }
        const createKwargs = {};
        if (warehouseCompanyId) {
            try { const cr = await axios.post(`${baseUrl}/web/dataset/call_kw`, { jsonrpc: '2.0', method: 'call', params: { model: 'res.company', method: 'search_read', args: [[]], kwargs: { fields: ['id'], limit: 100 } } }, { headers }); const allIds = (cr.data?.result || []).map((c) => c.id); createKwargs.context = { allowed_company_ids: [warehouseCompanyId, ...allIds.filter((id) => id !== warehouseCompanyId)] }; } catch (_) { createKwargs.context = { allowed_company_ids: [warehouseCompanyId] }; }
        }
        const response = await axios.post(`${baseUrl}/web/dataset/call_kw`, { jsonrpc: '2.0', method: 'call', params: { model: 'easy.purchase', method: 'create', args: [vals], kwargs: createKwargs } }, { headers, timeout: 30000 });
        if (response.data?.error) throw new Error(response.data.error?.data?.message || 'Easy purchase create failed');
        const recordId = response.data?.result;
        console.log('[OfflineSyncService] Created easy.purchase id:', recordId);
        await saveOfflineIdMapping(offlineId, recordId);
        try { const raw = await AsyncStorage.getItem('@cache:easyPurchases'); if (raw) { const list = JSON.parse(raw); let ch = false; const next = list.map((o) => { if (String(o.id) === offlineId) { ch = true; return { ...o, id: recordId, offline: false }; } return o; }); if (ch) await AsyncStorage.setItem('@cache:easyPurchases', JSON.stringify(next)); } } catch (_) {}
        try { const rawD = await AsyncStorage.getItem(`@cache:easyPurchaseDetail:${offlineId}`); if (rawD) { const prev = JSON.parse(rawD); await AsyncStorage.setItem(`@cache:easyPurchaseDetail:${recordId}`, JSON.stringify({ ...prev, id: recordId, offline: false })); await AsyncStorage.removeItem(`@cache:easyPurchaseDetail:${offlineId}`); } } catch (_) {}
        if (_confirmAfterCreate) {
            try { await axios.post(`${baseUrl}/web/dataset/call_kw`, { jsonrpc: '2.0', method: 'call', params: { model: 'easy.purchase', method: 'action_confirm', args: [[recordId]], kwargs: {} } }, { headers, timeout: 30000 }); console.log('[OfflineSyncService] Confirmed easy.purchase id:', recordId); } catch (e) { console.warn('[OfflineSyncService] easy.purchase confirm chain error:', e?.message); }
        }
        logSyncHistory(baseUrl, headers, { model: 'easy.purchase', operation: 'create', values: { partnerId }, syncedRecordId: recordId }).catch(() => {});
        return recordId;
    }

    // Easy purchase confirm
    if (item.model === 'easy.purchase' && item.operation === 'action_confirm') {
        const { _recordId, companyId } = values;
        let realId = _recordId;
        if (typeof realId === 'string' && realId.startsWith('offline_')) { const map = await readOfflineIdMap(); if (map[realId] === undefined) throw new Error(`Record ${realId} not yet synced`); realId = map[realId]; }
        await axios.post(`${baseUrl}/web/dataset/call_kw`, { jsonrpc: '2.0', method: 'call', params: { model: 'easy.purchase', method: 'action_confirm', args: [[Number(realId)]], kwargs: {} } }, { headers, timeout: 30000 });
        console.log('[OfflineSyncService] Confirmed easy.purchase id:', realId);
        logSyncHistory(baseUrl, headers, { model: 'easy.purchase', operation: 'action_confirm', values: { id: realId }, syncedRecordId: realId }).catch(() => {});
        return realId;
    }

    // Easy sales create — uses hardcoded field names from the easy_sales module:
    //   line_ids (one2many → easy.sales.line), quantity, price_unit,
    //   quick_payment_method_id, reference, warehouse_id.
    if (item.model === 'easy.sales' && item.operation === 'create') {
        const offlineId = `offline_${item.id}`;
        const existingMap = await readOfflineIdMap();
        if (existingMap[offlineId] !== undefined) {
            console.log('[OfflineSyncService] easy.sales already synced, reusing id:', existingMap[offlineId]);
            return existingMap[offlineId];
        }
        const { _confirmAfterCreate, partnerId, warehouseId, warehouseCompanyId, paymentMethodId, customerRef, orderLines } = values;

        // Build vals directly (no fields_get discovery needed)
        const vals = { partner_id: partnerId };
        if (warehouseId) vals.warehouse_id = warehouseId;
        if (paymentMethodId) vals.quick_payment_method_id = paymentMethodId;
        if (customerRef) vals.reference = customerRef;
        if (orderLines && orderLines.length > 0) {
            vals.line_ids = orderLines.map((l) => [0, 0, {
                product_id: l.product_id,
                quantity: l.qty || l.quantity || 1,
                price_unit: l.price_unit || l.price || 0,
                ...(l.discount ? { discount: l.discount } : {}),
            }]);
        }

        // Multi-company context
        const createKwargs = {};
        if (warehouseCompanyId) {
            try {
                const compResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
                    jsonrpc: '2.0', method: 'call',
                    params: { model: 'res.company', method: 'search_read', args: [[]], kwargs: { fields: ['id'], limit: 100 } },
                }, { headers });
                const allIds = (compResp.data?.result || []).map((c) => c.id);
                createKwargs.context = { allowed_company_ids: [warehouseCompanyId, ...allIds.filter((id) => id !== warehouseCompanyId)] };
            } catch (_) { createKwargs.context = { allowed_company_ids: [warehouseCompanyId] }; }
        }

        const response = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
            jsonrpc: '2.0', method: 'call',
            params: { model: 'easy.sales', method: 'create', args: [vals], kwargs: createKwargs },
        }, { headers, timeout: 30000 });

        if (response.data?.error) throw new Error(response.data.error?.data?.message || 'Easy sales create failed');
        const recordId = response.data?.result;
        console.log('[OfflineSyncService] Created easy.sales id:', recordId);
        await saveOfflineIdMapping(offlineId, recordId);

        // Swap placeholder in caches
        try {
            const raw = await AsyncStorage.getItem('@cache:easySales');
            if (raw) {
                const list = JSON.parse(raw);
                let changed = false;
                const next = list.map((o) => {
                    if (String(o.id) === offlineId) { changed = true; return { ...o, id: recordId, offline: false }; }
                    return o;
                });
                if (changed) await AsyncStorage.setItem('@cache:easySales', JSON.stringify(next));
            }
        } catch (_) {}
        try {
            const rawD = await AsyncStorage.getItem(`@cache:easySaleDetail:${offlineId}`);
            if (rawD) {
                const prev = JSON.parse(rawD);
                await AsyncStorage.setItem(`@cache:easySaleDetail:${recordId}`, JSON.stringify({ ...prev, id: recordId, offline: false }));
                await AsyncStorage.removeItem(`@cache:easySaleDetail:${offlineId}`);
            }
        } catch (_) {}

        if (_confirmAfterCreate) {
            try {
                await axios.post(`${baseUrl}/web/dataset/call_kw`, {
                    jsonrpc: '2.0', method: 'call',
                    params: { model: 'easy.sales', method: 'action_confirm', args: [[recordId]], kwargs: {} },
                }, { headers, timeout: 30000 });
                console.log('[OfflineSyncService] Confirmed easy.sales id:', recordId);
            } catch (e) { console.warn('[OfflineSyncService] easy.sales confirm chain error:', e?.message); }
        }

        logSyncHistory(baseUrl, headers, { model: 'easy.sales', operation: 'create', values: { partnerId }, syncedRecordId: recordId }).catch(() => {});
        return recordId;
    }

    // Easy sales confirm (action_confirm on an already-synced record)
    if (item.model === 'easy.sales' && item.operation === 'action_confirm') {
        const { _recordId, companyId } = values;
        let realRecordId = _recordId;
        if (typeof realRecordId === 'string' && realRecordId.startsWith('offline_')) {
            const map = await readOfflineIdMap();
            if (map[realRecordId] === undefined) throw new Error(`Record ${realRecordId} not yet synced`);
            realRecordId = map[realRecordId];
        }
        await axios.post(`${baseUrl}/web/dataset/call_kw`, {
            jsonrpc: '2.0', method: 'call',
            params: { model: 'easy.sales', method: 'action_confirm', args: [[Number(realRecordId)]], kwargs: {} },
        }, { headers, timeout: 30000 });
        console.log('[OfflineSyncService] Confirmed easy.sales id:', realRecordId);
        logSyncHistory(baseUrl, headers, { model: 'easy.sales', operation: 'action_confirm', values: { id: realRecordId }, syncedRecordId: realRecordId }).catch(() => {});
        return realRecordId;
    }

    // Sale order create (quotation). Supports optional _confirmAfterCreate,
    // _cancelAfterCreate, and _invoiceAfterCreate flags which chain
    // action_confirm / action_cancel / _create_invoices after the order is
    // created. _cancelAfterCreate wins over confirm if both are set.
    // _invoiceAfterCreate runs after confirm (invoices need confirmed orders).
    if (item.model === 'sale.order' && item.operation === 'create') {
        const offlineId = `offline_${item.id}`;
        const existingMap = await readOfflineIdMap();
        if (existingMap[offlineId] !== undefined) {
            console.log('[OfflineSyncService] sale.order already synced, reusing id:', existingMap[offlineId]);
            return existingMap[offlineId];
        }
        const { _confirmAfterCreate, _cancelAfterCreate, _invoiceAfterCreate, ...rest } = values;
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

        // Fetch real order name from Odoo so the cache shows the Odoo ref
        let realName = `S${String(recordId).padStart(5, '0')}`;
        try {
            const nameResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
                jsonrpc: '2.0', method: 'call',
                params: { model: 'sale.order', method: 'read', args: [[recordId]], kwargs: { fields: ['name'] } },
            }, { headers, timeout: 10000 });
            const fetched = nameResp.data?.result?.[0]?.name;
            if (fetched) realName = fetched;
        } catch (_) {}
        console.log('[OfflineSyncService] sale.order real name:', realName);

        // Copy the local S-number mapping from offline ID to real ID so the
        // invoice receipt keeps the same S-number after sync.
        try {
            const sMapRaw = await AsyncStorage.getItem('inv_map_s');
            if (sMapRaw) {
                const sMap = JSON.parse(sMapRaw);
                const offlineKey = offlineId;
                if (sMap[offlineKey] && !sMap[String(recordId)]) {
                    sMap[String(recordId)] = sMap[offlineKey];
                    await AsyncStorage.setItem('inv_map_s', JSON.stringify(sMap));
                    console.log('[OfflineSyncService] Copied S-number', sMap[offlineKey], 'from', offlineKey, 'to', recordId);
                }
            }
        } catch (_) {}

        // Swap offline placeholder in cached list/detail with real id + name.
        try {
            const raw = await AsyncStorage.getItem('@cache:saleOrders');
            if (raw) {
                const list = JSON.parse(raw);
                let changed = false;
                const next = list.map((o) => {
                    if (String(o.id) === offlineId) { changed = true; return { ...o, id: recordId, name: realName, offline: false }; }
                    return o;
                });
                if (changed) await AsyncStorage.setItem('@cache:saleOrders', JSON.stringify(next));
            }
        } catch (_) {}
        try {
            const rawD = await AsyncStorage.getItem(`@cache:saleOrderDetail:${offlineId}`);
            if (rawD) {
                const prev = JSON.parse(rawD);
                await AsyncStorage.setItem(`@cache:saleOrderDetail:${recordId}`, JSON.stringify({ ...prev, id: recordId, name: realName, offline: false }));
                await AsyncStorage.removeItem(`@cache:saleOrderDetail:${offlineId}`);
            }
        } catch (_) {}

        // Chain action_cancel if the user cancelled while offline.
        if (_cancelAfterCreate) {
            try {
                const cancelResp = await axios.post(
                    `${baseUrl}/web/dataset/call_kw`,
                    {
                        jsonrpc: '2.0', method: 'call',
                        params: { model: 'sale.order', method: 'action_cancel', args: [[recordId]], kwargs: {} },
                    },
                    { headers, timeout: 30000 }
                );
                if (cancelResp.data?.error) {
                    console.warn('[OfflineSyncService] sale.order cancel failed:', cancelResp.data.error?.data?.message);
                } else {
                    console.log('[OfflineSyncService] Cancelled sale.order id:', recordId);
                }
            } catch (e) { console.warn('[OfflineSyncService] cancel chain error:', e?.message); }
            logSyncHistory(baseUrl, headers, { model: 'sale.order', operation: 'create', values: rest, syncedRecordId: recordId }).catch(() => {});
            return recordId;
        }

        // Chain action_confirm if requested.
        if (_confirmAfterCreate) {
            try {
                // Get all company IDs for context
                let confirmCompanyIds = [1];
                try {
                    const ccResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, { jsonrpc: '2.0', method: 'call', params: { model: 'res.company', method: 'search_read', args: [[]], kwargs: { fields: ['id'], limit: 100 } } }, { headers });
                    confirmCompanyIds = (ccResp.data?.result || []).map((c) => c.id);
                } catch (_) {}

                const confirmResp = await axios.post(
                    `${baseUrl}/web/dataset/call_kw`,
                    {
                        jsonrpc: '2.0', method: 'call',
                        params: { model: 'sale.order', method: 'action_confirm', args: [[recordId]], kwargs: { context: { allowed_company_ids: confirmCompanyIds } } },
                    },
                    { headers, timeout: 30000 }
                );
                if (confirmResp.data?.error) {
                    console.warn('[OfflineSyncService] sale.order confirm failed:', confirmResp.data.error?.data?.message);
                    // Retry once without context
                    try {
                        const retryResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, { jsonrpc: '2.0', method: 'call', params: { model: 'sale.order', method: 'action_confirm', args: [[recordId]], kwargs: {} } }, { headers, timeout: 30000 });
                        if (!retryResp.data?.error) console.log('[OfflineSyncService] Confirmed sale.order on retry:', recordId);
                    } catch (_) {}
                } else {
                    console.log('[OfflineSyncService] Confirmed sale.order id:', recordId);
                }
            } catch (e) { console.warn('[OfflineSyncService] confirm chain error:', e?.message); }
        }

        // Chain invoice creation if requested (runs after confirm since
        // Odoo only invoices confirmed orders). Calls _create_invoices on
        // the sale.order, then swaps the placeholder "offline_inv" in cache
        // with the real invoice id.
        if (_invoiceAfterCreate) {
            try {
                const invResp = await axios.post(
                    `${baseUrl}/web/dataset/call_kw`,
                    {
                        jsonrpc: '2.0', method: 'call',
                        params: { model: 'sale.order', method: '_create_invoices', args: [[recordId]], kwargs: {} },
                    },
                    { headers, timeout: 30000 }
                );
                if (invResp.data?.error) {
                    console.warn('[OfflineSyncService] sale.order invoice create failed:', invResp.data.error?.data?.message);
                } else {
                    const invResult = invResp.data?.result;
                    // _create_invoices returns an account.move recordset repr.
                    // Fetch the real invoice ids linked to this SO for the cache patch.
                    try {
                        const readResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
                            jsonrpc: '2.0', method: 'call',
                            params: { model: 'sale.order', method: 'read', args: [[recordId]], kwargs: { fields: ['invoice_ids', 'invoice_status'] } },
                        }, { headers, timeout: 10000 });
                        const row = readResp.data?.result?.[0];
                        const realInvoiceIds = row?.invoice_ids || [];
                        console.log('[OfflineSyncService] Invoiced sale.order id:', recordId, 'invoice_ids:', realInvoiceIds);
                        // Patch cache: swap offline_inv with real ids in list + detail.
                        const patch = { invoice_status: row?.invoice_status || 'invoiced', invoice_ids: realInvoiceIds.length ? realInvoiceIds : ['offline_inv'] };
                        try {
                            const rawList = await AsyncStorage.getItem('@cache:saleOrders');
                            if (rawList) {
                                const list = JSON.parse(rawList);
                                const idx = list.findIndex((o) => o.id === recordId || String(o.id) === offlineId);
                                if (idx >= 0) { list[idx] = { ...list[idx], ...patch }; await AsyncStorage.setItem('@cache:saleOrders', JSON.stringify(list)); }
                            }
                        } catch (_) {}
                        try {
                            const detailKey = `@cache:saleOrderDetail:${recordId}`;
                            const rawD = await AsyncStorage.getItem(detailKey);
                            if (rawD) {
                                const prev = JSON.parse(rawD);
                                await AsyncStorage.setItem(detailKey, JSON.stringify({ ...prev, ...patch }));
                            }
                        } catch (_) {}
                    } catch (e) { console.warn('[OfflineSyncService] invoice read-back failed:', e?.message); }
                }
            } catch (e) { console.warn('[OfflineSyncService] invoice chain error:', e?.message); }
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

    // Sale order cancel (action_cancel on an already-synced order)
    if (item.model === 'sale.order' && item.operation === 'action_cancel') {
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
                params: { model: 'sale.order', method: 'action_cancel', args: [[Number(realRecordId)]], kwargs: {} },
            },
            { headers, timeout: 30000 }
        );
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Sale order cancel failed');
        }
        console.log('[OfflineSyncService] Cancelled sale.order id:', realRecordId);
        logSyncHistory(baseUrl, headers, { model: 'sale.order', operation: 'action_cancel', values: { id: realRecordId }, syncedRecordId: realRecordId }).catch(() => {});
        return realRecordId;
    }

    // Sale order invoice create (runs _create_invoices on an already-synced
    // order). Queued when the user tapped Create Invoice offline on a real
    // Odoo order — we materialize the invoice on reconnect without another tap.
    if (item.model === 'sale.order' && item.operation === 'action_invoice_create') {
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
                params: { model: 'sale.order', method: '_create_invoices', args: [[Number(realRecordId)]], kwargs: {} },
            },
            { headers, timeout: 30000 }
        );
        if (response.data?.error) {
            throw new Error(response.data.error?.data?.message || 'Invoice create failed');
        }
        // Read back real invoice_ids and patch the cache so the UI switches
        // from the "offline_inv" placeholder to the real invoice.
        try {
            const readResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
                jsonrpc: '2.0', method: 'call',
                params: { model: 'sale.order', method: 'read', args: [[Number(realRecordId)]], kwargs: { fields: ['invoice_ids', 'invoice_status'] } },
            }, { headers, timeout: 10000 });
            const row = readResp.data?.result?.[0];
            const realInvoiceIds = row?.invoice_ids || [];
            console.log('[OfflineSyncService] Invoiced sale.order id:', realRecordId, 'invoice_ids:', realInvoiceIds);
            const patch = { invoice_status: row?.invoice_status || 'invoiced', invoice_ids: realInvoiceIds.length ? realInvoiceIds : ['offline_inv'] };
            try {
                const rawList = await AsyncStorage.getItem('@cache:saleOrders');
                if (rawList) {
                    const list = JSON.parse(rawList);
                    const idx = list.findIndex((o) => o.id === Number(realRecordId) || String(o.id) === String(realRecordId));
                    if (idx >= 0) { list[idx] = { ...list[idx], ...patch }; await AsyncStorage.setItem('@cache:saleOrders', JSON.stringify(list)); }
                }
            } catch (_) {}
            try {
                const detailKey = `@cache:saleOrderDetail:${realRecordId}`;
                const rawD = await AsyncStorage.getItem(detailKey);
                if (rawD) {
                    const prev = JSON.parse(rawD);
                    await AsyncStorage.setItem(detailKey, JSON.stringify({ ...prev, ...patch }));
                }
            } catch (_) {}
        } catch (e) { console.warn('[OfflineSyncService] invoice read-back failed:', e?.message); }
        logSyncHistory(baseUrl, headers, { model: 'sale.order', operation: 'action_invoice_create', values: { id: realRecordId }, syncedRecordId: realRecordId }).catch(() => {});
        return realRecordId;
    }

    // Register Payment (account.payment) create — mirrors the online
    // createPaymentWithSignatureOdoo: resolve partner's company, pick a
    // matching journal in that company, create the payment with signatures
    // and GPS, then post it. Finally swap the offline placeholder in the
    // cached payments list with the real record.
    if (item.model === 'account.payment' && item.operation === 'create') {
        const offlineId = `offline_${item.id}`;
        const existingMap = await readOfflineIdMap();
        if (existingMap[offlineId] !== undefined) {
            console.log('[OfflineSyncService] account.payment already synced, reusing id:', existingMap[offlineId]);
            return existingMap[offlineId];
        }
        const { partnerId, amount, paymentType, journalId, ref, customerSignature,
                employeeSignature, latitude, longitude, locationName, _postAfterCreate } = values;

        const rpc = async (model, method, args, kwargs = {}) => {
            const resp = await axios.post(
                `${baseUrl}/web/dataset/call_kw`,
                { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } },
                { headers, withCredentials: true, timeout: 15000 }
            );
            if (resp.data?.error) throw new Error(resp.data.error?.data?.message || 'Odoo RPC error');
            return resp.data.result;
        };

        // Resolve partner's company → find matching journal if needed.
        let targetCompanyId = null;
        let resolvedJournalId = journalId;
        if (partnerId) {
            try {
                const partners = await rpc('res.partner', 'search_read', [[['id', '=', partnerId]]], { fields: ['id', 'company_id'], limit: 1 });
                targetCompanyId = partners?.[0]?.company_id ? partners[0].company_id[0] : null;
            } catch (_) {}
        }
        if (resolvedJournalId && targetCompanyId) {
            try {
                const journals = await rpc('account.journal', 'search_read', [[['id', '=', resolvedJournalId]]], { fields: ['id', 'company_id', 'type'], limit: 1 });
                const jCompany = journals?.[0]?.company_id ? journals[0].company_id[0] : null;
                const jType = journals?.[0]?.type || 'bank';
                if (jCompany && jCompany !== targetCompanyId) {
                    const matching = await rpc('account.journal', 'search_read', [[['type', '=', jType], ['company_id', '=', targetCompanyId]]], { fields: ['id'], limit: 1 });
                    if (matching?.length) resolvedJournalId = matching[0].id;
                }
            } catch (_) {}
        }
        if (!resolvedJournalId && targetCompanyId) {
            try {
                const matching = await rpc('account.journal', 'search_read', [[['type', 'in', ['bank', 'cash']], ['company_id', '=', targetCompanyId]]], { fields: ['id'], limit: 1 });
                if (matching?.length) resolvedJournalId = matching[0].id;
            } catch (_) {}
        }

        const vals = {
            partner_id: partnerId,
            partner_type: paymentType === 'outbound' ? 'supplier' : 'customer',
            payment_type: paymentType || 'inbound',
            amount: parseFloat(amount) || 0,
            ref: ref || '',
        };
        if (resolvedJournalId) vals.journal_id = resolvedJournalId;
        if (targetCompanyId) vals.company_id = targetCompanyId;
        if (customerSignature) {
            const m = String(customerSignature).match(/^data:image\/[^;]+;base64,(.+)$/);
            vals.customer_signature = m ? m[1] : customerSignature;
        }
        if (employeeSignature) {
            const m = String(employeeSignature).match(/^data:image\/[^;]+;base64,(.+)$/);
            vals.employee_signature = m ? m[1] : employeeSignature;
        }
        if (latitude !== null && latitude !== undefined) vals.latitude = latitude;
        if (longitude !== null && longitude !== undefined) vals.longitude = longitude;
        if (locationName) vals.location_name = locationName;

        const createKwargs = targetCompanyId ? { context: { allowed_company_ids: [targetCompanyId] } } : {};
        const createResp = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            { jsonrpc: '2.0', method: 'call', params: { model: 'account.payment', method: 'create', args: [vals], kwargs: createKwargs } },
            { headers, withCredentials: true, timeout: 30000 }
        );
        if (createResp.data?.error) {
            throw new Error(createResp.data.error?.data?.message || 'account.payment create failed');
        }
        const paymentId = createResp.data?.result;
        console.log('[OfflineSyncService] Created account.payment id:', paymentId);
        await saveOfflineIdMapping(offlineId, paymentId);

        // Post the payment so it shows "Posted" in Odoo.
        if (_postAfterCreate) {
            try {
                await axios.post(
                    `${baseUrl}/web/dataset/call_kw`,
                    { jsonrpc: '2.0', method: 'call', params: { model: 'account.payment', method: 'action_post', args: [[paymentId]], kwargs: targetCompanyId ? { context: { allowed_company_ids: [targetCompanyId] } } : {} } },
                    { headers, withCredentials: true, timeout: 15000 }
                );
                console.log('[OfflineSyncService] Posted account.payment id:', paymentId);
            } catch (postErr) {
                console.warn('[OfflineSyncService] action_post failed:', postErr?.message);
            }
        }

        // Read back name + state. Odoo assigns account.payment.name ONLY
        // after the state leaves draft (sequence fires on post). Treat '/'
        // and empty as "not yet assigned" and retry once to catch delayed
        // commits. Fall through to display_name, then to a fallback.
        try {
            const doRead = () => axios.post(`${baseUrl}/web/dataset/call_kw`, {
                jsonrpc: '2.0', method: 'call',
                params: { model: 'account.payment', method: 'read', args: [[paymentId]], kwargs: { fields: ['name', 'display_name', 'state', 'journal_id', 'company_id'] } },
            }, { headers, timeout: 10000 });
            let row = (await doRead()).data?.result?.[0] || {};
            const pickName = (r) => {
                if (r?.name && r.name !== '/') return r.name;
                if (r?.display_name && r.display_name !== '/') return r.display_name;
                return null;
            };
            let realName = pickName(row);
            if (!realName) {
                await new Promise((r) => setTimeout(r, 800));
                const retry = (await doRead()).data?.result?.[0] || {};
                row = { ...row, ...retry };
                realName = pickName(retry) || `P${paymentId}`;
            }
            for (const cacheKey of ['@cache:accountPayments:inbound', '@cache:accountPayments:outbound', '@cache:accountPayments']) {
            const rawList = await AsyncStorage.getItem(cacheKey);
            if (rawList) {
                const list = JSON.parse(rawList);
                const next = list.map((p) => {
                    if (String(p.id) === offlineId) {
                        return {
                            ...p,
                            id: paymentId,
                            name: realName,
                            state: row?.state || p.state || 'draft',
                            journal_name: row?.journal_id ? row.journal_id[1] : p.journal_name,
                            company_name: row?.company_id ? row.company_id[1] : p.company_name,
                            offline: false,
                        };
                    }
                    return p;
                });
                await AsyncStorage.setItem(cacheKey, JSON.stringify(next));
            }
            }
        } catch (e) { console.warn('[OfflineSyncService] payment read-back failed:', e?.message); }

        logSyncHistory(baseUrl, headers, { model: 'account.payment', operation: 'create', values: { partnerId, amount, paymentType }, syncedRecordId: paymentId }).catch(() => {});
        return paymentId;
    }

    // Payment action handlers — action_post / action_draft / action_cancel
    // for account.payment records. All three share the same shape: resolve
    // the real id (in case the payment was created offline too), run the
    // action method, fall back to alternative method names if needed, then
    // read back state and patch the cached payments list so the UI reflects
    // Odoo truth after sync.
    if (item.model === 'account.payment'
        && (item.operation === 'action_post' || item.operation === 'action_draft' || item.operation === 'action_cancel')) {
        const { _recordId } = item.values || {};
        let realRecordId = _recordId;
        if (typeof realRecordId === 'string' && realRecordId.startsWith('offline_')) {
            const map = await readOfflineIdMap();
            if (map[realRecordId] === undefined) throw new Error(`Payment ${realRecordId} not yet synced`);
            realRecordId = map[realRecordId];
        }
        const numId = Number(realRecordId);

        const methodsByOp = {
            action_post:   ['action_post', 'action_validate', 'mark_as_paid'],
            action_draft:  ['action_draft', 'button_draft'],
            action_cancel: ['action_cancel'],
        };
        const candidates = methodsByOp[item.operation];

        // Helper to read current state — we accept the call only when state
        // actually moves (or when cancel sets it to a cancelled-like value).
        // Includes display_name so callers can pick the real Odoo sequence
        // name once it's been assigned.
        const readState = async () => {
            const r = await axios.post(
                `${baseUrl}/web/dataset/call_kw`,
                { jsonrpc: '2.0', method: 'call', params: { model: 'account.payment', method: 'read', args: [[numId]], kwargs: { fields: ['state', 'name', 'display_name'] } } },
                { headers, timeout: 10000 }
            );
            return r.data?.result?.[0];
        };
        // Treat '/' and empty as "name not yet assigned by Odoo sequence".
        const pickName = (r) => {
            if (r?.name && r.name !== '/') return r.name;
            if (r?.display_name && r.display_name !== '/') return r.display_name;
            return null;
        };

        const before = await readState().catch(() => null);
        let lastErr = null;
        let finalRow = before;
        for (const method of candidates) {
            try {
                const resp = await axios.post(
                    `${baseUrl}/web/dataset/call_kw`,
                    { jsonrpc: '2.0', method: 'call', params: { model: 'account.payment', method, args: [[numId]], kwargs: {} } },
                    { headers, timeout: 30000 }
                );
                if (resp.data?.error) { lastErr = resp.data.error?.data?.message; continue; }
                const after = await readState();
                const newState = after?.state;
                const prevState = before?.state;
                console.log('[OfflineSyncService] account.payment', item.operation, 'via', method, '→ state:', newState);
                const transitioned =
                    (item.operation === 'action_post' && newState && newState !== prevState) ||
                    (item.operation === 'action_draft' && newState === 'draft') ||
                    (item.operation === 'action_cancel' && (newState === 'cancelled' || newState === 'canceled' || newState === 'rejected'));
                if (transitioned) { finalRow = after; break; }
            } catch (e) { lastErr = e?.message; }
        }
        if (finalRow === before && lastErr) throw new Error(`${item.operation} failed: ${lastErr}`);

        // If action_post fired but the sequence hasn't committed yet (name
        // still '/'), wait briefly and re-read so the cache gets PAY0000N.
        if (item.operation === 'action_post' && finalRow && !pickName(finalRow)) {
            try {
                await new Promise((r) => setTimeout(r, 800));
                const retry = await readState();
                if (retry) finalRow = { ...finalRow, ...retry };
            } catch (_) {}
        }
        const realName = pickName(finalRow) || finalRow?.name || `P${numId}`;

        // Patch the cached list so any screen auto-refresh picks up the real state + name.
        try {
            for (const cacheKey of ['@cache:accountPayments:inbound', '@cache:accountPayments:outbound', '@cache:accountPayments']) {
              const raw = await AsyncStorage.getItem(cacheKey);
              if (raw) {
                const list = JSON.parse(raw);
                const next = list.map((p) => {
                    if (p.id === numId || String(p.id) === String(numId)) {
                        return { ...p, state: finalRow?.state || p.state, name: realName };
                    }
                    return p;
                });
                await AsyncStorage.setItem(cacheKey, JSON.stringify(next));
              }
            }
        } catch (_) {}

        logSyncHistory(baseUrl, headers, { model: 'account.payment', operation: item.operation, values: { id: numId }, syncedRecordId: numId }).catch(() => {});
        return numId;
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
    if (flushing) { console.log('[OfflineSyncService] flush skipped — already in progress'); return { skipped: true }; }
    flushing = true;
    let synced = 0;
    let failed = 0;
    try {
        const items = await offlineQueue.getAll();
        console.log('[OfflineSyncService] flush started, queue has', items.length, 'items');
        if (items.length === 0) return { synced: 0, failed: 0, total: 0 };

        const online = await networkStatus.isOnline();
        if (!online) { console.log('[OfflineSyncService] flush aborted — offline'); return { synced: 0, failed: 0, total: items.length, offline: true }; }

        for (const item of items) {
            // Auto-remove poison pills (failed 5+ times)
            if ((item.retryCount || 0) >= 5) {
                console.warn('[OfflineSyncService] removing poison-pill:', item.id, item.model, 'lastError:', item.lastError);
                await offlineQueue.removeById(item.id);
                failed += 1;
                continue;
            }
            try {
                console.log('[OfflineSyncService] syncing item:', item.id, item.model, item.operation, 'retry:', item.retryCount || 0);
                await syncItemDirectly(item);
                await offlineQueue.removeById(item.id);
                synced += 1;
                console.log('[OfflineSyncService] SUCCESS:', item.id, item.model);
            } catch (e) {
                console.error('[OfflineSyncService] FAILED:', item.id, item.model, e?.message);
                await offlineQueue.markFailed(item.id, e?.message || 'sync failed');
                failed += 1;
            }
        }
        console.log('[OfflineSyncService] flush done: synced=', synced, 'failed=', failed);

        // Re-check: if items remain after flush, schedule another pass in 3s
        const remaining = await offlineQueue.getPendingCount();
        if (remaining > 0) {
            console.log('[OfflineSyncService] still', remaining, 'items in queue — scheduling retry');
            setTimeout(() => {
                flushOnce().catch((e) => console.warn('[OfflineSyncService] retry flush failed:', e?.message));
            }, 3000);
        }

        return { synced, failed, total: items.length };
    } finally {
        flushing = false;
        _notifyFlushIdle();
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
        console.log('[OfflineSyncService] connectivity changed:', online ? 'ONLINE' : 'OFFLINE');
        if (online) {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
                console.log('[OfflineSyncService] auto-flush triggered by connectivity change');
                flushOnce().then((res) => {
                    console.log('[OfflineSyncService] auto-flush result:', JSON.stringify(res));
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
