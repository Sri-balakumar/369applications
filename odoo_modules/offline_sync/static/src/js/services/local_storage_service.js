/** @odoo-module **/

import { registry } from "@web/core/registry";
import {
    putRecord,
    getAll,
    getByIndex,
    getByKey,
    deleteByKey,
    countByIndex,
    updateRecord,
    STORE_PENDING,
    STORE_SYNC_LOG,
} from "../utils/idb_helper";

function generateUUID() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export const localStorageService = {
    dependencies: [],

    start() {
        async function storeRecord(modelName, values) {
            const localId = generateUUID();
            await putRecord(STORE_PENDING, {
                localId,
                modelName,
                values: JSON.parse(JSON.stringify(values)),
                createdAt: Date.now(),
                status: "pending",
                error: null,
                retries: 0,
            });
            return localId;
        }

        async function getPendingRecords() {
            const all = await getAll(STORE_PENDING);
            return all.filter((r) => r.status === "pending" || (r.status === "failed" && r.retries < 5));
        }

        async function getAllRecords() {
            return getAll(STORE_PENDING);
        }

        async function getPendingCount() {
            const pending = await countByIndex(STORE_PENDING, "status", "pending");
            const failed = await getByIndex(STORE_PENDING, "status", "failed");
            const retryable = failed.filter((r) => r.retries < 5).length;
            return pending + retryable;
        }

        async function markSubmitting(localId) {
            const records = await getByIndex(STORE_PENDING, "localId", localId);
            if (records.length > 0) {
                await updateRecord(STORE_PENDING, records[0].id, { status: "submitting" });
            }
        }

        async function markSynced(localId, serverUniqueId) {
            const records = await getByIndex(STORE_PENDING, "localId", localId);
            if (records.length > 0) {
                await deleteByKey(STORE_PENDING, records[0].id);
                await putRecord(STORE_SYNC_LOG, {
                    localId,
                    uniqueId: serverUniqueId,
                    syncedAt: Date.now(),
                });
            }
        }

        async function markFailed(localId, errorMsg) {
            const records = await getByIndex(STORE_PENDING, "localId", localId);
            if (records.length > 0) {
                const rec = records[0];
                await updateRecord(STORE_PENDING, rec.id, {
                    status: "failed",
                    error: errorMsg,
                    retries: (rec.retries || 0) + 1,
                });
            }
        }

        async function resetStaleSubmitting() {
            const records = await getByIndex(STORE_PENDING, "status", "submitting");
            for (const rec of records) {
                await updateRecord(STORE_PENDING, rec.id, { status: "pending" });
            }
        }

        return {
            storeRecord,
            getPendingRecords,
            getAllRecords,
            getPendingCount,
            markSubmitting,
            markSynced,
            markFailed,
            resetStaleSubmitting,
        };
    },
};

registry.category("services").add("offline_sync.local_storage", localStorageService);
