import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import OfflineBanner from '@components/common/OfflineBanner';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import {
  fetchPurchaseOrderDetailOdoo,
  sendRfqPurchaseOrderOdoo,
  confirmPurchaseOrderOdoo,
  cancelPurchaseOrderOdoo,
} from '@api/services/generalApi';

const STATE_LABELS = {
  draft:    'RFQ',
  sent:     'RFQ Sent',
  purchase: 'Purchase Order',
  done:     'Locked',
  cancel:   'Cancelled',
};

const STATE_COLORS = {
  draft:    '#FF9800',
  sent:     '#2196F3',
  purchase: '#4CAF50',
  done:     '#607D8B',
  cancel:   '#F44336',
};

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value} numberOfLines={2}>{value ?? '-'}</Text>
  </View>
);

const PurchaseDetailScreen = ({ navigation, route }) => {
  const { orderId } = route?.params || {};
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const r = await fetchPurchaseOrderDetailOdoo(orderId);
      setRecord(r);
    } catch (_) {}
  };

  const handleSendRfq = async () => {
    setBusy(true);
    try {
      await sendRfqPurchaseOrderOdoo(orderId);
      showToastMessage('RFQ sent');
      await refresh();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to send RFQ');
    } finally { setBusy(false); }
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await confirmPurchaseOrderOdoo(orderId);
      showToastMessage('Purchase Order confirmed');
      await refresh();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to confirm order');
    } finally { setBusy(false); }
  };

  const handleCancel = () => {
    Alert.alert('Cancel Order', 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            await cancelPurchaseOrderOdoo(orderId);
            showToastMessage('Order cancelled');
            await refresh();
          } catch (err) {
            Alert.alert('Error', err?.message || 'Failed to cancel order');
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const r = await fetchPurchaseOrderDetailOdoo(orderId);
          if (!cancelled) setRecord(r);
        } catch (e) {
          if (!cancelled) setRecord(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [orderId])
  );

  if (loading && !record) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Purchase Order" onBackPress={() => navigation.goBack()} />
        <RoundedScrollContainer>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 }}>
            <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />
          </View>
        </RoundedScrollContainer>
      </SafeAreaView>
    );
  }

  if (!record) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Purchase Order" onBackPress={() => navigation.goBack()} />
        <OfflineBanner message="OFFLINE MODE — changes will sync when you reconnect" onOnline={refresh} />
        <RoundedScrollContainer>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 }}>
            <Text style={{ color: '#888' }}>Order not found.</Text>
          </View>
        </RoundedScrollContainer>
      </SafeAreaView>
    );
  }

  const partner = Array.isArray(record.partner_id) ? record.partner_id[1] : '-';
  const currency = Array.isArray(record.currency_id) ? record.currency_id[1] : '';
  const company = Array.isArray(record.company_id) ? record.company_id[1] : '-';
  const state = record.state || 'draft';
  const stateColor = STATE_COLORS[state] || '#999';
  const stateLabel = STATE_LABELS[state] || state;
  const lines = record.order_lines_detail || [];

  return (
    <SafeAreaView>
      <NavigationHeader title={record.name || 'Purchase Order'} onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — changes will sync when you reconnect" onOnline={refresh} />

      <RoundedScrollContainer contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        {/* Status badge */}
        <View style={styles.statusRow}>
          <Text style={styles.title}>{record.name}</Text>
          <View style={[styles.pill, { backgroundColor: stateColor + '22', borderColor: stateColor }]}>
            <Text style={[styles.pillText, { color: stateColor }]}>{stateLabel}</Text>
          </View>
        </View>

        {/* Header fields */}
        <View style={styles.card}>
          <Row label="Vendor" value={partner} />
          <Row label="Vendor Reference" value={record.partner_ref || '-'} />
          <Row label="Currency" value={currency || '-'} />
          <Row label="Order Deadline" value={record.date_order || '-'} />
          <Row label="Expected Arrival" value={record.date_planned || '-'} />
          <Row label="Company" value={company} />
        </View>

        {/* Lines */}
        <Text style={styles.sectionTitle}>Products</Text>
        <View style={styles.card}>
          {lines.length === 0 ? (
            <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: 12 }}>No product lines.</Text>
          ) : (
            <>
              <View style={[styles.lineRow, styles.lineHeader]}>
                <Text style={[styles.colName, styles.colHeader]}>Product</Text>
                <Text style={[styles.colQty, styles.colHeader]}>Qty</Text>
                <Text style={[styles.colPrice, styles.colHeader]}>Price</Text>
                <Text style={[styles.colAmount, styles.colHeader]}>Amount</Text>
              </View>
              {lines.map((l) => (
                <View key={l.id} style={styles.lineRow}>
                  <Text style={styles.colName} numberOfLines={2}>
                    {Array.isArray(l.product_id) ? l.product_id[1] : (l.name || '-')}
                  </Text>
                  <Text style={styles.colQty}>{l.product_qty}</Text>
                  <Text style={styles.colPrice}>{(l.price_unit ?? 0).toFixed(3)}</Text>
                  <Text style={styles.colAmount}>{(l.price_subtotal ?? 0).toFixed(3)}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Untaxed Amount</Text>
            <Text style={styles.totalValue}>{(record.amount_untaxed ?? 0).toFixed(3)} {currency}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>{(record.amount_tax ?? 0).toFixed(3)} {currency}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{(record.amount_total ?? 0).toFixed(3)} {currency}</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={{ gap: 10, marginTop: 6 }}>
          {state === 'draft' ? (
            <LoadingButton title="Send RFQ" backgroundColor="#2196F3" onPress={handleSendRfq} loading={busy} />
          ) : null}
          {(state === 'draft' || state === 'sent') ? (
            <LoadingButton title="Confirm Order" backgroundColor="#4CAF50" onPress={handleConfirm} loading={busy} />
          ) : null}
          {(state !== 'cancel' && state !== 'done') ? (
            <LoadingButton title="Cancel Order" backgroundColor="#F44336" onPress={handleCancel} loading={busy} />
          ) : null}
        </View>
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
  },
  pill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1,
  },
  pillText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    marginBottom: 6,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  label: { fontSize: 13, color: '#888', fontFamily: FONT_FAMILY.urbanistMedium, flex: 1 },
  value: { fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistSemiBold, flex: 1.5, textAlign: 'right' },
  lineRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  lineHeader: { borderBottomColor: '#ddd' },
  colHeader: { fontSize: 11, color: '#888', fontFamily: FONT_FAMILY.urbanistBold, textTransform: 'uppercase' },
  colName: { flex: 2, fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistMedium },
  colQty: { width: 40, textAlign: 'center', fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistMedium },
  colPrice: { width: 60, textAlign: 'right', fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistMedium },
  colAmount: { width: 70, textAlign: 'right', fontSize: 13, color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: '#888', fontFamily: FONT_FAMILY.urbanistMedium },
  totalValue: { fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistSemiBold },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 6 },
  grandLabel: { fontSize: 15, color: '#2e2a4f', fontFamily: FONT_FAMILY.urbanistBold },
  grandValue: { fontSize: 15, color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold },
});

export default PurchaseDetailScreen;
