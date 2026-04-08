/** @odoo-module **/

import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { ORM } from "@web/core/orm_service";
import { reactive } from "@odoo/owl";

const RETRY_INTERVAL = 60000; // 60 seconds
const SYNC_CHANNEL_NAME = "offline_sync_channel";

export const offlineSyncService = {
    dependencies: [
        "offline_sync.network_monitor",
        "offline_sync.local_storage",
        "notification",
    ],

    start(env, { "offline_sync.network_monitor": networkMonitor, "offline_sync.local_storage": localStorage, notification }) {
        const state = reactive({
            enabledModels: [],
            isSyncing: false,
            syncProgress: { total: 0, completed: 0, failed: 0 },
        });

        let retryTimer = null;
        let broadcastChannel = null;
        let isSyncLeader = false;

        // --- BroadcastChannel for tab coordination ---
        try {
            broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
            broadcastChannel.onmessage = (event) => {
                if (event.data.type === "sync_start") {
                    isSyncLeader = false;
                }
                if (event.data.type === "sync_complete") {
                    isSyncLeader = false;
                }
            };
        } catch (e) {
            // BroadcastChannel not supported — proceed without tab coordination
        }

        // --- Fetch enabled models ---
        async function fetchEnabledModels() {
            try {
                const response = await fetch("/offline_sync/api/enabled_models", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "call", params: {} }),
                });
                const data = await response.json();
                if (data.result && data.result.status === "ok") {
                    state.enabledModels = data.result.models;
                    window.localStorage.setItem(
                        "offline_sync_enabled_models",
                        JSON.stringify(data.result.models)
                    );
                }
            } catch (e) {
                // Offline — use cached list
                try {
                    const cached = window.localStorage.getItem("offline_sync_enabled_models");
                    if (cached) {
                        state.enabledModels = JSON.parse(cached);
                    }
                } catch (e2) {
                    // No cache available
                }
            }
        }

        function isModelEnabled(modelName) {
            return state.enabledModels.includes(modelName);
        }

        // --- Store record locally when offline ---
        async function storeLocally(modelName, values) {
            const localId = await localStorage.storeRecord(modelName, values);
            notification.add("Saved locally — will sync when online", {
                type: "warning",
                sticky: false,
            });
            env.bus.trigger("offline_sync.pending_changed");
            return localId;
        }

        // --- Sync all pending records to server ---
        async function syncPendingRecords() {
            if (state.isSyncing) {
                return;
            }

            // Tab coordination: claim leadership
            if (broadcastChannel) {
                isSyncLeader = true;
                broadcastChannel.postMessage({ type: "sync_start" });
            }

            const records = await localStorage.getPendingRecords();
            if (records.length === 0) {
                return;
            }

            state.isSyncing = true;
            state.syncProgress = { total: records.length, completed: 0, failed: 0 };

            notification.add(`Syncing ${records.length} pending record(s)...`, {
                type: "info",
                sticky: false,
            });

            for (const record of records) {
                try {
                    await localStorage.markSubmitting(record.localId);
                    const response = await fetch("/offline_sync/api/submit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            jsonrpc: "2.0",
                            id: Date.now(),
                            method: "call",
                            params: {
                                model_name: record.modelName,
                                values: record.values,
                            },
                        }),
                    });
                    const data = await response.json();
                    if (data.result && data.result.status === "ok") {
                        await localStorage.markSynced(record.localId, data.result.unique_id);
                        state.syncProgress.completed++;
                    } else {
                        const errMsg = (data.result && data.result.message) || "Unknown error";
                        await localStorage.markFailed(record.localId, errMsg);
                        state.syncProgress.failed++;
                    }
                } catch (e) {
                    await localStorage.markFailed(record.localId, e.message || "Network error");
                    state.syncProgress.failed++;
                }
            }

            // Trigger server-side processing of submitted records
            try {
                await fetch("/offline_sync/api/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "call", params: {} }),
                });
            } catch (e) {
                // Server sync trigger failed — cron will pick it up
            }

            const { completed, failed } = state.syncProgress;
            const msg = `Sync complete: ${completed} synced` + (failed > 0 ? `, ${failed} failed` : "");
            notification.add(msg, {
                type: failed > 0 ? "warning" : "success",
                sticky: false,
            });

            state.isSyncing = false;
            env.bus.trigger("offline_sync.pending_changed");

            if (broadcastChannel) {
                broadcastChannel.postMessage({ type: "sync_complete" });
                isSyncLeader = false;
            }
        }

        // --- Auto-queue drafts and sync on server side ---
        async function autoQueueAndSync() {
            try {
                notification.add("Back online — syncing offline records...", {
                    type: "info",
                    sticky: false,
                });
                const response = await fetch("/offline_sync/api/auto_queue_and_sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "call", params: {} }),
                });
                const data = await response.json();
                if (data.result && data.result.status === "ok") {
                    const res = data.result.results;
                    const queuedTotal = Object.values(res.queued || {}).reduce((a, b) => a + b, 0);
                    const syncedTotal = Object.values(res.sync || {}).reduce((a, b) => a + (b.synced || 0), 0);
                    if (queuedTotal > 0 || syncedTotal > 0) {
                        notification.add(
                            `Sync complete: ${queuedTotal} queued, ${syncedTotal} synced to server`,
                            { type: "success", sticky: false }
                        );
                    }
                }
            } catch (e) {
                _logger_warn("Auto queue and sync failed:", e);
            }
        }

        function _logger_warn(msg, e) {
            console.warn("[OfflineSync]", msg, e);
        }

        // --- Handle network status changes ---
        env.bus.addEventListener("offline_sync.status_changed", async (ev) => {
            const { effectivelyOnline } = ev.detail;
            if (effectivelyOnline) {
                // Back online — auto-queue all drafts and sync to server
                await fetchEnabledModels();
                await autoQueueAndSync();
                await syncPendingRecords();
                startRetryTimer();
            } else {
                stopRetryTimer();
                notification.add("You are offline — changes will be saved locally", {
                    type: "danger",
                    sticky: false,
                });
            }
        });

        // --- Periodic retry for failed records ---
        function startRetryTimer() {
            stopRetryTimer();
            retryTimer = setInterval(async () => {
                if (networkMonitor.state.effectivelyOnline && !state.isSyncing) {
                    const count = await localStorage.getPendingCount();
                    if (count > 0) {
                        await syncPendingRecords();
                    }
                }
            }, RETRY_INTERVAL);
        }

        function stopRetryTimer() {
            if (retryTimer) {
                clearInterval(retryTimer);
                retryTimer = null;
            }
        }

        // --- Patch ORM.create to intercept offline saves ---
        // When offline, ALL creates are saved locally automatically
        patch(ORM.prototype, {
            async create(model, values, kwargs) {
                if (!networkMonitor.state.effectivelyOnline) {
                    const valuesObj = Array.isArray(values) ? values[0] : values;
                    await storeLocally(model, valuesObj);
                    return [-Date.now()];
                }
                return super.create(model, values, kwargs);
            },
        });

        // --- Initialize ---
        localStorage.resetStaleSubmitting();
        fetchEnabledModels();
        if (networkMonitor.state.effectivelyOnline) {
            startRetryTimer();
        }

        return {
            get state() {
                return state;
            },
            isModelEnabled,
            storeLocally,
            syncPendingRecords,
            fetchEnabledModels,
        };
    },
};

registry.category("services").add("offline_sync.sync", offlineSyncService);
