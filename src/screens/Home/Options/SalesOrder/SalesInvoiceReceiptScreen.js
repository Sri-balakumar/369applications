import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Platform, ActivityIndicator, Share, TextInput, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchInvoiceDetailOdoo, fetchSaleOrderDetailOdoo, fetchPartnerPhoneOdoo } from '@api/services/generalApi';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useCurrencyStore } from '@stores/currency';
import { useAuthStore } from '@stores/auth';
import { showToastMessage } from '@components/Toast';
import { INVOICE_LOGO_BASE64 } from '@constants/invoiceLogo';
import { sendWhatsAppDocument } from '@api/services/whatsappApi';
import { COUNTRIES, getMaxDigits, parsePhoneCountryCode, CountryCodePicker } from '@screens/Home/Options/WhatsApp/ContactsSheet';

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
    partnerId: od.partnerId || null,
    partnerName: od.partnerName || '-',
    partnerPhone: od.partnerPhone || '',
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
    partnerId: Array.isArray(record.partner_id) ? record.partner_id[0] : null,
    partnerName: Array.isArray(record.partner_id) ? record.partner_id[1] : '-',
    partnerPhone: '',
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

  // Get partner phone — use from orderData first, then fetch from Odoo as fallback
  const [partnerPhone, setPartnerPhone] = useState('');
  useEffect(() => {
    if (!invoice) return;
    // Use phone from orderData if available
    if (invoice.partnerPhone) {
      console.log('[Invoice] Phone from orderData:', invoice.partnerPhone);
      setPartnerPhone(invoice.partnerPhone);
    }
    // Also try to fetch from Odoo (may update with better data)
    if (invoice.partnerId) {
      console.log('[Invoice] Fetching phone for partnerId:', invoice.partnerId);
      fetchPartnerPhoneOdoo(invoice.partnerId).then(phone => {
        console.log('[Invoice] Fetched phone from Odoo:', phone);
        if (phone) setPartnerPhone(phone);
      }).catch(e => console.warn('[Invoice] Phone fetch error:', e?.message));
    }
  }, [invoice]);

  const cashierName = currentUser?.name || currentUser?.username || currentUser?.login || 'Admin';

  const handlePrint = async () => {
    try {
      if (!invoice) return;
      const linesSummary = invoice.lines.map((l, i) =>
        `${i + 1}. ${l.productName}  Qty: ${l.quantity}  Price: ${l.priceUnit.toFixed(3)}  Total: ${l.subtotal.toFixed(3)}`
      ).join('\n');
      const message = `INVOICE: ${invoice.name}\nDate: ${invoice.invoiceDate}\nCustomer: ${invoice.partnerName}${partnerPhone ? '\nPhone: ' + partnerPhone : ''}\nCompany: ${invoice.companyName}\n\n--- Products ---\n${linesSummary}\n\nTotal: ${invoice.amountTotal.toFixed(3)} ${currency}\n\nCashier: ${cashierName}`;
      await Share.share({ message, title: `Invoice ${invoice.name}` });
    } catch (err) {
      console.error('Share error:', err);
      showToastMessage('Failed to share invoice');
    }
  };

  const [downloading, setDownloading] = useState(false);
  const [sendingWA, setSendingWA] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waCountryCode, setWaCountryCode] = useState('+968');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
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
            <img src="${INVOICE_LOGO_BASE64}" style="width:120px;height:auto;margin-bottom:8px;" />
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
            ${partnerPhone ? `<tr><td><strong>Phone:</strong> ${partnerPhone}</td></tr>` : ''}
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

      const sanitizedName = (invoice.name || 'Invoice').replace(/[^a-zA-Z0-9\-_]/g, '_');
      const fileName = `Invoice_${sanitizedName}_${Date.now()}.pdf`;

      if (Platform.OS === 'android') {
        const SAF = FileSystem.StorageAccessFramework;
        const permissions = await SAF.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const safUri = await SAF.createFileAsync(
            permissions.directoryUri,
            fileName,
            'application/pdf'
          );
          await FileSystem.writeAsStringAsync(safUri, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          showToastMessage('PDF saved: ' + fileName);
        } else {
          showToastMessage('Storage permission denied');
        }
      } else {
        const destUri = FileSystem.documentDirectory + fileName;
        await FileSystem.copyAsync({ from: uri, to: destUri });
        await Sharing.shareAsync(destUri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
        });
        showToastMessage('PDF saved: ' + fileName);
      }
    } catch (err) {
      console.error('[DownloadPDF] error:', err);
      showToastMessage('Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  // Try to auto-fetch phone, if not found show modal
  const handleWhatsAppTap = async () => {
    if (!invoice) return;
    setSendingWA(true);
    try {
      // Try to fetch partner phone from Odoo
      const phone = invoice.partnerId ? await fetchPartnerPhoneOdoo(invoice.partnerId) : null;
      if (phone && phone.trim()) {
        // Phone found — send directly
        await doSendWhatsApp(phone.trim());
      } else {
        // No phone — show modal for manual entry
        setSendingWA(false);
        setShowPhoneModal(true);
      }
    } catch (e) {
      setSendingWA(false);
      setShowPhoneModal(true);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!waPhone.trim()) {
      showToastMessage('Enter phone number');
      return;
    }
    setShowPhoneModal(false);
    const fullPhone = `${waCountryCode}${waPhone.trim()}`;
    setSendingWA(true);
    await doSendWhatsApp(fullPhone);
  };

  const doSendWhatsApp = async (phone) => {
    try {
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
        <html><head><meta charset="utf-8"/><style>
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
        </style></head><body>
          <div class="header">
            <img src="${INVOICE_LOGO_BASE64}" style="width:120px;height:auto;margin-bottom:8px;" />
            <h2>${invoice.companyName || 'Company'}</h2>
          </div>
          <h3 style="text-align:center;color:#2e2a4f;">INVOICE</h3>
          <table class="info" style="margin-bottom:15px;">
            <tr><td><strong>Date:</strong> ${invoice.invoiceDate || '-'}</td><td style="text-align:right;"><strong>Invoice:</strong> ${invoice.name || '-'}</td></tr>
            <tr><td><strong>Cashier:</strong> ${cashierName}</td><td style="text-align:right;"><strong>Company:</strong> ${invoice.companyName || '-'}</td></tr>
            <tr><td><strong>Customer:</strong> ${invoice.partnerName || '-'}</td></tr>
            ${partnerPhone ? `<tr><td><strong>Phone:</strong> ${partnerPhone}</td></tr>` : ''}
          </table><hr/>
          <table class="products" style="margin:15px 0;">
            <thead><tr><th style="text-align:left;width:40%;">Product Name</th><th style="width:12%;">Qty</th><th style="text-align:right;width:16%;">Unit Price</th><th style="width:12%;">Disc</th><th style="text-align:right;width:20%;">Total</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table><hr/>
          <div class="total-box"><span class="grand">Grand Total: ${(invoice.amountTotal || 0).toFixed(3)} ${currency}</span></div><hr/>
          <div style="text-align:center;margin:15px 0;">
            <h4 style="color:#2e2a4f;">Payment Details</h4>
            <table style="width:50%;margin:0 auto;font-size:12px;">
              <tr><td style="color:#666;">Cash:</td><td style="text-align:right;font-weight:bold;">${(invoice.amountTotal || 0).toFixed(3)} ${currency}</td></tr>
            </table>
          </div>
          <div class="footer"><p>Thank you for your business!</p><p>Generated from 369ai Biz Mobile App</p></div>
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const fileName = `Invoice_${(invoice.name || 'INV').replace(/[^a-zA-Z0-9\-_]/g, '_')}.pdf`;
      await sendWhatsAppDocument(phone, base64Data, fileName, `Invoice ${invoice.name || ''}`);
      showToastMessage('Invoice sent via WhatsApp!');
    } catch (err) {
      console.error('[SendWhatsApp] error:', err);
      showToastMessage('Failed to send: ' + err.message);
    } finally {
      setSendingWA(false);
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
          {partnerPhone ? <Text style={s.infoText}>Phone: {partnerPhone}</Text> : null}
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

        <View style={{ marginTop: 10 }}>
          <Button
            backgroundColor="#25D366"
            title={sendingWA ? "Sending..." : "Send WhatsApp"}
            onPress={handleWhatsAppTap}
            loading={sendingWA}
          />
        </View>

        {/* Phone Number Modal (shown only when customer has no phone) */}
        <Modal visible={showPhoneModal} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Send Invoice via WhatsApp</Text>
              <Text style={s.modalLabel}>Customer Phone Number</Text>
              <View style={s.modalPhoneRow}>
                <TouchableOpacity style={s.modalCountryBtn} onPress={() => setShowCountryPicker(true)}>
                  <Text style={s.modalCountryText}>{waCountryCode} ▼</Text>
                </TouchableOpacity>
                <TextInput
                  style={[s.modalInput, { flex: 1 }]}
                  placeholder="Phone number"
                  placeholderTextColor="#999"
                  value={waPhone}
                  onChangeText={(v) => setWaPhone(v.replace(/[^0-9]/g, ''))}
                  keyboardType="phone-pad"
                  maxLength={getMaxDigits(waCountryCode)}
                  autoFocus
                />
              </View>
              <Text style={s.modalHint}>{getMaxDigits(waCountryCode)} digits without country code</Text>
              <View style={s.modalBtnRow}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowPhoneModal(false)}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalSendBtn} onPress={handleSendWhatsApp}>
                  <Text style={s.modalSendText}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <CountryCodePicker
          visible={showCountryPicker}
          onClose={() => setShowCountryPicker(false)}
          onSelect={(dial) => setWaCountryCode(dial)}
          selectedDial={waCountryCode}
        />

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
  // WhatsApp phone modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '85%', maxWidth: 360 },
  modalTitle: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#1f2937', marginBottom: 16, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#555', marginBottom: 6 },
  modalInput: { backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1f2937', marginBottom: 20 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  modalCancelText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#6b7280' },
  modalSendBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#25D366' },
  modalSendText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' },
  modalPhoneRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  modalCountryBtn: { backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 10, paddingVertical: 12, justifyContent: 'center', alignItems: 'center', minWidth: 80 },
  modalCountryText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#1f2937' },
  modalHint: { fontSize: 11, color: '#25D366', fontStyle: 'italic', marginBottom: 16 },
});

export default SalesInvoiceReceiptScreen;
