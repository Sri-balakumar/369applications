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

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    const state = (item.state || 'draft').toLowerCase();
    const stateColor = STATE_COLORS[state] || '#999';
    const partnerName = Array.isArray(item.partner_id) ? item.partner_id[1] : '-';
    const amount = item.amount_total || 0;
    const paymentStatus = (item.payment_state || '').toLowerCase();
    const isPaid = paymentStatus === 'paid' || paymentStatus === 'invoiced';

    return (
      <TouchableOpacity style={s.card} activeOpacity={0.7}
        onPress={() => navigation.navigate('EasyPurchaseDetailScreen', { purchaseId: item.id })}>
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
          <Text style={s.amount}>{currencySymbol} {amount.toFixed ? amount.toFixed(3) : '0.000'}</Text>
        </View>
        <Text style={s.sub}>{(item.date || '').split('-').reverse().join('-') || '-'}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Easy Purchase" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — showing cached purchases" />
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
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderLeftWidth: 4, borderLeftColor: COLORS.primaryThemeColor,
    ...Platform.select({ android: { elevation: 3 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 } }),
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  head: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f', flex: 1 },
  content: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#555', flex: 1 },
  amount: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },
  sub: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistRegular, color: '#888' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' },
});

export default EasyPurchaseListScreen;
