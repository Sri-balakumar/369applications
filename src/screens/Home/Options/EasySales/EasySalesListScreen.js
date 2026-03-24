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
import { fetchEasySalesOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';

const STATE_COLORS = {
  draft: '#FF9800',
  confirmed: '#4CAF50',
  done: '#2196F3',
  cancel: '#F44336',
  cancelled: '#F44336',
};

const EasySalesListScreen = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchEasySalesOdoo({ limit: 100 });
      setData(records || []);
    } catch (err) {
      console.error('[EasySalesList] error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    const state = (item.state || 'draft').toLowerCase();
    const stateColor = STATE_COLORS[state] || '#999';
    const partnerName = Array.isArray(item.partner_id) ? item.partner_id[1] : (item.partner_name || '-');
    const amount = item.amount_total || item.total || 0;
    const paymentStatus = (item.payment_status || item.payment_state || '').toLowerCase();
    const isPaid = paymentStatus === 'paid' || paymentStatus === 'in_payment';

    return (
      <TouchableOpacity
        style={styles.itemContainer}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('EasySalesDetailScreen', { saleId: item.id })}
      >
        <View style={styles.row}>
          <Text style={styles.head} numberOfLines={1}>{item.name || `ES-${item.id}`}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[styles.badge, { backgroundColor: isPaid ? '#4CAF50' : '#F44336' }]}>
              <Text style={styles.badgeText}>{isPaid ? 'Paid' : 'Not Paid'}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: stateColor }]}>
              <Text style={styles.badgeText}>{state.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.content} numberOfLines={1}>{partnerName}</Text>
          <Text style={styles.amountText}>{currencySymbol} {amount.toFixed ? amount.toFixed(2) : '0.00'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.subContent}>{item.date || item.create_date?.split(' ')[0] || '-'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Easy Sales" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        {data.length === 0 && !loading ? (
          <EmptyState
            imageSource={require('@assets/images/EmptyData/empty.png')}
            message="No Easy Sales Found"
          />
        ) : (
          <FlashList
            data={formatData(data, 1)}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item, index) => item.id?.toString() || index.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={130}
          />
        )}
        <FABButton onPress={() => navigation.navigate('EasySalesForm')} />
        <OverlayLoader visible={loading} />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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

export default EasySalesListScreen;
