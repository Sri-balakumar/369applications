import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import OfflineBanner from '@components/common/OfflineBanner';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchEasyPurchaseDetailOdoo, confirmEasyPurchaseOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';

const STATE_COLORS = { draft: '#FF9800', done: '#4CAF50', cancelled: '#F44336' };

const Row = ({ label, value }) => (
  <View style={s.detailRow}>
    <Text style={s.label}>{label}</Text>
    <Text style={s.value} numberOfLines={2}>{value ?? '-'}</Text>
  </View>
);

const EasyPurchaseDetailScreen = ({ navigation, route }) => {
  const { purchaseId } = route?.params || {};
  const currencySymbol = useCurrencyStore((st) => st.currencySymbol) || '$';
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try { setRecord(await fetchEasyPurchaseDetailOdoo(purchaseId)); } catch (_) { setRecord(null); }
    finally { setLoading(false); }
  }, [purchaseId]);

  useFocusEffect(useCallback(() => { fetchDetail(); }, [fetchDetail]));

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await confirmEasyPurchaseOdoo(purchaseId);
      if (res && typeof res === 'object' && res.offline) {
        showToastMessage('Confirmed offline. Will sync when online.');
        try { setRecord(await fetchEasyPurchaseDetailOdoo(purchaseId)); } catch (_) {}
      } else {
        showToastMessage('Purchase confirmed');
        await fetchDetail();
      }
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to confirm');
    } finally { setConfirming(false); }
  };

  if (loading && !record) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Easy Purchase" onBackPress={() => navigation.goBack()} />
        <RoundedScrollContainer>
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />
          </View>
        </RoundedScrollContainer>
      </SafeAreaView>
    );
  }
  if (!record) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Easy Purchase" onBackPress={() => navigation.goBack()} />
        <OfflineBanner />
        <RoundedScrollContainer>
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <Text style={{ color: '#888' }}>Purchase not found.</Text>
          </View>
        </RoundedScrollContainer>
      </SafeAreaView>
    );
  }

  const state = (record.state || 'draft').toLowerCase();
  const stateColor = STATE_COLORS[state] || '#999';
  const partner = Array.isArray(record.partner_id) ? record.partner_id[1] : '-';
  const currency = Array.isArray(record.currency_id) ? record.currency_id[1] : (currencySymbol || '-');
  const company = Array.isArray(record.company_id) ? record.company_id[1] : '-';
  const warehouse = Array.isArray(record.warehouse_id) ? record.warehouse_id[1] : '-';
  const paymentMethod = Array.isArray(record.payment_method_id) ? record.payment_method_id[1] : '-';
  const paymentState = (record.payment_state || 'not_paid').toLowerCase();
  const untaxed = record.amount_untaxed || 0;
  const taxes = record.amount_tax || 0;
  const total = record.amount_total || 0;
  const lines = record.lines_detail || record.order_lines || [];

  return (
    <SafeAreaView>
      <NavigationHeader title={record.name || `EP-${record.id}`} onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — changes will sync when you reconnect" />
      <RoundedScrollContainer contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        {/* Status */}
        <View style={s.statusRow}>
          <Text style={s.title}>{record.name}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[s.pill, { backgroundColor: paymentState === 'paid' || paymentState === 'invoiced' ? '#E8F5E9' : '#FFEBEE', borderColor: paymentState === 'paid' || paymentState === 'invoiced' ? '#4CAF50' : '#F44336' }]}>
              <Text style={{ fontSize: 10, fontFamily: FONT_FAMILY.urbanistBold, color: paymentState === 'paid' || paymentState === 'invoiced' ? '#2E7D32' : '#C62828' }}>
                {paymentState === 'paid' ? 'Paid' : paymentState === 'invoiced' ? 'Invoiced' : 'Not Paid'}
              </Text>
            </View>
            <View style={[s.pill, { backgroundColor: stateColor + '22', borderColor: stateColor }]}>
              <Text style={[s.pillText, { color: stateColor }]}>{state.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Header */}
        <View style={s.card}>
          <Row label="Vendor" value={partner} />
          <Row label="Vendor Reference" value={record.reference || '-'} />
          <Row label="Date" value={(record.date || '').split('-').reverse().join('-') || '-'} />
          <Row label="Warehouse" value={warehouse} />
          <Row label="Payment Method" value={paymentMethod} />
          <Row label="Currency" value={currency} />
          <Row label="Company" value={company} />
        </View>

        {/* Lines */}
        <Text style={s.sectionTitle}>Products</Text>
        <View style={s.card}>
          {lines.length === 0 ? (
            <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: 12 }}>No product lines.</Text>
          ) : (
            <>
              <View style={[s.lineRow, s.lineHeader]}>
                <Text style={[s.colName, s.colH]}>Product</Text>
                <Text style={[s.colQty, s.colH]}>Qty</Text>
                <Text style={[s.colPrice, s.colH]}>Price</Text>
                <Text style={[s.colAmt, s.colH]}>Total</Text>
              </View>
              {lines.map((l) => (
                <View key={l.id} style={s.lineRow}>
                  <Text style={s.colName} numberOfLines={2}>{Array.isArray(l.product_id) ? l.product_id[1] : (l.description || '-')}</Text>
                  <Text style={s.colQty}>{l.quantity ?? l.product_uom_qty ?? 0}</Text>
                  <Text style={s.colPrice}>{(l.price_unit ?? 0).toFixed(3)}</Text>
                  <Text style={s.colAmt}>{(l.subtotal ?? l.total ?? 0).toFixed(3)}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Totals */}
        <View style={s.card}>
          <View style={s.totalRow}><Text style={s.totalLabel}>Untaxed</Text><Text style={s.totalValue}>{untaxed.toFixed(3)} {currency}</Text></View>
          <View style={s.totalRow}><Text style={s.totalLabel}>Tax</Text><Text style={s.totalValue}>{taxes.toFixed(3)} {currency}</Text></View>
          <View style={[s.totalRow, s.grandRow]}><Text style={s.grandLabel}>Total</Text><Text style={s.grandValue}>{total.toFixed(3)} {currency}</Text></View>
        </View>

        {/* Actions */}
        {state === 'draft' && (
          <View style={{ marginTop: 10 }}>
            <LoadingButton title="Confirm Purchase" backgroundColor="#4CAF50" onPress={handleConfirm} loading={confirming} />
          </View>
        )}
      </RoundedScrollContainer>
      <OverlayLoader visible={confirming} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  pillText: { fontSize: 10, fontFamily: FONT_FAMILY.urbanistBold },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f', marginBottom: 6, marginLeft: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  label: { fontSize: 13, color: '#888', fontFamily: FONT_FAMILY.urbanistMedium, flex: 1 },
  value: { fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistSemiBold, flex: 1.5, textAlign: 'right' },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  lineHeader: { borderBottomColor: '#ddd' },
  colH: { fontSize: 11, color: '#888', fontFamily: FONT_FAMILY.urbanistBold, textTransform: 'uppercase' },
  colName: { flex: 2, fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistMedium },
  colQty: { width: 40, textAlign: 'center', fontSize: 13, color: '#333' },
  colPrice: { width: 60, textAlign: 'right', fontSize: 13, color: '#333' },
  colAmt: { width: 70, textAlign: 'right', fontSize: 13, color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: '#888', fontFamily: FONT_FAMILY.urbanistMedium },
  totalValue: { fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistSemiBold },
  grandRow: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 6 },
  grandLabel: { fontSize: 15, color: '#2e2a4f', fontFamily: FONT_FAMILY.urbanistBold },
  grandValue: { fontSize: 15, color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold },
});

export default EasyPurchaseDetailScreen;
