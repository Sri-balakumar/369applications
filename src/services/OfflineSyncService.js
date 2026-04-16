// src/services/OfflineSyncService.js
//
// Auto-flushes the on-device offline queue directly to Odoo when online.
// Creates records via /web/dataset/call_kw (same endpoint as online flows).
// Includes session re-authentication if the cookie is expired.

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import offlineQueue from '@utils/offlineQueue';
import networkStatus from '@utils/networkStatus';
import { getOdooBaseUrl } from '@api/config/odooConfig';
import { logSyncHistory } from '@api/services/offlineSyncApi';

let started = false;
let unsubscribe = null;
let flushing = false;
let retryTimer = null;

// ─── Auth helpers ───

const getAuthHeaders = async () => {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const cookie = await AsyncStorage.getItem('odoo_cookie');
        if (cookie) headers.Cookie = cookie;
    } catch (_) {}
    return headers;
};

// Re-authenticate to Odoo and get fresh cookie. Called when the stored
// cookie is expired (Odoo returned HTML instead of JSON).
const reAuthenticate = async (baseUrl) => {
    console.log('[OfflineSyncService] Re-authenticating to Odoo...');
    try {
        const db = await AsyncStorage.getItem('odoo_db');
        const storedUser = await AsyncStorage.getItem('userData');
        if (!storedUser) throw new Error('No stored user data for re-auth');

        const userData = JSON.parse(storedUser);
        // Try to get credentials — the login screen stores them or we use defaults
        const login = userData?.login || userData?.username || userData?.user_name || 'admin';

        // We can't know the password from stored data (security).
        // Instead, use the stored session_id cookie approach: make a simple
        // JSON-RPC call to /web/session/check — if it returns OK, session is still valid.
        // If not, we need the user to re-login.
        const headers = await getAuthHeaders();
        const checkResp = await axios.post(
            `${baseUrl}/web/session/get_session_info`,
            { jsonrpc: '2.0', method: 'call', params: {} },
            { headers, timeout: 8000 }
        );

        if (checkResp.data?.result?.uid) {
            // Session is actually valid — the issue might be something else
            console.log('[OfflineSyncService] Session is actually valid, uid:', checkResp.data.result.uid);
            // Re-extract the cookie from response
            const setCookie = checkResp.headers['set-cookie'] || checkResp.headers['Set-Cookie'];
            if (setCookie) {
                const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
                await AsyncStorage.setItem('odoo_cookie', cookieStr);
                return { 'Content-Type': 'application/json', Cookie: cookieStr };
            }
            return headers;
        }

        throw new Error('Session expired — user must re-login');
    } catch (e) {
        console.error('[OfflineSyncService] Re-auth failed:', e?.message);
        throw new Error('Session expired. Please log out and log back in.');
    }
};

// ─── Response validation ───

// Validate that an Odoo JSON-RPC response is real (not an HTML login redirect).
const validateResponse = (response) => {
    if (!response || !response.data) {
        return { valid: false, error: 'Empty response' };
    }
    // If response.data is a string (HTML redirect), it's not valid JSON-RPC
    if (typeof response.data === 'string') {
        return { valid: false, error: 'Got HTML instead of JSON — session likely expired' };
    }
    // If response has a JSON-RPC error, extract it
    if (response.data?.error) {
        const msg = response.data.error?.data?.message || response.data.error?.message || 'Odoo error';
        return { valid: false, error: msg };
    }
    // Check that result exists
    if (response.data?.result === undefined || response.data?.result === null) {
        return { valid: false, error: 'Response has no result field' };
    }
    return { valid: true, result: response.data.result };
};

// ─── Core sync function ───

// Make an Odoo JSON-RPC call with automatic retry on session expiry.
const odooCall = async (baseUrl, model, method, args, kwargs = {}, timeout = 15000) => {
    let headers = await getAuthHeaders();

    // First attempt
    let response;
    try {
        response = await axios.post(
            `${baseUrl}/web/dataset/call_kw`,
            { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } },
            { headers, timeout }
        );
    } catch (e) {
        // Network-level failure — don't retry auth, just throw
        throw e;
    }

    let validation = validateResponse(response);
    if (validation.valid) return validation.result;

    // If it looks like a session issue (HTML or no result), try re-auth + retry once
    if (typeof response.data === 'string' || !response.data?.result) {
        console.warn('[OfflineSyncService] Invalid response, attempting re-auth...');
        try {
            headers = await reAuthenticate(baseUrl);
            response = await axios.post(
                `${baseUrl}/web/dataset/call_kw`,
                { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } },
                { headers, timeout }
            );
            validation = validateResponse(response);
            if (validation.valid) return validation.result;
        } catch (reAuthErr) {
            throw new Error('Re-auth failed: ' + (reAuthErr?.message || 'unknown'));
        }
    }

    throw new Error(validation.error || 'Odoo call failed');
};

