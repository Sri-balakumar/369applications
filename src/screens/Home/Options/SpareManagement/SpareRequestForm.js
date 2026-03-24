import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Alert } from 'react-native';
import Text from '@components/Text';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { DropdownSheet } from '@components/common/BottomSheets';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { useAuthStore } from '@stores/auth';
import { format } from 'date-fns';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  createSparePartRequestOdoo,
  fetchSparePartProductsOdoo,
  fetchJobCardsOdoo,
  fetchUsersOdoo,
  fetchCustomersOdoo,
} from '@api/services/generalApi';

const SpareRequestForm = ({ navigation, route }) => {
  const prefillJobCard = route?.params?.prefillJobCard || null;
  const prefillParts = route?.params?.prefillParts || [];
  const currentUser = useAuthStore((state) => state.user);

  // --- Header Fields ---
  const [jobCard, setJobCard] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [requestedBy, setRequestedBy] = useState(null);
  const [requestedTo, setRequestedTo] = useState(null);
  const [requestDate, setRequestDate] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});

  // --- Spare Parts Lines (table rows) ---
  const [lines, setLines] = useState([]);

  // --- Dropdown Data ---
  const [jobCards, setJobCards] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);

  // --- UI State ---
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownType, setDropdownType] = useState(null);
  const [activeLineIndex, setActiveLineIndex] = useState(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadDropdowns = async () => {
      setIsLoading(true);
      try {
        const [jcData, prodData, custData, userData] = await Promise.allSettled([
          fetchJobCardsOdoo({ limit: 50 }),
          fetchSparePartProductsOdoo({ limit: 100 }),
          fetchCustomersOdoo({ limit: 100 }),
          fetchUsersOdoo({ limit: 50 }),
        ]);

        const jcResult = jcData.status === 'fulfilled' ? jcData.value : [];
        const prodResult = prodData.status === 'fulfilled' ? prodData.value : [];
        const custResult = custData.status === 'fulfilled' ? custData.value : [];
        const userResult = userData.status === 'fulfilled' ? userData.value : [];

        if (jcData.status === 'rejected') console.warn('Job cards fetch failed:', jcData.reason?.message);
        if (prodData.status === 'rejected') console.warn('Products fetch failed:', prodData.reason?.message);

        setJobCards(jcResult.map(jc => ({ id: jc.id, label: jc.partner_name ? `${jc.name} - ${jc.partner_name}` : jc.name, partner_name: jc.partner_name })));
        setProducts(prodResult.map(p => ({ id: p.id, label: p.name, default_code: p.default_code })));
        setCustomers(custResult.map(c => ({ id: c.id, label: c.name })));
        setUsers(userResult.map(u => ({ id: u.id, label: u.name })));

        if (currentUser?.name || currentUser?.login) {
          setRequestedBy({ id: currentUser?.uid || null, label: currentUser?.name || currentUser?.login || '' });
        }

        // Prefill from job card details (spare parts request from repair screen)
        if (prefillJobCard) {
          setJobCard({ id: prefillJobCard.id, label: prefillJobCard.name || `JC-${prefillJobCard.id}` });
        }
        if (prefillParts.length > 0) {
          const prefillLines = prefillParts.map(p => {
            const matchedProd = p.matchedProductId
              ? prodResult.find(pr => pr.id === p.matchedProductId)
              : prodResult.find(pr => pr.name?.toLowerCase().includes((p.partName || '').toLowerCase()));
            return {
              product: matchedProd ? { id: matchedProd.id, label: matchedProd.name } : null,
              description: p.partName || '',
              requestedQty: String(p.quantity || 1),
            };
          });
          setLines(prefillLines);
        }
      } catch (err) {
        console.warn('Failed to load dropdowns:', err?.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadDropdowns();
  }, []);

  const clearError = (field) => setErrors(prev => ({ ...prev, [field]: null }));

  // --- Line management ---
  const addLine = () => {
    setLines([...lines, { product: null, description: '', requestedQty: '1' }]);
  };

  const removeLine = (index) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index, updates) => {
    setLines(prev => prev.map((line, i) =>
      i === index ? { ...line, ...(typeof updates === 'object' ? updates : {}) } : line
    ));
  };

  // --- Validation ---
  const validate = () => {
    const newErrors = {};
    if (lines.length === 0) {
      newErrors.lines = 'Add at least one spare part line';
      Alert.alert('Validation Error', 'Please add at least one spare part line.');
      return false;
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].product) newErrors[`line_${i}_product`] = 'Required';
      if (!lines[i].requestedQty || parseFloat(lines[i].requestedQty) <= 0) newErrors[`line_${i}_qty`] = 'Required';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      Alert.alert('Validation Error', 'Please fill all required fields in spare parts lines.');
    }
    return Object.keys(newErrors).length === 0;
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const result = await createSparePartRequestOdoo({
        jobCardId: jobCard?.id || null,
        customerId: customer?.id || null,
        requestedById: requestedBy?.id || null,
        requestedToId: requestedTo?.id || null,
        requestDate: format(requestDate, 'yyyy-MM-dd HH:mm:ss'),
        notes: notes || '',
        lines: lines.map(l => ({
          product_id: l.product?.id,
          description: l.description || '',
          requested_qty: parseFloat(l.requestedQty) || 1,
        })),
      });
      if (result) {
        Alert.alert('Success', `Spare Part Request created successfully (ID: ${result})`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', 'Failed to create request. No ID returned from server.');
      }
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to create spare part request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Dropdown handler ---
  const handleDropdownSelect = (item) => {
    if (dropdownType === 'Job Card') {
      setJobCard(item);
      if (item.partner_name) {
        const cust = customers.find(c => c.label === item.partner_name);
        if (cust) setCustomer(cust);
      }
    } else if (dropdownType === 'Customer') {
      setCustomer(item);
    } else if (dropdownType === 'Requested By') {
      setRequestedBy(item);
    } else if (dropdownType === 'Requested To') {
      setRequestedTo(item);
    } else if (dropdownType === 'Spare Part') {
      if (activeLineIndex !== null) {
        updateLine(activeLineIndex, { product: item, description: item.default_code || item.label || '' });
        clearError(`line_${activeLineIndex}_product`);
      }
    }
    setIsDropdownVisible(false);
    setActiveLineIndex(null);
  };

  const getDropdownItems = () => {
    if (dropdownType === 'Job Card') return jobCards;
    if (dropdownType === 'Customer') return customers;
    if (dropdownType === 'Requested By') return users;
    if (dropdownType === 'Requested To') return users;
    if (dropdownType === 'Spare Part') return products;
    return [];
  };

  const openDropdown = (type, lineIndex = null) => {
    setDropdownType(type);
    setActiveLineIndex(lineIndex);
    setIsDropdownVisible(true);
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Spare Parts Request" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>

        {/* Header Fields */}
        <View style={styles.sectionCard}>
          <FormInput
            label="Job Card"
            placeholder="Select Job Card"
            dropIcon="menu-down"
            editable={false}
            value={jobCard?.label || ''}
            onPress={() => openDropdown('Job Card')}
          />

          <FormInput
            label="Customer"
            placeholder="Auto-fills from Job Card"
            dropIcon="menu-down"
            editable={false}
            value={customer?.label || ''}
            onPress={() => openDropdown('Customer')}
          />

          <FormInput
            label="Requested By"
            placeholder="Select User"
            dropIcon="menu-down"
            editable={false}
            value={requestedBy?.label || ''}
            onPress={() => openDropdown('Requested By')}
          />

          <FormInput
            label="Requested To"
            placeholder="Select User"
            dropIcon="menu-down"
            editable={false}
            value={requestedTo?.label || ''}
            onPress={() => openDropdown('Requested To')}
          />

          <FormInput
            label="Request Date"
            dropIcon="calendar"
            placeholder="Select Date"
            editable={false}
            value={format(requestDate, 'MM/dd/yyyy hh:mm a')}
            onPress={() => setIsDatePickerVisible(true)}
          />
        </View>

        {/* Spare Parts Tab */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Spare Parts</Text>

          {errors.lines && <Text style={styles.errorText}>{errors.lines}</Text>}

          {/* Line Items */}
          {lines.map((line, index) => (
            <View key={index} style={styles.lineCard}>
              <View style={styles.lineHeader}>
                <Text style={styles.lineNumber}>#{index + 1}</Text>
                <TouchableOpacity onPress={() => removeLine(index)}>
                  <Icon name="close-circle" size={22} color="#F44336" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => openDropdown('Spare Part', index)}
              >
                <Text style={line.product ? styles.selectBtnText : styles.selectBtnPlaceholder}>
                  {line.product?.label || 'Select Spare Part *'}
                </Text>
                <Icon name="menu-down" size={20} color="#999" />
              </TouchableOpacity>
              {errors[`line_${index}_product`] && <Text style={styles.lineError}>Spare part is required</Text>}

              <FormInput
                label="Description"
                placeholder="Enter description"
                value={line.description}
                onChangeText={(val) => updateLine(index, { description: val })}
              />

              <FormInput
                label="Requested Qty"
                placeholder="1"
                value={line.requestedQty}
                keyboardType="numeric"
                validate={errors[`line_${index}_qty`]}
                onChangeText={(val) => { updateLine(index, { requestedQty: val }); clearError(`line_${index}_qty`); }}
              />
            </View>
          ))}

          {/* Add a line */}
          <TouchableOpacity onPress={addLine} style={styles.addLineBtn} activeOpacity={0.6}>
            <Icon name="plus-circle-outline" size={22} color={COLORS.primaryThemeColor} />
            <Text style={styles.addLineText}>Add a line</Text>
          </TouchableOpacity>
        </View>

        {/* Notes Tab */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <FormInput
            placeholder="Enter notes or remarks"
            value={notes}
            multiline
            numberOfLines={4}
            onChangeText={setNotes}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.btnRow}>
          <LoadingButton
            backgroundColor={COLORS.primaryThemeColor}
            title="Submit Request"
            onPress={handleSubmit}
            loading={isSubmitting}
          />
        </View>

        {/* Dropdowns */}
        <DropdownSheet
          isVisible={isDropdownVisible}
          items={getDropdownItems()}
          title={dropdownType || ''}
          onClose={() => { setIsDropdownVisible(false); setActiveLineIndex(null); }}
          onValueChange={handleDropdownSelect}
        />

        {/* Date Picker */}
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="datetime"
          date={requestDate}
          onConfirm={(date) => { setIsDatePickerVisible(false); setRequestDate(date); }}
          onCancel={() => setIsDatePickerVisible(false)}
        />
      </RoundedScrollContainer>
      <OverlayLoader visible={isLoading || isSubmitting} />
    </SafeAreaView>
  );
};

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
  lineCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  lineNumber: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  selectBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  selectBtnText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
    flex: 1,
  },
  selectBtnPlaceholder: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#aaa',
    flex: 1,
  },
  lineError: {
    fontSize: 11,
    color: '#F44336',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginBottom: 6,
  },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.primaryThemeColor,
    borderRadius: 10,
    borderStyle: 'dashed',
  },
  addLineText: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginLeft: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginBottom: 6,
  },
  btnRow: {
    marginBottom: 20,
  },
});

export default SpareRequestForm;
