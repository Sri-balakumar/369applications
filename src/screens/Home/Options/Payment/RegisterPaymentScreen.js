import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TabBar } from 'react-native-tab-view';
import { FABButton } from '@components/common/Button';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchAccountPaymentsOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import OfflineBanner from '@components/common/OfflineBanner';
import networkStatus from '@utils/networkStatus';
import { waitForFlush, flush } from '@services/OfflineSyncService';
import { getPendingCount } from '@utils/offlineQueue';

// Matches Odoo web UI palette for account.payment state badges.
const STATE_COLORS = {
  draft: '#FF9800',       // orange
  in_process: '#FBC02D',  // yellow
  paid: '#4CAF50',        // green
  posted: '#4CAF50',      // green (older Odoo)
  reconciled: '#4CAF50',  // green
  sent: '#2196F3',        // blue
  cancelled: '#F44336',   // red
  canceled: '#F44336',    // red
  rejected: '#F44336',    // red
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'in_process', label: 'In Process' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
];

// Each filter tab is tinted to match the state-badge color of the rows it
// filters for, so the filter bar doubles as a color legend.
const FILTER_COLORS = {
  all:        COLORS.primaryThemeColor,
  draft:      STATE_COLORS.draft,
  in_process: STATE_COLORS.in_process,
  paid:       STATE_COLORS.paid,
  cancelled:  STATE_COLORS.cancelled,
};

const filterPredicate = (filter) => (item) => {
  const s = (item.state || 'draft').toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'paid') return s === 'paid' || s === 'posted' || s === 'reconciled';
  if (filter === 'cancelled') return s === 'cancelled' || s === 'canceled' || s === 'rejected';
  return s === filter;
};


