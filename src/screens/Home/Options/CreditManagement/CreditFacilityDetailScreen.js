import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform, ScrollView, TouchableOpacity, TextInput, Alert, Image } from 'react-native';
import Text from '@components/Text';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useCurrencyStore } from '@stores/currency';
import Toast from 'react-native-toast-message';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  fetchCreditFacilityDetailOdoo,
  approveCreditFacilityOdoo,
  rejectCreditFacilityOdoo,
  resetCreditFacilityToDraftOdoo,
  submitCreditFacilityOdoo,
} from '@api/services/generalApi';

const STATES = ['draft', 'submitted', 'approved', 'rejected'];
const STATE_LABELS = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' };
const STATE_COLORS = { draft: '#FF9800', submitted: '#2196F3', approved: '#4CAF50', rejected: '#F44336' };

const TAB_ROUTES = [
  { key: 'companyInfo', title: 'Company Info' },
  { key: 'business', title: 'Business & Proprietors' },
  { key: 'signatories', title: 'Auth. Signatories' },
  { key: 'contacts', title: 'Contacts' },
  { key: 'financial', title: 'Financial Info' },
  { key: 'documents', title: 'Documents' },
];

// --- Read-only field display ---
const FieldRow = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{String(value)}</Text>
    </View>
  );
};

const SectionCard = ({ title, children }) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

// --- Tab Content Components ---
const CompanyInfoContent = ({ d }) => (
  <View style={styles.tabContentInner}>
    <SectionCard title="Company Information">
      <FieldRow label="Company Name" value={d.company_name} />
      <FieldRow label="Company Address" value={d.company_address} />
      <FieldRow label="Email" value={d.email} />
      <FieldRow label="Phone Number" value={d.phone_number} />
      <FieldRow label="Fax" value={d.fax} />
      <FieldRow label="Trade License No" value={d.trade_license_no} />
      <FieldRow label="PO Box" value={d.po_box} />
    </SectionCard>
    <SectionCard title="License & Credit Dates">
      <FieldRow label="License Issue Date" value={d.license_issue_date} />
      <FieldRow label="License Expiry Date" value={d.license_expiry_date} />
      <FieldRow label="Credit Issue Date" value={d.credit_issue_date} />
      <FieldRow label="Credit Expiry Date" value={d.credit_expiry_date} />
    </SectionCard>
    <SectionCard title="Branch Details">
      <FieldRow label="Branch Mobile No" value={d.branch_mobile_no} />
      <FieldRow label="Branch Telephone" value={d.branch_tele} />
      <FieldRow label="Branch Fax" value={d.branch_fax} />
    </SectionCard>
  </View>
);

const BusinessContent = ({ d }) => (
  <View style={styles.tabContentInner}>
    <SectionCard title="Business Information">
      <FieldRow label="Local Sponsor" value={d.local_sponsor} />
      <FieldRow label="Occupation" value={d.occupation} />
    </SectionCard>
    <SectionCard title="Proprietors / Stakeholders / Shareholders">
      {[1, 2, 3].map(i => {
        const name = d[`proprietor_name_${i}`];
        if (!name) return null;
        return (
          <View key={i} style={styles.subSection}>
            <Text style={styles.subTitle}>Proprietor {i}</Text>
            <FieldRow label="Name" value={name} />
            <FieldRow label="Nationality" value={d[`proprietor_nationality_${i}`]} />
            <FieldRow label="Holding %" value={d[`proprietor_holding_${i}`]} />
          </View>
        );
      })}
    </SectionCard>
  </View>
);

const SignatoriesContent = ({ d, baseUrl }) => (
  <View style={styles.tabContentInner}>
    <SectionCard title="Authorized Signatories">
      {[1, 2, 3].map(i => {
        const name = d[`signatory_name_${i}`];
        const sig = d[`signatory_signature_${i}`];
        if (!name && !sig) return null;
        return (
          <View key={i} style={styles.subSection}>
            <Text style={styles.subTitle}>Signatory {i}</Text>
            <FieldRow label="Name" value={name} />
            <FieldRow label="Nationality" value={d[`signatory_nationality_${i}`]} />
            {sig ? <Image source={{ uri: `data:image/png;base64,${sig}` }} style={styles.signatureImage} resizeMode="contain" /> : null}
          </View>
        );
      })}
    </SectionCard>
  </View>
);

