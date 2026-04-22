import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchPaymentDetailOdoo, postPaymentOdoo, cancelPaymentOdoo, draftPaymentOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';
import { MaterialIcons } from '@expo/vector-icons';
import OfflineBanner from '@components/common/OfflineBanner';
import { StyledAlertModal } from '@components/Modal';

const STATE_COLORS = {
  draft: '#FF9800',
  in_process: '#FBC02D',
  paid: '#4CAF50',
  posted: '#4CAF50',
  reconciled: '#4CAF50',
  sent: '#2196F3',
  cancelled: '#F44336',
  canceled: '#F44336',
  rejected: '#F44336',
};

const STATE_LABELS = {
  draft: 'DRAFT',
  in_process: 'IN PROCESS',
  paid: 'PAID',
  posted: 'POSTED',
  reconciled: 'RECONCILED',
  sent: 'SENT',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  rejected: 'REJECTED',
};

const PaymentDetailScreen = ({ navigation, route }) => {
  const { paymentId } = route?.params || {};
  const currencySymbol = useCurrencyStore((s) => s.currencySymbol) || useCurrencyStore((s) => s.currency) || '';
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Styled modal state — one shared modal for all confirm/info dialogs.
  const [alertModal, setAlertModal] = useState({ visible: false, message: '', confirmText: 'OK', cancelText: '', destructive: false, onConfirm: null, onCancel: null });
  const showAlert = useCallback((opts) => setAlertModal({
    visible: true,
    message: opts?.message || '',
    confirmText: opts?.confirmText || 'OK',
    cancelText: opts?.cancelText || '',
    destructive: !!opts?.destructive,
    onConfirm: opts?.onConfirm || null,
    onCancel: opts?.onCancel || null,
  }), []);
  const hideAlert = useCallback(() => setAlertModal((s) => ({ ...s, visible: false })), []);

  const fetchDetail = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    try {
      const rec = await fetchPaymentDetailOdoo(paymentId);
      setRecord(rec);
    } catch (e) {
      console.error('[PaymentDetail] fetch error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useFocusEffect(useCallback(() => { fetchDetail(); }, [fetchDetail]));

  if (loading && !record) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Payment" onBackPress={() => navigation.goBack()} />
        <OverlayLoader visible />
      </SafeAreaView>
    );
  }
  if (!record) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Payment" onBackPress={() => navigation.goBack()} />
        <OfflineBanner message="OFFLINE MODE — changes will sync when you reconnect" onOnline={fetchDetail} />
        <RoundedScrollContainer>
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <Text style={{ color: '#888' }}>Payment not found.</Text>
          </View>
        </RoundedScrollContainer>
      </SafeAreaView>
    );
  }

  const state = (record.state || 'draft').toLowerCase();
  const stateColor = STATE_COLORS[state] || '#999';
  const stateLabel = STATE_LABELS[state] || state.toUpperCase();
  // Draft → "Draft Payment". Everything else → Odoo's real sequence name.
  const isRealName = record.name && record.name !== '/' && !String(record.name).startsWith('DRAFT-');
  const displayName = state === 'draft' && !isRealName ? 'Draft Payment' : (record.name || 'Payment');
  // Button visibility matches Odoo's standard account.payment form:
  //   Validate → available for draft + in_process
  //   Reset to Draft → available for in_process / paid / posted / cancelled
  //   Cancel Payment → available for draft + in_process
  const canValidate = state === 'draft' || state === 'in_process';
  const canResetToDraft = state === 'in_process' || state === 'paid'
    || state === 'posted' || state === 'reconciled' || state === 'cancelled' || state === 'canceled';
  const canCancel = state === 'draft' || state === 'in_process';

  const handleValidate = () => {
    showAlert({
      message: 'Confirm and validate this payment to Odoo?',
      confirmText: 'VALIDATE',
      cancelText: 'CANCEL',
      onConfirm: async () => {
        hideAlert();
        setValidating(true);
        const prevState = state;
        try {
          const res = await postPaymentOdoo(record.id);
          if (res && res.offline) {
            showToastMessage('Validate queued — will post when online');
          } else if (res && res.state && res.state !== prevState) {
            showToastMessage(`Payment is now ${(res.state || '').replace('_', ' ')}`);
          } else {
            showAlert({ message: 'Odoo accepted the request but the state did not change. The payment may be locked or requires reconciliation.' });
          }
          await fetchDetail();
        } catch (err) {
          showAlert({ message: err?.message || 'Failed to validate payment' });
        } finally {
          setValidating(false);
        }
      },
      onCancel: hideAlert,
    });
  };

  const handleResetToDraft = () => {
    showAlert({
      message: 'Move this payment back to Draft state?',
      confirmText: 'RESET',
      cancelText: 'CANCEL',
      onConfirm: async () => {
        hideAlert();
        setResetting(true);
        try {
          const res = await draftPaymentOdoo(record.id);
          if (res && res.offline) {
            showToastMessage('Reset queued — will sync when online');
          } else {
            showToastMessage('Payment reset to Draft');
          }
          await fetchDetail();
        } catch (err) {
          showAlert({ message: err?.message || 'Failed to reset payment' });
        } finally {
          setResetting(false);
        }
      },
      onCancel: hideAlert,
    });
  };

  const handleCancelPayment = () => {
    showAlert({
      message: 'Are you sure you want to cancel this payment?',
      confirmText: 'YES',
      cancelText: 'NO',
      destructive: true,
      onConfirm: async () => {
        hideAlert();
        setCancelling(true);
        try {
          const res = await cancelPaymentOdoo(record.id);
          if (res && res.offline) {
            showToastMessage('Cancel queued — will sync when online');
          } else {
            showToastMessage('Payment cancelled');
          }
          await fetchDetail();
        } catch (err) {
          showAlert({ message: err?.message || 'Failed to cancel payment' });
        } finally {
          setCancelling(false);
        }
      },
      onCancel: hideAlert,
    });
  };

  const row = (label, value) => (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={2}>{value || '-'}</Text>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title={displayName} onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — changes will sync when you reconnect" onOnline={fetchDetail} />

      <RoundedScrollContainer contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        {/* State + amount header */}
        <View style={s.headerCard}>
          <View style={s.headerTopRow}>
            <Text style={s.paymentName}>{displayName}</Text>
            <View style={[s.badge, { backgroundColor: stateColor }]}>
              <Text style={s.badgeText}>{stateLabel}</Text>
            </View>
          </View>
          <Text style={s.amountText}>{currencySymbol} {(record.amount || 0).toFixed(3)}</Text>
          <Text style={s.subText}>
            {record.payment_type === 'outbound' ? 'Vendor Payment' : 'Customer Payment'}
          </Text>
        </View>

        {/* Details */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Payment Details</Text>
          {row(record.payment_type === 'outbound' ? 'Vendor' : 'Customer', record.partner_name)}
          {row('Amount', `${currencySymbol} ${(record.amount || 0).toFixed(3)}`)}
          {row('Date', record.date)}
          {row('Journal', record.journal_name)}
          {row('Memo / Ref', record.memo)}
          {row('Company', record.company_name)}
        </View>

        {/* Signatures */}
        {(record.customer_signature || record.employee_signature) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Signatures</Text>
            {record.customer_signature ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={s.sigLabel}>Customer</Text>
                <Image
                  source={{ uri: `data:image/png;base64,${record.customer_signature}` }}
                  style={s.sigImage}
                  resizeMode="contain"
                />
              </View>
            ) : null}
            {record.employee_signature ? (
              <View>
                <Text style={s.sigLabel}>Employee</Text>
                <Image
                  source={{ uri: `data:image/png;base64,${record.employee_signature}` }}
                  style={s.sigImage}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>
        )}

        {/* Location */}
        {(record.location_name || record.latitude) ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Location</Text>
            {record.location_name ? (
              <View style={s.locationRow}>
                <MaterialIcons name="place" size={18} color={COLORS.primaryThemeColor} />
                <Text style={s.locationText}>{record.location_name}</Text>
              </View>
            ) : null}
            {(record.latitude && record.longitude) ? (
              <Text style={s.coords}>
                {Number(record.latitude).toFixed(6)}, {Number(record.longitude).toFixed(6)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Action buttons — state-driven, matches Odoo's payment form */}
        {canValidate && (
          <View style={{ marginVertical: 8 }}>
            <Button
              backgroundColor="#4CAF50"
              title="Validate"
              onPress={handleValidate}
              loading={validating}
            />
          </View>
        )}
        {canResetToDraft && (
          <View style={{ marginVertical: 8 }}>
            <Button
              backgroundColor="#607D8B"
              title="Reset to Draft"
              onPress={handleResetToDraft}
              loading={resetting}
            />
          </View>
        )}
        {canCancel && (
          <View style={{ marginVertical: 8 }}>
            <Button
              backgroundColor="#F44336"
              title="Cancel Payment"
              onPress={handleCancelPayment}
              loading={cancelling}
            />
          </View>
        )}
      </RoundedScrollContainer>
      <OverlayLoader visible={validating || cancelling || resetting} />

      <StyledAlertModal
        isVisible={alertModal.visible}
        message={alertModal.message}
        confirmText={alertModal.confirmText}
        cancelText={alertModal.cancelText}
        destructive={alertModal.destructive}
        onConfirm={() => { const cb = alertModal.onConfirm; if (cb) cb(); else hideAlert(); }}
        onCancel={() => { const cb = alertModal.onCancel; if (cb) cb(); else hideAlert(); }}
      />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  headerCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  paymentName: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#1B4F72' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: FONT_FAMILY.urbanistBold },
  amountText: { fontSize: 26, fontFamily: FONT_FAMILY.urbanistExtraBold, color: COLORS.primaryThemeColor, marginTop: 4 },
  subText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1 },
  cardTitle: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#1B4F72', marginBottom: 10, letterSpacing: 0.3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666', flex: 1 },
  rowValue: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#222', flex: 1, textAlign: 'right' },
  sigLabel: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#666', marginBottom: 4 },
  sigImage: { width: '100%', height: 140, backgroundColor: '#f5f6fa', borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333' },
  coords: { fontSize: 11, color: '#888', marginTop: 4, fontFamily: FONT_FAMILY.urbanistMedium },
});

export default PaymentDetailScreen;
