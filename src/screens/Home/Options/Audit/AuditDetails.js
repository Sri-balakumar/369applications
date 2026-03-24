import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { RoundedScrollContainer } from '@components/containers';
import { showToastMessage } from '@components/Toast';
import { OverlayLoader } from '@components/Loader';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { AntDesign } from '@expo/vector-icons';
import { fetchAuditingDetailsOdoo, updateAuditStateOdoo, fetchAuditAttachmentsOdoo } from '@api/services/generalApi';
import Toast from 'react-native-toast-message';

const STATE_COLORS = {
  draft: '#6c757d',
  audited: '#28a745',
  rejected: '#dc3545',
};

const STATES = ['draft', 'audited', 'rejected'];
const STATE_LABELS = { draft: 'Draft', audited: 'Audited', rejected: 'Rejected' };

const FieldRow = ({ label, value, isBold }) => (
  <View style={styles.fieldRow}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={[styles.fieldValue, isBold && styles.boldValue]}>{value || '\u2014'}</Text>
  </View>
);

const SectionHeader = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const SignatureBlock = ({ label, signature, signedBy, signedDate }) => (
  <View style={styles.signatureBlock}>
    <Text style={styles.signatureLabel}>{label}</Text>
    {signature ? (
      <Image source={{ uri: signature }} style={styles.signatureImage} />
    ) : (
      <Text style={styles.noSignature}>No signature</Text>
    )}
    {signedBy ? <Text style={styles.signedByText}>Signed by: {signedBy}</Text> : null}
    {signedDate ? <Text style={styles.signedDateText}>{signedDate}</Text> : null}
  </View>
);

