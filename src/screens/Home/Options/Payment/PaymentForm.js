import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Image } from 'react-native';
import Text from '@components/Text';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { CustomListModal } from '@components/Modal';
import SignatureModal from '@components/SignatureModal';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { StyledAlertModal } from '@components/Modal';
import usePaymentSignatureLocation from '@hooks/usePaymentSignatureLocation';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { useCurrencyStore } from '@stores/currency';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { showToastMessage } from '@components/Toast';
import { OverlayLoader } from '@components/Loader';
import OfflineBanner from '@components/common/OfflineBanner';
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

  // --- Signature modal targets ---
  const [signatureTarget, setSignatureTarget] = useState(null); // 'customer' | 'employee' | null

  // Styled alert modal state — matches the logout popup design for error
  // messages on this form.
  const [alertModal, setAlertModal] = useState({ visible: false, message: '' });
  const showAlert = (message) => setAlertModal({ visible: true, message });
  const hideAlert = () => setAlertModal({ visible: false, message: '' });

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
          // Dropdown-friendly label for the picker.
          label: j.company_name ? `${j.name} (${j.type}) - ${j.company_name}` : `${j.name} (${j.type})`,
          // Keep the raw journal name — without type/company suffixes — so
          // the offline placeholder writes "Bank" into journal_name instead
          // of the verbose label. Matches the clean format Odoo sends back
          // on online creates.
          name: j.name,
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
    const missing = [];
    if (!partner) { newErrors.partner = 'Partner is required'; missing.push(paymentType?.id === 'outbound' ? 'Vendor' : 'Customer'); }
    if (!amount || parseFloat(amount) <= 0) { newErrors.amount = 'Valid amount is required'; missing.push('Amount'); }
    if (!journal) { newErrors.journal = 'Payment journal is required'; missing.push('Journal'); }
    setErrors(newErrors);
    if (missing.length > 0) {
      // Top-center toast listing every missing field at once — same pattern
      // used elsewhere in the app (e.g., Estimate Sale product validation).
      showToastMessage(`Please fill: ${missing.join(', ')}`);
      return false;
    }
    return true;
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const parsedAmount = parseFloat(amount);
      const partnerId = partner?.id || partner?._id || null;

      // Capture GPS location — cap at 1.5s so the submit never stalls on
      // cold GPS. If the fix isn't ready, we submit without it; the payment
      // still saves. (GPS is a nice-to-have, not critical for accounting.)
      const location = await Promise.race([
        captureLocation(),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);

      const result = await createPaymentWithSignatureOdoo({
        partnerId,
        amount: parsedAmount,
        paymentType: paymentType.id,
        journalId: journal?.id || null,
        journalName: journal?.name || journal?.label || '',
        companyId: company?.id || null,
        companyName: company?.label || '',
        ref: memo || '',
        customerSignature: customerSignatureBase64 || null,
        employeeSignature: employeeSignatureBase64 || null,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        locationName: location?.locationName || '',
      });

      if (result) {
        showToastMessage('Payment registered — open it from the list to Validate');
        // Land on the payments list (not whatever triggered the form) so the
        // user sees the new Draft row immediately and can tap to Validate.
        navigation.navigate('RegisterPaymentScreen');
      } else {
        showAlert('Failed to register payment');
      }
    } catch (err) {
      console.error('Payment submit error:', err);
      showAlert(err?.message || 'Failed to register payment');
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
      <OfflineBanner message="OFFLINE MODE — payment will sync when you reconnect" />
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
            placeholder="0.000"
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
              <Text style={styles.totalValue}>{parseFloat(amount).toFixed(3)} {currency}</Text>
            </View>
          </View>
        )}

        {/* Section: Customer / Vendor Signature — opens in a fullscreen modal
            so drawing never fights with the form's scroll. */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {paymentType.id === 'inbound' ? 'Customer Signature' : 'Vendor Signature'}
          </Text>
          <SignatureTapButton
            label={paymentType.id === 'inbound' ? 'Tap to sign Customer' : 'Tap to sign Vendor'}
            base64={customerSignatureBase64}
            onPress={() => setSignatureTarget('customer')}
            onClear={() => setCustomerSignatureBase64('')}
          />
        </View>

        {/* Section: Employee Signature */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Employee Signature</Text>
          <SignatureTapButton
            label="Tap to sign Employee"
            base64={employeeSignatureBase64}
            onPress={() => setSignatureTarget('employee')}
            onClear={() => setEmployeeSignatureBase64('')}
          />
        </View>

        {/* Submit Button */}
        <LoadingButton
          backgroundColor={COLORS.primaryThemeColor}
          title="Register Payment"
          onPress={handleSubmit}
          loading={isSubmitting}
        />

        {/* Dropdown — centered modal (not a bottom sheet) to match Estimate Sales. */}
        <CustomListModal
          isVisible={isDropdownVisible}
          items={getDropdownItems()}
          title={dropdownType || ''}
          onClose={() => setIsDropdownVisible(false)}
          onValueChange={handleDropdownSelect}
          onAddIcon={false}
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

      {/* Styled alert modal — matches the logout popup design */}
      <StyledAlertModal
        isVisible={alertModal.visible}
        message={alertModal.message}
        confirmText="OK"
        cancelText=""
        onConfirm={hideAlert}
        onCancel={hideAlert}
      />

      {/* Fullscreen signature modal — reused for both customer and employee. */}
      <SignatureModal
        visible={signatureTarget !== null}
        title={
          signatureTarget === 'employee'
            ? 'Employee Signature'
            : paymentType.id === 'inbound' ? 'Customer Signature' : 'Vendor Signature'
        }
        onClose={() => setSignatureTarget(null)}
        onSave={(b64) => {
          if (signatureTarget === 'customer') setCustomerSignatureBase64(b64);
          else if (signatureTarget === 'employee') setEmployeeSignatureBase64(b64);
        }}
      />

      <OverlayLoader visible={isLoading || isSubmitting} />
    </SafeAreaView>
  );
};

