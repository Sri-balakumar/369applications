import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchSaleOrdersOdoo, searchInvoicesByOriginOdoo, createInvoiceFromQuotationOdoo } from '@api/services/generalApi';
import networkStatus, { isOnline } from '@utils/networkStatus';
import { waitForFlush } from '@services/OfflineSyncService';
import { showToastMessage } from '@components/Toast';
import { useCurrencyStore } from '@stores/currency';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OfflineBanner from '@components/common/OfflineBanner';

const INV_COUNTER_KEY = 'inv_counter_s';
const INV_MAP_KEY = 'inv_map_s';
const INV_START = 10003;

const INV_RESET_KEY = 'inv_reset_s10003';

// Assign S numbers to orders, sorted by ID ascending so older orders get lower numbers
const assignSNumbers = async (ids) => {
  // One-time reset to start fresh from S10003
  const resetDone = await AsyncStorage.getItem(INV_RESET_KEY);
  if (!resetDone) {
    await AsyncStorage.removeItem(INV_MAP_KEY);
    await AsyncStorage.setItem(INV_COUNTER_KEY, String(INV_START));
    await AsyncStorage.setItem(INV_RESET_KEY, 'done');
  }
  const mapRaw = await AsyncStorage.getItem(INV_MAP_KEY);
  const map = mapRaw ? JSON.parse(mapRaw) : {};
  // Find highest existing S number to prevent duplicates
  let maxUsed = INV_START - 1;
  for (const val of Object.values(map)) {
    const num = parseInt(String(val).replace('S', ''), 10);
    if (!isNaN(num) && num > maxUsed) maxUsed = num;
  }
  const counterRaw = await AsyncStorage.getItem(INV_COUNTER_KEY);
  const storedCounter = counterRaw ? parseInt(counterRaw, 10) : INV_START;
  let counter = Math.max(maxUsed + 1, storedCounter);
  let changed = false;
  // Sort ascending so older orders get lower S numbers
  const sortedIds = [...ids].sort((a, b) => a - b);
  for (const id of sortedIds) {
    const key = String(id);
    if (!map[key]) {
      map[key] = `S${counter}`;
      counter++;
      changed = true;
    }
  }
  if (changed) {
    await AsyncStorage.setItem(INV_MAP_KEY, JSON.stringify(map));
    await AsyncStorage.setItem(INV_COUNTER_KEY, String(counter));
  }
  return map;
};

const STATE_LABELS = {
  draft: 'QUOTATION',
  sent: 'SENT',
  sale: 'SALES ORDER',
  done: 'LOCKED',
  cancel: 'CANCELLED',
};

const STATE_COLORS = {
  draft: '#FF9800',
  sent: '#2196F3',
  sale: '#4CAF50',
  done: '#607D8B',
  cancel: '#F44336',
};

// Each filter tab is tinted to match the row badges it filters for so the
// filter bar reads as a color legend. Invoiced uses the teal that the bulk
// "Invoice (N)" button already uses, keeping visuals consistent.
const FILTER_COLORS = {
  all:      '#6C7A89',
  draft:    STATE_COLORS.draft,
  sale:     STATE_COLORS.sale,
  invoiced: '#009688',
  cancel:   STATE_COLORS.cancel,
};

const INVOICE_STATUS_LABELS = {
  upselling: 'Upselling',
  invoiced: 'INVOICED',
  to_invoice: 'TO INVOICE',
  no: 'Nothing to Invoice',
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Quotation' },
  { key: 'sale', label: 'Sales Order' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'cancel', label: 'Cancelled' },
];