const AuditDetails = ({ navigation, route }) => {
  const { id: auditId } = route?.params || {};
  const [details, setDetails] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  const fetchDetails = async () => {
    setIsLoading(true);
    setAttachmentsLoading(true);
    try {
      const data = await fetchAuditingDetailsOdoo(auditId);
      setDetails(data);
    } catch (error) {
      console.error('Error fetching Audit details:', error);
      showToastMessage('Failed to fetch Audit details. Please try again.');
    } finally {
      setIsLoading(false);
    }
    // Fetch attachments separately so it never blocks the details
    try {
      console.log(`[AuditDetails] Fetching attachments for audit ID: ${auditId}`);
      const atts = await fetchAuditAttachmentsOdoo(auditId);
      console.log(`[AuditDetails] Attachments found: ${atts?.length || 0}`);
      setAttachments(atts || []);
    } catch (error) {
      console.error('Error fetching attachments:', error);
      setAttachments([]);
      Toast.show({ type: 'error', text1: 'Attachment Error', text2: error?.message || 'Failed to load attachments', position: 'bottom' });
    } finally {
      setAttachmentsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (auditId) fetchDetails();
    }, [auditId])
  );

  const handleConfirm = () => {
    Alert.alert(
      'Confirm Audit',
      'Are you sure you want to confirm this audit transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsLoading(true);
            try {
              await updateAuditStateOdoo(auditId, 'audited');
              showToastMessage('Audit confirmed successfully');
              fetchDetails();
            } catch (error) {
              console.error('Error confirming audit:', error);
              showToastMessage('Failed to confirm audit. Please try again.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = () => {
    Alert.alert(
      'Reject Audit',
      'Are you sure you want to reject this audit transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await updateAuditStateOdoo(auditId, 'rejected');
              showToastMessage('Audit rejected');
              fetchDetails();
            } catch (error) {
              console.error('Error rejecting audit:', error);
              showToastMessage('Failed to reject audit. Please try again.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handlePrintVoucher = () => {
    showToastMessage('Print Audit Voucher - Coming soon');
  };

  const formatCurrency = (val, currency) => {
    if (val == null) return '\u2014';
    const sym = currency === 'INR' ? '\u20B9' : (currency === 'USD' ? '$' : currency || '');
    const n = Number(val).toFixed(2);
    const [intPart, decPart] = n.split('.');
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (rest ? ',' : '') + last3;
    return `${sym} ${formatted}.${decPart}`;
  };

  const formatDate = (d) => {
    if (!d) return '\u2014';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return d; }
  };

  if (!details && !isLoading) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Audit Details" onBackPress={() => navigation.goBack()} logo={false} />
        <RoundedScrollContainer>
          <Text style={{ textAlign: 'center', marginTop: 40, color: '#999' }}>No data found</Text>
        </RoundedScrollContainer>
      </SafeAreaView>
    );
  }

  const currentState = details?.state || 'draft';

  return (
    <SafeAreaView>
      <NavigationHeader
        title={details?.transaction_ref || 'Audit Details'}
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      <RoundedScrollContainer>
        {/* ─── Status Badge Row ─── */}
        {details && (
          <View style={styles.statusRow}>
            <Text style={styles.displayName}>
              {details.transaction_ref}{details.audit_account_type ? ` | ${details.audit_account_type}` : ''}{details.partner_name ? ` | ${details.partner_name}` : ''}
            </Text>
          </View>
        )}

        {/* ─── Action Buttons ─── */}
        <View style={styles.actionRow}>
          {currentState === 'draft' && (
            <>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleConfirm}>
                <Text style={styles.btnTextWhite}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnReject} onPress={handleReject}>
                <Text style={styles.btnTextWhite}>Reject</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.btnOutline} onPress={handlePrintVoucher}>
            <Text style={styles.btnTextDark}>Print Audit Voucher</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Status Bar (Draft → Audited → Rejected) ─── */}
        <View style={styles.statusBar}>
          {STATES.map((state, idx) => (
            <React.Fragment key={state}>
              {idx > 0 && (
                <AntDesign name="right" size={12} color="#adb5bd" style={{ marginHorizontal: 4 }} />
              )}
              <View style={[
                styles.statusChip,
                currentState === state && { backgroundColor: STATE_COLORS[state] },
              ]}>
                <Text style={[
                  styles.statusChipText,
                  currentState === state && styles.statusChipTextActive,
                ]}>
                  {STATE_LABELS[state]}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* ─── TRANSACTION INFORMATION ─── */}
        <SectionHeader title="TRANSACTION INFORMATION" />
        <FieldRow label="1. Transaction Reference" value={details?.transaction_ref} />
        <FieldRow label="2. Audit Account Type" value={details?.audit_account_type} />
        <FieldRow label="3. Partner" value={details?.partner_name} />
        <FieldRow label="4. Amount (before Tax)" value={formatCurrency(details?.amount_untaxed, details?.currency_name)} isBold />
        {details?.has_tax && (
          <FieldRow label="5. Tax Amount" value={formatCurrency(details?.amount_tax, details?.currency_name)} />
        )}
        <FieldRow label="6. Total Amount" value={formatCurrency(details?.amount_total, details?.currency_name)} isBold />
        <FieldRow label="7. Salesperson / Creator" value={details?.salesperson_name} />
        <FieldRow label="Transaction Date" value={formatDate(details?.transaction_date)} />
        <FieldRow label="Transaction Number / Ref" value={details?.transaction_ref} />
        <FieldRow label="Created By" value={details?.created_by_name} />
        <FieldRow label="Payment Method" value={details?.payment_method} />
        <FieldRow label="Journal" value={details?.journal_name} />
        <FieldRow label="Company" value={details?.company_name} />

        {/* ─── TRANSACTION LINES ─── */}
        {details?.lines && details.lines.length > 0 && (
          <>
            <SectionHeader title="TRANSACTION LINES" />
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableCellProduct]}>Product</Text>
              <Text style={[styles.tableCell, styles.tableCellNum]}>Qty</Text>
              <Text style={[styles.tableCell, styles.tableCellNum]}>Price</Text>
              <Text style={[styles.tableCell, styles.tableCellNum]}>Tax</Text>
              <Text style={[styles.tableCell, styles.tableCellNum]}>Subtotal</Text>
            </View>
            {details.lines.map((line) => (
              <View key={line.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.tableCellProduct]} numberOfLines={2}>{line.product_name || line.description}</Text>
                <Text style={[styles.tableCell, styles.tableCellNum]}>{line.quantity}</Text>
                <Text style={[styles.tableCell, styles.tableCellNum]}>{Number(line.price_unit).toFixed(2)}</Text>
                <Text style={[styles.tableCell, styles.tableCellNum]}>{Number(line.tax_amount).toFixed(2)}</Text>
                <Text style={[styles.tableCell, styles.tableCellNum]}>{Number(line.subtotal).toFixed(2)}</Text>
              </View>
            ))}
          </>
        )}

        {/* ─── SIGNATURES ─── */}
        <SectionHeader title="SIGNATURES" />
        <SignatureBlock
          label="8. Partner Signature"
          signature={details?.customer_signature}
          signedBy={details?.customer_signed_by}
          signedDate={details?.customer_signed_date}
        />
        {details?.is_courier && (
          <View style={styles.courierInfoBlock}>
            <Text style={styles.courierInfoLabel}>Courier Delivery</Text>
            <Text style={styles.courierInfoText}>Yes - delivered via courier</Text>
            {details?.courier_proof && (
              <Image source={{ uri: `data:image/png;base64,${details.courier_proof}` }} style={styles.courierProofImage} />
            )}
          </View>
        )}
        <SignatureBlock
          label="9. Cashier Signature"
          signature={details?.cashier_signature}
          signedBy={details?.cashier_signed_by}
          signedDate={details?.cashier_signed_date}
        />

        {/* ─── SOURCE VOUCHER / ATTACHMENTS ─── */}
        <SectionHeader title="SOURCE VOUCHER / ATTACHMENTS" />
        {attachmentsLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <ActivityIndicator size="small" color="#714B67" />
            <Text style={[styles.noAttachments, { fontStyle: 'normal', marginTop: 6 }]}>Loading attachments...</Text>
          </View>
        ) : attachments.length > 0 ? (
          <View style={styles.attachmentsGrid}>
            {attachments.map((att) => (
              <View key={att.id} style={styles.attachmentItem}>
                {att.uri ? (
                  <Image source={{ uri: att.uri }} style={styles.attachmentImage} />
                ) : (
                  <View style={styles.attachmentPlaceholder}>
                    <AntDesign name="file1" size={24} color="#adb5bd" />
                  </View>
                )}
                <Text style={styles.attachmentName} numberOfLines={1}>{att.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noAttachments}>No attachments</Text>
        )}

        <OverlayLoader visible={isLoading} />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  displayName: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#212529',
    marginRight: 8,
  },
  // Action buttons
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  btnConfirm: {
    backgroundColor: '#714B67',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
  },
  btnReject: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
  },
  btnOutline: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  btnTextWhite: {
    fontSize: 13,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  btnTextDark: {
    fontSize: 13,
    color: '#495057',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  // Status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 4,
  },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#e9ecef',
  },
  statusChipText: {
    fontSize: 12,
    color: '#6c757d',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  statusChipTextActive: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  // Section
  sectionHeader: {
    marginTop: 18,
    marginBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primaryThemeColor,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    letterSpacing: 0.5,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  fieldLabel: {
    flex: 1.2,
    fontSize: 13,
    color: '#495057',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  fieldValue: {
    flex: 1,
    fontSize: 13,
    color: '#212529',
    fontFamily: FONT_FAMILY.urbanistMedium,
    textAlign: 'right',
  },
  boldValue: {
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  // Table styles for transaction lines
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f3f5',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  tableCell: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#212529',
  },
  tableCellProduct: {
    flex: 2,
  },
  tableCellNum: {
    flex: 1,
    textAlign: 'right',
  },
  // Signature styles
  signatureBlock: {
    marginVertical: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  signatureLabel: {
    fontSize: 14,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginBottom: 8,
  },
  signatureImage: {
    width: '100%',
    height: 120,
    resizeMode: 'contain',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  noSignature: {
    fontSize: 13,
    color: '#adb5bd',
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontStyle: 'italic',
  },
  signedByText: {
    fontSize: 12,
    color: '#6c757d',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 4,
  },
  signedDateText: {
    fontSize: 11,
    color: '#adb5bd',
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  // Attachment styles
  attachmentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 8,
  },
  attachmentItem: {
    width: 90,
    alignItems: 'center',
  },
  attachmentImage: {
    width: 85,
    height: 85,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#f8f9fa',
  },
  attachmentPlaceholder: {
    width: 85,
    height: 85,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentName: {
    fontSize: 10,
    color: '#6c757d',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 4,
    textAlign: 'center',
  },
  // Courier delivery
  courierInfoBlock: {
    marginVertical: 8,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  courierInfoLabel: {
    fontSize: 13,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginBottom: 4,
  },
  courierInfoText: {
    fontSize: 13,
    color: '#212529',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginBottom: 6,
  },
  courierProofImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginTop: 6,
  },
  noAttachments: {
    fontSize: 13,
    color: '#adb5bd',
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
});

export default AuditDetails;
