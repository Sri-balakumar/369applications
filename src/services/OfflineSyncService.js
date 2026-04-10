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
import offlineQueue from '@utils/offlineQueue';
import networkStatus from '@utils/networkStatus';
import { getOdooBaseUrl } from '@api/config/odooConfig';
import { logSyncHistory } from '@api/services/offlineSyncApi';

let started = false;
let unsubscribe = null;
let flushing = false;
let retryTimer = null;

const getAuthHeaders = async () => {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const cookie = await AsyncStorage.getItem('odoo_cookie');
        if (cookie) headers.Cookie = cookie;
    } catch (_) {}
    return headers;
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

        // Log to Odoo's Sync Queue for admin audit trail (fire-and-forget)
        logSyncHistory({
            model: 'hr.attendance',
            operation: 'create',
            values: values,
            synced_record_id: recordId,
        }).catch((e) => console.warn('[OfflineSyncService] history log failed:', e?.message));

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
        logSyncHistory({ model: 'app.banner', operation: 'create', values, synced_record_id: recordId }).catch(() => {});
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
        logSyncHistory({ model: 'app.banner', operation: 'delete', values, synced_record_id: bannerId }).catch(() => {});
        return bannerId;
    }

    // Fallback: try the offline_sync submit endpoint for other models
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
            // Small delay to let the connection stabilize before hitting Odoo.
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
                flushOnce().then((res) => {
                    if (res && res.synced > 0) console.log('[OfflineSyncService] auto-flush synced:', res.synced);
                }).catch((e) => console.warn('[OfflineSyncService] auto-flush failed:', e?.message));
            }, 3000);
        }
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
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    started = false;
};

export default { start, stop, flush };
