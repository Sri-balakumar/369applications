/** @odoo-module **/

import { Component, useState, onWillStart, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";

export class OfflineStatusSystray extends Component {
    static template = "offline_sync.OfflineStatusSystray";
    static components = { Dropdown };
    static props = {};

    setup() {
        this.networkMonitor = useService("offline_sync.network_monitor");
        this.localStorage = useService("offline_sync.local_storage");
        this.syncService = useService("offline_sync.sync");
        this.actionService = useService("action");

        this.state = useState({
            pendingCount: 0,
        });

        this._refreshInterval = null;

        onWillStart(async () => {
            await this._refreshCount();
        });

        onMounted(() => {
            this._refreshInterval = setInterval(() => this._refreshCount(), 10000);
            this.env.bus.addEventListener("offline_sync.pending_changed", this._onPendingChanged);
        });

        onWillUnmount(() => {
            if (this._refreshInterval) {
                clearInterval(this._refreshInterval);
            }
            this.env.bus.removeEventListener("offline_sync.pending_changed", this._onPendingChanged);
        });
    }

    _onPendingChanged = () => {
        this._refreshCount();
    };

    async _refreshCount() {
        try {
            this.state.pendingCount = await this.localStorage.getPendingCount();
        } catch (e) {
            // IndexedDB might not be available
        }
    }

    get isOnline() {
        return this.networkMonitor.state.effectivelyOnline;
    }

    get isSyncing() {
        return this.syncService.state.isSyncing;
    }

    get syncProgress() {
        return this.syncService.state.syncProgress;
    }

    get statusLabel() {
        if (this.isSyncing) {
            const p = this.syncProgress;
            return `Syncing... (${p.completed + p.failed}/${p.total})`;
        }
        return this.isOnline ? "Online" : "Offline";
    }

    get statusIcon() {
        if (!this.isOnline) {
            return "fa-wifi text-danger";
        }
        if (this.isSyncing) {
            return "fa-refresh fa-spin text-warning";
        }
        if (this.state.pendingCount > 0) {
            return "fa-wifi text-warning";
        }
        return "fa-wifi text-success";
    }

    async onSyncNow() {
        if (!this.isOnline || this.isSyncing) {
            return;
        }
        await this.syncService.syncPendingRecords();
    }

    onViewQueue() {
        this.actionService.doAction({
            type: "ir.actions.act_window",
            name: "Offline Sync Queue",
            res_model: "offline.sync.queue",
            views: [[false, "list"], [false, "form"]],
            target: "current",
        });
    }
}

export const systrayItem = {
    Component: OfflineStatusSystray,
};

registry.category("systray").add("offline_sync.StatusIndicator", systrayItem, { sequence: 100 });
