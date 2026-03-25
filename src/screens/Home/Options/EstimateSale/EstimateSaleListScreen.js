import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { EmptyItem, EmptyState } from '@components/common/empty';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchEstimateSalesOdoo } from '@api/services/generalApi';
import { useDataFetching } from '@hooks';
import { useCurrencyStore } from '@stores/currency';
import { MaterialIcons } from '@expo/vector-icons';

const STATE_LABELS = { draft: 'DRAFT', done: 'DONE', cancelled: 'CANCELLED' };
const STATE_COLORS = { draft: '#FF9800', done: '#4CAF50', cancelled: '#F44336' };
const PAYMENT_LABELS = { not_paid: 'NOT PAID', partial: 'PARTIAL', paid: 'PAID', over_paid: 'OVER PAID', invoiced: 'INVOICED' };
const PAYMENT_COLORS = { not_paid: '#F44336', partial: '#FF9800', paid: '#4CAF50', over_paid: '#2196F3', invoiced: '#2196F3' };

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];

const EstimateSaleListScreen = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchEstimateSalesOdoo);
  const [activeFilter, setActiveFilter] = useState('all');

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const filteredData = activeFilter === 'all' ? data : data.filter(i => (i.state || 'draft').toLowerCase() === activeFilter);

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    const state = (item.state || 'draft').toLowerCase();
    const customerName = Array.isArray(item.partner_id) ? item.partner_id[1] : '-';
    const amount = item.amount_total || 0;
    const paymentState = item.payment_state || '';

    return (
      <TouchableOpacity style={styles.itemContainer} activeOpacity={0.7}
        onPress={() => navigation.navigate('EstimateSaleDetailScreen', { recordId: item.id })}>
        <View style={styles.row}>
          <Text style={styles.head} numberOfLines={1}>{item.name || `ES-${item.id}`}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {state === 'done' && paymentState && (
              <View style={[styles.badge, { backgroundColor: PAYMENT_COLORS[paymentState] || '#999' }]}>
                <Text style={styles.badgeText}>{PAYMENT_LABELS[paymentState] || paymentState.toUpperCase()}</Text>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: STATE_COLORS[state] || '#999' }]}>
              <Text style={styles.badgeText}>{STATE_LABELS[state] || state.toUpperCase()}</Text>
            </View>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.content} numberOfLines={1}>{customerName}</Text>
          <Text style={styles.amountText}>{currencySymbol} {amount.toFixed ? amount.toFixed(3) : '0.000'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.subContent}>{item.date || '-'}</Text>
          {item.reference ? <Text style={styles.subContent}>Ref: {item.reference}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Estimate Sales" onBackPress={() => navigation.goBack()} />
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
        {filteredData.length === 0 ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message="No Estimate Sales Found" />
        ) : (
          <FlashList data={formatData(filteredData, 1)} numColumns={1} renderItem={renderItem}
            keyExtractor={(item, index) => item.id?.toString() || index.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 80 }} showsVerticalScrollIndicator={false}
            onEndReached={() => fetchMoreData()} onEndReachedThreshold={0.2} estimatedItemSize={130} />
        )}
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('EstimateSaleForm')}>
          <MaterialIcons name="add" size={24} color="white" />
        </TouchableOpacity>
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
  itemContainer: { marginHorizontal: 5, marginVertical: 5, backgroundColor: 'white', borderRadius: 15, ...Platform.select({ android: { elevation: 4 }, ios: { shadowColor: 'black', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2 } }), padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  head: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 16, flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },
  content: { color: '#333', fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, flex: 1, marginRight: 8 },
  amountText: { color: COLORS.primaryThemeColor, fontSize: 16, fontFamily: FONT_FAMILY.urbanistExtraBold },
  subContent: { color: '#999', fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: COLORS.primaryThemeColor, borderRadius: 30, width: 60, height: 60, justifyContent: 'center', alignItems: 'center', elevation: 6 },
});

export default EstimateSaleListScreen;
