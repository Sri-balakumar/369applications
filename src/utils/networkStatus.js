// src/utils/networkStatus.js
//
// Tiny wrapper around expo-network for offline-sync use.
//
// expo-network does not expose a true push listener — it only has a one-shot
// `getNetworkStateAsync()` call. We poll every 5 seconds and emit on change.
// This is good enough for our use (auto-flushing the offline queue when the
// device comes back online); we are NOT trying to react in <100ms.

import * as Network from 'expo-network';
import { getOdooBaseUrl } from '@api/config/odooConfig';

let lastKnown = null; // null = unknown, true = online, false = offline
let pollHandle = null;
const subscribers = new Set();

const POLL_INTERVAL_MS = 2000;

/**
 * One-shot connectivity check. Returns true only if the device can actually
 * reach the internet — not just connected to WiFi. Uses a fast HTTP ping
 * as fallback when expo-network reports ambiguous state.
 */
export const isOnline = async () => {
    try {
        const state = await Network.getNetworkStateAsync();
        const connected = Boolean(state?.isConnected);
        const reachable = state?.isInternetReachable;

        // If OS says not connected at all, we're definitely offline
        if (!connected) return false;

        // If OS explicitly says not reachable, trust it
        if (reachable === false) return false;

        // Ambiguous (null/undefined) OR reachable — verify by pinging Odoo
        // This catches: device online but Odoo server down, ngrok tunnel active
        // but no Odoo, etc.
        try {
            const odooUrl = getOdooBaseUrl();
            const pingUrl = odooUrl
                ? `${odooUrl.replace(/\/+$/, '')}/web/webclient/version_info`
                : 'https://clients3.google.com/generate_204';
            const controller = new AbortController();
            const tm = setTimeout(() => controller.abort(), 4000);
            const resp = await fetch(pingUrl, { method: 'POST', signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }),
            });
            clearTimeout(tm);
            return resp.ok || resp.status === 200;
        } catch (_) {
            return false;
        }
    } catch (e) {
        console.warn('[networkStatus] isOnline failed:', e?.message);
        return false;
    }
};

const tickAndNotify = async () => {
    const online = await isOnline();
    if (online !== lastKnown) {
        lastKnown = online;
        subscribers.forEach((cb) => {
            try { cb(online); } catch (e) { console.warn('[networkStatus] subscriber error:', e?.message); }
        });
    }
};

const ensurePolling = () => {
    if (pollHandle) return;
    // Run immediately, then on interval
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
 * Subscribe to connectivity changes. The callback fires whenever the online
 * state flips. Returns an unsubscribe function.
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

/**
 * Returns the last known online state without triggering a fresh check.
 * May be `null` if no check has run yet.
 */
export const getLastKnown = () => lastKnown;

export default { isOnline, subscribe, getLastKnown };
