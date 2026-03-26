import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import getOdooBaseUrl from '@api/config/odooConfig';

const getAuthHeaders = async () => {
  try {
    const cookie = await AsyncStorage.getItem('odoo_cookie');
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    return headers;
  } catch (e) {
    return { 'Content-Type': 'application/json' };
  }
};

const odooRpc = async (model, method, args = [], kwargs = {}) => {
  const baseUrl = getOdooBaseUrl().replace(/\/$/, '');
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${baseUrl}/web/dataset/call_kw`,
    {
      jsonrpc: '2.0',
      method: 'call',
      params: { model, method, args, kwargs },
    },
    { headers, withCredentials: true, timeout: 15000 }
  );
  if (response.data.error) {
    throw new Error(response.data.error.data?.message || response.data.error.message || 'Odoo RPC error');
  }
  return response.data.result;
};

// Fetch all WhatsApp sessions
export const fetchWhatsAppSessions = async () => {
  return odooRpc('whatsapp.session', 'search_read', [[], ['id', 'name', 'status', 'phone_number', 'error_message']], { limit: 20 });
};

// Connect a session (triggers QR code generation)
export const connectWhatsAppSession = async (sessionId) => {
  return odooRpc('whatsapp.session', 'action_connect', [[sessionId]]);
};

// Disconnect a session
export const disconnectWhatsAppSession = async (sessionId) => {
  return odooRpc('whatsapp.session', 'action_disconnect', [[sessionId]]);
};

// Refresh session status (syncs in-memory state to DB, like Odoo's "Refresh Status" button)
export const refreshWhatsAppStatus = async (sessionId) => {
  return odooRpc('whatsapp.session', 'action_refresh_status', [[sessionId]]);
};

// Create a new session
export const createWhatsAppSession = async (name) => {
  return odooRpc('whatsapp.session', 'create', [{ name }]);
};

// Delete a session
export const deleteWhatsAppSession = async (sessionId) => {
  return odooRpc('whatsapp.session', 'unlink', [[sessionId]]);
};

// Poll QR code status — reads session record directly via standard RPC (most reliable)
export const pollQrStatus = async (sessionId) => {
  try {
    // First try the dedicated endpoint
    const baseUrl = getOdooBaseUrl().replace(/\/$/, '');
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${baseUrl}/whatsapp/qr/status/${sessionId}`,
      { jsonrpc: '2.0', method: 'call', params: {} },
      { headers, withCredentials: true, timeout: 10000 }
    );
    const result = response.data.result || response.data;
    if (result && result.qr_image) return result;
    // If no QR from endpoint, fall through to DB read
  } catch (e) {
    console.warn('QR endpoint failed, falling back to DB read:', e.message);
  }
  // Fallback: read qr_image directly from session record
  const records = await odooRpc('whatsapp.session', 'read', [[sessionId], ['status', 'qr_image', 'phone_number', 'error_message']]);
  const rec = Array.isArray(records) ? records[0] : records;
  return {
    status: rec?.status || 'disconnected',
    qr_image: rec?.qr_image || null,
    session_id: sessionId,
  };
};

// Send text message
export const sendWhatsAppMessage = async (phone, message, sessionId) => {
  const baseUrl = getOdooBaseUrl().replace(/\/$/, '');
  const headers = await getAuthHeaders();
  const params = { phone, message };
  if (sessionId) params.session_id = sessionId;
  const response = await axios.post(
    `${baseUrl}/whatsapp/send`,
    { jsonrpc: '2.0', method: 'call', params },
    { headers, withCredentials: true, timeout: 15000 }
  );
  const result = response.data.result || response.data;
  if (!result.success) throw new Error(result.error || 'Failed to send message');
  return result;
};

// Send document/file
export const sendWhatsAppDocument = async (phone, fileBase64, filename, caption, sessionId) => {
  const baseUrl = getOdooBaseUrl().replace(/\/$/, '');
  const headers = await getAuthHeaders();
  const params = { phone, file_base64: fileBase64, filename, caption };
  if (sessionId) params.session_id = sessionId;
  const response = await axios.post(
    `${baseUrl}/whatsapp/send/document`,
    { jsonrpc: '2.0', method: 'call', params },
    { headers, withCredentials: true, timeout: 30000 }
  );
  const result = response.data.result || response.data;
  if (!result.success) throw new Error(result.error || 'Failed to send document');
  return result;
};

// Fetch message history
export const fetchWhatsAppMessages = async (sessionId, limit = 50) => {
  const domain = sessionId ? [['session_id', '=', sessionId]] : [];
  return odooRpc('whatsapp.message', 'search_read', [
    domain,
    ['id', 'phone', 'message', 'direction', 'status', 'create_date', 'partner_id'],
  ], { limit, order: 'create_date desc' });
};