const PaymentList = ({ paymentType, navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const payments = await fetchAccountPaymentsOdoo({ paymentType, limit: 100 });
      setData(payments || []);
    } catch (err) {
      console.error('fetchPayments error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [paymentType]);

  // Focus: if there's a pending queue online, flush FIRST so the single
  // fetch below sees real Odoo ids + names. Only one network fetch per
  // focus — avoids the double-fetch we saw in the logs (fetch → flush →
  // fetch again).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const online = await networkStatus.isOnline();
        const pending = await getPendingCount();
        if (online && pending > 0 && !cancelled) {
          console.log('[RegisterPayment] Focus + online + queue=', pending, '→ force flush before fetch');
          try { await flush(); } catch (e) { console.warn('[RegisterPayment] focus flush failed:', e?.message); }
          try { await waitForFlush(8000); } catch (_) {}
        }
        if (!cancelled) await fetchData();
      })();
      return () => { cancelled = true; };
    }, [fetchData])
  );

  // Auto-refresh when internet returns — actively call flush() so queued
  // create/action_post/action_cancel items push to Odoo right away instead
  // of waiting on the background scheduler's debounce window.
  useEffect(() => {
    let wasOff = null;
    const unsub = networkStatus.subscribe(async (online) => {
      const previouslyOff = wasOff === true;
      wasOff = !online;
      if (online && previouslyOff) {
        const pending = await getPendingCount();
        console.log('[RegisterPayment] Online transition → force flush, queue=', pending, paymentType);
        try { await flush(); } catch (e) { console.warn('[RegisterPayment] reconnect flush failed:', e?.message); }
        try { await waitForFlush(8000); } catch (_) {}
        try { await fetchData(); } catch (_) {}
      }
    });
    (async () => { wasOff = !(await networkStatus.isOnline()); })();
    return () => unsub && unsub();
  }, [fetchData, paymentType]);

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    const state = (item.state || 'draft').toLowerCase();
    const stateColor = STATE_COLORS[state] || '#999';
    // Display name priority: real Odoo sequence name (PAY0000X) > offline
    // placeholder label ("NEW N(offline)") > predicted PAY name on validate >
    // "Payment" fallback. Legacy DRAFT- placeholders still get the friendly
    // "Draft Payment" treatment.
    const rawName = item.name || '';
    const isLegacyDraft = String(rawName).startsWith('DRAFT-');
    const displayName = rawName && rawName !== '/' && !isLegacyDraft
      ? rawName
      : (state === 'draft' ? 'Draft Payment' : 'Payment');

    return (
      <TouchableOpacity
        style={styles.itemContainer}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PaymentDetailScreen', { paymentId: item.id })}
      >
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.head} numberOfLines={1}>{displayName}</Text>
            {item.offline_label && item.offline_label !== item.name ? (
              <Text style={{ fontSize: 11, color: '#999', fontFamily: FONT_FAMILY.urbanistMedium }}>
                Ref: {item.offline_label}
              </Text>
            ) : null}
          </View>
          <View style={[styles.badge, { backgroundColor: stateColor, alignSelf: 'flex-start' }]}>
            <Text style={styles.badgeText}>{state.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.content} numberOfLines={1}>{item.partner_name || '-'}</Text>
          <Text style={styles.amountText}>{currencySymbol} {item.amount?.toFixed(3) || '0.000'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.subContent}>{item.date || '-'}</Text>
          <Text style={styles.subContent}>{item.journal_name || '-'}</Text>
        </View>

        {item.ref ? (
          <Text style={styles.subContent} numberOfLines={1}>Memo: {item.ref}</Text>
        ) : null}

        {item.company_name ? (
          <View style={styles.companyRow}>
            <Icon name="domain" size={14} color="#888" />
            <Text style={styles.companyText} numberOfLines={1}>{item.company_name}</Text>
          </View>
        ) : null}

        {item.location_name ? (
          <View style={styles.locationRow}>
            <Icon name="map-marker" size={14} color={COLORS.primaryThemeColor} />
            <Text style={styles.locationText} numberOfLines={1}>{item.location_name}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const filteredData = data.filter(filterPredicate(activeFilter));
  const filterCounts = FILTERS.reduce((acc, f) => {
    acc[f.key] = data.filter(filterPredicate(f.key)).length;
    return acc;
  }, {});

  return (
    <RoundedContainer>
      {/* Filter bar — tap to narrow by state. Counts update live with data. */}
      <View style={styles.filterBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBarContent}>
          {FILTERS.map((f) => {
            const color = FILTER_COLORS[f.key] || COLORS.primaryThemeColor;
            const isActive = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterTab,
                  isActive && { backgroundColor: color, borderColor: color },
                ]}
                onPress={() => setActiveFilter(f.key)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    isActive ? styles.filterTabTextActive : { color },
                  ]}
                >
                  {f.label} ({filterCounts[f.key] ?? 0})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {filteredData.length === 0 && !loading ? (
        <EmptyState
          imageSource={require('@assets/images/EmptyData/empty.png')}
          message={`No ${paymentType === 'inbound' ? 'Customer' : 'Vendor'} Payments Found`}
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
      <FABButton onPress={() => navigation.navigate('PaymentForm', { paymentType })} />
      <OverlayLoader visible={loading} />
    </RoundedContainer>
  );
};

const RegisterPaymentScreen = ({ navigation }) => {
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'customer', title: 'Customer' },
    { key: 'vendor', title: 'Vendor' },
  ]);

  const renderScene = ({ route }) => {
    switch (route.key) {
      case 'customer':
        return <PaymentList paymentType="inbound" navigation={navigation} />;
      case 'vendor':
        return <PaymentList paymentType="outbound" navigation={navigation} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Register Payment" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — payments will sync when you reconnect" />
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        renderTabBar={props => (
          <TabBar
            {...props}
            scrollEnabled={false}
            style={{ backgroundColor: COLORS.primaryThemeColor }}
            indicatorStyle={{ backgroundColor: '#fff', height: 3 }}
            labelStyle={{ color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, textTransform: 'capitalize' }}
            pressColor={COLORS.primaryThemeColor}
          />
        )}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  filterBarWrap: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  filterBarContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#F8F8F8',
    marginRight: 6,
  },
  filterTabText: {
    fontSize: 12,
    color: '#555',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  filterTabTextActive: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
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
    marginRight: 8,
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
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  companyText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginLeft: 4,
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.primaryThemeColor,
    marginLeft: 4,
    flex: 1,
  },
});

export default RegisterPaymentScreen;