const ContactsContent = ({ d }) => (
  <View style={styles.tabContentInner}>
    <SectionCard title="Purchasing Contacts">
      {[1, 2].map(i => {
        const name = d[`purchasing_name_${i}`];
        if (!name) return null;
        return (
          <View key={i} style={styles.subSection}>
            <Text style={styles.subTitle}>Contact {i}</Text>
            <FieldRow label="Name" value={name} />
            <FieldRow label="Title" value={d[`purchasing_title_${i}`]} />
            <FieldRow label="Telephone" value={d[`purchasing_tele_${i}`]} />
            <FieldRow label="Fax" value={d[`purchasing_fax_${i}`]} />
            <FieldRow label="Email" value={d[`purchasing_email_${i}`]} />
            {d[`purchasing_signature_${i}`] ? <Image source={{ uri: `data:image/png;base64,${d[`purchasing_signature_${i}`]}` }} style={styles.signatureImage} resizeMode="contain" /> : null}
          </View>
        );
      })}
    </SectionCard>
    <SectionCard title="Accounts Contact">
      <FieldRow label="Name" value={d.accounts_name} />
      <FieldRow label="Telephone" value={d.accounts_tele} />
      <FieldRow label="Fax" value={d.accounts_fax} />
      <FieldRow label="Email" value={d.accounts_email} />
      <FieldRow label="Date Business Started" value={d.date_business_started} />
      <FieldRow label="Any Other Business" value={d.any_other_business} />
      <FieldRow label="Business Description" value={d.business_description} />
      {d.accounts_signature ? <Image source={{ uri: `data:image/png;base64,${d.accounts_signature}` }} style={styles.signatureImage} resizeMode="contain" /> : null}
    </SectionCard>
  </View>
);

const FinancialContent = ({ d }) => (
  <View style={styles.tabContentInner}>
    <SectionCard title="Present Yearly Sales Volume">
      <FieldRow label="Yearly Sales Volume" value={d.sales_volume} />
      <FieldRow label="Sales Days" value={d.sales_days} />
    </SectionCard>
    <SectionCard title="Bank Details">
      {[1, 2].map(i => {
        const name = d[`bank_name_${i}`];
        if (!name) return null;
        return (
          <View key={i} style={styles.subSection}>
            <Text style={styles.subTitle}>Bank {i}</Text>
            <FieldRow label="Bank Name" value={name} />
            <FieldRow label="Account" value={d[`bank_account_${i}`]} />
            <FieldRow label="Branch" value={d[`bank_branch_${i}`]} />
            <FieldRow label="Country" value={d[`bank_country_${i}`]} />
            <FieldRow label="Telephone" value={d[`bank_tele_${i}`]} />
            <FieldRow label="Fax" value={d[`bank_fax_${i}`]} />
          </View>
        );
      })}
    </SectionCard>
  </View>
);

const DocumentsContent = ({ d }) => {
  const docs = [
    { key: 'trade_license_file', label: 'Trade License File' },
    { key: 'passport_copy_file', label: 'Passport Copy File' },
    { key: 'tax_registration_file', label: 'Tax Registration File' },
    { key: 'credit_application_file', label: 'Credit Application File' },
    { key: 'nationality_id_file', label: 'Nationality ID File' },
  ];
  return (
    <View style={styles.tabContentInner}>
      <SectionCard title="Uploaded Documents">
        <View style={styles.docsGrid}>
          {docs.map(doc => (
            <View key={doc.key} style={styles.docItem}>
              <Text style={styles.docLabel}>{doc.label}</Text>
              {d[doc.key] ? (
                <Image source={{ uri: `data:image/png;base64,${d[doc.key]}` }} style={styles.docImage} resizeMode="cover" />
              ) : (
                <View style={styles.docEmpty}><Text style={styles.docEmptyText}>No file</Text></View>
              )}
            </View>
          ))}
        </View>
      </SectionCard>
    </View>
  );
};