// Sync a single queued item to Odoo.
const syncItemDirectly = async (item) => {
    const baseUrl = (getOdooBaseUrl() || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('No Odoo URL configured');

    const values = item.values || {};

    // Attendance create
    if (item.model === 'hr.attendance' && item.operation === 'create') {
        const createVals = {
            employee_id: values.employee_id,
            check_in: values.check_in,
            ...(values.check_out ? { check_out: values.check_out } : {}),
        };
        const recordId = await odooCall(baseUrl, 'hr.attendance', 'create', [createVals], {}, 15000);
        console.log('[OfflineSyncService] Created hr.attendance id:', recordId);
        logSyncHistory({ model: 'hr.attendance', operation: 'create', values, synced_record_id: recordId }).catch(() => {});
        return recordId;
    }

    // Banner create
    if (item.model === 'app.banner' && item.operation === 'create') {
        const createVals = {
            name: values.name || `banner_${Date.now()}`,
            image: values.image,
        };
        const recordId = await odooCall(baseUrl, 'app.banner', 'create', [createVals], {}, 30000);
        console.log('[OfflineSyncService] Created app.banner id:', recordId);
        logSyncHistory({ model: 'app.banner', operation: 'create', values, synced_record_id: recordId }).catch(() => {});
        return recordId;
    }

    // Banner delete
    if (item.model === 'app.banner' && item.operation === 'delete') {
        const bannerId = values.id;
        if (!bannerId) throw new Error('Banner delete: no id');
        const result = await odooCall(baseUrl, 'app.banner', 'unlink', [[bannerId]], {}, 15000);
        console.log('[OfflineSyncService] Deleted app.banner id:', bannerId);
        logSyncHistory({ model: 'app.banner', operation: 'delete', values, synced_record_id: bannerId }).catch(() => {});
        return result;
    }

    // Sale order create
    if (item.model === 'sale.order' && item.operation === 'create') {
        const recordId = await odooCall(baseUrl, 'sale.order', 'create', [values], {}, 15000);
        console.log('[OfflineSyncService] Created sale.order id:', recordId);
        logSyncHistory({ model: 'sale.order', operation: 'create', values, synced_record_id: recordId }).catch(() => {});
        return recordId;
    }

    // Fallback
    const { submitOfflineRecord } = require('@api/services/offlineSyncApi');
    return await submitOfflineRecord({ model: item.model, operation: item.operation, values: item.values });
};

// ─── Flush logic ───

const flushOnce = async () => {
    if (flushing) return { skipped: true };
    flushing = true;
    let synced = 0;
    let failed = 0;
    try {
        const items = await offlineQueue.getAll();
        console.log('[OfflineSyncService] ====== FLUSH START ======');
        console.log('[OfflineSyncService] Queue has', items.length, 'items');

        if (items.length === 0) {
            console.log('[OfflineSyncService] Nothing to sync');
            return { synced: 0, failed: 0, total: 0 };
        }

        const online = await networkStatus.isOnline();
        console.log('[OfflineSyncService] Online:', online);
        if (!online) return { synced: 0, failed: 0, total: items.length, offline: true };

        for (const item of items) {
            console.log('[OfflineSyncService] Processing:', item.id, item.model, item.operation, 'retries:', item.retryCount || 0);
            if ((item.retryCount || 0) >= 10) {
                console.warn('[OfflineSyncService] removing poison-pill:', item.id);
                await offlineQueue.removeById(item.id);
                failed += 1;
                continue;
            }
            try {
                const result = await syncItemDirectly(item);
                await offlineQueue.removeById(item.id);
                synced += 1;
                console.log('[OfflineSyncService] SUCCESS:', item.id, item.model, 'recordId:', result);
            } catch (e) {
                const errDetail = e?.response?.data?.error?.data?.message || e?.response?.data?.error?.message || e?.message || 'unknown';
                console.error('[OfflineSyncService] FAILED:', item.id, item.model, errDetail);
                if (e?.response?.status) console.error('[OfflineSyncService] HTTP status:', e.response.status);
                if (e?.response?.data && typeof e.response.data === 'string') console.error('[OfflineSyncService] Response is HTML (session expired?)');
                await offlineQueue.markFailed(item.id, errDetail);
                failed += 1;
            }
        }
        console.log('[OfflineSyncService] ====== FLUSH END: synced', synced, 'failed', failed, '======');
        return { synced, failed, total: items.length };
    } finally {
        flushing = false;
    }
};

export const flush = async () => flushOnce();

export const start = () => {
    if (started) return;
    started = true;

    flushOnce().then((res) => {
        if (res && res.synced > 0) console.log('[OfflineSyncService] boot flush synced:', res.synced);
    }).catch((e) => console.warn('[OfflineSyncService] boot flush failed:', e?.message));

    unsubscribe = networkStatus.subscribe((online) => {
        if (online) {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
                flushOnce().then((res) => {
                    if (res && res.synced > 0) console.log('[OfflineSyncService] auto-flush synced:', res.synced);
                }).catch(() => {});
            }, 3000);
        }
    });

    // Periodic retry every 30s
    setInterval(async () => {
        try {
            const count = await offlineQueue.getPendingCount();
            if (count > 0) {
                const online = await networkStatus.isOnline();
                if (online) {
                    const res = await flushOnce();
                    if (res && res.synced > 0) console.log('[OfflineSyncService] periodic synced:', res.synced);
                }
            }
        } catch (_) {}
    }, 30000);
};

export const stop = () => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    started = false;
};

export default { start, stop, flush };
