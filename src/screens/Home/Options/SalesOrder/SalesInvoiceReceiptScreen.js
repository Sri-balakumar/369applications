import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Platform, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchInvoiceDetailOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';
import { useAuthStore } from '@stores/auth';
import { showToastMessage } from '@components/Toast';

const SalesInvoiceReceiptScreen = ({ navigation, route }) => {
  const { invoiceId } = route?.params || {};
  const currency = useCurrencyStore((state) => state.currency) || 'OMR';
  const currentUser = useAuthStore(state => state.user);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoiceDetailOdoo(invoiceId).then(data => {
        setInvoice(data);
      }).catch(err => {
        console.error('Failed to fetch invoice:', err);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [invoiceId]);

  const cashierName = currentUser?.name || currentUser?.username || currentUser?.login || 'Admin';

  const handlePrint = async () => {
    try {
      if (!invoice) return;
      const linesSummary = invoice.lines.map((l, i) =>
        `${i + 1}. ${l.productName}  Qty: ${l.quantity}  Price: ${l.priceUnit.toFixed(3)}  Total: ${l.subtotal.toFixed(3)}`
      ).join('\n');
      const message = `INVOICE: ${invoice.name}\nDate: ${invoice.invoiceDate}\nCustomer: ${invoice.partnerName}\nCompany: ${invoice.companyName}\n\n--- Products ---\n${linesSummary}\n\nSubtotal: ${invoice.amountUntaxed.toFixed(3)} ${currency}\nTax: ${invoice.amountTax.toFixed(3)} ${currency}\nGrand Total: ${invoice.amountTotal.toFixed(3)} ${currency}\n\nCashier: ${cashierName}`;
      await Share.share({ message, title: `Invoice ${invoice.name}` });
    } catch (err) {
      console.error('Share error:', err);
      showToastMessage('Failed to share invoice');
    }
  };

  if (loading) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Invoice" onBackPress={() => navigation.goBack()} logo={false} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />
        </View>
      </SafeAreaView>
    );
  }

  if (!invoice) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Invoice" onBackPress={() => navigation.goBack()} logo={false} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#999', fontSize: 16 }}>Invoice not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f6fa' }}>
      <NavigationHeader title={invoice.name || 'Invoice'} onBackPress={() => navigation.goBack()} logo={false} />
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.receiptCard}>
          {/* Header */}
          <View style={s.headerRow}>
            <Text style={s.dateText}>Date: {invoice.invoiceDate}</Text>
            <Text style={s.invoiceNo}>{invoice.name}</Text>
          </View>
          <Text style={s.infoText}>Cashier: {cashierName}</Text>
          <Text style={s.infoText}>Customer: {invoice.partnerName}</Text>
          <Text style={s.infoText}>Company: {invoice.companyName}</Text>

          <View style={s.divider} />

          {/* Table Header */}
          <View style={s.tableHeader}>
            <Text style={[s.thCell, { flex: 2.5 }]}>Product Name</Text>
            <Text style={[s.thCell, { flex: 0.7 }]}>Qty</Text>
            <Text style={[s.thCell, { flex: 1 }]}>Unit</Text>
            <Text style={[s.thCell, { flex: 0.7 }]}>Disc</Text>
            <Text style={[s.thCell, { flex: 1 }]}>Total</Text>
          </View>

          {/* Product Rows */}
          {invoice.lines.map((line, idx) => (
            <View key={line.id || idx} style={s.tableRow}>
              <Text style={[s.tdCell, { flex: 2.5 }]} numberOfLines={2}>{idx + 1}. {line.productName}</Text>
              <Text style={[s.tdCell, { flex: 0.7, textAlign: 'center' }]}>{line.quantity}</Text>
              <Text style={[s.tdCell, { flex: 1, textAlign: 'right' }]}>{line.priceUnit.toFixed(3)}</Text>
              <Text style={[s.tdCell, { flex: 0.7, textAlign: 'center' }]}>{line.discount > 0 ? line.discount + '%' : '0'}</Text>
              <Text style={[s.tdCell, { flex: 1, textAlign: 'right' }]}>{line.subtotal.toFixed(3)}</Text>
            </View>
          ))}

          <View style={s.divider} />

          {/* Summary */}
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Subtotal</Text>
            <Text style={s.summaryValue}>{invoice.amountUntaxed.toFixed(3)} {currency}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Tax</Text>
            <Text style={s.summaryValue}>{invoice.amountTax.toFixed(3)} {currency}</Text>
          </View>

          <View style={s.divider} />

          <View style={s.grandTotalRow}>
            <Text style={s.grandTotalLabel}>Grand Total</Text>
            <Text style={s.grandTotalValue}>{invoice.amountTotal.toFixed(3)} {currency}</Text>
          </View>

          <View style={s.divider} />

          {/* Payment Details */}
          <Text style={s.paymentTitle}>Payment Details</Text>
          <View style={s.summaryRow}>
            <Text style={s.paymentLabel}>Cash:</Text>
            <Text style={s.paymentValue}>{invoice.amountTotal.toFixed(3)} {currency}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.paymentLabel}>Change:</Text>
            <Text style={s.paymentValue}>0</Text>
          </View>
        </View>

        {/* Print/Share Button */}
        <View style={s.buttonContainer}>
          <Button
            backgroundColor="#333"
            title="Print / Share Invoice"
            onPress={handlePrint}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { padding: 16 },
  receiptCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
    }),
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dateText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333' },
  invoiceNo: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },
  infoText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#555', marginBottom: 2 },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 12 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#333', paddingBottom: 6 },
  thCell: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#333', textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tdCell: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#555' },
  summaryValue: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  grandTotalLabel: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f' },
  grandTotalValue: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistExtraBold, color: COLORS.primaryThemeColor },
  paymentTitle: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f', textAlign: 'center', marginBottom: 8 },
  paymentLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#555' },
  paymentValue: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#333' },
  buttonContainer: { marginTop: 20 },
});

export default SalesInvoiceReceiptScreen;