// --- Main Screen ---
const CreditFacilityDetailScreen = ({ navigation, route }) => {
  const { facilityId } = route?.params || {};
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [tabIndex, setTabIndex] = useState(0);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await fetchCreditFacilityDetailOdoo(facilityId);
      setData(detail);
      setRejectionReason(detail.rejection_reason || '');
    } catch (err) {
      console.error('fetchDetail error:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to load details', position: 'bottom' });
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleApprove = () => {
    Alert.alert('Approve', 'Are you sure you want to approve this application?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve', onPress: async () => {
          setActionLoading(true);
          try {
            await approveCreditFacilityOdoo(facilityId);
            Toast.show({ type: 'success', text1: 'Approved', text2: 'Credit facility approved successfully', position: 'bottom' });
            fetchDetail();
          } catch (err) {
            Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to approve', position: 'bottom' });
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter a rejection reason', position: 'bottom' });
      return;
    }
    Alert.alert('Reject', 'Are you sure you want to reject this application?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            await rejectCreditFacilityOdoo(facilityId, rejectionReason);
            Toast.show({ type: 'success', text1: 'Rejected', text2: 'Credit facility rejected', position: 'bottom' });
            fetchDetail();
          } catch (err) {
            Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to reject', position: 'bottom' });
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleResetToDraft = async () => {
    setActionLoading(true);
    try {
      await resetCreditFacilityToDraftOdoo(facilityId);
      Toast.show({ type: 'success', text1: 'Reset', text2: 'Application reset to draft', position: 'bottom' });
      fetchDetail();
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to reset', position: 'bottom' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = async () => {
    setActionLoading(true);
    try {
      await submitCreditFacilityOdoo(facilityId);
      Toast.show({ type: 'success', text1: 'Submitted', text2: 'Application submitted for approval', position: 'bottom' });
      fetchDetail();
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to submit', position: 'bottom' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Application Details" onBackPress={() => navigation.goBack()} />
        <OverlayLoader visible={true} />
      </SafeAreaView>
    );
  }

  const state = (data.state || 'draft').toLowerCase();

  return (
    <SafeAreaView>
      <NavigationHeader title={data.name || 'Application Details'} onBackPress={() => navigation.goBack()} />

      <ScrollView style={styles.scrollView}>
        {/* Status Bar */}
        <View style={styles.statusBar}>
          {STATES.map((s, idx) => {
            const isActive = STATES.indexOf(state) >= idx;
            const isCurrent = state === s;
            return (
              <View key={s} style={[styles.statusStep, isActive && { backgroundColor: STATE_COLORS[s] }]}>
                <Text style={[styles.statusText, isActive && styles.statusTextActive, isCurrent && styles.statusTextCurrent]}>
                  {STATE_LABELS[s]}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Icon name="credit-card-outline" size={22} color={COLORS.primaryThemeColor} />
            <Text style={styles.infoHeaderText}>Credit Facility Application</Text>
          </View>
          <Text style={styles.infoSubText}>Complete credit facility details for customer</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Customer</Text>
              <Text style={styles.infoValue}>{data.partner_name || '-'}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Credit Limit</Text>
              <Text style={styles.infoValue}>{currencySymbol} {(data.credit_limit || 0).toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Use Credit Facility</Text>
              <Text style={styles.infoValue}>{data.use_credit_facility || '-'}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Submission Date</Text>
              <Text style={styles.infoValue}>{data.submission_date || '-'}</Text>
            </View>
          </View>

          {(state === 'approved' || state === 'rejected') && (
            <View style={styles.infoGrid}>
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Approved/Rejected By</Text>
                <Text style={styles.infoValue}>{data.approved_by_name || '-'}</Text>
              </View>
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Approval/Rejection Date</Text>
                <Text style={styles.infoValue}>{data.approval_date || '-'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Rejection Reason */}
        {state === 'rejected' && data.rejection_reason ? (
          <View style={styles.rejectionCard}>
            <Text style={styles.rejectionTitle}>Rejection Reason</Text>
            <Text style={styles.rejectionText}>{data.rejection_reason}</Text>
          </View>
        ) : null}

        {state === 'submitted' && (
          <View style={styles.rejectionCard}>
            <Text style={styles.rejectionTitle}>Rejection Reason (fill before rejecting)</Text>
            <TextInput
              style={styles.rejectionInput}
              placeholder="Enter reason if you want to reject..."
              placeholderTextColor="#999"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={3}
            />
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {state === 'draft' && (
            <LoadingButton
              backgroundColor="#2196F3"
              title="Submit for Approval"
              onPress={handleSubmit}
              loading={actionLoading}
            />
          )}
          {state === 'submitted' && (
            <>
              <LoadingButton
                backgroundColor="#4CAF50"
                title="Approve"
                onPress={handleApprove}
                loading={actionLoading}
              />
              <View style={{ height: 8 }} />
              <LoadingButton
                backgroundColor="#F44336"
                title="Reject"
                onPress={handleReject}
                loading={actionLoading}
              />
            </>
          )}
          {(state === 'approved' || state === 'rejected') && (
            <LoadingButton
              backgroundColor="#FF9800"
              title="Reset to Draft"
              onPress={handleResetToDraft}
              loading={actionLoading}
            />
          )}
        </View>

        {/* Tab Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
          {TAB_ROUTES.map((route, idx) => (
            <TouchableOpacity
              key={route.key}
              style={[styles.tabItem, tabIndex === idx && styles.tabItemActive]}
              onPress={() => setTabIndex(idx)}
            >
              <Text style={[styles.tabLabel, tabIndex === idx && styles.tabLabelActive]}>
                {route.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tab Content */}
        {tabIndex === 0 && <CompanyInfoContent d={data} />}
        {tabIndex === 1 && <BusinessContent d={data} />}
        {tabIndex === 2 && <SignatoriesContent d={data} />}
        {tabIndex === 3 && <ContactsContent d={data} />}
        {tabIndex === 4 && <FinancialContent d={data} />}
        {tabIndex === 5 && <DocumentsContent d={data} />}

        <View style={{ height: 40 }} />
      </ScrollView>

      <OverlayLoader visible={actionLoading} />
    </SafeAreaView>
  );
};

export default CreditFacilityDetailScreen;

const styles = StyleSheet.create({
  scrollView: { flex: 1 },

  // Status Bar
  statusBar: {
    flexDirection: 'row',
    margin: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  statusStep: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#999',
  },
  statusTextActive: { color: '#fff' },
  statusTextCurrent: { fontSize: 12 },

  // Info Card
  infoCard: {
    backgroundColor: '#E0F7FA',
    borderRadius: 12,
    padding: 16,
    margin: 12,
    marginTop: 0,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoHeaderText: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginLeft: 8,
  },
  infoSubText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#00838F',
    marginBottom: 12,
  },
  infoGrid: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoCol: { flex: 1 },
  infoLabel: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    marginTop: 2,
  },

  // Rejection
  rejectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 8,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  rejectionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#F44336',
    marginBottom: 8,
  },
  rejectionText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
  },
  rejectionInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
    textAlignVertical: 'top',
    minHeight: 60,
  },

  // Action Buttons
  actionButtons: {
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  // Tab Bar
  tabBar: {
    backgroundColor: COLORS.tabColor || '#F37021',
    flexDirection: 'row',
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: COLORS.tabIndicator || '#2E294E',
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: 'rgba(255,255,255,0.7)',
  },
  tabLabelActive: { color: '#fff' },

  // Tab Content
  tabContentInner: { padding: 12 },

  // Section Card
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginBottom: 10,
  },
  subSection: { marginBottom: 12 },
  subTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },

  // Field Row
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#666',
    flex: 1,
  },
  fieldValue: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },

  // Signature Image
  signatureImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 8,
    backgroundColor: '#fff',
  },

  // Documents
  docsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  docItem: { width: '48%', marginBottom: 16 },
  docLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
    marginBottom: 8,
  },
  docImage: {
    width: '100%',
    height: 150,
    borderRadius: 10,
  },
  docEmpty: {
    height: 150,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  docEmptyText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#adb5bd',
  },
});
