import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Text from '@components/Text';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
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

const USE_CREDIT_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

const CreditFacilityForm = ({ navigation, route }) => {
  const currency = useCurrencyStore((state) => state.currency) || '';

  // --- Form State ---
  const [partner, setPartner] = useState(route?.params?.partner || null);
  const [useCreditFacility, setUseCreditFacility] = useState({ id: 'yes', label: 'Yes' });
  const [creditLimit, setCreditLimit] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [fax, setFax] = useState('');
  const [tradeLicenseNo, setTradeLicenseNo] = useState('');
  const [poBox, setPoBox] = useState('');
  const [licenseIssueDate, setLicenseIssueDate] = useState(null);
  const [licenseExpiryDate, setLicenseExpiryDate] = useState(null);
  const [creditIssueDate, setCreditIssueDate] = useState(null);
  const [creditExpiryDate, setCreditExpiryDate] = useState(null);
  const [errors, setErrors] = useState({});

  // --- Dropdown & Date Picker State ---
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [activeDateField, setActiveDateField] = useState(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  // --- Loading ---
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Update partner from route params ---
  useEffect(() => {
    if (route?.params?.partner) {
      setPartner(route.params.partner);
      clearError('partner');
    }
  }, [route?.params?.partner]);

  const clearError = (field) => {
    setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const openPartnerSelector = () => {
    navigation.navigate('CustomerScreen', {
      selectMode: true,
      onSelect: (selected) => {
        setPartner(selected);
        clearError('partner');
      },
    });
  };

  const openDatePicker = (field) => {
    setActiveDateField(field);
    setIsDatePickerVisible(true);
  };

  const handleDateConfirm = (date) => {
    setIsDatePickerVisible(false);
    switch (activeDateField) {
      case 'licenseIssueDate': setLicenseIssueDate(date); break;
      case 'licenseExpiryDate': setLicenseExpiryDate(date); break;
      case 'creditIssueDate': setCreditIssueDate(date); break;
      case 'creditExpiryDate': setCreditExpiryDate(date); break;
    }
  };

  const getDateValue = () => {
    switch (activeDateField) {
      case 'licenseIssueDate': return licenseIssueDate || new Date();
      case 'licenseExpiryDate': return licenseExpiryDate || new Date();
      case 'creditIssueDate': return creditIssueDate || new Date();
      case 'creditExpiryDate': return creditExpiryDate || new Date();
      default: return new Date();
    }
  };

  // --- Validation ---
  const validate = () => {
    const newErrors = {};
    if (!partner) newErrors.partner = 'Customer is required';
    if (!creditLimit || parseFloat(creditLimit) <= 0) newErrors.creditLimit = 'Valid credit limit is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Submit ---
  const handleSubmit = async (shouldSubmitForApproval = false) => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const partnerId = partner?.id || partner?._id || null;
      const data = {
        partner_id: partnerId,
        credit_limit: parseFloat(creditLimit) || 0,
        use_credit_facility: useCreditFacility.id,
        company_name: companyName || '',
        company_address: companyAddress || '',
        phone_number: phoneNumber || '',
        email: email || '',
        fax: fax || '',
        trade_license_no: tradeLicenseNo || '',
        po_box: poBox || '',
      };
      if (licenseIssueDate) data.license_issue_date = format(licenseIssueDate, 'yyyy-MM-dd');
      if (licenseExpiryDate) data.license_expiry_date = format(licenseExpiryDate, 'yyyy-MM-dd');
      if (creditIssueDate) data.credit_issue_date = format(creditIssueDate, 'yyyy-MM-dd');
      if (creditExpiryDate) data.credit_expiry_date = format(creditExpiryDate, 'yyyy-MM-dd');

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
      <RoundedScrollContainer>

        {/* Section: Basic Info */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Application Details</Text>

          <FormInput
            label="Customer"
            placeholder="Select Customer"
            dropIcon="chevron-down"
            editable={false}
            value={partner?.name?.trim() || ''}
            required
            validate={errors.partner}
            onPress={openPartnerSelector}
          />

          <FormInput
            label="Credit Limit"
            placeholder="0.00"
            value={creditLimit}
            keyboardType="numeric"
            required
            validate={errors.creditLimit}
            onChangeText={(val) => { setCreditLimit(val); clearError('creditLimit'); }}
          />

          <FormInput
            label="Use Credit Facility"
            placeholder="Select"
            dropIcon="menu-down"
            editable={false}
            value={useCreditFacility?.label || ''}
            onPress={() => setIsDropdownVisible(true)}
          />
        </View>

        {/* Section: Company Information */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Company Information</Text>

          <FormInput label="Company Name" placeholder="Enter company name" value={companyName} onChangeText={setCompanyName} />
          <FormInput label="Company Address" placeholder="Enter address" value={companyAddress} onChangeText={setCompanyAddress} multiline numberOfLines={2} />
          <FormInput label="Email" placeholder="Enter email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <FormInput label="Phone Number" placeholder="Enter phone" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" />
          <FormInput label="Fax" placeholder="Enter fax" value={fax} onChangeText={setFax} />
          <FormInput label="Trade License No" placeholder="Enter license number" value={tradeLicenseNo} onChangeText={setTradeLicenseNo} />
          <FormInput label="PO Box" placeholder="Enter PO Box" value={poBox} onChangeText={setPoBox} />
        </View>

        {/* Section: Dates */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>License & Credit Dates</Text>

          <FormInput label="License Issue Date" dropIcon="calendar" placeholder="Select Date" editable={false}
            value={licenseIssueDate ? format(licenseIssueDate, 'yyyy-MM-dd') : ''}
            onPress={() => openDatePicker('licenseIssueDate')} />

          <FormInput label="License Expiry Date" dropIcon="calendar" placeholder="Select Date" editable={false}
            value={licenseExpiryDate ? format(licenseExpiryDate, 'yyyy-MM-dd') : ''}
            onPress={() => openDatePicker('licenseExpiryDate')} />

          <FormInput label="Credit Issue Date" dropIcon="calendar" placeholder="Select Date" editable={false}
            value={creditIssueDate ? format(creditIssueDate, 'yyyy-MM-dd') : ''}
            onPress={() => openDatePicker('creditIssueDate')} />

          <FormInput label="Credit Expiry Date" dropIcon="calendar" placeholder="Select Date" editable={false}
            value={creditExpiryDate ? format(creditExpiryDate, 'yyyy-MM-dd') : ''}
            onPress={() => openDatePicker('creditExpiryDate')} />
        </View>

        {/* Buttons */}
        <LoadingButton
          backgroundColor={COLORS.primaryThemeColor}
          title="Save as Draft"
          onPress={() => handleSubmit(false)}
          loading={isSubmitting}
        />

        <View style={{ height: 10 }} />

        <LoadingButton
          backgroundColor="#4CAF50"
          title="Submit for Approval"
          onPress={() => handleSubmit(true)}
          loading={isSubmitting}
        />

        <View style={{ height: 40 }} />

        {/* Dropdown */}
        <DropdownSheet
          isVisible={isDropdownVisible}
          items={USE_CREDIT_OPTIONS}
          title="Use Credit Facility"
          onClose={() => setIsDropdownVisible(false)}
          onValueChange={(item) => { setUseCreditFacility(item); setIsDropdownVisible(false); }}
        />

        {/* Date Picker */}
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          date={getDateValue()}
          onConfirm={handleDateConfirm}
          onCancel={() => setIsDatePickerVisible(false)}
        />

      </RoundedScrollContainer>
      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

export default CreditFacilityForm;

const styles = StyleSheet.create({
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
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginBottom: 10,
  },
});
