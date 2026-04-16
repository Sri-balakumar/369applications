import React, { useState, useCallback } from 'react';
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
import { fetchSaleOrdersOdoo, searchInvoicesByOriginOdoo } from '@api/services/generalApi';
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchSaleOrdersOdoo({ limit: 100 });
      // Enrich: for SOs with no invoice_ids, search by origin
      for (const r of (records || [])) {
        if ((!r.invoice_ids || r.invoice_ids.length === 0) && r.name) {
          try {
            const invs = await searchInvoicesByOriginOdoo(r.name);
            if (invs.length > 0) r.invoice_ids = invs.map(i => i.id);
          } catch (e) {}
        }
      }
      setData(records || []);
      // Assign S numbers (source of truth - orders get numbers here)
      const ids = (records || []).map(r => r.id);
      if (ids.length > 0) {
        const map = await assignSNumbers(ids);
        setInvMap(map);
      }
    } catch (err) {
      console.error('[SaleOrderList] error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const filteredData = activeFilter === 'all'
    ? data
    : activeFilter === 'invoiced'
      ? data.filter(i => {
          const hasInv = i.invoice_status === 'invoiced' || (i.invoice_ids && i.invoice_ids.length > 0);
          return hasInv;
        })
      : activeFilter === 'sale'
        ? data.filter(i => {
            const s = (i.state || 'draft').toLowerCase();
            const hasInv = i.invoice_status === 'invoiced' || (i.invoice_ids && i.invoice_ids.length > 0);
            return s === 'sale' && !hasInv;
          })
        : activeFilter === 'draft'
          ? data.filter(i => {
              const s = (i.state || 'draft').toLowerCase();
              const hasInv = i.invoice_status === 'invoiced' || (i.invoice_ids && i.invoice_ids.length > 0);
              return s === activeFilter && !hasInv;
            })
          : data.filter(i => (i.state || 'draft').toLowerCase() === activeFilter);

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
          <Text style={styles.head} numberOfLines={1}>{invMap[item.id] || item.name || `SO-${item.id}`}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
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
      <NavigationHeader title="Sales Orders" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — showing cached orders" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, activeFilter === f.key && styles.filterTabActive]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Text style={[styles.filterTabText, activeFilter === f.key && styles.filterTabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  filterTab: { paddingHorizontal: 16, paddingVertical: 12, marginRight: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterTabActive: { borderBottomColor: COLORS.primaryThemeColor },
  filterTabText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#999' },
  filterTabTextActive: { color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold },
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
