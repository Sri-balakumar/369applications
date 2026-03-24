import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { RoundedScrollContainer } from '@components/containers';
import { showToastMessage } from '@components/Toast';
import { OverlayLoader } from '@components/Loader';
import { LoadingButton } from '@components/common/Button';
import SignaturePad from '@components/SignaturePad';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { AntDesign } from '@expo/vector-icons';
import {
  fetchStockTransferDetailsOdoo,
  stockTransferActionOdoo,
  updateStockTransferOdoo,
} from '@api/services/generalApi';

const STATE_COLORS = {
  draft: '#6c757d',
  sent: '#0d6efd',
  done: '#28a745',
  rejected: '#dc3545',
  cancel: '#adb5bd',
};

const STATES = ['draft', 'sent', 'done'];
const STATE_LABELS = {
  draft: 'Draft',
  sent: 'Sent',
  done: 'Done',
  rejected: 'Rejected',
  cancel: 'Cancelled',
};

const URGENCY_COLORS = {
  normal: '#6c757d',
  urgent: '#fd7e14',
  critical: '#dc3545',
};

const STOCK_STATUS_COLORS = {
  available: '#198754',
  partial: '#fd7e14',
  unavailable: '#dc3545',
};

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

const StockTransferDetails = ({ navigation, route }) => {
  const { id: requestId, selectedCompanyId } = route?.params || {};
  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [showApproveSignature, setShowApproveSignature] = useState(false);
  const [approveSignatureBase64, setApproveSignatureBase64] = useState('');
  const [approveSignatureUrl, setApproveSignatureUrl] = useState('');
  const [isApproving, setIsApproving] = useState(false);

  const fetchDetails = async () => {
    setIsLoading(true);
    try {
      const data = await fetchStockTransferDetailsOdoo(requestId);
      setDetails(data);
    } catch (error) {
      console.error('Error fetching stock request details:', error);
      showToastMessage('Failed to fetch details');
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (requestId) fetchDetails();
    }, [requestId])
  );

  const handleAction = (action, confirmTitle, confirmMessage, companyId = null) => {
    Alert.alert(confirmTitle, confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setIsLoading(true);
          try {
            await stockTransferActionOdoo(requestId, action, companyId);
            showToastMessage('Action completed successfully');
            fetchDetails();
          } catch (error) {
            console.error(`Error performing ${action}:`, error);
            showToastMessage(error?.message || 'Failed to perform action');
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const handleApproveTransfer = async () => {
    if (!approveSignatureBase64) {
      showToastMessage('Please provide your signature before approving');
      return;
    }
    setIsApproving(true);
    try {
      const sigData = approveSignatureBase64.replace(/^data:image\/[^;]+;base64,/, '');
      await updateStockTransferOdoo(requestId, { source_signature: sigData });
      await stockTransferActionOdoo(requestId, 'action_approve_and_transfer', details?.source_company_id);
      showToastMessage('Request approved & transfer created');
      setShowApproveSignature(false);
      setApproveSignatureBase64('');
      setApproveSignatureUrl('');
      fetchDetails();
    } catch (error) {
      console.error('Error approving request:', error);
      showToastMessage(error?.message || 'Failed to approve request');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      showToastMessage('Please provide a rejection reason');
      return;
    }
    setIsLoading(true);
    try {
      await updateStockTransferOdoo(requestId, { rejection_reason: rejectionReason });
      await stockTransferActionOdoo(requestId, 'action_reject_request', details?.source_company_id);
      showToastMessage('Request rejected');
      setShowRejectInput(false);
      setRejectionReason('');
      fetchDetails();
    } catch (error) {
      console.error('Error rejecting request:', error);
      showToastMessage(error?.message || 'Failed to reject request');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '\u2014';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return d; }
  };

  const formatCurrency = (val) => {
    if (val == null) return '\u2014';
    const n = Number(val).toFixed(2);
    const [intPart, decPart] = n.split('.');
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (rest ? ',' : '') + last3;
    return formatted + '.' + decPart;
  };

  if (!details && !isLoading) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Request Details" onBackPress={() => navigation.goBack()} logo={false} />
        <RoundedScrollContainer>
          <Text style={{ textAlign: 'center', marginTop: 40, color: '#999' }}>No data found</Text>
        </RoundedScrollContainer>
      </SafeAreaView>
    );
  }

  const currentState = details?.state || 'draft';
  const displayStates = (currentState === 'cancel' || currentState === 'rejected')
    ? [...STATES.filter(s => s !== 'done'), currentState]
    : STATES;

  // Role: requester = created the request, source = must approve/reject
  const isRequester = selectedCompanyId && details?.requesting_company_id === selectedCompanyId;
  const isSource = selectedCompanyId && details?.source_company_id === selectedCompanyId;

  return (
    <SafeAreaView>
      <NavigationHeader
        title={details?.name || 'Request Details'}
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      <RoundedScrollContainer scrollEnabled={scrollEnabled}>
        {/* Status Badge Row */}
        {details && (
          <View style={styles.statusRow}>
            <Text style={styles.displayName}>
              {details.name}
              {details.requesting_company_name ? ` | ${details.requesting_company_name}` : ''}
              {' \u2192 '}
              {details.source_company_name || ''}
            </Text>
            {details.urgency && details.urgency !== 'normal' && (
              <View style={[styles.urgencyBadge, { backgroundColor: URGENCY_COLORS[details.urgency] }]}>
                <Text style={styles.urgencyText}>{details.urgency.toUpperCase()}</Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons - role-based on company switcher */}
        <View style={styles.actionRow}>
          {/* SENT: Source company can approve or reject */}
          {currentState === 'sent' && isSource && (
            <>
              <TouchableOpacity
                style={styles.btnConfirm}
                onPress={() => setShowApproveSignature(true)}
              >
                <Text style={styles.btnTextWhite}>Approve & Transfer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnReject}
                onPress={() => setShowRejectInput(true)}
              >
                <Text style={styles.btnTextWhite}>Reject</Text>
              </TouchableOpacity>
            </>
          )}
          {currentState === 'sent' && !isSource && (
            <View style={styles.infoBanner}>
              <AntDesign name="clockcircleo" size={14} color="#0d6efd" />
              <Text style={[styles.infoText, { color: '#0d6efd' }]}>Waiting for source company approval</Text>
            </View>
          )}

          {/* DONE: show completion status */}
          {currentState === 'done' && (
            <View style={styles.infoBanner}>
              <AntDesign name="checkcircleo" size={14} color="#28a745" />
              <Text style={[styles.infoText, { color: '#28a745' }]}>Request completed</Text>
            </View>
          )}

          {/* CANCELLED / REJECTED: requester can reset to draft */}
          {(currentState === 'cancel' || currentState === 'rejected') && isRequester && (
            <TouchableOpacity
              style={styles.btnOutline}
              onPress={() => handleAction('action_draft', 'Reset to Draft', 'Reset this request to draft?', details?.requesting_company_id)}
            >
              <Text style={styles.btnTextDark}>Reset to Draft</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Rejection Reason Input */}
        {showRejectInput && (
          <View style={styles.rejectInputContainer}>
            <Text style={styles.rejectLabel}>Rejection Reason:</Text>
            <TextInput
              style={styles.rejectInput}
              placeholder="Enter reason for rejection"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleReject}>
                <Text style={styles.btnTextWhite}>Submit Rejection</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={() => { setShowRejectInput(false); setRejectionReason(''); }}
              >
                <Text style={styles.btnTextDark}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Approve & Transfer - Signature Section */}
        {showApproveSignature && currentState === 'sent' && (
          <View
            style={styles.sendSignatureContainer}
            onStartShouldSetResponder={() => {
              if (!scrollEnabled) setScrollEnabled(true);
              return false;
            }}
          >
            <Text style={styles.sendSignatureTitle}>SOURCE SIGNATURE (REQUIRED TO APPROVE)</Text>
            <SignaturePad
              setScrollEnabled={setScrollEnabled}
              setUrl={setApproveSignatureUrl}
              title="Signature"
              previousSignature={approveSignatureUrl || ''}
              onSignatureBase64={(sig) => setApproveSignatureBase64(sig)}
            />
            <View style={styles.sendSignatureActions}>
              <LoadingButton
                title="SIGN & APPROVE TRANSFER"
                onPress={() => {
                  setScrollEnabled(true);
                  handleApproveTransfer();
                }}
                marginTop={10}
                loading={isApproving}
              />
              <TouchableOpacity
                style={[styles.btnOutline, { marginTop: 8, alignItems: 'center' }]}
                onPress={() => {
                  setScrollEnabled(true);
                  setShowApproveSignature(false);
                  setApproveSignatureBase64('');
                  setApproveSignatureUrl('');
                }}
              >
                <Text style={styles.btnTextDark}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Status Bar */}
        <View style={styles.statusBar}>
          {displayStates.map((state, idx) => (
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

        {/* REQUEST INFORMATION */}
        <SectionHeader title="REQUEST INFORMATION" />
        <FieldRow label="Reference" value={details?.name} />
        <FieldRow label="Request Date" value={formatDate(details?.date)} />
        <FieldRow label="Requesting Company" value={details?.requesting_company_name} />
        <FieldRow label="Receive At" value={details?.requesting_location_name} />
        <FieldRow label="Request From" value={details?.source_company_name} />
        <FieldRow label="Ship From" value={details?.source_location_name} />
        <FieldRow label="Urgency" value={details?.urgency ? details.urgency.charAt(0).toUpperCase() + details.urgency.slice(1) : 'Normal'} />
        <FieldRow label="Total Value" value={formatCurrency(details?.total_value)} isBold />
        <FieldRow label="Notes" value={details?.note} />

        {/* REQUESTED PRODUCTS */}
        {details?.lines && details.lines.length > 0 && (
          <>
            <SectionHeader title="REQUESTED PRODUCTS" />
            {details.lines.map((line) => (
              <View key={line.id} style={styles.productCard}>
                {/* Row 1: Product name + Status badge */}
                <View style={styles.productCardRow1}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName} numberOfLines={2}>{line.product_name}</Text>
                    {line.uom_name ? (
                      <Text style={styles.productUom}>{line.uom_name}</Text>
                    ) : null}
                  </View>
                  {line.stock_status && (
                    <View style={[styles.statusBadge, {
                      backgroundColor: line.stock_status === 'available' ? '#d1e7dd'
                        : line.stock_status === 'partial' ? '#fff3cd' : '#f8d7da',
                    }]}>
                      <Text style={[styles.statusBadgeText, {
                        color: STOCK_STATUS_COLORS[line.stock_status] || '#6c757d',
                      }]}>
                        {line.stock_status === 'available' ? 'Available'
                          : line.stock_status === 'partial' ? 'Partial' : 'Unavailable'}
                      </Text>
                    </View>
                  )}
                </View>
                {/* Row 2: Available | Qty | Price | Subtotal */}
                <View style={styles.productCardRow2}>
                  <View style={styles.productDataCol}>
                    <Text style={styles.productDataLabel}>Available</Text>
                    <Text style={[styles.productDataValue, {
                      color: STOCK_STATUS_COLORS[line.stock_status] || '#6c757d',
                    }]}>{line.available_qty ?? 0}</Text>
                  </View>
                  <View style={styles.productDataCol}>
                    <Text style={styles.productDataLabel}>Req. Qty</Text>
                    <Text style={styles.productDataValue}>{line.quantity}</Text>
                  </View>
                  <View style={styles.productDataCol}>
                    <Text style={styles.productDataLabel}>Unit Price</Text>
                    <Text style={styles.productDataValue}>{Number(line.unit_price).toFixed(2)}</Text>
                  </View>
                  <View style={styles.productDataCol}>
                    <Text style={styles.productDataLabel}>Subtotal</Text>
                    <Text style={[styles.productDataValue, { fontFamily: FONT_FAMILY.urbanistBold }]}>
                      {Number(line.subtotal).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* APPROVAL INFORMATION */}
        {(details?.sent_by_name || details?.approved_by_name) && (
          <>
            <SectionHeader title="APPROVAL INFORMATION" />
            {details?.sent_by_name ? (
              <>
                <FieldRow label="Requested By" value={details.sent_by_name} />
                <FieldRow label="Requested Date" value={formatDate(details.sent_date)} />
              </>
            ) : null}
            {details?.approved_by_name ? (
              <>
                <FieldRow label="Approved By" value={details.approved_by_name} />
                <FieldRow label="Approval Date" value={formatDate(details.approval_date)} />
                {details.approval_note ? <FieldRow label="Source Notes" value={details.approval_note} /> : null}
              </>
            ) : null}
            {details?.rejection_reason ? (
              <FieldRow label="Rejection Reason" value={details.rejection_reason} />
            ) : null}
          </>
        )}

        {/* REQUESTER SIGNATURE */}
        {details?.requester_signature && (
          <>
            <SectionHeader title="REQUESTER SIGNATURE" />
            <View style={styles.signatureBlock}>
              <Image source={{ uri: details.requester_signature }} style={styles.signatureImage} />
            </View>
          </>
        )}

        {/* SOURCE SIGNATURE */}
        {details?.source_signature && (
          <>
            <SectionHeader title="SOURCE COMPANY SIGNATURE" />
            <View style={styles.signatureBlock}>
              <Image source={{ uri: details.source_signature }} style={styles.signatureImage} />
            </View>
          </>
        )}

        {/* LINKED TRANSFER */}
        {details?.transfer_name && (
          <>
            <SectionHeader title="LINKED TRANSFER" />
            <FieldRow label="Transfer Reference" value={details.transfer_name} />
            <FieldRow label="Transfer Status" value={details.transfer_state ? details.transfer_state.charAt(0).toUpperCase() + details.transfer_state.slice(1) : ''} />
          </>
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
  urgencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  urgencyText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  infoText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#6c757d',
  },
  rejectInputContainer: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  rejectLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#856404',
    marginBottom: 6,
  },
  rejectInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 6,
    padding: 10,
    minHeight: 60,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    textAlignVertical: 'top',
  },
  sendSignatureContainer: {
    marginVertical: 12,
    borderTopWidth: 2,
    borderTopColor: COLORS.primaryThemeColor,
    paddingTop: 12,
  },
  sendSignatureTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sendSignatureActions: {
    marginTop: 4,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 4,
    flexWrap: 'wrap',
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
  productCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 12,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  productCardRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  productName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#212529',
  },
  productUom: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#6c757d',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  productCardRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  productDataCol: {
    alignItems: 'center',
    flex: 1,
  },
  productDataLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#6c757d',
    marginBottom: 2,
  },
  productDataValue: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#212529',
  },
  signatureBlock: {
    marginVertical: 12,
    paddingVertical: 8,
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
});

export default StockTransferDetails;
