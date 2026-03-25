import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, ScrollView, Alert } from 'react-native';
import Text from '@components/Text';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@stores/auth';
import {
  fetchSparePartRequestDetailsOdoo,
  approveSparePartRequestOdoo,
} from '@api/services/generalApi';

const STATE_COLORS = {
  draft: '#FF9800',
  requested: '#2196F3',
  approved: '#4CAF50',
  rejected: '#F44336',
  issued: '#9C27B0',
  done: '#4CAF50',
};

const STAGES = ['Draft', 'Requested', 'Approved', 'Issued'];
const STAGE_MAP = { draft: 0, requested: 1, approved: 2, issued: 3 };

const SpareRequestDetails = ({ navigation, route }) => {
  const { id } = route?.params || {};
  const currentUser = useAuthStore((state) => state.user);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const loadDetail = async () => {
      setLoading(true);
      try {
        const data = await fetchSparePartRequestDetailsOdoo(id);
        setDetail(data);
      } catch (err) {
        console.error('Failed to load spare part request:', err);
      } finally {
        setLoading(false);
      }
    };
    if (id) loadDetail();
  }, [id]);

  const handleApprove = () => {
    Alert.alert(
      'Confirm Approval',
      `Are you sure you want to approve request ${detail?.name || ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Approve', onPress: processApprove },
      ]
    );
  };

  const processApprove = async () => {
    setApproving(true);
    try {
      await approveSparePartRequestOdoo(id);
      Toast.show({ type: 'success', text1: 'Approved', text2: 'Spare part request approved', position: 'bottom' });
      const data = await fetchSparePartRequestDetailsOdoo(id);
      setDetail(data);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to approve', position: 'bottom' });
    } finally {
      setApproving(false);
    }
  };

  const stateColor = STATE_COLORS[detail?.state] || '#999';
  const activeStage = STAGE_MAP[detail?.state] ?? 0;

  const DetailRow = ({ label, value }) => (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '-'}</Text>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Request Details" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        {detail && (
          <>
            {/* Stage Progress Bar */}
            <View style={styles.stageBar}>
              {STAGES.map((stage, i) => (
                <View key={stage} style={styles.stageItem}>
                  <View style={[styles.stageDot, i <= activeStage && styles.stageDotActive]} />
                  <Text style={[styles.stageText, i <= activeStage && styles.stageTextActive]}>{stage}</Text>
                  {i < STAGES.length - 1 && (
                    <View style={[styles.stageLine, i < activeStage && styles.stageLineActive]} />
                  )}
                </View>
              ))}
            </View>

            {/* Header Info */}
            <View style={styles.sectionCard}>
              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>{detail.name}</Text>
                <View style={[styles.badge, { backgroundColor: stateColor }]}>
                  <Text style={styles.badgeText}>{(detail.state || 'draft').toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <DetailRow label="Job Card" value={detail.job_card_name} />
              <DetailRow label="Customer" value={detail.partner_name} />
              <DetailRow label="Requested By" value={detail.requested_by} />
              <DetailRow label="Requested To" value={detail.requested_to} />
              <DetailRow label="Request Date" value={detail.request_date ? detail.request_date.split(' ')[0] : ''} />
              {detail.approved_by ? <DetailRow label="Approved By" value={detail.approved_by} /> : null}
              {detail.approved_date ? <DetailRow label="Approved Date" value={detail.approved_date.split(' ')[0]} /> : null}
            </View>

            {/* Spare Parts Lines Table */}
            {detail.spare_lines && detail.spare_lines.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Spare Parts</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.thText, { width: 150 }]}>Spare Part</Text>
                      <Text style={[styles.thText, { width: 120 }]}>Description</Text>
                      <Text style={[styles.thText, { width: 80 }]}>Req Qty</Text>
                      <Text style={[styles.thText, { width: 70 }]}>Unit</Text>
                      <Text style={[styles.thText, { width: 80 }]}>Issued Qty</Text>
                      <Text style={[styles.thText, { width: 90 }]}>Returned Qty</Text>
                    </View>
                    {detail.spare_lines.map((line, idx) => (
                      <View key={line.id || idx} style={styles.tableRow}>
                        <Text style={[styles.tdText, { width: 150 }]}>{line.product_name || '-'}</Text>
                        <Text style={[styles.tdText, { width: 120 }]}>{line.description || '-'}</Text>
                        <Text style={[styles.tdText, { width: 80, textAlign: 'center' }]}>{line.requested_qty}</Text>
                        <Text style={[styles.tdText, { width: 70, textAlign: 'center' }]}>{line.uom || 'Units'}</Text>
                        <Text style={[styles.tdText, { width: 80, textAlign: 'center' }]}>{line.issued_qty}</Text>
                        <Text style={[styles.tdText, { width: 90, textAlign: 'center' }]}>{line.returned_qty}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Notes */}
            {detail.notes ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.notesText}>{detail.notes}</Text>
              </View>
            ) : null}

            {/* Approve Button - only shown to the assigned user (requested_to) */}
            {(detail.state === 'draft' || detail.state === 'requested') && (() => {
              const reqTo = detail.requested_to || '';
              const uid = currentUser?.uid;
              const uName = (currentUser?.name || currentUser?.login || '').toLowerCase();
              const reqToStr = (typeof reqTo === 'string' ? reqTo : '').toLowerCase();
              const isAssigned = (uid && detail.requested_to_id && detail.requested_to_id === uid) ||
                (reqToStr && uName && reqToStr === uName);
              if (isAssigned) {
                return (
                  <LoadingButton
                    backgroundColor="#4CAF50"
                    title="Approve Request"
                    onPress={handleApprove}
                    loading={approving}
                  />
                );
              }
              return (
                <View style={{ padding: 12, backgroundColor: '#FFF3E0', borderRadius: 8, marginTop: 8 }}>
                  <Text style={{ fontSize: 13, color: '#F44336', fontFamily: FONT_FAMILY.urbanistMedium }}>
                    Only {reqTo || 'the assigned user'} can approve this request.
                  </Text>
                </View>
              );
            })()}
          </>
        )}
      </RoundedScrollContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  stageBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  stageItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ccc',
    marginHorizontal: 4,
  },
  stageDotActive: {
    backgroundColor: COLORS.primaryThemeColor,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stageText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginRight: 4,
  },
  stageTextActive: {
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  stageLine: {
    width: 20,
    height: 1.5,
    backgroundColor: '#ddd',
    marginHorizontal: 2,
  },
  stageLineActive: {
    backgroundColor: COLORS.primaryThemeColor,
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    maxWidth: '60%',
    textAlign: 'right',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginTop: 10,
  },
  thText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#555',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tdText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
  },
  notesText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#555',
    marginTop: 8,
    lineHeight: 20,
  },
});

export default SpareRequestDetails;