// Small row used in place of the inline SignaturePad. Shows either a
// "Tap to sign …" button (no signature yet) or a thumbnail preview + redo
// button (signature already captured).
const SignatureTapButton = ({ label, base64, onPress, onClear }) => {
  if (base64) {
    return (
      <View style={styles.sigPreviewRow}>
        <Image
          source={{ uri: base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}` }}
          style={styles.sigPreviewImg}
          resizeMode="contain"
        />
        <View style={styles.sigPreviewActions}>
          <TouchableOpacity style={styles.sigRedoBtn} onPress={onPress}>
            <MaterialCommunityIcons name="draw-pen" size={16} color={COLORS.primaryThemeColor} />
            <Text style={styles.sigRedoText}>Redo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sigClearBtn} onPress={onClear}>
            <AntDesign name="delete" size={14} color="#dc3545" />
            <Text style={styles.sigClearText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.sigTapBtn} onPress={onPress} activeOpacity={0.8}>
      <MaterialCommunityIcons name="draw-pen" size={22} color={COLORS.primaryThemeColor} />
      <Text style={styles.sigTapBtnText}>{label}</Text>
    </TouchableOpacity>
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
  sigTapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 18, borderWidth: 2, borderStyle: 'dashed',
    borderColor: COLORS.primaryThemeColor, borderRadius: 10, backgroundColor: '#f9f5f8',
  },
  sigTapBtnText: {
    fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor,
  },
  sigPreviewRow: { flexDirection: 'column', gap: 10 },
  sigPreviewImg: {
    width: '100%', height: 180, backgroundColor: '#fff',
    borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    // Soft paper-like shadow so it reads as a "sheet".
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
    }),
  },
  sigPreviewActions: { flexDirection: 'row', gap: 10 },
  sigRedoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: '#f5eef4', borderWidth: 1, borderColor: COLORS.primaryThemeColor,
  },
  sigRedoText: { color: COLORS.primaryThemeColor, fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold },
  sigClearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: '#fdecec', borderWidth: 1, borderColor: '#dc3545',
  },
  sigClearText: { color: '#dc3545', fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold },
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
