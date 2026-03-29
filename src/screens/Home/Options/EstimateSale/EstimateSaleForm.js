import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Keyboard, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  fetchCustomersOdoo,
  createCustomerOdoo,
  fetchWarehousesSessionOdoo,
  fetchEstimateSalePaymentMethodsOdoo,
  fetchProductsOdoo,
  createEstimateSaleOdoo,
  fetchProductByBarcodeOdoo,
  createProductOdoo,
  fetchPosCategoriesOdoo,
  createBelowCostApprovalLogOdoo,
} from '@api/services/generalApi';
import BelowCostApprovalModal from '@components/BelowCostApprovalModal';
import { checkBelowCostLines, generateBelowCostDetailsText } from '@utils/belowCostCheck';

const EstimateSaleForm = ({ navigation }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const submittingRef = useRef(false);
  const [showBelowCostModal, setShowBelowCostModal] = useState(false);
  const [belowCostLines, setBelowCostLines] = useState([]);

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

  // Create Customer modal
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustCompany, setNewCustCompany] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Create Product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdCost, setNewProdCost] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdOnHand, setNewProdOnHand] = useState('');
  const [newProdInternalRef, setNewProdInternalRef] = useState('');
  const [newProdCategory, setNewProdCategory] = useState(null);
  const [prodCategories, setProdCategories] = useState([]);
  const [showProdCatDropdown, setShowProdCatDropdown] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);

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
      if (methods.length === 0) showToastMessage('No payment methods found. Please check Odoo configuration.');
    }).catch(() => { showToastMessage('Failed to load payment methods'); });
    fetchProductsOdoo({ limit: 50 }).then(data => {
      setProducts((data || []).map(p => ({ id: p.id, name: p.product_name || p.name || '', label: p.product_name || p.name || '', lst_price: p.lst_price || p.price || 0 })));
    }).catch(() => {});
  }, []);

  const handleCreateCustomer = async () => {
    if (!newCustName.trim()) {
      Alert.alert('Error', 'Customer name is required');
      return;
    }
    setCreatingCustomer(true);
    try {
      const newId = await createCustomerOdoo({
        name: newCustName.trim(),
        phone: newCustPhone.trim() || undefined,
        email: newCustEmail.trim() || undefined,
        company: newCustCompany.trim() || undefined,
      });
      const newItem = { id: newId, name: newCustName.trim(), label: newCustName.trim() };
      setCustomers(prev => [newItem, ...prev]);
      setCustomer(newItem);
      if (errors.customer) setErrors(prev => ({ ...prev, customer: null }));
      setShowCustomerModal(false);
      setNewCustName(''); setNewCustPhone(''); setNewCustEmail(''); setNewCustCompany('');
      showToastMessage('Customer created successfully');
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to create customer');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const openCreateProduct = async () => {
    setIsDropdownVisible(false);
    if (prodCategories.length === 0) {
      try {
        const cats = await fetchPosCategoriesOdoo();
        setProdCategories((cats || []).map(c => ({ id: c._id || c.id, name: c.category_name || c.name || '', label: c.category_name || c.name || '' })));
      } catch (e) {}
    }
    setShowProductModal(true);
  };

  const handleCreateProduct = async () => {
    if (!newProdName.trim()) { Alert.alert('Error', 'Product name is required'); return; }
    if (!newProdCategory) { Alert.alert('Error', 'Category is required'); return; }
    setCreatingProduct(true);
    try {
      const productId = await createProductOdoo({
        name: newProdName.trim(),
        posCategoryId: newProdCategory.id,
        listPrice: newProdPrice || undefined,
        standardPrice: newProdCost || undefined,
        barcode: newProdBarcode || undefined,
        defaultCode: newProdInternalRef || undefined,
        onHandQty: newProdOnHand || undefined,
      });
      const newItem = { id: productId, name: newProdName.trim(), label: newProdName.trim(), lst_price: parseFloat(newProdPrice) || 0 };
      setProducts(prev => [newItem, ...prev]);
      if (editingLineIndex !== null) {
        const updated = [...lines];
        updated[editingLineIndex] = { ...updated[editingLineIndex], product_id: productId, product_name: newProdName.trim(), price_unit: parseFloat(newProdPrice) || 0 };
        setLines(updated);
      }
      setShowProductModal(false);
      setNewProdName(''); setNewProdPrice(''); setNewProdCost(''); setNewProdBarcode(''); setNewProdOnHand(''); setNewProdInternalRef(''); setNewProdCategory(null);
      showToastMessage('Product created successfully');
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to create product');
    } finally {
      setCreatingProduct(false);
    }
  };

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

  const handleBarcodeScan = (lineIndex) => {
    navigation.navigate('Scanner', {
      onScan: async (barcode) => {
        const products = await fetchProductByBarcodeOdoo(barcode);
        if (products && products.length > 0) {
          const p = products[0];
          const updated = [...lines];
          updated[lineIndex] = { ...updated[lineIndex], product_id: p.id, product_name: p.product_name, price_unit: p.price || 0 };
          setLines(updated);
          navigation.goBack();
        } else {
          showToastMessage('Product not found');
        }
      }
    });
  };

  const handleAddLine = () => { setLines(prev => [...prev, { product_id: null, product_name: '', quantity: '1', price_unit: 0 }]); };
  const handleRemoveLine = (index) => { setLines(prev => prev.filter((_, i) => i !== index)); };
  const handleLineFieldChange = (index, field, value) => { const updated = [...lines]; updated[index] = { ...updated[index], [field]: value }; setLines(updated); };
  const computeTotal = () => lines.reduce((sum, l) => sum + (Number(l.quantity || 0) * Number(l.price_unit || 0)), 0).toFixed(3);

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

  const executeEstimateSale = async () => {
    submittingRef.current = true; setIsSubmitting(true);
    try {
      const result = await createEstimateSaleOdoo({
        partnerId: customer.id, warehouseId: warehouse.id, paymentMethodId: paymentMethod.id,
        reference: reference || undefined, notes: notes || undefined,
        orderLines: lines.map(l => ({ product_id: l.product_id, qty: Number(l.quantity), price_unit: Number(l.price_unit || 0) })),
      });
      showToastMessage('Estimate Sale created successfully');
      navigation.goBack();
      return result;
    } catch (error) { Alert.alert('Error', error?.message || 'Failed to create'); return null; }
    finally { submittingRef.current = false; setIsSubmitting(false); }
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!validateForm()) return;

    // Check for below-cost lines
    submittingRef.current = true; setIsSubmitting(true);
    try {
      const linesToCheck = lines.map(l => ({
        product_id: l.product_id,
        product_name: l.product_name || '',
        price_unit: Number(l.price_unit || 0),
        qty: Number(l.quantity || 1),
      }));
      const result = await checkBelowCostLines(linesToCheck);
      if (result.hasBelowCost) {
        setBelowCostLines(result.belowCostLines);
        submittingRef.current = false; setIsSubmitting(false);
        setShowBelowCostModal(true);
        return;
      }
    } catch (err) {
      console.log('[EstimateSale] Below cost check failed, proceeding:', err?.message);
    }
    submittingRef.current = false; setIsSubmitting(false);

    await executeEstimateSale();
  };

  const handleBelowCostApprove = async ({ approverId, approverName, reason }) => {
    setShowBelowCostModal(false);
    await executeEstimateSale();
    setBelowCostLines([]);
  };

  const handleBelowCostReject = async () => {
    setShowBelowCostModal(false);
    Alert.alert('Sale Rejected', 'The below-cost sale has been rejected.');
    setBelowCostLines([]);
  };

  const renderLine = (line, index) => (
    <View key={index} style={styles.lineCard}>
      <View style={styles.lineRow}>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => openDropdown('product', index)}>
          <Text style={styles.productText} numberOfLines={1}>{line.product_name || 'Tap to select product'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleBarcodeScan(index)} style={{ marginRight: 8 }}><Icon name="barcode-scan" size={20} color={COLORS.primaryThemeColor} /></TouchableOpacity>
        <TouchableOpacity onPress={() => handleRemoveLine(index)}><AntDesign name="close" size={16} color="#999" /></TouchableOpacity>
      </View>
      {line.product_id && (
        <View style={styles.lineFieldsRow}>
          <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Qty</Text>
            <TextInput style={styles.fieldInput} keyboardType="numeric" value={String(line.quantity)} onChangeText={(val) => handleLineFieldChange(index, 'quantity', val)} selectTextOnFocus /></View>
          <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Price</Text>
            <TextInput style={styles.fieldInput} keyboardType="numeric" value={String(line.price_unit)} onChangeText={(val) => handleLineFieldChange(index, 'price_unit', val)} selectTextOnFocus /></View>
          <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Subtotal</Text>
            <Text style={[styles.fieldValue, { fontFamily: FONT_FAMILY.urbanistBold }]}>{(Number(line.quantity || 0) * Number(line.price_unit || 0)).toFixed(3)}</Text></View>
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
            <Text style={styles.totalLabel}>Total: </Text>
            <Text style={styles.totalValue}>{computeTotal()}</Text>
          </View>
        )}

        <LoadingButton title="CREATE ESTIMATE SALE" onPress={handleSubmit} marginTop={10} loading={isSubmitting} />
        <View style={{ height: 40 }} />
        <CustomListModal isVisible={isDropdownVisible} items={getDropdownItems()} title={getDropdownTitle()} onClose={() => setIsDropdownVisible(false)} onValueChange={handleDropdownSelect}
          onAddIcon={dropdownType === 'customer' || dropdownType === 'product'}
          onAdd={dropdownType === 'customer' ? () => { setIsDropdownVisible(false); setShowCustomerModal(true); } : dropdownType === 'product' ? openCreateProduct : undefined}
        />

        {/* Create Customer Modal */}
        <Modal visible={showCustomerModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Create Customer</Text>

              <Text style={styles.modalLabel}>Name *</Text>
              <TextInput style={styles.modalInput} placeholder="Customer name" placeholderTextColor="#999" value={newCustName} onChangeText={setNewCustName} autoFocus />

              <Text style={styles.modalLabel}>Phone</Text>
              <TextInput style={styles.modalInput} placeholder="Phone number" placeholderTextColor="#999" value={newCustPhone} onChangeText={setNewCustPhone} keyboardType="phone-pad" />

              <Text style={styles.modalLabel}>Email</Text>
              <TextInput style={styles.modalInput} placeholder="Email address" placeholderTextColor="#999" value={newCustEmail} onChangeText={setNewCustEmail} keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.modalLabel}>Company</Text>
              <TextInput style={styles.modalInput} placeholder="Company name" placeholderTextColor="#999" value={newCustCompany} onChangeText={setNewCustCompany} />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowCustomerModal(false); setNewCustName(''); setNewCustPhone(''); setNewCustEmail(''); setNewCustCompany(''); }}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleCreateCustomer} disabled={creatingCustomer}>
                  <Text style={styles.modalSaveText}>{creatingCustomer ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Create Product Modal */}
        <Modal visible={showProductModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Create Product</Text>

              <Text style={styles.modalLabel}>Product Name *</Text>
              <TextInput style={styles.modalInput} placeholder="Product name" placeholderTextColor="#999" value={newProdName} onChangeText={setNewProdName} autoFocus />

              <Text style={styles.modalLabel}>Category *</Text>
              <TouchableOpacity style={styles.modalInput} onPress={() => setShowProdCatDropdown(true)}>
                <Text style={{ fontSize: 15, color: newProdCategory ? '#1f2937' : '#999' }}>{newProdCategory?.name || 'Select category'}</Text>
              </TouchableOpacity>

              <Text style={styles.modalLabel}>Sales Price</Text>
              <TextInput style={styles.modalInput} placeholder="0.000" placeholderTextColor="#999" value={newProdPrice} onChangeText={setNewProdPrice} keyboardType="decimal-pad" />

              <Text style={styles.modalLabel}>Cost</Text>
              <TextInput style={styles.modalInput} placeholder="0.000" placeholderTextColor="#999" value={newProdCost} onChangeText={setNewProdCost} keyboardType="decimal-pad" />

              <Text style={styles.modalLabel}>On Hand Quantity</Text>
              <TextInput style={styles.modalInput} placeholder="0" placeholderTextColor="#999" value={newProdOnHand} onChangeText={setNewProdOnHand} keyboardType="numeric" />

              <Text style={styles.modalLabel}>Barcode</Text>
              <TextInput style={styles.modalInput} placeholder="Enter barcode" placeholderTextColor="#999" value={newProdBarcode} onChangeText={setNewProdBarcode} />

              <Text style={styles.modalLabel}>Internal Reference</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. PROD-001" placeholderTextColor="#999" value={newProdInternalRef} onChangeText={setNewProdInternalRef} />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowProductModal(false); setNewProdName(''); setNewProdPrice(''); setNewProdCost(''); setNewProdBarcode(''); setNewProdOnHand(''); setNewProdInternalRef(''); setNewProdCategory(null); }}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleCreateProduct} disabled={creatingProduct}>
                  <Text style={styles.modalSaveText}>{creatingProduct ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <CustomListModal isVisible={showProdCatDropdown} items={prodCategories} title="Select Category" onClose={() => setShowProdCatDropdown(false)} onValueChange={(item) => { setNewProdCategory(item); setShowProdCatDropdown(false); }} />
      </RoundedScrollContainer>
      <OverlayLoader visible={isSubmitting} />
      <BelowCostApprovalModal
        visible={showBelowCostModal}
        belowCostLines={belowCostLines}
        orderTotal={Number(computeTotal())}
        currency=""
        onApprove={handleBelowCostApprove}
        onReject={handleBelowCostReject}
        onCancel={() => { setShowBelowCostModal(false); setBelowCostLines([]); }}
      />
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
  // Customer modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '88%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: '#1f2937', marginBottom: 16, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#555', marginBottom: 4 },
  modalInput: { backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1f2937', marginBottom: 14, fontFamily: FONT_FAMILY.urbanistMedium },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  modalCancelBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  modalCancelText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#6b7280' },
  modalSaveBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.primaryThemeColor },
  modalSaveText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' },
});

export default EstimateSaleForm;
