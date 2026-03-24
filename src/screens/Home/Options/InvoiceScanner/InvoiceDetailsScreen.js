import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { DetailField } from '@components/common/Detail';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import SignaturePad from '@components/SignaturePad';
import usePaymentSignatureLocation from '@hooks/usePaymentSignatureLocation';
import { createPaymentWithSignatureOdoo } from '@api/services/generalApi';
import { showToastMessage } from '@components/Toast';

const formatState = (state) => {
  const map = { draft: 'Draft', posted: 'Posted', cancel: 'Cancelled' };
  return map[state] || state || '-';
};

const formatPaymentState = (ps) => {
  const map = { not_paid: 'Not Paid', in_payment: 'In Payment', paid: 'Paid', partial: 'Partially Paid', reversed: 'Reversed' };
  return map[ps] || ps || '-';
};

const formatMoveType = (mt) => {
  const map = { out_invoice: 'Customer Invoice', in_invoice: 'Vendor Bill', out_refund: 'Credit Note', in_refund: 'Vendor Credit Note', entry: 'Journal Entry' };
  return map[mt] || mt || '-';
};

const formatAmount = (amount, currency) => {
  if (amount === null || amount === undefined) return '-';
  const formatted = Number(amount).toFixed(2);
  return currency ? `${currency} ${formatted}` : formatted;
};

const InvoiceDetailsScreen = ({ navigation, route }) => {
  const { invoice } = route?.params || {};
  const [paymentAmount, setPaymentAmount] = useState(invoice?.amount_residual?.toString() || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    signatureBase64,
    setSignatureBase64,
    scrollEnabled,
    setScrollEnabled,
    captureLocation,
  } = usePaymentSignatureLocation();

  const handleRegisterPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      showToastMessage('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const location = await captureLocation();

      await createPaymentWithSignatureOdoo({
        partnerId: invoice.partner_id || null,
        amount,
        paymentType: invoice.move_type === 'in_invoice' ? 'outbound' : 'inbound',
        ref: invoice.name || '',
        customerSignature: signatureBase64 || null,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        locationName: location?.locationName || '',
      });

      showToastMessage('Payment registered successfully');
      navigation.goBack();
    } catch (error) {
      console.error('Register payment error:', error);
      showToastMessage('Failed to register payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!invoice) {
    return (
      <SafeAreaView backgroundColor={COLORS.white}>
        <NavigationHeader title="Invoice Details" color={COLORS.black} backgroundColor={COLORS.white} onBackPress={() => navigation.goBack()} />
        <RoundedScrollContainer>
          <Text style={styles.noDataText}>No invoice data available.</Text>
        </RoundedScrollContainer>
      </SafeAreaView>
    );
  }

  const currency = invoice.currency_name || '';
  const isPaid = invoice.payment_state === 'paid';

  const renderLineItem = ({ item, index }) => (
    <View style={styles.lineItemContainer}>
      <Text style={styles.lineItemIndex}>{index + 1}.</Text>
      <View style={styles.lineItemContent}>
        <Text style={styles.lineItemProduct}>
          {item.product_name || item.description || 'N/A'}
        </Text>
        <View style={styles.lineItemRow}>
          <Text style={styles.lineItemLabel}>
            Qty: {item.quantity}  x  {formatAmount(item.price_unit, '')}
          </Text>
          <Text style={styles.lineItemSubtotal}>
            {formatAmount(item.price_subtotal, currency)}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader
        title={invoice.name || 'Invoice Details'}
        color={COLORS.black}
        backgroundColor={COLORS.white}
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer scrollEnabled={scrollEnabled}>
        <DetailField label="Invoice Number" value={invoice.name || '-'} />
        <DetailField label="Type" value={formatMoveType(invoice.move_type)} />
        <DetailField label="Customer" value={invoice.partner_name || '-'} />
        <DetailField label="Invoice Date" value={invoice.invoice_date || '-'} />
        <DetailField label="Due Date" value={invoice.invoice_date_due || '-'} />
        <DetailField label="Reference" value={invoice.ref || '-'} />
        <DetailField label="Status" value={formatState(invoice.state)} />
        <DetailField label="Payment Status" value={formatPaymentState(invoice.payment_state)} />
        <DetailField label="Currency" value={currency || '-'} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Amount Summary</Text>
        </View>
        <DetailField label="Untaxed Amount" value={formatAmount(invoice.amount_untaxed, currency)} />
        <DetailField label="Tax" value={formatAmount(invoice.amount_tax, currency)} />
        <DetailField label="Total" value={formatAmount(invoice.amount_total, currency)} />
        <DetailField label="Amount Due" value={formatAmount(invoice.amount_residual, currency)} />

        {invoice.invoice_lines && invoice.invoice_lines.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Invoice Lines ({invoice.invoice_lines.length})
              </Text>
            </View>
            <FlatList
              data={invoice.invoice_lines}
              renderItem={renderLineItem}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
            />
          </>
        )}

        {!isPaid && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Register Payment</Text>
            </View>
            <FormInput
              label="Payment Amount"
              placeholder="Enter amount"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="decimal-pad"
            />
            <SignaturePad
              setUrl={() => {}}
              setScrollEnabled={setScrollEnabled}
              title="Customer Signature"
              onSignatureBase64={setSignatureBase64}
            />
            <LoadingButton
              title="Register Payment"
              onPress={handleRegisterPayment}
              loading={isSubmitting}
              style={styles.payButton}
            />
          </>
        )}
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  noDataText: { textAlign: 'center', marginTop: 40, fontSize: 16, color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium },
  sectionHeader: { marginTop: 20, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#dadada', paddingBottom: 5 },
  sectionTitle: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },
  lineItemContainer: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
  lineItemIndex: { width: 24, fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: COLORS.gray },
  lineItemContent: { flex: 1 },
  lineItemProduct: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: COLORS.black, marginBottom: 4 },
  lineItemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  lineItemLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistRegular, color: COLORS.gray },
  lineItemSubtotal: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: COLORS.primaryThemeColor },
  payButton: { marginTop: 16, marginBottom: 20 },
});

export default InvoiceDetailsScreen;
