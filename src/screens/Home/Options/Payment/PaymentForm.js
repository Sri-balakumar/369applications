import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Text from '@components/Text';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { DropdownSheet } from '@components/common/BottomSheets';
import SignaturePad from '@components/SignaturePad';
import usePaymentSignatureLocation from '@hooks/usePaymentSignatureLocation';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { useCurrencyStore } from '@stores/currency';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { OverlayLoader } from '@components/Loader';
import {
  fetchPaymentJournalsOdoo,
  fetchCompaniesOdoo,
  createPaymentWithSignatureOdoo,
} from '@api/services/generalApi';

const PAYMENT_TYPES = [
  { id: 'inbound', label: 'Customer' },
  { id: 'outbound', label: 'Vendor' },
];

const PaymentForm = ({ navigation, route }) => {
  const currentUser = useAuthStore((state) => state.user);
  const currency = useCurrencyStore((state) => state.currency) || '';

  // --- Customer/Vendor Signature & Location ---
  const {
    signatureBase64: customerSignatureBase64,
    setSignatureBase64: setCustomerSignatureBase64,
    scrollEnabled,
    setScrollEnabled,
    captureLocation,
  } = usePaymentSignatureLocation();

  // --- Employee Signature ---
  const [employeeSignatureBase64, setEmployeeSignatureBase64] = useState('');

  // --- Form State ---
  const initialType = route?.params?.paymentType === 'outbound'
    ? { id: 'outbound', label: 'Vendor' }
    : { id: 'inbound', label: 'Customer' };
  const [paymentType, setPaymentType] = useState(initialType);
  const [partner, setPartner] = useState(route?.params?.partner || null);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [journal, setJournal] = useState(null);
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState({});

  // --- Dropdown State ---
  const [company, setCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [allJournals, setAllJournals] = useState([]);
  const [journals, setJournals] = useState([]);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownType, setDropdownType] = useState(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  // --- Loading ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // --- Fetch companies and payment journals on mount ---
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [journalData, companyData] = await Promise.all([
          fetchPaymentJournalsOdoo(),
          fetchCompaniesOdoo().catch(() => []),
        ]);
        const journalItems = (journalData || []).map((j) => ({
          id: j.id,
          label: j.company_name ? `${j.name} (${j.type}) - ${j.company_name}` : `${j.name} (${j.type})`,
          type: j.type,
          company_id: j.company_id,
          company_name: j.company_name,
        }));
        setAllJournals(journalItems);
        setJournals(journalItems);
        setCompanies(companyData.map(c => ({ id: c.id, label: c.name })));
      } catch (err) {
        console.warn('Failed to load payment data:', err?.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // --- Filter journals when company changes ---
  useEffect(() => {
    if (company) {
      const filtered = allJournals.filter(j => j.company_id === company.id);
      setJournals(filtered);
      // Reset journal if it doesn't belong to the selected company
      if (journal && journal.company_id !== company.id) {
        setJournal(null);
      }
    } else {
      setJournals(allJournals);
    }
  }, [company, allJournals]);

  // --- Update partner from route params (when returning from CustomerScreen) ---
  useEffect(() => {
    if (route?.params?.partner) {
      setPartner(route.params.partner);
      clearError('partner');
    }
  }, [route?.params?.partner]);

  // --- Helpers ---
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

  const toggleDropdown = (type) => {
    setDropdownType(type);
    setIsDropdownVisible(true);
  };

  // --- Validation ---
  const validate = () => {
    const newErrors = {};
    if (!partner) newErrors.partner = 'Partner is required';
    if (!amount || parseFloat(amount) <= 0) newErrors.amount = 'Valid amount is required';
    if (!journal) newErrors.journal = 'Payment journal is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const parsedAmount = parseFloat(amount);
      const partnerId = partner?.id || partner?._id || null;

      // Capture GPS location
      const location = await captureLocation();

      const result = await createPaymentWithSignatureOdoo({
        partnerId,
        amount: parsedAmount,
        paymentType: paymentType.id,
        journalId: journal?.id || null,
        ref: memo || '',
        customerSignature: customerSignatureBase64 || null,
        employeeSignature: employeeSignatureBase64 || null,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        locationName: location?.locationName || '',
      });

      if (result) {
        Toast.show({
          type: 'success',
          text1: 'Payment Registered',
          text2: `Payment ID: ${result}`,
          position: 'bottom',
        });
        navigation.goBack();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to register payment',
          position: 'bottom',
        });
      }
    } catch (err) {
      console.error('Payment submit error:', err);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: err?.message || 'Failed to register payment',
        position: 'bottom',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Dropdown handler ---
  const handleDropdownSelect = (item) => {
    if (dropdownType === 'Company') {
      setCompany(item);
      setJournal(null); // Reset journal when company changes
    } else if (dropdownType === 'Payment Type') {
      setPaymentType(item);
    } else if (dropdownType === 'Journal') {
      setJournal(item);
      clearError('journal');
    }
    setIsDropdownVisible(false);
  };

  const getDropdownItems = () => {
    if (dropdownType === 'Company') return companies;
    if (dropdownType === 'Payment Type') return PAYMENT_TYPES;
    if (dropdownType === 'Journal') return journals;
    return [];
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Register Payment" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer scrollEnabled={scrollEnabled}>

        {/* Section: Payment Info */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Payment Information</Text>

          {/* Payment Type */}
          <FormInput
            label="Payment Type"
            placeholder="Select Payment Type"
            editable={false}
            value={paymentType?.label || ''}
            required
          />

          {/* Partner */}
          <FormInput
            label={paymentType?.id === 'outbound' ? 'Vendor' : 'Customer'}
            placeholder={paymentType?.id === 'outbound' ? 'Select Vendor' : 'Select Customer'}
            dropIcon="chevron-down"
            editable={false}
            value={partner?.name?.trim() || ''}
            required
            validate={errors.partner}
            onPress={openPartnerSelector}
          />

          {/* Amount */}
          <FormInput
            label="Amount"
            placeholder="0.00"
            value={amount}
            keyboardType="numeric"
            required
            validate={errors.amount}
            onChangeText={(val) => {
              setAmount(val);
              clearError('amount');
            }}
          />

          {/* Payment Date */}
          <FormInput
            label="Payment Date"
            dropIcon="calendar"
            placeholder="Select Date"
            editable={false}
            required
            value={format(paymentDate, 'yyyy-MM-dd')}
            onPress={() => setIsDatePickerVisible(true)}
          />

          {/* Company */}
          <FormInput
            label="Company"
            placeholder="Select Company"
            dropIcon="menu-down"
            editable={false}
            value={company?.label || ''}
            onPress={() => toggleDropdown('Company')}
          />

          {/* Journal */}
          <FormInput
            label="Journal"
            placeholder="Select Journal"
            dropIcon="menu-down"
            editable={false}
            value={journal?.label || ''}
            required
            validate={errors.journal}
            onPress={() => toggleDropdown('Journal')}
          />
        </View>

        {/* Section: Additional Details */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Additional Details</Text>

          {/* Salesperson */}
          <FormInput
            label="Salesperson"
            editable={false}
            value={currentUser?.related_profile?.name || currentUser?.name || currentUser?.login || '-'}
          />

          {/* Memo */}
          <FormInput
            label="Memo / Reference"
            placeholder="Enter memo or reference"
            value={memo}
            multiline
            numberOfLines={3}
            onChangeText={setMemo}
          />
        </View>

        {/* Section: Summary */}
        {amount && parseFloat(amount) > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Payment Type</Text>
              <Text style={styles.summaryValue}>
                {paymentType.id === 'inbound' ? 'Customer Payment' : 'Vendor Payment'}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Partner</Text>
              <Text style={styles.summaryValue}>{partner?.name?.trim() || '-'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Journal</Text>
              <Text style={styles.summaryValue}>{journal?.label || '-'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Amount</Text>
              <Text style={styles.totalValue}>{parseFloat(amount).toFixed(2)} {currency}</Text>
            </View>
          </View>
        )}

        {/* Section: Customer / Vendor Signature */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {paymentType.id === 'inbound' ? 'Customer Signature' : 'Vendor Signature'}
          </Text>
          <SignaturePad
            setUrl={() => {}}
            setScrollEnabled={setScrollEnabled}
            title=""
            onSignatureBase64={setCustomerSignatureBase64}
          />
        </View>

        {/* Section: Employee Signature */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Employee Signature</Text>
          <SignaturePad
            setUrl={() => {}}
            setScrollEnabled={setScrollEnabled}
            title=""
            onSignatureBase64={setEmployeeSignatureBase64}
          />
        </View>

        {/* Submit Button */}
        <LoadingButton
          backgroundColor={COLORS.primaryThemeColor}
          title="Register Payment"
          onPress={handleSubmit}
          loading={isSubmitting}
        />

        {/* Dropdown Sheet */}
        <DropdownSheet
          isVisible={isDropdownVisible}
          items={getDropdownItems()}
          title={dropdownType || ''}
          onClose={() => setIsDropdownVisible(false)}
          onValueChange={handleDropdownSelect}
        />

        {/* Date Picker */}
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          date={paymentDate}
          onConfirm={(date) => {
            setIsDatePickerVisible(false);
            setPaymentDate(date);
          }}
          onCancel={() => setIsDatePickerVisible(false)}
        />

      </RoundedScrollContainer>
      <OverlayLoader visible={isLoading || isSubmitting} />
    </SafeAreaView>
  );
};

export default PaymentForm;

const styles = StyleSheet.create({
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 15,
    color: '#555',
  },
  summaryValue: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 15,
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#e8e5f0',
    marginVertical: 6,
  },
  totalLabel: {
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    fontSize: 18,
    color: COLORS.primaryThemeColor,
  },
  totalValue: {
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    fontSize: 18,
    color: COLORS.primaryThemeColor,
  },
});
