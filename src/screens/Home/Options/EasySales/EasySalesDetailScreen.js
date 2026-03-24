import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchEasySaleDetailOdoo, confirmEasySaleOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';

const STATE_COLORS = {
  draft: '#FF9800',
  confirmed: '#4CAF50',
  done: '#2196F3',
  cancel: '#F44336',
  cancelled: '#F44336',
};

const EasySalesDetailScreen = ({ navigation, route }) => {
  const { saleId } = route?.params || {};
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!saleId) return;
    setLoading(true);
    try {
      const data = await fetchEasySaleDetailOdoo(saleId);
      setRecord(data);
    } catch (err) {
      console.error('[EasySalesDetail] error:', err);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useFocusEffect(useCallback(() => { fetchDetail(); }, [fetchDetail]));

  const handleConfirmSale = async () => {
    setConfirming(true);
    try {
      await confirmEasySaleOdoo(saleId);
      Alert.alert('Sale Confirmed', 'Easy sale confirmed successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to confirm sale.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading || !record) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Easy Sales" onBackPress={() => navigation.goBack()} />
        <OverlayLoader visible={true} />
      </SafeAreaView>
    );
  }

  const state = (record.state || 'draft').toLowerCase();
  const stateColor = STATE_COLORS[state] || '#999';
  const partnerName = Array.isArray(record.partner_id) ? record.partner_id[1] : (record.partner_name || '-');
  const warehouseName = Array.isArray(record.warehouse_id) ? record.warehouse_id[1] : (record.warehouse_name || '-');
  const paymentMethodName = (() => {
    const keys = Object.keys(record);
    const pmKey = keys.find(k => k.includes('payment_method') && record[k]);
    if (pmKey) {
      return Array.isArray(record[pmKey]) ? record[pmKey][1] : record[pmKey];
    }
    return '-';
  })();
  const currencyName = Array.isArray(record.currency_id) ? record.currency_id[1] : (record.currency || currency || '-');
  const customerRef = record.client_order_ref || record.customer_ref || record.reference || '';
  const dateStr = record.date || record.date_order || record.create_date?.split(' ')[0] || '-';

  // Find order lines
  const lineFieldKey = Object.keys(record).find(k =>
    (k.includes('line') || k.includes('order_line')) && Array.isArray(record[k])
  );
  const lineIds = lineFieldKey ? record[lineFieldKey] : [];

  const untaxed = record.amount_untaxed || record.untaxed_amount || 0;
  const taxes = record.amount_tax || record.tax_amount || 0;
  const total = record.amount_total || record.total || 0;

  return (
    <SafeAreaView>
      <NavigationHeader title={record.name || `ES-${record.id}`} onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>

        {/* Status Badge */}
        <View style={styles.statusRow}>
          <View style={[styles.badge, { backgroundColor: stateColor }]}>
            <Text style={styles.badgeText}>{state.toUpperCase()}</Text>
          </View>
        </View>

        {/* Details Card */}
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Customer</Text>
              <Text style={styles.fieldValue}>{partnerName}</Text>
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Payment Method</Text>
              <Text style={styles.fieldValue}>{paymentMethodName}</Text>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Date</Text>
              <Text style={styles.fieldValue}>{dateStr}</Text>
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Warehouse</Text>
              <Text style={styles.fieldValue}>{warehouseName}</Text>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Customer Reference</Text>
              <Text style={styles.fieldValue}>{customerRef || '-'}</Text>
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Currency</Text>
              <Text style={styles.fieldValue}>{currencyName}</Text>
            </View>
          </View>
        </View>

        {/* Products Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Products</Text>
          {lineIds.length === 0 ? (
            <Text style={styles.emptyText}>No product lines</Text>
          ) : (
            <Text style={styles.lineCount}>{lineIds.length} product line(s)</Text>
          )}
        </View>

        {/* Totals Card */}
        <View style={styles.card}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Untaxed Amount:</Text>
            <Text style={styles.totalValue}>{currencySymbol} {untaxed.toFixed ? untaxed.toFixed(2) : '0.00'}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Taxes:</Text>
            <Text style={styles.totalValue}>{currencySymbol} {taxes.toFixed ? taxes.toFixed(2) : '0.00'}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Total:</Text>
            <Text style={styles.grandTotalValue}>{currencySymbol} {total.toFixed ? total.toFixed(2) : '0.00'}</Text>
          </View>
        </View>

        {/* Confirm Sale Button - only for draft */}
        {state === 'draft' && (
          <View style={{ marginVertical: 16 }}>
            <Button
              backgroundColor={COLORS.primaryThemeColor}
              title="Confirm Sale"
              onPress={handleConfirmSale}
              loading={confirming}
            />
          </View>
        )}

      </RoundedScrollContainer>
      <OverlayLoader visible={confirming} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
    }),
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  fieldCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  lineCount: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#666',
    paddingVertical: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#666',
  },
  totalValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 4,
    paddingTop: 10,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  grandTotalValue: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    color: COLORS.primaryThemeColor,
  },
});

export default EasySalesDetailScreen;
