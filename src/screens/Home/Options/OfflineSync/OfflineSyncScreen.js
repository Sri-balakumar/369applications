import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { OverlayLoader } from '@components/Loader';
import { ConfirmationModal } from '@components/Modal';
import { showToastMessage } from '@components/Toast';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  pingOfflineSync,
  fetchOfflineSyncStats,
  fetchOfflineSyncPending,
  triggerOfflineSyncNow,
} from '@api/services/offlineSyncApi';
import offlineQueue from '@utils/offlineQueue';
import OfflineSyncService from '@services/OfflineSyncService';

const { width } = Dimensions.get('window');
// Cap the scale factor so tablets/large screens don't blow up the UI.
// width/390 on a 1280px tablet would give ~3.3x — we clamp to 1.15x max and 0.85x min.
const SCALE_FACTOR = Math.min(1.15, Math.max(0.85, width / 390));
const scale = (size) => Math.round(SCALE_FACTOR * size);

const OfflineSyncScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const [connection, setConnection] = useState({ status: 'unknown', checkedAt: null });
  const [stats, setStats] = useState({ pending: 0, synced: 0, failed: 0, total: 0 });
  const [pendingByModel, setPendingByModel] = useState([]); // [{ model, count }]
  const [localQueueCount, setLocalQueueCount] = useState(0);
  const [flushingLocal, setFlushingLocal] = useState(false);

  const loadAll = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);

    // Local queue count works regardless of connectivity.
    try {
      const localCount = await offlineQueue.getPendingCount();
      setLocalQueueCount(localCount);
    } catch (_) { /* ignore */ }

    // Ping first so we can flip the status card even if stats fails.
    let online = false;
    try {
      await pingOfflineSync();
      online = true;
    } catch (_) {
      online = false;
    }
    setConnection({ status: online ? 'online' : 'offline', checkedAt: new Date() });

    if (online) {
      try {
        const s = await fetchOfflineSyncStats();
        setStats({
          pending: s.pending || 0,
          synced: s.synced || 0,
          failed: s.failed || 0,
          total: s.total || 0,
        });
      } catch (err) {
        console.warn('[OfflineSync] stats failed:', err?.message);
      }

      try {
        const p = await fetchOfflineSyncPending();
        const byModel = p?.by_model || {};
        const rows = Object.keys(byModel).map((model) => ({ model, count: byModel[model] }));
        rows.sort((a, b) => b.count - a.count);
        setPendingByModel(rows);
      } catch (err) {
        console.warn('[OfflineSync] pending failed:', err?.message);
      }
    }

    if (showSpinner) setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll(true);
    }, [loadAll])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll(false);
    setRefreshing(false);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await triggerOfflineSyncNow();
      const results = res?.results || {};
      let synced = 0;
      let failed = 0;
      let remaining = 0;
      Object.values(results).forEach((r) => {
        synced += r?.synced || 0;
        failed += r?.failed || 0;
        remaining += r?.remaining || 0;
      });
      showToastMessage(`Synced ${synced}, Failed ${failed}, Remaining ${remaining}`);
      await loadAll(false);
    } catch (err) {
      showToastMessage(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleFlushLocal = async () => {
    setFlushingLocal(true);
    try {
      const res = await OfflineSyncService.flush();
      if (res?.offline) {
        showToastMessage('Still offline — try again when connected');
      } else if (typeof res?.synced === 'number') {
        showToastMessage(`Local: synced ${res.synced}, failed ${res.failed}`);
      }
      await loadAll(false);
    } catch (err) {
      showToastMessage(err?.message || 'Local flush failed');
    } finally {
      setFlushingLocal(false);
    }
  };

  const handleClearLocalQueue = async () => {
    await offlineQueue.clear();
    setLocalQueueCount(0);
    showToastMessage('Local queue cleared');
    await loadAll(false);
  };

  const renderConnectionCard = () => {
    const isOnline = connection.status === 'online';
    const dotColor = isOnline ? '#4CAF50' : connection.status === 'offline' ? '#E74C3C' : '#BDBDBD';
    const label = isOnline ? 'Connected' : connection.status === 'offline' ? 'Offline' : 'Checking…';
    const checkedText = connection.checkedAt
      ? `Last check ${connection.checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
      : '—';

    return (
      <View style={styles.connectionCard}>
        <View style={styles.connectionLeft}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <View>
            <Text style={styles.connectionLabel}>{label}</Text>
            <Text style={styles.connectionSub}>{checkedText}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => loadAll(true)} style={styles.refreshBtn}>
          <MaterialIcons name="refresh" size={scale(20)} color={COLORS.primaryThemeColor} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderStatsCard = () => (
    <View style={styles.statsCard}>
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: '#FF9800' }]}>{stats.pending}</Text>
        <Text style={styles.statLabel}>Pending</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: '#4CAF50' }]}>{stats.synced}</Text>
        <Text style={styles.statLabel}>Synced</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: '#E74C3C' }]}>{stats.failed}</Text>
        <Text style={styles.statLabel}>Failed</Text>
      </View>
    </View>
  );

  const renderLocalQueueCard = () => (
    <View style={styles.localCard}>
      <View style={styles.localCardLeft}>
        <MaterialIcons name="phone-android" size={scale(22)} color={COLORS.primaryThemeColor} />
        <View style={{ marginLeft: scale(10) }}>
          <Text style={styles.localCardTitle}>On-device queue</Text>
          <Text style={styles.localCardSub}>
            {localQueueCount === 0
              ? 'No items waiting on this device'
              : `${localQueueCount} item${localQueueCount === 1 ? '' : 's'} saved offline`}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: scale(6) }}>
        <TouchableOpacity
          style={[
            styles.localFlushBtn,
            (flushingLocal || localQueueCount === 0) && styles.localFlushBtnDisabled,
          ]}
          disabled={flushingLocal || localQueueCount === 0}
          onPress={handleFlushLocal}
        >
          <Text style={styles.localFlushBtnText}>
            {flushingLocal ? '…' : 'Sync'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.localFlushBtn,
            { backgroundColor: '#E74C3C' },
            localQueueCount === 0 && styles.localFlushBtnDisabled,
          ]}
          disabled={localQueueCount === 0}
          onPress={handleClearLocalQueue}
        >
          <Text style={styles.localFlushBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPendingRow = ({ item }) => (
    <View style={styles.pendingRow}>
      <View style={styles.pendingRowLeft}>
        <MaterialIcons name="cloud-upload" size={scale(18)} color={COLORS.primaryThemeColor} />
        <Text style={styles.pendingModelText} numberOfLines={1}>{item.model}</Text>
      </View>
      <View style={styles.pendingBadge}>
        <Text style={styles.pendingBadgeText}>{item.count}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
      <NavigationHeader
        title="Offline Sync"
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: scale(120) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {renderConnectionCard()}
        {renderStatsCard()}
        {renderLocalQueueCard()}

        <Text style={styles.sectionTitle}>Pending by Model</Text>

        {pendingByModel.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="check-circle" size={scale(48)} color="#4CAF50" />
            <Text style={styles.emptyText}>All records are synced</Text>
            <Text style={styles.emptySubtext}>Nothing pending in the queue</Text>
          </View>
        ) : (
          <FlatList
            data={pendingByModel}
            renderItem={renderPendingRow}
            keyExtractor={(item) => item.model}
            scrollEnabled={false}
            contentContainerStyle={{ paddingHorizontal: scale(12) }}
          />
        )}
      </ScrollView>

      <View style={styles.syncButtonContainer}>
        <TouchableOpacity
          style={[
            styles.syncButton,
            (syncing || stats.pending === 0 || connection.status !== 'online') && styles.syncButtonDisabled,
          ]}
          disabled={syncing || stats.pending === 0 || connection.status !== 'online'}
          onPress={() => setConfirmVisible(true)}
        >
          <MaterialIcons name="sync" size={scale(20)} color="#fff" />
          <Text style={styles.syncButtonText}>
            {syncing ? 'Syncing…' : `Sync Now${stats.pending ? ` (${stats.pending})` : ''}`}
          </Text>
        </TouchableOpacity>
      </View>

      <ConfirmationModal
        isVisible={confirmVisible}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => {
          setConfirmVisible(false);
          handleSyncNow();
        }}
        headerMessage="Sync all pending records to Odoo now?"
      />

      <OverlayLoader visible={loading || syncing} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  connectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: scale(12),
    marginTop: scale(12),
    borderRadius: scale(12),
    padding: scale(14),
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  connectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  statusDot: {
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
  },
  connectionLabel: {
    fontSize: scale(15),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  connectionSub: {
    fontSize: scale(11),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginTop: 2,
  },
  refreshBtn: {
    padding: scale(6),
    borderRadius: scale(20),
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: scale(12),
    marginTop: scale(10),
    borderRadius: scale(12),
    padding: scale(16),
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
  statValue: {
    fontSize: scale(22),
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  statLabel: {
    fontSize: scale(12),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginTop: 2,
  },
  localCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: scale(12),
    marginTop: scale(10),
    borderRadius: scale(12),
    padding: scale(14),
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  localCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  localCardTitle: {
    fontSize: scale(14),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  localCardSub: {
    fontSize: scale(11),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginTop: 2,
  },
  localFlushBtn: {
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: scale(8),
    paddingHorizontal: scale(14),
    paddingVertical: scale(8),
  },
  localFlushBtnDisabled: {
    backgroundColor: '#BDBDBD',
  },
  localFlushBtnText: {
    color: '#fff',
    fontSize: scale(12),
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  sectionTitle: {
    fontSize: scale(14),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    marginHorizontal: scale(16),
    marginTop: scale(18),
    marginBottom: scale(8),
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: scale(10),
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    marginBottom: scale(8),
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
    }),
  },
  pendingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    flex: 1,
  },
  pendingModelText: {
    fontSize: scale(13),
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
    flex: 1,
  },
  pendingBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: scale(10),
    paddingVertical: scale(4),
    borderRadius: scale(12),
    minWidth: scale(36),
    alignItems: 'center',
  },
  pendingBadgeText: {
    fontSize: scale(12),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#FF9800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(40),
    paddingHorizontal: scale(20),
  },
  emptyText: {
    fontSize: scale(16),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    marginTop: scale(12),
  },
  emptySubtext: {
    fontSize: scale(12),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginTop: scale(4),
  },
  syncButtonContainer: {
    position: 'absolute',
    bottom: scale(16),
    left: scale(12),
    right: scale(12),
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: scale(12),
    paddingVertical: scale(14),
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 },
    }),
  },
  syncButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: scale(15),
    fontFamily: FONT_FAMILY.urbanistBold,
  },
});

export default OfflineSyncScreen;
