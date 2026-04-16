import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Platform, ActivityIndicator, Share, TextInput, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchInvoiceDetailOdoo, fetchSaleOrderDetailOdoo, fetchPartnerPhoneOdoo, fetchPartnerIdFromInvoice, fetchPartnerIdFromOrder, fetchCustomersOdoo, fetchCompanyNameOdoo } from '@api/services/generalApi';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useCurrencyStore } from '@stores/currency';
import { useAuthStore } from '@stores/auth';
import { showToastMessage } from '@components/Toast';
import { INVOICE_LOGO_BASE64 } from '@constants/invoiceLogo';
import { sendWhatsAppDocument } from '@api/services/whatsappApi';
import { COUNTRIES, getMaxDigits, parsePhoneCountryCode, CountryCodePicker } from '@screens/Home/Options/WhatsApp/ContactsSheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PrintReceiptButton from '@components/TSPLPrinter/PrintReceiptButton';
import { WebView } from 'react-native-webview';
import { isOnline } from '@utils/networkStatus';
import { Alert } from 'react-native';
import OfflineBanner from '@components/common/OfflineBanner';

const INV_COUNTER_KEY = 'inv_counter_s';
const INV_MAP_KEY = 'inv_map_s';
const INV_START = 10003;

// Look up S number, or assign one if not found (for direct invoice flow)
const getOrAssignSNumber = async (id) => {
  if (!id) return null;
  const key = String(id);
  const mapRaw = await AsyncStorage.getItem(INV_MAP_KEY);
  const map = mapRaw ? JSON.parse(mapRaw) : {};
  if (map[key]) return map[key];
  // Not found - assign next number (direct invoice flow)
  let maxUsed = INV_START - 1;
  for (const val of Object.values(map)) {
    const num = parseInt(String(val).replace('S', ''), 10);
    if (!isNaN(num) && num > maxUsed) maxUsed = num;
  }
  const counterRaw = await AsyncStorage.getItem(INV_COUNTER_KEY);
  const storedCounter = counterRaw ? parseInt(counterRaw, 10) : INV_START;
  const nextNumber = Math.max(maxUsed + 1, storedCounter);
  const sNumber = `S${nextNumber}`;
  map[key] = sNumber;
  await AsyncStorage.setItem(INV_MAP_KEY, JSON.stringify(map));
  await AsyncStorage.setItem(INV_COUNTER_KEY, String(nextNumber + 1));
  return sNumber;
};

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
    invoiceDate: record.date_order ? record.date_order.split(' ')[0].split('-').reverse().join('-') : '-',
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
      let invoiceData = null;

      // TIER 1: Use orderData passed from navigation
      if (orderData && orderData.lines && orderData.lines.length > 0) {
        console.log('[Invoice] TIER 1: Using orderData from navigation -', orderData.lines.length, 'lines');
        invoiceData = buildFromOrderData(orderData);
      }

      // TIER 2: Fetch invoice from Odoo
      if (!invoiceData && invoiceId) {
        try {
          const data = await fetchInvoiceDetailOdoo(invoiceId);
          console.log('[Invoice] TIER 2: Fetched invoice from Odoo -', data?.lines?.length || 0, 'lines');
          if (data && data.lines && data.lines.length > 0) {
            invoiceData = data;
          }
        } catch (err) {
          console.error('[Invoice] TIER 2 failed:', err?.message);
        }
      }

      // TIER 3: Fetch sale order directly and use its lines
      if (!invoiceData && orderId) {
        try {
          console.log('[Invoice] TIER 3: Fetching sale order', orderId, 'directly');
          const soRecord = await fetchSaleOrderDetailOdoo(orderId);
          if (soRecord && soRecord.order_lines_detail && soRecord.order_lines_detail.length > 0) {
            console.log('[Invoice] TIER 3: Got', soRecord.order_lines_detail.length, 'lines from sale order');
            invoiceData = buildFromSaleOrder(soRecord);
          }
        } catch (err) {
          console.error('[Invoice] TIER 3 failed:', err?.message);
        }
      }

      // FALLBACK
      if (!invoiceData && orderData && (orderData.amountTotal > 0 || orderData.name)) {
        console.log('[Invoice] FALLBACK: Using orderData with 0 lines but has header/totals');
        invoiceData = buildFromOrderData(orderData);
      }

      if (invoiceData) {
        // Get S number - look up existing or assign new one
        const primaryId = orderId || invoiceId || invoiceData.id;
        const sNum = await getOrAssignSNumber(primaryId);
        if (sNum) {
          invoiceData.name = sNum;
          // Also store by both keys so both screens find it
          if (orderId && invoiceId && String(orderId) !== String(invoiceId)) {
            const mapRaw = await AsyncStorage.getItem(INV_MAP_KEY);
            const map = mapRaw ? JSON.parse(mapRaw) : {};
            map[String(orderId)] = sNum;
            map[String(invoiceId)] = sNum;
            await AsyncStorage.setItem(INV_MAP_KEY, JSON.stringify(map));
          }
        }
        // Fetch company name from Odoo if missing
        if (!invoiceData.companyName || invoiceData.companyName === '-') {
          try {
            const compName = await fetchCompanyNameOdoo();
            if (compName) invoiceData.companyName = compName;
          } catch (e) { /* ignore */ }
        }

        setInvoice(invoiceData);

        // Get phone from passed data first
        let phone = invoiceData.partnerPhone || orderData?.partnerPhone || '';

        // If no phone, fetch from customers list by name (same API that shows phones in customer list)
        if (!phone && invoiceData.partnerName && invoiceData.partnerName !== '-') {
          try {
            const customers = await fetchCustomersOdoo({ searchText: invoiceData.partnerName, limit: 1 });
            if (customers && customers.length > 0) {
              phone = customers[0].phone || '';
            }
          } catch (e) { /* ignore */ }
        }

        setPartnerPhone(phone);
      } else {
        console.warn('[Invoice] All tiers failed - no product data available');
      }
      setLoading(false);
    };

    loadInvoice();
  }, [invoiceId, orderId]);

  const [partnerPhone, setPartnerPhone] = useState('');

  const cashierName = currentUser?.name || currentUser?.username || currentUser?.login || 'Admin';

  const guardOnlineOnly = async (actionLabel) => {
    const online = await isOnline();
    if (!online) {
      Alert.alert(
        'You\'re Offline',
        `Can't ${actionLabel} right now. Please try again once you're connected to the internet.`
      );
      return false;
    }
    return true;
  };

  const handlePrint = async () => {
    if (!(await guardOnlineOnly('share the invoice'))) return;
    try {
      if (!invoice) return;
      const linesSummary = invoice.lines.map((l, i) =>
        `${i + 1}. ${l.productName}  Qty: ${l.quantity}  Price: ${l.priceUnit.toFixed(3)}  Total: ${l.subtotal.toFixed(3)}`
      ).join('\n');
      const phoneDisplay = partnerPhone || invoice?.partnerPhone || '';
      const message = `INVOICE: ${invoice.name}\nDate: ${invoice.invoiceDate}\nCustomer: ${invoice.partnerName}${phoneDisplay ? '\nPhone: ' + phoneDisplay : ''}\nCompany: ${invoice.companyName}\n\n--- Products ---\n${linesSummary}\n\nTotal: ${invoice.amountTotal.toFixed(3)} ${currency}\n\nCashier: ${cashierName}`;
      await Share.share({ message, title: `Invoice ${invoice.name}` });
    } catch (err) {
      console.error('Share error:', err);
      showToastMessage('Failed to share invoice');
    }
  };

  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sendingWA, setSendingWA] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waCountryCode, setWaCountryCode] = useState('+968');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const buildInvoiceHtml = () => {
    const rowsHtml = (invoice.lines || []).map((line, idx) =>
      `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:8px;">${idx + 1}. ${line.productName || '-'}</td>
        <td style="text-align:center;padding:8px;">${line.quantity || 0}</td>
        <td style="text-align:right;padding:8px;">${(line.priceUnit || 0).toFixed(3)}</td>
        <td style="text-align:right;padding:8px;">${(line.subtotal || 0).toFixed(3)}</td>
      </tr>`
    ).join('');

    return `
      <html>
      <head><meta charset="utf-8"/>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet"/>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; color: #2d2d2d; padding: 32px; background: #fff; font-size: 13px; line-height: 1.6; }
        .header { text-align: center; padding-bottom: 18px; margin-bottom: 18px; border-bottom: 2px solid #2e2a4f; }
        .header img { width: 90px; height: auto; mix-blend-mode: multiply; margin-bottom: 8px; }
        .header h2 { font-family: 'Playfair Display', Georgia, serif; color: #2e2a4f; font-size: 20px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 4px; }
        .invoice-title { text-align: center; margin: 16px 0; padding: 10px 0; background: #2e2a4f; border-radius: 4px; }
        .invoice-title h3 { font-family: 'Inter', sans-serif; color: #fff; font-size: 15px; letter-spacing: 3px; font-weight: 700; text-transform: uppercase; }
        .info-grid { display: flex; flex-wrap: wrap; margin-bottom: 16px; font-size: 12.5px; line-height: 1.9; }
        .info-grid .left { width: 58%; }
        .info-grid .right { width: 42%; text-align: right; }
        .info-grid strong { color: #2e2a4f; font-weight: 600; }
        .products { width: 100%; border-collapse: collapse; margin: 14px 0; }
        .products thead th { background: #2e2a4f; color: #fff; font-size: 11.5px; font-weight: 600; padding: 10px 8px; text-transform: uppercase; letter-spacing: 0.8px; }
        .products thead th:first-child { border-radius: 4px 0 0 4px; text-align: left; }
        .products thead th:last-child { border-radius: 0 4px 4px 0; }
        .products tbody tr { border-bottom: 1px solid #eaeaea; }
        .products tbody tr:nth-child(even) { background: #f9f9fb; }
        .products tbody td { font-size: 12.5px; padding: 10px 8px; color: #333; font-weight: 400; }
        .total-box { text-align: center; margin: 20px 0; padding: 14px 20px; background: #e85d04; border-radius: 6px; }
        .grand { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
        .payment-section { margin: 18px 0; padding: 16px; background: #f7f8fa; border-radius: 6px; border: 1px solid #e8e8e8; }
        .payment-section h4 { color: #2e2a4f; font-size: 14px; font-weight: 700; text-align: center; margin-bottom: 10px; letter-spacing: 0.5px; }
        .payment-section table { width: 60%; margin: 0 auto; font-size: 12.5px; }
        .payment-section td { padding: 5px 0; }
        .footer { text-align: center; margin-top: 28px; padding-top: 14px; border-top: 2px solid #2e2a4f; }
        .footer p { color: #2e2a4f; font-size: 13px; font-weight: 600; letter-spacing: 0.3px; }
      </style></head>
      <body>
        <div class="header">
          <img src="${INVOICE_LOGO_BASE64}" />
          <h2>MOBILE ACCESSORIES & TOYS</h2>
          <p style="font-size:18px; color:#111; font-weight:700; margin-top:4px; direction:rtl;">\u0625\u0643\u0633\u0633\u0648\u0627\u0631\u0627\u062A \u0627\u0644\u0647\u0648\u0627\u062A\u0641 \u0627\u0644\u0645\u062D\u0645\u0648\u0644\u0629 \u0648\u0627\u0644\u0623\u0644\u0639\u0627\u0628</p>
        </div>
        <div class="invoice-title"><h3>INVOICE</h3></div>
        <div class="info-grid">
          <div class="left">
            <div><strong>Date:</strong> ${invoice.invoiceDate || '-'}</div>
            <div><strong>Cashier:</strong> ${cashierName}</div>
            <div><strong>Customer:</strong> ${invoice.partnerName || '-'}</div>
            ${(partnerPhone || invoice?.partnerPhone) ? `<div><strong>Phone:</strong> ${partnerPhone || invoice.partnerPhone}</div>` : ''}
          </div>
          <div class="right">
            <div><strong>Invoice:</strong> ${invoice.name || '-'}</div>
            <div><strong>Company:</strong> ${invoice.companyName || '-'}</div>
          </div>
        </div>
        <table class="products">
          <thead><tr>
            <th style="width:40%;">Product Name</th>
            <th style="width:15%;text-align:center;">Qty</th>
            <th style="width:20%;text-align:right;">Unit Price</th>
            <th style="width:25%;text-align:right;">Total</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="total-box">
          <span class="grand">Grand Total: ${(invoice.amountTotal || 0).toFixed(3)} ${currency}</span>
        </div>
        <div class="payment-section">
          <h4>Payment Details</h4>
          <table>
            <tr><td style="color:#666;">Cash:</td><td style="text-align:right;font-weight:bold;">${(invoice.amountTotal || 0).toFixed(3)} ${currency}</td></tr>
          </table>
        </div>
        <div class="footer">
          <p>Thank You for Your Purchase</p>
        </div>
      </body></html>
    `;
  };

  const handlePrintInvoice = async () => {
    if (!(await guardOnlineOnly('print the invoice'))) return;
    if (!invoice) {
      showToastMessage('Invoice data not available');
      return;
    }
    setPreviewHtml(buildInvoiceHtml());
    setShowPreview(true);
  };

  const handleDownloadPdf = async () => {
    if (!(await guardOnlineOnly('download the PDF'))) return;
    if (!invoice) {
      showToastMessage('Invoice data not available');
      return;
    }
    setDownloading(true);
    try {
      const html = buildInvoiceHtml();

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

  const handleWhatsAppTap = async () => {
    const online = await isOnline();
    if (!online) {
      Alert.alert(
        'You\'re Offline',
        'Can\'t send WhatsApp right now. Once your internet is connected, tap the Send WhatsApp button again.'
      );
      return;
    }
    if (!invoice) return;
    if (partnerPhone && partnerPhone.trim()) {
      setSendingWA(true);
      await doSendWhatsApp(partnerPhone.trim());
    } else {
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
          <td style="text-align:right;padding:8px;">${(line.subtotal || 0).toFixed(3)}</td>
        </tr>`
      ).join('');

      const html = `
        <html><head><meta charset="utf-8"/><style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; padding: 30px; background: #fff; }
          .header { text-align: center; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
          .header img { width: 100px; height: auto; mix-blend-mode: multiply; margin-bottom: 6px; }
          .header h2 { color: #2e2a4f; font-size: 16px; font-weight: 600; letter-spacing: 0.5px; }
          .invoice-title { text-align: center; margin: 18px 0; padding: 10px 0; background: #2e2a4f; border-radius: 6px; }
          .invoice-title h3 { color: #fff; font-size: 16px; letter-spacing: 2px; font-weight: 700; }
          .info-grid { display: flex; flex-wrap: wrap; margin-bottom: 18px; font-size: 12px; line-height: 1.8; }
          .info-grid .left { width: 60%; }
          .info-grid .right { width: 40%; text-align: right; }
          .info-grid strong { color: #2e2a4f; }
          .products { width: 100%; border-collapse: collapse; margin: 16px 0; }
          .products thead th { background: #2e2a4f; color: #fff; font-size: 11px; font-weight: 600; padding: 10px 8px; text-transform: uppercase; letter-spacing: 0.5px; }
          .products thead th:first-child { border-radius: 6px 0 0 6px; text-align: left; }
          .products thead th:last-child { border-radius: 0 6px 6px 0; }
          .products tbody tr { border-bottom: 1px solid #f0f0f0; }
          .products tbody tr:nth-child(even) { background: #fafafa; }
          .products tbody td { font-size: 12px; padding: 10px 8px; color: #444; }
          .total-box { text-align: center; margin: 20px 0; padding: 14px 20px; background: #e85d04; border-radius: 8px; }
          .grand { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
          .payment-section { margin: 20px 0; padding: 16px; background: #f8f9fa; border-radius: 8px; border: 1px solid #eee; }
          .payment-section h4 { color: #2e2a4f; font-size: 14px; font-weight: 700; text-align: center; margin-bottom: 10px; }
          .payment-section table { width: 60%; margin: 0 auto; font-size: 12px; }
          .payment-section td { padding: 4px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 16px; border-top: 1px solid #e0e0e0; }
          .footer p { color: #2e2a4f; font-size: 13px; font-weight: 600; }
        </style></head><body>
          <div class="header">
            <img src="${INVOICE_LOGO_BASE64}" />
          </div>
          <div class="invoice-title"><h3>INVOICE</h3></div>
          <div class="info-grid">
            <div class="left">
              <div><strong>Date:</strong> ${invoice.invoiceDate || '-'}</div>
              <div><strong>Cashier:</strong> ${cashierName}</div>
              <div><strong>Customer:</strong> ${invoice.partnerName || '-'}</div>
              ${(partnerPhone || invoice?.partnerPhone) ? `<div><strong>Phone:</strong> ${partnerPhone || invoice.partnerPhone}</div>` : ''}
            </div>
            <div class="right">
              <div><strong>Invoice:</strong> ${invoice.name || '-'}</div>
              <div><strong>Company:</strong> ${invoice.companyName || '-'}</div>
            </div>
          </div>
          <table class="products">
            <thead><tr>
              <th style="width:40%;">Product Name</th>
              <th style="width:15%;text-align:center;">Qty</th>
              <th style="width:20%;text-align:right;">Unit Price</th>
              <th style="width:25%;text-align:right;">Total</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="total-box"><span class="grand">Grand Total: ${(invoice.amountTotal || 0).toFixed(3)} ${currency}</span></div>
          <div class="payment-section">
            <h4>Payment Details</h4>
            <table>
              <tr><td style="color:#666;">Cash:</td><td style="text-align:right;font-weight:bold;">${(invoice.amountTotal || 0).toFixed(3)} ${currency}</td></tr>
            </table>
          </div>
          <div class="footer"><p>Thank You for Your Purchase</p></div>
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
      <OfflineBanner message="OFFLINE MODE — Print / Download / WhatsApp require internet" />
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
            <Text style={[s.thCell, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
            <Text style={[s.thCell, { flex: 1, textAlign: 'right' }]}>Unit</Text>
            <Text style={[s.thCell, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>

          {/* Product Rows */}
          {invoice.lines.map((line, idx) => (
            <View key={line.id || idx} style={s.tableRow}>
              <Text style={[s.tdCell, { flex: 2.5 }]} numberOfLines={2}>{idx + 1}. {line.productName}</Text>
              <Text style={[s.tdCell, { flex: 0.7, textAlign: 'center' }]}>{line.quantity}</Text>
              <Text style={[s.tdCell, { flex: 1, textAlign: 'right' }]}>{line.priceUnit.toFixed(3)}</Text>
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

        <View style={{ marginTop: 20 }}>
          <Button
            backgroundColor="#1E88E5"
            title={printing ? "Loading..." : "Print Preview"}
            onPress={handlePrintInvoice}
            loading={printing}
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

        <PrintReceiptButton
          invoice={invoice}
          cashierName={cashierName}
          currency={currency}
          partnerPhone={partnerPhone}
        />

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

      {/* Print Preview Modal */}
      <Modal visible={showPreview} animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={s.previewHeader}>
            <Text style={s.previewTitle}>Print Preview</Text>
            <TouchableOpacity onPress={() => setShowPreview(false)} style={s.previewCloseBtn}>
              <Text style={s.previewCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ html: previewHtml }}
            style={{ flex: 1 }}
            originWhitelist={['*']}
            scalesPageToFit={true}
          />
        </View>
      </Modal>
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
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  phoneInput: { flex: 1, fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333', borderBottomWidth: 1, borderBottomColor: '#ddd', paddingVertical: 2, paddingHorizontal: 4 },
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
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff',
  },
  previewTitle: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f' },
  previewCloseBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f0f0f0', borderRadius: 8 },
  previewCloseText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#333' },
});

export default SalesInvoiceReceiptScreen;
