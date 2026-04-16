// src/api/services/offlineSyncApi.js
//
// Offline sync API — talks to the offline.sync.queue model DIRECTLY via
// /web/dataset/call_kw (the standard Odoo JSON-RPC endpoint).
//
// This bypasses the custom /offline_sync/api/* controller routes which have
// compatibility issues across Odoo versions. The standard call_kw endpoint
// works reliably on Odoo 17, 18, and 19.

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOdooBaseUrl } from '@api/config/odooConfig';

const TIMEOUT_MS = 15000;

const getAuthHeaders = async () => {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const cookie = await AsyncStorage.getItem('odoo_cookie');
    if (cookie) headers.Cookie = cookie;
  } catch (_) {}
  return headers;
};

// Standard Odoo JSON-RPC call via /web/dataset/call_kw
const callKw = async (model, method, args = [], kwargs = {}) => {
  const baseUrl = (getOdooBaseUrl() || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Odoo base URL is not configured.');

  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${baseUrl}/web/dataset/call_kw`,
    { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } },
    { headers, timeout: TIMEOUT_MS }
  );

  if (typeof response.data === 'string') {
    throw new Error('Session expired — got HTML instead of JSON');
  }
  if (response.data?.error) {
    const msg = response.data.error?.data?.message || response.data.error?.message || 'Odoo error';
    throw new Error(msg);
  }
  return response.data?.result;
};

// -------- Public API --------

// Heartbeat — check if offline.sync.queue model exists
export const pingOfflineSync = async () => {
  // Just do a count query — if model exists, returns 0+; if not, throws
  const count = await callKw('offline.sync.queue', 'search_count', [[]]);
  return { status: 'ok', count };
};

// Dashboard stats
export const fetchOfflineSyncStats = async () => {
  const pending = await callKw('offline.sync.queue', 'search_count', [[['state', '=', 'pending']]]);
  const synced = await callKw('offline.sync.queue', 'search_count', [[['state', '=', 'synced']]]);
  const failed = await callKw('offline.sync.queue', 'search_count', [[['state', '=', 'failed']]]);
  return { status: 'ok', pending, synced, failed, total: pending + synced + failed };
};

// Pending breakdown by model
export const fetchOfflineSyncPending = async (modelName) => {
  const domain = [['state', '=', 'pending']];
  if (modelName) domain.push(['model_name', '=', modelName]);

  const records = await callKw('offline.sync.queue', 'search_read', [domain], {
    fields: ['model_name'],
    limit: 500,
  });

  const byModel = {};
  (records || []).forEach((r) => {
    byModel[r.model_name] = (byModel[r.model_name] || 0) + 1;
  });
  return { status: 'ok', total_pending: records?.length || 0, by_model: byModel };
};

// Trigger sync — call the engine's method via call_kw
export const triggerOfflineSyncNow = async (modelName) => {
  try {
    // Try calling the offline_sync controller endpoint first
    const baseUrl = (getOdooBaseUrl() || '').replace(/\/+$/, '');
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${baseUrl}/offline_sync/api/sync`,
      { jsonrpc: '2.0', method: 'call', params: modelName ? { model_name: modelName } : {} },
      { headers, timeout: 30000 }
    );
    if (response.data?.result) return response.data.result;
  } catch (_) {
    // Controller not available — just return empty
    console.warn('[offlineSyncApi] /sync endpoint not available, skipping server-side sync');
  }
  return { status: 'ok', results: {} };
};

// List enabled models
export const fetchOfflineSyncEnabledModels = async () => {
  try {
    const lines = await callKw('offline.sync.model.line', 'search_read', [
      [['mode', '=', 'local']],
    ], { fields: ['model_name'], limit: 100 });
    return { status: 'ok', models: (lines || []).map((l) => l.model_name) };
  } catch (_) {
    return { status: 'ok', models: [] };
  }
};

// Submit a single record into Odoo's offline_sync queue
export const submitOfflineRecord = async ({ model, operation, values }) => {
  if (!model || !operation) throw new Error('model and operation required');

  // Find the ir.model id for the target model
  const models = await callKw('ir.model', 'search_read', [
    [['model', '=', model]],
  ], { fields: ['id'], limit: 1 });

  if (!models || models.length === 0) {
    throw new Error(`Model '${model}' not found in Odoo`);
  }

  const recordId = await callKw('offline.sync.queue', 'create', [{
    model_id: models[0].id,
    record_data: JSON.stringify(values),
    operation: operation,
    state: 'pending',
  }]);

  return { status: 'ok', unique_id: recordId };
};

// Log a completed sync to the queue for admin audit trail
export const logSyncHistory = async ({ model, operation, values, synced_record_id }) => {
  try {
    const models = await callKw('ir.model', 'search_read', [
      [['model', '=', model]],
    ], { fields: ['id'], limit: 1 });

    if (!models || models.length === 0) return;

    await callKw('offline.sync.queue', 'create', [{
      model_id: models[0].id,
      record_data: JSON.stringify(values || {}),
      operation: operation || 'create',
      state: 'synced',
      synced_record_id: synced_record_id || 0,
      synced_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    }]);
  } catch (e) {
    console.warn('[offlineSyncApi] logSyncHistory failed:', e?.message);
  }
};
