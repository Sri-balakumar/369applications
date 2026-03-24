import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Keyboard, TouchableOpacity, Alert, TextInput } from 'react-native';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader, TitleWithButton } from '@components/Header';
import { CustomListModal } from '@components/Modal';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { AntDesign } from '@expo/vector-icons';
import {
  fetchCustomersOdoo,
  fetchWarehousesSessionOdoo,
  fetchEstimateSalePaymentMethodsOdoo,
  fetchProductsOdoo,
  createEstimateSaleOdoo,
} from '@api/services/generalApi';

const EstimateSaleForm = ({ navigation }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const submittingRef = useRef(false);

  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [products, setProducts] = useState([]);

  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownType, setDropdownType] = useState(null);
  const [editingLineIndex, setEditingLineIndex] = useState(null);

  const [customer, setCustomer] = useState(null);
  const [warehouse, setWarehouse] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);

  useEffect(() => {
    fetchCustomersOdoo({ limit: 50 }).then(data => {
      setCustomers((data || []).map(c => ({ id: c.id, name: c.name || '', label: c.name || '' })));
    }).catch(() => {});
    fetchWarehousesSessionOdoo().then(data => {
      setWarehouses((data || []).map(w => ({ id: w.id, name: w.name || '', label: w.name || '' })));
    }).catch(() => {});
    fetchEstimateSalePaymentMethodsOdoo().then(data => {
      const methods = (data || []).map(pm => ({ id: pm.id, name: pm.name || '', label: pm.name || '', is_default: pm.is_default }));
      setPaymentMethods(methods);
      const defaultPm = methods.find(pm => pm.is_default);
      if (defaultPm) setPaymentMethod(defaultPm);
    }).catch(() => {});
    fetchProductsOdoo({ limit: 50 }).then(data => {
      setProducts((data || []).map(p => ({ id: p.id, name: p.product_name || p.name || '', label: p.product_name || p.name || '', lst_price: p.lst_price || p.price || 0 })));
    }).catch(() => {});
  }, []);

  const openDropdown = (type, lineIndex = null) => { setDropdownType(type); setEditingLineIndex(lineIndex); setIsDropdownVisible(true); };

  const handleDropdownSelect = (item) => {
    switch (dropdownType) {
      case 'customer': setCustomer(item); if (errors.customer) setErrors(prev => ({ ...prev, customer: null })); break;
      case 'warehouse': setWarehouse(item); if (errors.warehouse) setErrors(prev => ({ ...prev, warehouse: null })); break;
      case 'payment_method': setPaymentMethod(item); if (errors.payment_method) setErrors(prev => ({ ...prev, payment_method: null })); break;
      case 'product':
        if (editingLineIndex !== null) {
          const updated = [...lines];
          updated[editingLineIndex] = { ...updated[editingLineIndex], product_id: item.id, product_name: item.label || item.name, price_unit: item.lst_price || 0 };
          setLines(updated);
        }
        break;
    }
    setIsDropdownVisible(false);
  };

  const getDropdownItems = () => {
    switch (dropdownType) {
      case 'customer': return customers; case 'warehouse': return warehouses;
      case 'payment_method': return paymentMethods; case 'product': return products; default: return [];
    }
  };
  const getDropdownTitle = () => {
    switch (dropdownType) {
      case 'customer': return 'Select Customer'; case 'warehouse': return 'Select Warehouse';
      case 'payment_method': return 'Select Payment Method'; case 'product': return 'Select Product'; default: return 'Select';
    }
  };

  const handleAddLine = () => { setLines(prev => [...prev, { product_id: null, product_name: '', quantity: '1', price_unit: 0 }]); };
  const handleRemoveLine = (index) => { setLines(prev => prev.filter((_, i) => i !== index)); };
  const handleLineFieldChange = (index, field, value) => { const updated = [...lines]; updated[index] = { ...updated[index], [field]: value }; setLines(updated); };
  const computeTotal = () => lines.reduce((sum, l) => sum + (Number(l.quantity || 0) * Number(l.price_unit || 0)), 0).toFixed(2);

  const validateForm = () => {
    Keyboard.dismiss();
    const newErrors = {};
    if (!customer) newErrors.customer = 'Required';
    if (!warehouse) newErrors.warehouse = 'Required';
    if (!paymentMethod) newErrors.payment_method = 'Required';
    if (lines.length === 0) { showToastMessage('Please add at least one product line'); return false; }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].product_id) { showToastMessage(`Select product for line ${i + 1}`); return false; }
      if (!lines[i].quantity || Number(lines[i].quantity) <= 0) { showToastMessage(`Qty must be positive for line ${i + 1}`); return false; }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!validateForm()) return;
    submittingRef.current = true; setIsSubmitting(true);
    try {
      await createEstimateSaleOdoo({
        partnerId: customer.id, warehouseId: warehouse.id, paymentMethodId: paymentMethod.id,
        reference: reference || undefined, notes: notes || undefined,
        orderLines: lines.map(l => ({ product_id: l.product_id, qty: Number(l.quantity), price_unit: Number(l.price_unit || 0) })),
      });
      showToastMessage('Estimate Sale created successfully');
      navigation.goBack();
    } catch (error) { Alert.alert('Error', error?.message || 'Failed to create'); }
    finally { submittingRef.current = false; setIsSubmitting(false); }
  };

  const renderLine = (line, index) => (
    <View key={index} style={styles.lineCard}>
      <View style={styles.lineRow}>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => openDropdown('product', index)}>
          <Text style={styles.productText} numberOfLines={1}>{line.product_name || 'Tap to select product'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleRemoveLine(index)}><AntDesign name="close" size={16} color="#999" /></TouchableOpacity>
      </View>
      {line.product_id && (
        <View style={styles.lineFieldsRow}>
          <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Qty</Text>
            <TextInput style={styles.fieldInput} keyboardType="numeric" value={String(line.quantity)} onChangeText={(val) => handleLineFieldChange(index, 'quantity', val)} selectTextOnFocus /></View>
          <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Price</Text>
            <TextInput style={styles.fieldInput} keyboardType="numeric" value={String(line.price_unit)} onChangeText={(val) => handleLineFieldChange(index, 'price_unit', val)} selectTextOnFocus /></View>
          <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Subtotal</Text>
            <Text style={[styles.fieldValue, { fontFamily: FONT_FAMILY.urbanistBold }]}>{(Number(line.quantity || 0) * Number(line.price_unit || 0)).toFixed(2)}</Text></View>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="New Estimate Sale" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        <FormInput label="Customer" placeholder="Select Customer" dropIcon="menu-down" editable={false} value={customer?.name || ''} validate={errors.customer} required onPress={() => openDropdown('customer')} />
        <FormInput label="Warehouse" placeholder="Select Warehouse" dropIcon="menu-down" editable={false} value={warehouse?.name || ''} validate={errors.warehouse} required onPress={() => openDropdown('warehouse')} />
        <FormInput label="Payment Method" placeholder="Select Payment Method" dropIcon="menu-down" editable={false} value={paymentMethod?.name || ''} validate={errors.payment_method} required onPress={() => openDropdown('payment_method')} />
        <FormInput label="Customer Reference" placeholder="Enter reference (optional)" value={reference} onChangeText={setReference} />
        <FormInput label="Notes" placeholder="Enter notes (optional)" value={notes} onChangeText={setNotes} multiline />

        <TitleWithButton label="Add Product Line" onPress={handleAddLine} />
        {lines.map((line, index) => renderLine(line, index))}

        {lines.length > 0 && (
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total (No Tax): </Text>
            <Text style={styles.totalValue}>{computeTotal()}</Text>
          </View>
        )}

        <LoadingButton title="CREATE ESTIMATE SALE" onPress={handleSubmit} marginTop={10} loading={isSubmitting} />
        <View style={{ height: 40 }} />
        <CustomListModal isVisible={isDropdownVisible} items={getDropdownItems()} title={getDropdownTitle()} onClose={() => setIsDropdownVisible(false)} onValueChange={handleDropdownSelect} onAddIcon={false} />
      </RoundedScrollContainer>
      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  lineCard: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginVertical: 4, borderWidth: 1, borderColor: '#e0e0e0' },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },
  lineFieldsRow: { flexDirection: 'row', marginTop: 8, gap: 12 },
  fieldGroup: { flex: 1 }, fieldLabel: { fontSize: 10, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginBottom: 2 },
  fieldValue: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#212529' },
  fieldInput: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#212529', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingVertical: 2 },
  totalSection: { flexDirection: 'row', justifyContent: 'center', marginVertical: 10, padding: 10, backgroundColor: '#e9ecef', borderRadius: 8 },
  totalLabel: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#212529' },
  totalValue: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },
});

export default EstimateSaleForm;
