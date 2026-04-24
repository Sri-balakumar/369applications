import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { FABButton } from '@components/common/Button';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchEasyPurchasesOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';
import OfflineBanner from '@components/common/OfflineBanner';
import networkStatus from '@utils/networkStatus';
import { waitForFlush, flush } from '@services/OfflineSyncService';
import { getPendingCount } from '@utils/offlineQueue';

const STATE_COLORS = { draft: '#FF9800', done: '#4CAF50', cancelled: '#F44336' };

const EasyPurchaseListScreen = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((s) => s.currencySymbol) || '$';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData((await fetchEasyPurchasesOdoo({ limit: 100 })) || []); } catch (_) { setData([]); }
    finally { setLoading(false); }
  }, []);

  // Focus: if there's a pending queue while online, drain it FIRST so the
  // subsequent fetch sees the freshly-synced Odoo ids + names. Without this,
  // offline-created placeholders can be wiped by a refetch that runs before
  // the sync commits.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const online = await networkStatus.isOnline();
        const pending = await getPendingCount();
        if (online && pending > 0 && !cancelled) {
          console.log('[EasyPurchaseList] Focus + online + queue=', pending, '→ force flush before fetch');
          try { await flush(); } catch (e) { console.warn('[EasyPurchaseList] focus flush failed:', e?.message); }
          try { await waitForFlush(8000); } catch (_) {}
        }
        if (!cancelled) await fetchData();
      })();
      return () => { cancelled = true; };
    }, [fetchData])
  );

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    const state = (item.state || 'draft').toLowerCase();
    const stateColor = STATE_COLORS[state] || '#999';
    const partnerName = Array.isArray(item.partner_id) ? item.partner_id[1] : '-';
    const amount = item.amount_total || 0;
    const paymentStatus = (item.payment_state || '').toLowerCase();
    const isPaid = paymentStatus === 'paid' || paymentStatus === 'invoiced';

    return (
      <TouchableOpacity
        style={s.itemContainer}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('EasyPurchaseDetailScreen', { purchaseId: item.id })}
      >
        <View style={s.row}>
          <Text style={s.head} numberOfLines={1}>{item.name || `EP-${item.id}`}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[s.badge, { backgroundColor: isPaid ? '#4CAF50' : '#F44336' }]}>
              <Text style={s.badgeText}>{isPaid ? 'Paid' : 'Not Paid'}</Text>
            </View>
            <View style={[s.badge, { backgroundColor: stateColor }]}>
              <Text style={s.badgeText}>{state.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={s.row}>
          <Text style={s.content} numberOfLines={1}>{partnerName}</Text>
          <Text style={s.amountText}>{currencySymbol} {amount.toFixed ? amount.toFixed(3) : '0.000'}</Text>
        </View>

        <View style={s.row}>
          <Text style={s.subContent}>{(item.date || '').split('-').reverse().join('-') || '-'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Easy Purchase" onBackPress={() => navigation.goBack()} />
      <OfflineBanner
        message="OFFLINE MODE — showing cached purchases"
        onOnline={async () => {
          try { await flush(); } catch (_) {}
          try { await waitForFlush(8000); } catch (_) {}
          fetchData();
        }}
      />
      <RoundedContainer>
        {data.length === 0 && !loading ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message="No Easy Purchases Found" />
        ) : (
          <FlashList data={formatData(data, 1)} numColumns={1} renderItem={renderItem}
            keyExtractor={(item, i) => item.id?.toString() || i.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false} estimatedItemSize={130} />
        )}
        <FABButton onPress={() => navigation.navigate('EasyPurchaseForm')} />
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
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
});

export default EasyPurchaseListScreen;
