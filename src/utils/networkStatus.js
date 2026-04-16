// src/utils/networkStatus.js
//
// Simple connectivity detection via HTTP ping to the Odoo server.
// No dependency on expo-network — works reliably on all devices.

import axios from 'axios';

let lastKnown = null;
let pollHandle = null;
const subscribers = new Set();

const POLL_INTERVAL_MS = 5000;

/**
 * Check if the device can reach the Odoo server (or the internet).
 * Returns true if reachable, false if not.
 */
export const isOnline = async () => {
    try {
        // Try to reach the Odoo server first
        const { getOdooBaseUrl } = require('@api/config/odooConfig');
        const baseUrl = (getOdooBaseUrl() || '').replace(/\/+$/, '');
        if (baseUrl) {
            try {
                await axios.get(`${baseUrl}/web/webclient/version_info`, { timeout: 4000 });
                return true;
            } catch (e) {
                // If we get a response (even 4xx/5xx), the server is reachable = online
                if (e.response) return true;
            }
        }

        // Fallback: try Google
        try {
            await axios.head('https://clients3.google.com/generate_204', { timeout: 3000 });
            return true;
        } catch (e) {
            if (e.response) return true;
        }

        return false;
    } catch (e) {
        // If everything fails, assume online and let actual API calls decide
        return true;
    }
};

const tickAndNotify = async () => {
    const online = await isOnline();
    if (online !== lastKnown) {
        lastKnown = online;
        subscribers.forEach((cb) => {
            try { cb(online); } catch (_) {}
        });
    }
};

const ensurePolling = () => {
    if (pollHandle) return;
    tickAndNotify();
    pollHandle = setInterval(tickAndNotify, POLL_INTERVAL_MS);
};

const stopPollingIfIdle = () => {
    if (subscribers.size === 0 && pollHandle) {
        clearInterval(pollHandle);
        pollHandle = null;
    }
};

/**
 * Subscribe to connectivity changes. Callback fires when state flips.
 * Returns an unsubscribe function.
 */
export const subscribe = (callback) => {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);
    ensurePolling();
    return () => {
        subscribers.delete(callback);
        stopPollingIfIdle();
    };
};

export const getLastKnown = () => lastKnown;

export default { isOnline, subscribe, getLastKnown };
