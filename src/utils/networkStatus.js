// src/utils/networkStatus.js
//
// Tiny wrapper around expo-network for offline-sync use.
//
// expo-network does not expose a true push listener — it only has a one-shot
// `getNetworkStateAsync()` call. We poll every 5 seconds and emit on change.
// This is good enough for our use (auto-flushing the offline queue when the
// device comes back online); we are NOT trying to react in <100ms.

import * as Network from 'expo-network';

let lastKnown = null; // null = unknown, true = online, false = offline
let pollHandle = null;
const subscribers = new Set();

const POLL_INTERVAL_MS = 2000;

/**
 * One-shot connectivity check. Returns true if the device has internet
 * (any reachable network — wifi or cellular).
 */
export const isOnline = async () => {
    try {
        const state = await Network.getNetworkStateAsync();
        return Boolean(state?.isConnected && state?.isInternetReachable !== false);
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
