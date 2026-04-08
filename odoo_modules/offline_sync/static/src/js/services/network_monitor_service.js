/** @odoo-module **/

import { registry } from "@web/core/registry";
import { reactive } from "@odoo/owl";

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const PING_TIMEOUT = 5000; // 5 seconds

export const networkMonitorService = {
    dependencies: [],

    start(env) {
        const state = reactive({
            isOnline: navigator.onLine,
            lastPingOk: navigator.onLine,
            effectivelyOnline: navigator.onLine,
        });

        function updateEffectiveStatus() {
            state.effectivelyOnline = state.isOnline && state.lastPingOk;
        }

        let heartbeatTimer = null;
        let wasEffectivelyOnline = state.effectivelyOnline;

        function notifyChange() {
            const now = state.effectivelyOnline;
            if (now !== wasEffectivelyOnline) {
                wasEffectivelyOnline = now;
                env.bus.trigger("offline_sync.status_changed", { effectivelyOnline: now });
            }
        }

        async function ping() {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT);
                const response = await fetch("/offline_sync/api/ping", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "call", params: {} }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                const data = await response.json();
                state.lastPingOk = data.result && data.result.status === "ok";
            } catch (e) {
                state.lastPingOk = false;
            }
            updateEffectiveStatus();
            notifyChange();
        }

        function startHeartbeat() {
            stopHeartbeat();
            ping();
            heartbeatTimer = setInterval(ping, HEARTBEAT_INTERVAL);
        }

        function stopHeartbeat() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
        }

        function onOnline() {
            state.isOnline = true;
            updateEffectiveStatus();
            notifyChange();
            startHeartbeat();
        }

        function onOffline() {
            state.isOnline = false;
            state.lastPingOk = false;
            updateEffectiveStatus();
            stopHeartbeat();
            notifyChange();
        }

        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);

        if (state.isOnline) {
            startHeartbeat();
        }

        return {
            get state() {
                return state;
            },
            ping,
            destroy() {
                stopHeartbeat();
                window.removeEventListener("online", onOnline);
                window.removeEventListener("offline", onOffline);
            },
        };
    },
};

registry.category("services").add("offline_sync.network_monitor", networkMonitorService);
