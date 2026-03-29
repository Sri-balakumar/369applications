import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { INVOICE_LOGO_BASE64 } from '@constants/invoiceLogo';

const ReceiptTemplate = ({ invoice, cashierName, currency, partnerPhone, labelSize }) => {
  if (!invoice) return null;

  const { widthDots, heightDots } = labelSize;
  // Scale factor relative to the 400px base width
  const s = widthDots / 400;

  return (
    <View style={[styles.container, { width: widthDots, height: heightDots, backgroundColor: '#fff' }]}>
      {/* ── Header ────────────────────────────────────── */}
      <View style={styles.header}>
        <Image
          source={{ uri: INVOICE_LOGO_BASE64 }}
          style={{ width: 70 * s, height: 70 * s, alignSelf: 'center' }}
          resizeMode="contain"
        />
        <Text style={[styles.companyTitle, { fontSize: 16 * s }]}>
          MOBILE ACCESSORIES & TOYS
        </Text>
        <Text style={[styles.arabicTitle, { fontSize: 14 * s }]}>
          {'\u0625\u0643\u0633\u0633\u0648\u0627\u0631\u0627\u062A \u0627\u0644\u0647\u0648\u0627\u062A\u0641 \u0627\u0644\u0645\u062D\u0645\u0648\u0644\u0629 \u0648\u0627\u0644\u0623\u0644\u0639\u0627\u0628'}
        </Text>
      </View>

      {/* ── Invoice Title Bar ─────────────────────────── */}
      <View style={[styles.invoiceBar, { paddingVertical: 6 * s, marginVertical: 6 * s }]}>
        <Text style={[styles.invoiceBarText, { fontSize: 14 * s, letterSpacing: 3 * s }]}>
          INVOICE
        </Text>
      </View>

      {/* ── Info Grid ─────────────────────────────────── */}
      <View style={[styles.infoGrid, { paddingHorizontal: 10 * s }]}>
        <View style={styles.infoLeft}>
          <Text style={[styles.infoText, { fontSize: 9 * s }]}>
            <Text style={styles.infoLabel}>Date: </Text>{invoice.invoiceDate || '-'}
          </Text>
          <Text style={[styles.infoText, { fontSize: 9 * s }]}>
            <Text style={styles.infoLabel}>Cashier: </Text>{cashierName || 'Admin'}
          </Text>
          <Text style={[styles.infoText, { fontSize: 9 * s }]}>
            <Text style={styles.infoLabel}>Customer: </Text>{invoice.partnerName || '-'}
          </Text>
          {partnerPhone ? (
            <Text style={[styles.infoText, { fontSize: 9 * s }]}>
              <Text style={styles.infoLabel}>Phone: </Text>{partnerPhone}
            </Text>
          ) : null}
        </View>
        <View style={styles.infoRight}>
          <Text style={[styles.infoText, { fontSize: 9 * s, textAlign: 'right' }]}>
            <Text style={styles.infoLabel}>Invoice: </Text>{invoice.name || '-'}
          </Text>
          <Text style={[styles.infoText, { fontSize: 9 * s, textAlign: 'right' }]}>
            <Text style={styles.infoLabel}>Company: </Text>{invoice.companyName || '-'}
          </Text>
        </View>
      </View>

      {/* ── Product Table ─────────────────────────────── */}
      <View style={[styles.tableHeader, { marginTop: 8 * s, marginHorizontal: 6 * s }]}>
        <Text style={[styles.thCell, { flex: 2.5, fontSize: 8 * s }]}>PRODUCT NAME</Text>
        <Text style={[styles.thCell, { flex: 0.6, fontSize: 8 * s, textAlign: 'center' }]}>QTY</Text>
        <Text style={[styles.thCell, { flex: 1, fontSize: 8 * s, textAlign: 'right' }]}>UNIT PRICE</Text>
        <Text style={[styles.thCell, { flex: 1, fontSize: 8 * s, textAlign: 'right' }]}>TOTAL</Text>
      </View>

      {(invoice.lines || []).map((line, idx) => (
        <View key={line.id || idx} style={[styles.tableRow, { marginHorizontal: 6 * s }]}>
          <Text style={[styles.tdCell, { flex: 2.5, fontSize: 8 * s }]} numberOfLines={2}>
            {idx + 1}. {line.productName || '-'}
          </Text>
          <Text style={[styles.tdCell, { flex: 0.6, fontSize: 8 * s, textAlign: 'center' }]}>
            {line.quantity || 0}
          </Text>
          <Text style={[styles.tdCell, { flex: 1, fontSize: 8 * s, textAlign: 'right' }]}>
            {(line.priceUnit || 0).toFixed(3)}
          </Text>
          <Text style={[styles.tdCell, { flex: 1, fontSize: 8 * s, textAlign: 'right' }]}>
            {(line.subtotal || 0).toFixed(3)}
          </Text>
        </View>
      ))}

      {/* ── Grand Total Banner ────────────────────────── */}
      <View style={[styles.totalBox, { marginTop: 10 * s, marginHorizontal: 6 * s, paddingVertical: 8 * s }]}>
        <Text style={[styles.grandTotalText, { fontSize: 14 * s }]}>
          Grand Total: {(invoice.amountTotal || 0).toFixed(3)} {currency}
        </Text>
      </View>

      {/* ── Payment Details ───────────────────────────── */}
      <View style={[styles.paymentSection, { marginTop: 8 * s, marginHorizontal: 10 * s, padding: 8 * s }]}>
        <Text style={[styles.paymentTitle, { fontSize: 11 * s }]}>Payment Details</Text>
        <View style={styles.paymentRow}>
          <Text style={[styles.paymentLabel, { fontSize: 9 * s }]}>Cash:</Text>
          <Text style={[styles.paymentValue, { fontSize: 9 * s }]}>
            {(invoice.amountTotal || 0).toFixed(3)} {currency}
          </Text>
        </View>
      </View>

      {/* ── Footer ────────────────────────────────────── */}
      <View style={[styles.footer, { marginTop: 10 * s, paddingTop: 6 * s }]}>
        <Text style={[styles.footerText, { fontSize: 10 * s }]}>
          Thank You for Your Purchase
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  // Header
  header: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#2e2a4f',
  },
  companyTitle: {
    color: '#2e2a4f',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 4,
  },
  arabicTitle: {
    color: '#111',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
    writingDirection: 'rtl',
  },
  // Invoice bar
  invoiceBar: {
    backgroundColor: '#2e2a4f',
    borderRadius: 3,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  invoiceBarText: {
    color: '#fff',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  // Info grid
  infoGrid: {
    flexDirection: 'row',
  },
  infoLeft: { flex: 1.3 },
  infoRight: { flex: 1 },
  infoText: {
    color: '#333',
    lineHeight: 16,
  },
  infoLabel: {
    color: '#2e2a4f',
    fontWeight: '600',
  },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2e2a4f',
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  thCell: {
    color: '#fff',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eaeaea',
  },
  tdCell: {
    color: '#333',
  },
  // Total
  totalBox: {
    backgroundColor: '#e85d04',
    borderRadius: 4,
    alignItems: 'center',
  },
  grandTotalText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // Payment
  paymentSection: {
    backgroundColor: '#f7f8fa',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  paymentTitle: {
    color: '#2e2a4f',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  paymentLabel: {
    color: '#666',
  },
  paymentValue: {
    fontWeight: '700',
    color: '#333',
  },
  // Footer
  footer: {
    borderTopWidth: 2,
    borderTopColor: '#2e2a4f',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  footerText: {
    color: '#2e2a4f',
    fontWeight: '600',
  },
});

export default ReceiptTemplate;
