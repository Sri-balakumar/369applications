import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { FABButton } from '@components/common/Button';
import OfflineBanner from '@components/common/OfflineBanner';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useDataFetching } from '@hooks';
import { fetchPurchaseOrdersOdoo } from '@api/services/generalApi';

// Odoo purchase.order.state → UI label
const STATES = [
  { key: '',         label: 'All' },
  { key: 'draft',    label: 'RFQ' },
  { key: 'sent',     label: 'RFQ Sent' },
  { key: 'purchase', label: 'Purchase Order' },
  { key: 'done',     label: 'Locked' },
  { key: 'cancel',   label: 'Cancelled' },
];

const STATE_COLORS = {
  draft:    '#FF9800',
  sent:     '#2196F3',
  purchase: '#4CAF50',
  done:     '#607D8B',
  cancel:   '#F44336',
};

const STATE_LABELS = {
  draft:    'RFQ',
  sent:     'RFQ Sent',
  purchase: 'Purchase Order',
  done:     'Locked',
  cancel:   'Cancelled',
};

const PurchaseListItem = ({ item, onPress }) => {
  const partner = Array.isArray(item?.partner_id) ? item.partner_id[1] : '-';
  const currency = Array.isArray(item?.currency_id) ? item.currency_id[1] : '';
  const stateColor = STATE_COLORS[item?.state] || '#999';
  const stateLabel = STATE_LABELS[item?.state] || item?.state || '';
  const date = item?.date_order ? String(item.date_order).split(' ')[0] : '';

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.orderName}>{item?.name || '-'}</Text>
        <View style={[styles.pill, { backgroundColor: stateColor + '22', borderColor: stateColor }]}>
          <Text style={[styles.pillText, { color: stateColor }]}>{stateLabel}</Text>
        </View>
      </View>
      <Text style={styles.partner} numberOfLines={1}>Vendor: {partner}</Text>
      <View style={styles.row}>
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.total}>
          {(item?.amount_total ?? 0).toFixed(3)} {currency}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const PurchaseListScreen = ({ navigation }) => {
  const [state, setState] = useState('');
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(
    fetchPurchaseOrdersOdoo,
    { cacheKey: '@cache:purchaseOrdersOdoo' }
  );

  useFocusEffect(
    useCallback(() => {
      fetchData({ state });
    }, [state])
  );

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    return (
      <PurchaseListItem
        item={item}
        onPress={() => navigation.navigate('PurchaseDetailScreen', { orderId: item.id })}
      />
    );
  };

  const renderEmpty = () => (
    <EmptyState
      imageSource={require('@assets/images/EmptyData/empty.png')}
      message={'No Purchase Orders Found'}
    />
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Purchase" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — showing cached purchase orders" onOnline={() => fetchData({ state })} />

      {/* Status filter */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
          {STATES.map((s) => {
            const isActive = state === s.key;
            return (
              <TouchableOpacity
                key={s.key || 'all'}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setState(s.key)}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <RoundedContainer>
        {data.length === 0 && !loading ? renderEmpty() : (
          <FlashList
            data={formatData(data, 1)}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item, index) => String(item?.id || index)}
            contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
            onEndReached={() => fetchMoreData({ state })}
            onEndReachedThreshold={0.2}
            estimatedItemSize={110}
            showsVerticalScrollIndicator={false}
          />
        )}
        <FABButton onPress={() => navigation.navigate('PurchaseFormScreen')} />
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  filterBar: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  chip: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20, backgroundColor: '#f0f0f0',
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipActive: {
    backgroundColor: COLORS.primaryThemeColor,
    borderColor: COLORS.primaryThemeColor,
  },
  chipText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#555',
  },
  chipTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primaryThemeColor,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  orderName: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
  },
  pill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1,
  },
  pillText: {
    fontSize: 10, fontFamily: FONT_FAMILY.urbanistBold,
  },
  partner: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#555',
    marginBottom: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12, color: '#888', fontFamily: FONT_FAMILY.urbanistRegular },
  total: { fontSize: 14, color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold },
});

export default PurchaseListScreen;
