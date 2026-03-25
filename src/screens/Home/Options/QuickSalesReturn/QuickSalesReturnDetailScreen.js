import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchQuickSalesReturnDetailOdoo, confirmQuickSalesReturnOdoo, cancelQuickSalesReturnOdoo, draftQuickSalesReturnOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';

const STATE_LABELS = { draft: 'DRAFT', done: 'DONE', cancelled: 'CANCELLED' };
const STATE_COLORS = { draft: '#FF9800', done: '#4CAF50', cancelled: '#F44336' };

const QuickSalesReturnDetailScreen = ({ navigation, route }) => {
  const { recordId } = route?.params || {};
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const anyLoading = confirmLoading || cancelLoading || draftLoading;

  const fetchDetail = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    try { setRecord(await fetchQuickSalesReturnDetailOdoo(recordId)); }
    catch (err) { console.error('[QuickSalesReturnDetail]', err); }
    finally { setLoading(false); }
  }, [recordId]);

  useFocusEffect(useCallback(() => { fetchDetail(); }, [fetchDetail]));

  const handleConfirm = () => {
    Alert.alert('Confirm Return', 'This will create a Credit Note and Return Picking. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        setConfirmLoading(true);
        try {
          const companyId = record?.company_id ? (Array.isArray(record.company_id) ? record.company_id[0] : record.company_id) : null;
          await confirmQuickSalesReturnOdoo(recordId, companyId);
          Alert.alert('Success', 'Return confirmed.', [{ text: 'OK', onPress: fetchDetail }]);
        } catch (err) { Alert.alert('Error', err?.message || 'Failed to confirm.'); }
        finally { setConfirmLoading(false); }
      }},
    ]);
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try { await cancelQuickSalesReturnOdoo(recordId); Alert.alert('Cancelled', 'Return cancelled.', [{ text: 'OK', onPress: fetchDetail }]); }
    catch (err) { Alert.alert('Error', err?.message || 'Failed to cancel.'); }
    finally { setCancelLoading(false); }
  };

  const handleSetDraft = async () => {
    setDraftLoading(true);
    try { await draftQuickSalesReturnOdoo(recordId); Alert.alert('Done', 'Set back to draft.', [{ text: 'OK', onPress: fetchDetail }]); }
    catch (err) { Alert.alert('Error', err?.message || 'Failed.'); }
    finally { setDraftLoading(false); }
  };

  if (!record) {
    return (<SafeAreaView><NavigationHeader title="Sales Return" onBackPress={() => navigation.goBack()} /><OverlayLoader visible={true} /></SafeAreaView>);
  }

  const state = (record.state || 'draft').toLowerCase();
  const customerName = Array.isArray(record.partner_id) ? record.partner_id[1] : '-';
  const invoiceName = Array.isArray(record.source_invoice_id) ? record.source_invoice_id[1] : '-';
  const warehouseName = Array.isArray(record.warehouse_id) ? record.warehouse_id[1] : '-';
  const creditNoteName = Array.isArray(record.credit_note_id) ? record.credit_note_id[1] : (record.credit_note_id ? String(record.credit_note_id) : '-');
  const pickingName = Array.isArray(record.return_picking_id) ? record.return_picking_id[1] : (record.return_picking_id ? String(record.return_picking_id) : '-');
  const lines = record.lines_detail || [];
  const isDraft = state === 'draft';
  const isCancelled = state === 'cancelled';
  const isDone = state === 'done';

  return (
    <SafeAreaView>
      <NavigationHeader title={record.name || `SR-${record.id}`} onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        <View style={styles.statusRow}>
          <View style={[styles.badge, { backgroundColor: STATE_COLORS[state] || '#999' }]}>
            <Text style={styles.badgeText}>{STATE_LABELS[state] || state.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}><Text style={styles.fieldLabel}>Customer</Text><Text style={styles.fieldValue}>{customerName}</Text></View>
            <View style={styles.fieldCol}><Text style={styles.fieldLabel}>Date</Text><Text style={styles.fieldValue}>{record.date || '-'}</Text></View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}><Text style={styles.fieldLabel}>Source Invoice</Text><Text style={styles.fieldValue}>{invoiceName}</Text></View>
            <View style={styles.fieldCol}><Text style={styles.fieldLabel}>Warehouse</Text><Text style={styles.fieldValue}>{warehouseName}</Text></View>
          </View>
        </View>

        {isDone && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Created Documents</Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldCol}><Text style={styles.fieldLabel}>Credit Note</Text><Text style={styles.fieldValue}>{creditNoteName}</Text></View>
              <View style={styles.fieldCol}><Text style={styles.fieldLabel}>Return Picking</Text><Text style={styles.fieldValue}>{pickingName}</Text></View>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Return Lines</Text>
          {lines.length === 0 ? <Text style={styles.emptyText}>No return lines</Text> : lines.map((line, idx) => {
            const productName = Array.isArray(line.product_id) ? line.product_id[1] : (line.description || '-');
            return (
              <View key={line.id || idx} style={styles.lineItem}>
                <Text style={styles.lineName} numberOfLines={2}>{productName}</Text>
                <View style={styles.lineDetails}>
                  <Text style={styles.lineDetail}>Sold: {line.sold_qty || 0}</Text>
                  <Text style={styles.lineDetail}>Returnable: {line.returnable_qty || 0}</Text>
                  <Text style={[styles.lineDetail, { color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold }]}>Return: {line.return_qty || 0}</Text>
                </View>
                <View style={styles.lineDetails}>
                  <Text style={styles.lineDetail}>Price: {currencySymbol} {(line.price_unit || 0).toFixed(3)}</Text>
                  <Text style={styles.lineSubtotal}>{currencySymbol} {(line.total || line.subtotal || 0).toFixed(3)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Untaxed:</Text><Text style={styles.totalValue}>{currencySymbol} {(record.amount_untaxed || 0).toFixed(3)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Taxes:</Text><Text style={styles.totalValue}>{currencySymbol} {(record.amount_tax || 0).toFixed(3)}</Text></View>
          <View style={[styles.totalRow, styles.grandTotalRow]}><Text style={styles.grandTotalLabel}>Total:</Text><Text style={styles.grandTotalValue}>{currencySymbol} {(record.amount_total || 0).toFixed(3)}</Text></View>
        </View>

        {record.notes ? <View style={styles.card}><Text style={styles.sectionTitle}>Notes</Text><Text style={{ fontSize: 13, color: '#555' }}>{record.notes}</Text></View> : null}

        {isDraft && (
          <View style={styles.actionSection}>
            <Button backgroundColor={COLORS.primaryThemeColor} title="Confirm Return" onPress={handleConfirm} loading={confirmLoading} disabled={anyLoading} />
            <View style={{ height: 12 }} />
            <Button backgroundColor="#F44336" title="Cancel" onPress={handleCancel} loading={cancelLoading} disabled={anyLoading} />
          </View>
        )}
        {isCancelled && (
          <View style={styles.actionSection}>
            <Button backgroundColor="#FF9800" title="Set to Draft" onPress={handleSetDraft} loading={draftLoading} disabled={anyLoading} />
          </View>
        )}
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 } }) },
  fieldRow: { flexDirection: 'row', marginBottom: 12 }, fieldCol: { flex: 1 },
  fieldLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginBottom: 2 },
  fieldValue: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333' },
  sectionTitle: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginBottom: 8 },
  emptyText: { textAlign: 'center', color: '#999', paddingVertical: 12 },
  lineItem: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#eee' },
  lineName: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginBottom: 4 },
  lineDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 2 },
  lineDetail: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666' },
  lineSubtotal: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistExtraBold, color: COLORS.primaryThemeColor },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  totalLabel: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666' },
  totalValue: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333' },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: '#eee', marginTop: 4, paddingTop: 10 },
  grandTotalLabel: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#333' },
  grandTotalValue: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistExtraBold, color: COLORS.primaryThemeColor },
  actionSection: { marginTop: 8, marginBottom: 20, paddingHorizontal: 4 },
});

export default QuickSalesReturnDetailScreen;
