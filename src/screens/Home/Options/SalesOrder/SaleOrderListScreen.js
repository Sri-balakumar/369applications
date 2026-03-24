import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchSaleOrdersOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';

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
  invoiced: 'Fully Invoiced',
  to_invoice: 'To Invoice',
  no: 'Nothing to Invoice',
};

const SaleOrderListScreen = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchSaleOrdersOdoo({ limit: 100 });
      setData(records || []);
    } catch (err) {
      console.error('[SaleOrderList] error:', err);
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
    const stateLabel = STATE_LABELS[state] || state.toUpperCase();
    const partnerName = Array.isArray(item.partner_id) ? item.partner_id[1] : (item.partner_name || '-');
    const amount = item.amount_total || 0;
    const dateStr = item.date_order ? item.date_order.split(' ')[0] : '-';
    const invoiceStatus = item.invoice_status || '';

    return (
      <TouchableOpacity
        style={styles.itemContainer}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('SaleOrderDetailScreen', { orderId: item.id })}
      >
        <View style={styles.row}>
          <Text style={styles.head} numberOfLines={1}>{item.name || `SO-${item.id}`}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {state === 'sale' && invoiceStatus === 'to_invoice' && (
              <View style={[styles.badge, { backgroundColor: '#FF5722' }]}>
                <Text style={styles.badgeText}>TO INVOICE</Text>
              </View>
            )}
            {state === 'sale' && invoiceStatus === 'invoiced' && (
              <View style={[styles.badge, { backgroundColor: '#009688' }]}>
                <Text style={styles.badgeText}>INVOICED</Text>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: stateColor }]}>
              <Text style={styles.badgeText}>{stateLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.content} numberOfLines={1}>{partnerName}</Text>
          <Text style={styles.amountText}>{currencySymbol} {amount.toFixed ? amount.toFixed(2) : '0.00'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.subContent}>{dateStr}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Sales Orders" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        {data.length === 0 && !loading ? (
          <EmptyState
            imageSource={require('@assets/images/EmptyData/empty.png')}
            message="No Sales Orders Found"
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

export default SaleOrderListScreen;
