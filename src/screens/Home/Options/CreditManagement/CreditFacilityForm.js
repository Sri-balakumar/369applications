import React, { useState, useEffect, useReducer, useCallback } from 'react';
import { View, StyleSheet, Platform, ScrollView, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { DropdownSheet } from '@components/common/BottomSheets';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useCurrencyStore } from '@stores/currency';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { OverlayLoader } from '@components/Loader';
import { createCreditFacilityOdoo, submitCreditFacilityOdoo } from '@api/services/generalApi';

import {
  CompanyInfoTab,
  BusinessProprietorsTab,
  AuthorizedSignatoriesTab,
  ContactsTab,
  FinancialInfoTab,
  UploadedDocumentsTab,
} from './CreditFacilityFormTabs';

const USE_CREDIT_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

// --- Reducer ---
const initialState = {
  // Header
  partner: null,
  creditLimit: '',
  useCreditFacility: { id: 'yes', label: 'Yes' },

  // Tab 1: Company Info
  companyName: '', companyAddress: '', fax: '', phoneNumber: '',
  tradeLicenseNo: '', poBox: '', email: '',
  licenseIssueDate: null, licenseExpiryDate: null,
  creditIssueDate: null, creditExpiryDate: null,
  branchMobileNo: '', branchTelephone: '', branchFax: '',

  // Tab 2: Business & Proprietors
  localSponsor: '', occupation: '',
  proprietors: [
    { name: '', nationality: '', holdingPercent: '' },
    { name: '', nationality: '', holdingPercent: '' },
    { name: '', nationality: '', holdingPercent: '' },
  ],

  // Tab 3: Authorized Signatories
  signatories: [
    { name: '', nationality: '', signatureBase64: null },
    { name: '', nationality: '', signatureBase64: null },
    { name: '', nationality: '', signatureBase64: null },
  ],

  // Tab 4: Contacts
  purchasingContacts: [
    { name: '', title: '', telephone: '', fax: '', email: '', signatureBase64: null },
    { name: '', title: '', telephone: '', fax: '', email: '', signatureBase64: null },
  ],
  accountsContact: {
    name: '', telephone: '', fax: '', email: '',
    dateBusinessStarted: null, anyOtherBusiness: { id: 'no', label: 'No' },
    businessDescription: '', signatureBase64: null,
  },

  // Tab 5: Financial Information
  yearlySalesVolume: '', salesDays: '',
  banks: [
    { bankName: '', account: '', branch: '', country: '', telephone: '', fax: '' },
    { bankName: '', account: '', branch: '', country: '', telephone: '', fax: '' },
  ],

  // Tab 6: Uploaded Documents
  tradeLicenseFile: null, passportCopyFile: null,
  taxRegistrationFile: null, creditApplicationFile: null,
  nationalityIdFile: null,
};

function formReducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_PROPRIETOR': {
      const proprietors = [...state.proprietors];
      proprietors[action.index] = { ...proprietors[action.index], [action.field]: action.value };
      return { ...state, proprietors };
    }
    case 'SET_SIGNATORY': {
      const signatories = [...state.signatories];
      signatories[action.index] = { ...signatories[action.index], [action.field]: action.value };
      return { ...state, signatories };
    }
    case 'SET_PURCHASING_CONTACT': {
      const purchasingContacts = [...state.purchasingContacts];
      purchasingContacts[action.index] = { ...purchasingContacts[action.index], [action.field]: action.value };
      return { ...state, purchasingContacts };
    }
    case 'SET_ACCOUNTS_CONTACT':
      return { ...state, accountsContact: { ...state.accountsContact, [action.field]: action.value } };
    case 'SET_BANK': {
      const banks = [...state.banks];
      banks[action.index] = { ...banks[action.index], [action.field]: action.value };
      return { ...state, banks };
    }
    default:
      return state;
  }
}

