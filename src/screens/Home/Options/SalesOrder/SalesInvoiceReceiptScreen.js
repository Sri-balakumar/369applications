import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Platform, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchInvoiceDetailOdoo, fetchSaleOrderDetailOdoo } from '@api/services/generalApi';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCurrencyStore } from '@stores/currency';
import { useAuthStore } from '@stores/auth';
import { showToastMessage } from '@components/Toast';

const SalesInvoiceReceiptScreen = ({ navigation, route }) => {
  const { invoiceId, orderId, orderData } = route?.params || {};
  const currency = useCurrencyStore((state) => state.currency) || 'OMR';
  const currentUser = useAuthStore(state => state.user);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper: build invoice object from sale order data
  const buildFromOrderData = (od) => ({
    id: invoiceId,
    name: od.name || '',
    partnerName: od.partnerName || '-',
    companyName: od.companyName || '-',
    invoiceDate: od.invoiceDate || '-',
    amountUntaxed: od.amountUntaxed || 0,
    amountTax: od.amountTax || 0,
    amountTotal: od.amountTotal || 0,
    lines: od.lines || [],
  });

  // Helper: build invoice object from raw sale order record
  const buildFromSaleOrder = (record) => ({
    id: invoiceId,
    name: record.name || '',
    partnerName: Array.isArray(record.partner_id) ? record.partner_id[1] : '-',
    companyName: Array.isArray(record.company_id) ? record.company_id[1] : '-',
    invoiceDate: record.date_order ? record.date_order.split(' ')[0] : '-',
    amountUntaxed: record.amount_untaxed || 0,
    amountTax: record.amount_tax || 0,
    amountTotal: record.amount_total || 0,
    lines: (record.order_lines_detail || [])
      .filter(l => !(l.name || '').toLowerCase().includes('down payment'))
      .map(l => ({
        id: l.id,
        productName: Array.isArray(l.product_id) ? l.product_id[1] : (l.name || '-'),
        quantity: l.product_uom_qty || 0,
        priceUnit: l.price_unit || 0,
        discount: l.discount || 0,
        subtotal: l.price_subtotal || 0,
      })),
  });

  useEffect(() => {
    const loadInvoice = async () => {
      // TIER 1: Use orderData passed from navigation
      if (orderData && orderData.lines && orderData.lines.length > 0) {
        console.log('[Invoice] TIER 1: Using orderData from navigation -', orderData.lines.length, 'lines');
        setInvoice(buildFromOrderData(orderData));
        setLoading(false);
        return;
      }
      console.log('[Invoice] TIER 1 skipped: orderData has', orderData?.lines?.length || 0, 'lines');

      // TIER 2: Fetch invoice from Odoo
      if (invoiceId) {
        try {
          const data = await fetchInvoiceDetailOdoo(invoiceId);
          console.log('[Invoice] TIER 2: Fetched invoice from Odoo -', data?.lines?.length || 0, 'lines');
          if (data && data.lines && data.lines.length > 0) {
            setInvoice(data);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('[Invoice] TIER 2 failed:', err?.message);
        }
      }

      // TIER 3: Fetch sale order directly and use its lines
      if (orderId) {
        try {
          console.log('[Invoice] TIER 3: Fetching sale order', orderId, 'directly');
          const soRecord = await fetchSaleOrderDetailOdoo(orderId);
          if (soRecord && soRecord.order_lines_detail && soRecord.order_lines_detail.length > 0) {
            console.log('[Invoice] TIER 3: Got', soRecord.order_lines_detail.length, 'lines from sale order');
            setInvoice(buildFromSaleOrder(soRecord));
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('[Invoice] TIER 3 failed:', err?.message);
        }
      }

      // FALLBACK: If we have orderData with amounts but no lines, still show the invoice
      if (orderData && (orderData.amountTotal > 0 || orderData.name)) {
        console.log('[Invoice] FALLBACK: Using orderData with 0 lines but has header/totals');
        setInvoice(buildFromOrderData(orderData));
      } else {
        console.warn('[Invoice] All tiers failed - no product data available');
      }
      setLoading(false);
    };

    loadInvoice();
  }, [invoiceId, orderId]);

  const cashierName = currentUser?.name || currentUser?.username || currentUser?.login || 'Admin';

  const handlePrint = async () => {
    try {
      if (!invoice) return;
      const linesSummary = invoice.lines.map((l, i) =>
        `${i + 1}. ${l.productName}  Qty: ${l.quantity}  Price: ${l.priceUnit.toFixed(3)}  Total: ${l.subtotal.toFixed(3)}`
      ).join('\n');
      const message = `INVOICE: ${invoice.name}\nDate: ${invoice.invoiceDate}\nCustomer: ${invoice.partnerName}\nCompany: ${invoice.companyName}\n\n--- Products ---\n${linesSummary}\n\nTotal: ${invoice.amountTotal.toFixed(3)} ${currency}\n\nCashier: ${cashierName}`;
      await Share.share({ message, title: `Invoice ${invoice.name}` });
    } catch (err) {
      console.error('Share error:', err);
      showToastMessage('Failed to share invoice');
    }
  };

  const [downloading, setDownloading] = useState(false);
  const handleDownloadPdf = async () => {
    if (!invoice) {
      showToastMessage('Invoice data not available');
      return;
    }
    setDownloading(true);
    try {
      // Build product rows HTML
      const rowsHtml = (invoice.lines || []).map((line, idx) =>
        `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;">${idx + 1}. ${line.productName || '-'}</td>
          <td style="text-align:center;padding:8px;">${line.quantity || 0}</td>
          <td style="text-align:right;padding:8px;">${(line.priceUnit || 0).toFixed(3)}</td>
          <td style="text-align:center;padding:8px;">${line.discount > 0 ? line.discount + '%' : '0'}</td>
          <td style="text-align:right;padding:8px;">${(line.subtotal || 0).toFixed(3)}</td>
        </tr>`
      ).join('');

      const html = `
        <html>
        <head><meta charset="utf-8"/><style>
          body { font-family: Arial, sans-serif; color: #333; padding: 20px; }
          h2 { color: #2e2a4f; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 15px; }
          .info td { font-size: 12px; padding: 2px 0; }
          .products th { text-align: center; padding: 8px; border-bottom: 2px solid #333; background: #f5f5f5; font-size: 12px; }
          .products td { font-size: 12px; }
          .total-box { text-align: right; margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 8px; }
          .grand { font-size: 18px; font-weight: bold; color: #e85d04; }
          .footer { text-align: center; margin-top: 30px; color: #999; font-size: 10px; border-top: 1px solid #ddd; padding-top: 15px; }
        </style></head>
        <body>
          <div class="header">
            <h2>${invoice.companyName || 'Company'}</h2>
          </div>
          <h3 style="text-align:center;color:#2e2a4f;">INVOICE</h3>
          <table class="info" style="margin-bottom:15px;">
            <tr>
              <td><strong>Date:</strong> ${invoice.invoiceDate || '-'}</td>
              <td style="text-align:right;"><strong>Invoice:</strong> ${invoice.name || '-'}</td>
            </tr>
            <tr>
              <td><strong>Cashier:</strong> ${cashierName}</td>
              <td style="text-align:right;"><strong>Company:</strong> ${invoice.companyName || '-'}</td>
            </tr>
            <tr><td><strong>Customer:</strong> ${invoice.partnerName || '-'}</td></tr>
          </table>
          <hr/>
          <table class="products" style="margin:15px 0;">
            <thead><tr>
              <th style="text-align:left;width:40%;">Product Name</th>
              <th style="width:12%;">Qty</th>
              <th style="text-align:right;width:16%;">Unit Price</th>
              <th style="width:12%;">Disc</th>
              <th style="text-align:right;width:20%;">Total</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <hr/>
          <div class="total-box">
            <span class="grand">Grand Total: ${(invoice.amountTotal || 0).toFixed(3)} ${currency}</span>
          </div>
          <hr/>
          <div style="text-align:center;margin:15px 0;">
            <h4 style="color:#2e2a4f;">Payment Details</h4>
            <table style="width:50%;margin:0 auto;font-size:12px;">
              <tr><td style="color:#666;">Cash:</td><td style="text-align:right;font-weight:bold;">${(invoice.amountTotal || 0).toFixed(3)} ${currency}</td></tr>
              <tr><td style="color:#666;">Change:</td><td style="text-align:right;font-weight:bold;">0</td></tr>
            </table>
          </div>
          <div class="footer">
            <p>Thank you for your business!</p>
            <p>Generated from 369ai Biz Mobile App</p>
          </div>
        </body></html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      console.log('[DownloadPDF] PDF created at:', uri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } else {
        showToastMessage('PDF saved successfully');
      }
    } catch (err) {
      console.error('[DownloadPDF] error:', err);
      showToastMessage('Failed to generate PDF');
    } finally {
      setDownloading(false);
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

        <View style={{ marginTop: 10 }}>
          <Button
            backgroundColor="#E85D04"
            title={downloading ? "Downloading..." : "Download PDF"}
            onPress={handleDownloadPdf}
            loading={downloading}
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