const SaleOrderListScreen = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currency) || 'OMR';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [invMap, setInvMap] = useState({});
  const [generatingInvoices, setGeneratingInvoices] = useState(false);
  const [isDeviceOnline, setIsDeviceOnline] = useState(false);
  const [refreshingManually, setRefreshingManually] = useState(false);

  // Check online status on focus + subscribe to changes
  useFocusEffect(useCallback(() => {
    isOnline().then((o) => setIsDeviceOnline(o));
  }, []));

  // Debounce ref — prevent auto-invoice loop from firing twice within 30s
  // if the network flaps (offline → online → offline → online quickly).
  const lastAutoInvoiceAtRef = useRef(0);

  // Direct subscribe: on every offline → online transition, wait for the
  // push-side flush to upload any queued sale.order.create (so Odoo returns
  // real ids + refs), then re-fetch the list in-place — no need for the
  // user to navigate away and come back. After the refetch, if any orders
  // are confirmed-but-not-yet-invoiced, auto-run the bulk invoice pass so
  // the user doesn't have to tap the "Invoice (N)" button manually.
  useEffect(() => {
    let wasOff = null;
    const unsub = networkStatus.subscribe(async (online) => {
      setIsDeviceOnline(online);
      const previouslyOff = wasOff === true;
      wasOff = !online;
      if (online && previouslyOff) {
        console.log('[SaleOrderList] Online transition — waiting for sync, then refetching');
        try { await waitForFlush(8000); } catch (_) {}
        try {
          const fresh = await fetchData();
          console.log('[SaleOrderList] Post-reconnect refetch complete');
          const eligible = getToInvoiceOrders(fresh);
          const sinceLast = Date.now() - lastAutoInvoiceAtRef.current;
          if (eligible.length > 0 && sinceLast > 30_000) {
            lastAutoInvoiceAtRef.current = Date.now();
            console.log('[SaleOrderList] Auto-generating invoices for', eligible.length, 'orders');
            const { success, failed } = await runBulkGenerate(eligible);
            console.log('[SaleOrderList] Auto-invoice result:', success, 'created,', failed, 'failed');
          } else if (eligible.length > 0) {
            console.log('[SaleOrderList] Skipping auto-invoice (debounced, last run', sinceLast, 'ms ago)');
          }
        } catch (e) {
          console.warn('[SaleOrderList] Post-reconnect refetch failed:', e?.message);
        }
      }
    });
    isOnline().then((o) => { wasOff = !o; setIsDeviceOnline(o); });
    return () => unsub && unsub();
  }, [fetchData, getToInvoiceOrders, runBulkGenerate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchSaleOrdersOdoo({ limit: 100 });
      // Enrich in PARALLEL: for SOs with no invoice_ids, search by origin.
      // Serial was ~N round-trips; parallel is ~1 worst-case wall-clock.
      await Promise.all((records || []).map(async (r) => {
        if ((!r.invoice_ids || r.invoice_ids.length === 0) && r.name) {
          try {
            const invs = await searchInvoicesByOriginOdoo(r.name);
            if (invs.length > 0) r.invoice_ids = invs.map(i => i.id);
          } catch (e) {}
        }
      }));
      setData(records || []);
      // Assign S numbers (source of truth - orders get numbers here)
      const ids = (records || []).map(r => r.id);
      if (ids.length > 0) {
        const map = await assignSNumbers(ids);
        setInvMap(map);
      }
      return records || [];
    } catch (err) {
      console.error('[SaleOrderList] error:', err);
      setData([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  // Manual refresh handler wired to the NavigationHeader's refresh icon.
  // Waits for any pending offline-queued writes to flush before re-fetching,
  // so the list always shows real Odoo refs instead of offline placeholders.
  const onHeaderRefresh = async () => {
    if (refreshingManually) return;
    if (!(await isOnline())) {
      showToastMessage('You are offline');
      return;
    }
    setRefreshingManually(true);
    try {
      try { await waitForFlush(8000); } catch (_) {}
      await fetchData();
    } finally {
      setRefreshingManually(false);
    }
  };

  // Per-filter predicate. Single source of truth used by both `filteredData`
  // (the visible list) and `filterCounts` (the count badges next to each tab).
  const filterPredicate = (filter) => (item) => {
    const s = (item.state || 'draft').toLowerCase();
    const hasInv = item.invoice_status === 'invoiced'
      || (item.invoice_ids && item.invoice_ids.length > 0);
    if (filter === 'all') return true;
    if (filter === 'invoiced') return hasInv;
    if (filter === 'sale') return s === 'sale' && !hasInv;
    if (filter === 'draft') return s === 'draft' && !hasInv;
    return s === filter; // 'cancel' etc. — match state directly
  };

  const filteredData = data.filter(filterPredicate(activeFilter));

  // Counts recompute only when the underlying data changes. Each filter
  // tab's label shows its count — e.g. `All (20)`, `Invoiced (2)`.
  const filterCounts = useMemo(() => {
    const out = {};
    for (const f of FILTERS) out[f.key] = data.filter(filterPredicate(f.key)).length;
    return out;
  }, [data]);

  // Orders eligible for bulk invoice generation: confirmed, not invoiced, real Odoo ID.
  // Extracted so we can run it against freshly-fetched records (inside the
  // reconnect auto-fire effect) without waiting for the setData re-render.
  const getToInvoiceOrders = useCallback((list) => (list || []).filter((o) => {
    const s = (o.state || '').toLowerCase();
    const isConfirmed = s === 'sale' || s === 'done';
    const notInvoiced = o.invoice_status !== 'invoiced' && (!o.invoice_ids || o.invoice_ids.length === 0 || (o.invoice_ids.length === 1 && o.invoice_ids[0] === 'offline_inv'));
    const hasRealId = !String(o.id || '').startsWith('offline_');
    return isConfirmed && notInvoiced && hasRealId;
  }), []);

  const toInvoiceOrders = getToInvoiceOrders(data);

  // Shared bulk-invoice loop. Accepts an explicit list so auto-fire can pass
  // freshly-fetched eligible orders without racing the state update.
  // Fires all invoice calls in PARALLEL — on a single order this is a no-op,
  // on many orders the wall-clock drops from sum(calls) to max(call).
  const runBulkGenerate = useCallback(async (orders) => {
    if (!orders || orders.length === 0) return { success: 0, failed: 0 };
    setGeneratingInvoices(true);
    const results = await Promise.allSettled(orders.map(async (order) => {
      const companyId = order.company_id ? (Array.isArray(order.company_id) ? order.company_id[0] : order.company_id) : null;
      console.log('[BulkInvoice] Generating for order:', order.id, order.name);
      const r = await createInvoiceFromQuotationOdoo(order.id, companyId);
      console.log('[BulkInvoice] SUCCESS:', order.id);
      return r;
    }));
    let success = 0;
    let failed = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') success += 1;
      else { failed += 1; console.error('[BulkInvoice] FAILED:', r.reason?.message || r.reason); }
    }
    setGeneratingInvoices(false);
    await fetchData();
    return { success, failed };
  }, [fetchData]);

  const handleBulkGenerateInvoices = async () => {
    const online = await isOnline();
    if (!online) { showToastMessage('Internet required to generate invoices'); return; }
    if (toInvoiceOrders.length === 0) { showToastMessage('No orders pending invoice'); return; }
    const { success, failed } = await runBulkGenerate(toInvoiceOrders);
    showToastMessage(`Invoices: ${success} created, ${failed} failed`);
  };

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    const state = (item.state || 'draft').toLowerCase();
    const stateColor = STATE_COLORS[state] || '#999';
    const stateLabel = STATE_LABELS[state] || state.toUpperCase();
    const partnerName = Array.isArray(item.partner_id) ? item.partner_id[1] : (item.partner_name || '-');
    const amount = item.amount_total || 0;
    const rawDate = item.date_order ? item.date_order.split(' ')[0] : '';
    const dateStr = rawDate ? rawDate.split('-').reverse().join('-') : '-';
    const invoiceStatus = item.invoice_status || '';
    const hasInvoice = invoiceStatus === 'invoiced' || (item.invoice_ids && item.invoice_ids.length > 0);

    return (
      <TouchableOpacity
        style={styles.itemContainer}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('SaleOrderDetailScreen', { orderId: item.id })}
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.head} numberOfLines={1}>{invMap[item.id] || item.name || `SO-${item.id}`}</Text>
            <Text style={{ fontSize: 11, color: '#999', fontFamily: FONT_FAMILY.urbanistMedium }}>{String(item.id || '').startsWith('offline_') ? 'Ref: -' : `Ref: ${item.name || '-'}`}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'flex-start' }}>
            {!hasInvoice && invoiceStatus === 'to_invoice' && (
              <View style={[styles.badge, { backgroundColor: '#FF5722' }]}>
                <Text style={styles.badgeText}>TO INVOICE</Text>
              </View>
            )}
            {hasInvoice ? (
              <View style={[styles.badge, { backgroundColor: '#009688' }]}>
                <Text style={styles.badgeText}>INVOICED</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: stateColor }]}>
                <Text style={styles.badgeText}>{stateLabel}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <MaterialIcons name="person-outline" size={16} color="#888" style={{ marginRight: 4 }} />
            <Text style={styles.content} numberOfLines={1}>{partnerName}</Text>
          </View>
          <Text style={styles.amountText}>{currencySymbol} {amount.toFixed ? amount.toFixed(3) : '0.000'}</Text>
        </View>

        <View style={styles.row}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialIcons name="calendar-today" size={14} color="#999" style={{ marginRight: 4 }} />
            <Text style={styles.subContent}>{dateStr}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Sales Orders"
        onBackPress={() => navigation.goBack()}
        refreshIcon
        refreshPress={onHeaderRefresh}
      />
      <OfflineBanner message="OFFLINE MODE — showing cached orders" onOnline={() => { setIsDeviceOnline(true); fetchData(); }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterRow, { flex: 1, borderBottomWidth: 0 }]} contentContainerStyle={styles.filterRowContent}>
          {FILTERS.map((f) => {
            const color = FILTER_COLORS[f.key] || COLORS.primaryThemeColor;
            const isActive = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterTab, isActive && { borderBottomColor: color }]}
                onPress={() => setActiveFilter(f.key)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: isActive ? color : `${color}B3` },
                    isActive && { fontFamily: FONT_FAMILY.urbanistBold },
                  ]}
                >
                  {f.label} ({filterCounts[f.key] ?? 0})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {toInvoiceOrders.length > 0 && isDeviceOnline && (
          <TouchableOpacity
            style={styles.bulkInvoiceBtn}
            onPress={handleBulkGenerateInvoices}
            disabled={generatingInvoices}
            activeOpacity={0.7}
          >
            <MaterialIcons name="receipt-long" size={16} color="#009688" />
            <Text style={styles.bulkInvoiceBtnText}>
              {generatingInvoices ? '...' : `Invoice (${toInvoiceOrders.length})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <RoundedContainer>
        {filteredData.length === 0 && !loading ? (
          <EmptyState
            imageSource={require('@assets/images/EmptyData/empty.png')}
            message="No Sales Orders Found"
          />
        ) : (
          <FlashList
            data={formatData(filteredData, 1)}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item, index) => item.id?.toString() || index.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={130}
          />
        )}
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CustomerScreen')}>
          <MaterialIcons name="add" size={24} color="white" />
        </TouchableOpacity>
        <OverlayLoader visible={loading} />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  filterRow: { backgroundColor: '#fff', maxHeight: 48, borderBottomWidth: 1, borderBottomColor: '#eee' },
  filterRowContent: { paddingHorizontal: 12, alignItems: 'center' },
  bulkInvoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#009688',
    gap: 4,
  },
  bulkInvoiceBtnText: {
    color: '#009688',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  filterTab: { paddingHorizontal: 16, paddingVertical: 12, marginRight: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterTabText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold },
  itemContainer: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: 'black', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2 },
    }),
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  head: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  content: {
    color: '#333',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    flex: 1,
  },
  amountText: {
    color: COLORS.primaryThemeColor,
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
  },
  subContent: {
    color: '#999',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
});

export default SaleOrderListScreen;
