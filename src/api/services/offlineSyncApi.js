// src/api/services/offlineSyncApi.js
//
// Thin JSON-RPC wrapper around the Odoo `offline_sync` module's REST controller
// (see odoo_modules/offline_sync/controllers/offline_api.py).
//
// Every call uses the same pattern as existing generalApi.js helpers:
//   - base URL from getOdooBaseUrl()
//   - Cookie auth header read from AsyncStorage ('odoo_cookie')
//   - Odoo JSON-RPC envelope: { jsonrpc: "2.0", method: "call", params: {...} }
//   - 15s timeout so a hung Odoo can never block the UI forever
//
// Each function resolves with the inner Odoo `result` object and throws on
// network/auth errors so screens can show a toast.

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOdooBaseUrl } from '@api/config/odooConfig';

const TIMEOUT_MS = 15000;

// Local headers helper — mirrors the private getOdooAuthHeaders() in
// generalApi.js. Kept local to avoid exporting internals of that file.
const getAuthHeaders = async () => {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const cookie = await AsyncStorage.getItem('odoo_cookie');
    if (cookie) headers.Cookie = cookie;
  } catch (_) {
    // fall through with no cookie — Odoo will reject with auth error
  }
  return headers;
};

// Core helper: POST to an /offline_sync/api/<route> endpoint.
const callOfflineSync = async (route, params = {}) => {
  const baseUrl = (getOdooBaseUrl() || '').replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Odoo base URL is not configured. Please log in again.');
  }

  const headers = await getAuthHeaders();
  const url = `${baseUrl}/offline_sync/api/${route}`;

  const response = await axios.post(
    url,
    { jsonrpc: '2.0', method: 'call', params },
    { headers, timeout: TIMEOUT_MS }
  );

  if (response.data?.error) {
    const msg = response.data.error?.data?.message || response.data.error?.message || 'Odoo error';
    throw new Error(msg);
  }

  const result = response.data?.result;
  if (!result) {
    throw new Error('Empty response from offline_sync API');
  }
  if (result.status && result.status !== 'ok') {
    throw new Error(result.message || 'offline_sync API returned an error');
  }
  return result;
};

// -------- Public API --------

// Heartbeat — returns { status, ts } quickly; used to tell the user whether
// the offline_sync backend is reachable.
export const pingOfflineSync = async () => {
  return callOfflineSync('ping');
};

// Dashboard stats — { status, pending, synced, failed, total }
export const fetchOfflineSyncStats = async () => {
  return callOfflineSync('stats');
};

// Pending breakdown — { status, total_pending, by_model: { model_name: count } }
// Pass a modelName to scope to one model, or omit for all.
export const fetchOfflineSyncPending = async (modelName) => {
  const params = modelName ? { model_name: modelName } : {};
  return callOfflineSync('pending', params);
};

// Trigger a sync replay — { status, results: { [model_name]: {synced, failed, remaining} } }
// Pass a modelName to sync one model only, or omit to sync everything.
export const triggerOfflineSyncNow = async (modelName) => {
  const params = modelName ? { model_name: modelName } : {};
  return callOfflineSync('sync', params);
};

// List models in LOCAL mode — { status, models: [model_name, ...] }
export const fetchOfflineSyncEnabledModels = async () => {
  return callOfflineSync('enabled_models');
};