const CreditFacilityForm = ({ navigation, route }) => {
  const currency = useCurrencyStore((state) => state.currency) || '';

  const [formData, dispatch] = useReducer(formReducer, {
    ...initialState,
    partner: route?.params?.partner || null,
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [activeDateField, setActiveDateField] = useState(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  // Tab state
  const [tabIndex, setTabIndex] = useState(0);
  const [routes] = useState([
    { key: 'companyInfo', title: 'Company Info' },
    { key: 'business', title: 'Business & Proprietors' },
    { key: 'signatories', title: 'Auth. Signatories' },
    { key: 'contacts', title: 'Contacts' },
    { key: 'financial', title: 'Financial Info' },
    { key: 'documents', title: 'Documents' },
  ]);

  useEffect(() => {
    if (route?.params?.partner) {
      dispatch({ type: 'SET_FIELD', field: 'partner', value: route.params.partner });
      clearError('partner');
    }
  }, [route?.params?.partner]);

  const clearError = (field) => {
    setErrors((prev) => ({ ...prev, [field]: null }));
  };

  // --- Helper callbacks ---
  const updateField = useCallback((field, value) => {
    dispatch({ type: 'SET_FIELD', field, value });
  }, []);

  const updateProprietor = useCallback((index, field, value) => {
    dispatch({ type: 'SET_PROPRIETOR', index, field, value });
  }, []);

  const updateSignatory = useCallback((index, field, value) => {
    dispatch({ type: 'SET_SIGNATORY', index, field, value });
  }, []);

  const updatePurchasingContact = useCallback((index, field, value) => {
    dispatch({ type: 'SET_PURCHASING_CONTACT', index, field, value });
  }, []);

  const updateAccountsContact = useCallback((field, value) => {
    dispatch({ type: 'SET_ACCOUNTS_CONTACT', field, value });
  }, []);

  const updateBank = useCallback((index, field, value) => {
    dispatch({ type: 'SET_BANK', index, field, value });
  }, []);

  const openPartnerSelector = () => {
    navigation.navigate('CustomerScreen', {
      selectMode: true,
      onSelect: (selected) => {
        dispatch({ type: 'SET_FIELD', field: 'partner', value: selected });
        clearError('partner');
      },
    });
  };

  const openDatePicker = useCallback((field) => {
    setActiveDateField(field);
    setIsDatePickerVisible(true);
  }, []);

  const handleDateConfirm = (date) => {
    setIsDatePickerVisible(false);
    if (activeDateField === 'dateBusinessStarted') {
      dispatch({ type: 'SET_ACCOUNTS_CONTACT', field: 'dateBusinessStarted', value: date });
    } else {
      dispatch({ type: 'SET_FIELD', field: activeDateField, value: date });
    }
  };

  const getDateValue = () => {
    if (activeDateField === 'dateBusinessStarted') {
      return formData.accountsContact.dateBusinessStarted || new Date();
    }
    return formData[activeDateField] || new Date();
  };

  // --- Validation ---
  const validate = () => {
    const newErrors = {};
    if (!formData.partner) newErrors.partner = 'Customer is required';
    if (!formData.creditLimit || parseFloat(formData.creditLimit) <= 0) newErrors.creditLimit = 'Valid credit limit is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Helper to strip base64 prefix ---
  const stripBase64Prefix = (base64Str) => {
    if (!base64Str) return false;
    return base64Str.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  };

  // --- Submit ---
  const handleSubmit = async (shouldSubmitForApproval = false) => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const partnerId = formData.partner?.id || formData.partner?._id || null;
      const data = {
        partner_id: partnerId,
        credit_limit: parseFloat(formData.creditLimit) || 0,
        use_credit_facility: formData.useCreditFacility.id,
        // Tab 1: Company Info
        company_name: formData.companyName || '',
        company_address: formData.companyAddress || '',
        phone_number: formData.phoneNumber || '',
        email: formData.email || '',
        fax: formData.fax || '',
        trade_license_no: formData.tradeLicenseNo || '',
        po_box: formData.poBox || '',
        branch_mobile_no: formData.branchMobileNo || '',
        branch_tele: formData.branchTelephone || '',
        branch_fax: formData.branchFax || '',
        // Tab 2: Business & Proprietors
        local_sponsor: formData.localSponsor || '',
        occupation: formData.occupation || '',
        proprietor_name_1: formData.proprietors[0].name || '',
        proprietor_nationality_1: formData.proprietors[0].nationality || '',
        proprietor_holding_1: parseFloat(formData.proprietors[0].holdingPercent) || 0,
        proprietor_name_2: formData.proprietors[1].name || '',
        proprietor_nationality_2: formData.proprietors[1].nationality || '',
        proprietor_holding_2: parseFloat(formData.proprietors[1].holdingPercent) || 0,
        proprietor_name_3: formData.proprietors[2].name || '',
        proprietor_nationality_3: formData.proprietors[2].nationality || '',
        proprietor_holding_3: parseFloat(formData.proprietors[2].holdingPercent) || 0,
        // Tab 3: Signatories
        signatory_name_1: formData.signatories[0].name || '',
        signatory_nationality_1: formData.signatories[0].nationality || '',
        signatory_signature_1: stripBase64Prefix(formData.signatories[0].signatureBase64),
        signatory_name_2: formData.signatories[1].name || '',
        signatory_nationality_2: formData.signatories[1].nationality || '',
        signatory_signature_2: stripBase64Prefix(formData.signatories[1].signatureBase64),
        signatory_name_3: formData.signatories[2].name || '',
        signatory_nationality_3: formData.signatories[2].nationality || '',
        signatory_signature_3: stripBase64Prefix(formData.signatories[2].signatureBase64),
        // Tab 4: Purchasing Contacts
        purchasing_name_1: formData.purchasingContacts[0].name || '',
        purchasing_title_1: formData.purchasingContacts[0].title || '',
        purchasing_tele_1: formData.purchasingContacts[0].telephone || '',
        purchasing_fax_1: formData.purchasingContacts[0].fax || '',
        purchasing_email_1: formData.purchasingContacts[0].email || '',
        purchasing_signature_1: stripBase64Prefix(formData.purchasingContacts[0].signatureBase64),
        purchasing_name_2: formData.purchasingContacts[1].name || '',
        purchasing_title_2: formData.purchasingContacts[1].title || '',
        purchasing_tele_2: formData.purchasingContacts[1].telephone || '',
        purchasing_fax_2: formData.purchasingContacts[1].fax || '',
        purchasing_email_2: formData.purchasingContacts[1].email || '',
        purchasing_signature_2: stripBase64Prefix(formData.purchasingContacts[1].signatureBase64),
        // Tab 4: Accounts Contact
        accounts_name: formData.accountsContact.name || '',
        accounts_tele: formData.accountsContact.telephone || '',
        accounts_fax: formData.accountsContact.fax || '',
        accounts_email: formData.accountsContact.email || '',
        accounts_signature: stripBase64Prefix(formData.accountsContact.signatureBase64),
        any_other_business: formData.accountsContact.anyOtherBusiness?.id || '',
        business_description: formData.accountsContact.businessDescription || '',
        // Tab 5: Financial Info
        sales_volume: parseFloat(formData.yearlySalesVolume) || 0,
        sales_days: parseInt(formData.salesDays, 10) || 0,
        bank_name_1: formData.banks[0].bankName || '',
        bank_account_1: formData.banks[0].account || '',
        bank_branch_1: formData.banks[0].branch || '',
        bank_country_1: formData.banks[0].country || '',
        bank_tele_1: formData.banks[0].telephone || '',
        bank_fax_1: formData.banks[0].fax || '',
        bank_name_2: formData.banks[1].bankName || '',
        bank_account_2: formData.banks[1].account || '',
        bank_branch_2: formData.banks[1].branch || '',
        bank_country_2: formData.banks[1].country || '',
        bank_tele_2: formData.banks[1].telephone || '',
        bank_fax_2: formData.banks[1].fax || '',
        // Tab 6: Documents
        trade_license_file: stripBase64Prefix(formData.tradeLicenseFile),
        passport_copy_file: stripBase64Prefix(formData.passportCopyFile),
        tax_registration_file: stripBase64Prefix(formData.taxRegistrationFile),
        credit_application_file: stripBase64Prefix(formData.creditApplicationFile),
        nationality_id_file: stripBase64Prefix(formData.nationalityIdFile),
      };

      // Dates
      if (formData.licenseIssueDate) data.license_issue_date = format(formData.licenseIssueDate, 'yyyy-MM-dd');
      if (formData.licenseExpiryDate) data.license_expiry_date = format(formData.licenseExpiryDate, 'yyyy-MM-dd');
      if (formData.creditIssueDate) data.credit_issue_date = format(formData.creditIssueDate, 'yyyy-MM-dd');
      if (formData.creditExpiryDate) data.credit_expiry_date = format(formData.creditExpiryDate, 'yyyy-MM-dd');
      if (formData.accountsContact.dateBusinessStarted) data.date_business_started = format(formData.accountsContact.dateBusinessStarted, 'yyyy-MM-dd');

      const facilityId = await createCreditFacilityOdoo(data);

      if (facilityId && shouldSubmitForApproval) {
        await submitCreditFacilityOdoo(facilityId);
        Toast.show({ type: 'success', text1: 'Submitted', text2: 'Credit facility submitted for approval', position: 'bottom' });
      } else if (facilityId) {
        Toast.show({ type: 'success', text1: 'Saved', text2: 'Credit facility application created as draft', position: 'bottom' });
      }
      navigation.goBack();
    } catch (err) {
      console.error('Credit facility submit error:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to create application', position: 'bottom' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Credit Facility Application" onBackPress={() => navigation.goBack()} />

      {/* Application Details - Scrollable header with tabs below */}
      <ScrollView style={styles.headerScrollView} nestedScrollEnabled>
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Application Details</Text>

          <FormInput
            label="Customer"
            placeholder="Select Customer"
            dropIcon="chevron-down"
            editable={false}
            value={formData.partner?.name?.trim() || ''}
            required
            validate={errors.partner}
            onPress={openPartnerSelector}
          />

          <FormInput
            label="Credit Limit"
            placeholder="0.00"
            value={formData.creditLimit}
            keyboardType="numeric"
            required
            validate={errors.creditLimit}
            onChangeText={(val) => { updateField('creditLimit', val); clearError('creditLimit'); }}
          />

          <FormInput
            label="Use Credit Facility"
            placeholder="Select"
            dropIcon="menu-down"
            editable={false}
            value={formData.useCreditFacility?.label || ''}
            onPress={() => setIsDropdownVisible(true)}
          />
        </View>

        {/* Tab Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarContainer}>
          {routes.map((route, idx) => (
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

        {/* Tab Content - rendered inline inside ScrollView */}
        <View style={styles.tabContent}>
          {tabIndex === 0 && <CompanyInfoTab formData={formData} updateField={updateField} openDatePicker={openDatePicker} />}
          {tabIndex === 1 && <BusinessProprietorsTab formData={formData} updateField={updateField} updateProprietor={updateProprietor} />}
          {tabIndex === 2 && <AuthorizedSignatoriesTab formData={formData} updateSignatory={updateSignatory} />}
          {tabIndex === 3 && <ContactsTab formData={formData} updatePurchasingContact={updatePurchasingContact} updateAccountsContact={updateAccountsContact} openDatePicker={openDatePicker} />}
          {tabIndex === 4 && <FinancialInfoTab formData={formData} updateField={updateField} updateBank={updateBank} />}
          {tabIndex === 5 && <UploadedDocumentsTab formData={formData} updateField={updateField} />}
        </View>

        {/* Buttons */}
        <View style={styles.buttonSection}>
          <LoadingButton
            backgroundColor={COLORS.primaryThemeColor}
            title="Save as Draft"
            onPress={() => handleSubmit(false)}
            loading={isSubmitting}
          />
          <View style={{ height: 8 }} />
          <LoadingButton
            backgroundColor="#4CAF50"
            title="Submit for Approval"
            onPress={() => handleSubmit(true)}
            loading={isSubmitting}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <DropdownSheet
        isVisible={isDropdownVisible}
        items={USE_CREDIT_OPTIONS}
        title="Use Credit Facility"
        onClose={() => setIsDropdownVisible(false)}
        onValueChange={(item) => { updateField('useCreditFacility', item); setIsDropdownVisible(false); }}
      />

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        date={getDateValue()}
        onConfirm={handleDateConfirm}
        onCancel={() => setIsDatePickerVisible(false)}
      />

      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

export default CreditFacilityForm;

const styles = StyleSheet.create({
  headerScrollView: {
    flex: 1,
  },
  headerSection: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    margin: 12,
    marginBottom: 8,
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
  tabBarContainer: {
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
  tabLabelActive: {
    color: '#fff',
  },
  tabContent: {
    minHeight: 200,
  },
  buttonSection: {
    padding: 12,
  },
});
