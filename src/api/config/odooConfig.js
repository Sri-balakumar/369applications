// src/api/odooConfig.js
import AsyncStorage from '@react-native-async-storage/async-storage';

// Fallback Odoo server URL (used if no URL was saved from login)
const FALLBACK_ODOO_BASE_URL = "http://115.246.240.218:2309";

// In-memory cache for the active Odoo URL (avoids async reads on every call)
let _cachedOdooUrl = null;

// Get the active Odoo base URL (synchronous — returns cached value or fallback)
const getOdooBaseUrl = () => {
  return _cachedOdooUrl || FALLBACK_ODOO_BASE_URL;
};

// Load the saved URL from AsyncStorage into cache (call on app start / after login)
const loadOdooBaseUrl = async () => {
  try {
    const saved = await AsyncStorage.getItem('odoo_base_url');
    if (saved) {
      _cachedOdooUrl = saved.replace(/\/+$/, '');
    }
  } catch (e) {
    console.warn('Failed to load odoo_base_url:', e?.message);
  }
  return getOdooBaseUrl();
};

// Save a new Odoo URL (call at login time)
const setOdooBaseUrl = async (url) => {
  const cleaned = (url || '').replace(/\/+$/, '');
  _cachedOdooUrl = cleaned;
  try {
    await AsyncStorage.setItem('odoo_base_url', cleaned);
  } catch (e) {
    console.warn('Failed to save odoo_base_url:', e?.message);
  }
};

// Default DB to use for Odoo JSON-RPC login
const DEFAULT_ODOO_DB = "grocery-test";

// Default credentials for auto-fill
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";

// Named export for default base URL for backward compatibility
const DEFAULT_ODOO_BASE_URL = FALLBACK_ODOO_BASE_URL;

export { DEFAULT_ODOO_DB, DEFAULT_ODOO_BASE_URL, DEFAULT_USERNAME, DEFAULT_PASSWORD, getOdooBaseUrl, setOdooBaseUrl, loadOdooBaseUrl };
export default getOdooBaseUrl;
