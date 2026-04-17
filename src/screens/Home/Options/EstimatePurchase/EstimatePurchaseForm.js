import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Keyboard, TouchableOpacity, Alert, TextInput, Modal, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader, TitleWithButton } from '@components/Header';
import { CustomListModal } from '@components/Modal';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useProductStore } from '@stores/product';
import { useCurrencyStore } from '@stores/currency';
import {
  fetchVendorsOdoo,
  createVendorOdoo,
  fetchWarehousesSessionOdoo,
  fetchEstimatePurchasePaymentMethodsOdoo,
  fetchProductsOdoo,
  createEstimatePurchaseOdoo,
  fetchProductByBarcodeOdoo,
  createProductOdoo,
  fetchPosCategoriesOdoo,
} from '@api/services/generalApi';

const ESTIMATE_PURCHASE_CART_ID = '__estimate_purchase__';

const EstimatePurchaseForm = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((s) => s.currencySymbol) || '$';
  const { getCurrentCart, setCurrentCustomer, loadCustomerCart, removeProduct, addProduct, clearProducts } = useProductStore();

  useEffect(() => { setCurrentCustomer(ESTIMATE_PURCHASE_CART_ID); loadCustomerCart(ESTIMATE_PURCHASE_CART_ID, []); }, []);
  useFocusEffect(useCallback(() => { setCurrentCustomer(ESTIMATE_PURCHASE_CART_ID); }, []));
  const cartProducts = getCurrentCart();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const submittingRef = useRef(false);

  // Dropdown data
  const [vendors, setVendors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [products, setProducts] = useState([]);

  // Dropdown visibility
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownType, setDropdownType] = useState(null);
  const [editingLineIndex, setEditingLineIndex] = useState(null);

  // Form fields
  const [vendor, setVendor] = useState(null);
  const [warehouse, setWarehouse] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);

  // Create Vendor modal
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorCompany, setNewVendorCompany] = useState('');
  const [creatingVendor, setCreatingVendor] = useState(false);

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
    loadDropdownData();
  }, []);

  const loadDropdownData = async () => {
    // Load each dropdown independently — don't block UI
    fetchVendorsOdoo({ limit: 50 }).then(data => setVendors(data || [])).catch(() => {});
    fetchWarehousesSessionOdoo().then(data => {
      setWarehouses((data || []).map(w => ({ id: w.id, name: w.name || '', label: w.name || '' })));
    }).catch(() => {});
    fetchEstimatePurchasePaymentMethodsOdoo().then(data => {
      const methods = (data || []).map(pm => ({ id: pm.id, name: pm.name || '', label: pm.name || '', is_default: pm.is_default, is_vendor_account: pm.is_vendor_account }));
      setPaymentMethods(methods);
      const defaultPm = methods.find(pm => pm.is_default);
      if (defaultPm) setPaymentMethod(defaultPm);
      if (methods.length === 0) showToastMessage('No payment methods found. Please check Odoo configuration.');
    }).catch(() => { showToastMessage('Failed to load payment methods'); });
    fetchProductsOdoo({ limit: 50 }).then(data => {
      setProducts((data || []).map(p => ({ id: p.id, name: p.product_name || p.name || '', label: p.product_name || p.name || '', standard_price: p.standard_price || p.price || 0 })));
    }).catch(() => {});
  };

  const handleCreateVendor = async () => {
    if (!newVendorName.trim()) {
      Alert.alert('Error', 'Vendor name is required');
      return;
    }
    setCreatingVendor(true);
    try {
      const newId = await createVendorOdoo({
        name: newVendorName.trim(),
        phone: newVendorPhone.trim() || undefined,
        email: newVendorEmail.trim() || undefined,
        company: newVendorCompany.trim() || undefined,
      });
      const newVendorItem = { id: newId, name: newVendorName.trim(), label: newVendorName.trim() };
      setVendors(prev => [newVendorItem, ...prev]);
      setVendor(newVendorItem);
      if (errors.vendor) setErrors(prev => ({ ...prev, vendor: null }));
      setShowVendorModal(false);
      setNewVendorName('');
      setNewVendorPhone('');
      setNewVendorEmail('');
      setNewVendorCompany('');
      showToastMessage('Vendor created successfully');
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to create vendor');
    } finally {
      setCreatingVendor(false);
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
      const newItem = { id: productId, name: newProdName.trim(), label: newProdName.trim(), standard_price: parseFloat(newProdPrice) || 0 };
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

  const openDropdown = (type, lineIndex = null) => {
    setDropdownType(type);
    setEditingLineIndex(lineIndex);
    setIsDropdownVisible(true);
  };

  const handleDropdownSelect = (item) => {
    switch (dropdownType) {
      case 'vendor':
        setVendor(item);
        if (errors.vendor) setErrors(prev => ({ ...prev, vendor: null }));
        break;
      case 'warehouse':
        setWarehouse(item);
        if (errors.warehouse) setErrors(prev => ({ ...prev, warehouse: null }));
        break;
      case 'payment_method':
        setPaymentMethod(item);
        if (errors.payment_method) setErrors(prev => ({ ...prev, payment_method: null }));
        break;
      case 'product':
        if (editingLineIndex !== null) {
          const updatedLines = [...lines];
          updatedLines[editingLineIndex] = {
            ...updatedLines[editingLineIndex],
            product_id: item.id,
            product_name: item.label || item.name,
            price_unit: item.standard_price || 0,
          };
          setLines(updatedLines);
        }
        break;
    }
    setIsDropdownVisible(false);
  };

  const getDropdownItems = () => {
    switch (dropdownType) {
      case 'vendor': return vendors;
      case 'warehouse': return warehouses;
      case 'payment_method': return paymentMethods;
      case 'product': return products;
      default: return [];
    }
  };

  const getDropdownTitle = () => {
    switch (dropdownType) {
      case 'vendor': return 'Select Vendor';
      case 'warehouse': return 'Select Warehouse';
      case 'payment_method': return 'Select Payment Method';
      case 'product': return 'Select Product';
      default: return 'Select';
    }
  };

  const handleBarcodeScan = (lineIndex) => {
    navigation.navigate('Scanner', {
      onScan: async (barcode) => {
        const products = await fetchProductByBarcodeOdoo(barcode);
        if (products && products.length > 0) {
          const p = products[0];
          const updatedLines = [...lines];
          updatedLines[lineIndex] = { ...updatedLines[lineIndex], product_id: p.id, product_name: p.product_name, price_unit: p.standard_price || p.price || 0 };
          setLines(updatedLines);
          navigation.goBack();
        } else {
          showToastMessage('Product not found');
        }
      }
    });
  };

  const handleAddLine = () => {
    setLines(prev => [...prev, { product_id: null, product_name: '', quantity: '1', price_unit: 0 }]);
  };

  const handleRemoveLine = (index) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleLineFieldChange = (index, field, value) => {
    const updatedLines = [...lines];
    updatedLines[index] = { ...updatedLines[index], [field]: value };
    setLines(updatedLines);
  };

  const computeTotal = () => {
    return lines.reduce((sum, l) => sum + (Number(l.quantity || 0) * Number(l.price_unit || 0)), 0).toFixed(3);
  };

  const validateForm = () => {
    Keyboard.dismiss();
    const newErrors = {};
    if (!vendor) newErrors.vendor = 'Required';
    if (!warehouse) newErrors.warehouse = 'Required';
    if (!paymentMethod) newErrors.payment_method = 'Required';
    if (lines.length === 0) {
      showToastMessage('Please add at least one product line');
      return false;
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].product_id) {
        showToastMessage(`Please select a product for line ${i + 1}`);
        return false;
      }
      if (!lines[i].quantity || Number(lines[i].quantity) <= 0) {
        showToastMessage(`Quantity must be positive for line ${i + 1}`);
        return false;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!validateForm()) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const data = {
        partnerId: vendor.id,
        warehouseId: warehouse.id,
        paymentMethodId: paymentMethod.id,
        reference: reference || undefined,
        notes: notes || undefined,
        orderLines: lines.map(l => ({
          product_id: l.product_id,
          qty: Number(l.quantity),
          price_unit: Number(l.price_unit || 0),
        })),
      };

      await createEstimatePurchaseOdoo(data);
      showToastMessage('Estimate Purchase created successfully');
      navigation.goBack();
    } catch (error) {
      console.error('Error creating estimate purchase:', error);
      const msg = error?.message || 'Failed to create estimate purchase';
      Alert.alert('Error', msg);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Easy-Sales-style product line rendering
  const handleCartQtyChange = (productId, quantity) => {
    const qty = Math.max(0, isNaN(parseInt(quantity)) ? 0 : parseInt(quantity));
    const p = cartProducts.find((x) => x.id === productId);
    if (p) addProduct({ ...p, quantity: qty });
  };
  const handleCartPriceChange = (productId, price) => {
    const p = cartProducts.find((x) => x.id === productId);
    if (p) addProduct({ ...p, price: isNaN(parseFloat(price)) ? 0 : parseFloat(price) });
  };
  const handleAddProductNav = () => {
    navigation.navigate('POSProducts', { fromCustomerDetails: { id: ESTIMATE_PURCHASE_CART_ID, name: 'Estimate Purchase' } });
  };
  const handleBarcodeScanNav = () => {
    navigation.navigate('Scanner', {
      onScan: async (barcode) => {
        const results = await fetchProductByBarcodeOdoo(barcode);
        if (results && results.length > 0) {
          const p = results[0];
          addProduct({ id: p.id, name: p.product_name || p.name, price: p.standard_price || p.price || 0, quantity: 1 });
          navigation.goBack();
        } else { Alert.alert('Not Found', 'Product not found'); }
      },
    });
  };

  const renderProductLine = ({ item }) => (
    <View style={styles.lineCard}>
      <View style={styles.lineRow}>
        <View style={{ flex: 1 }}><Text style={styles.lineName} numberOfLines={1}>{item?.name?.trim() || '-'}</Text></View>
        <TouchableOpacity onPress={() => removeProduct(item.id)}><Ionicons name="trash-outline" size={20} color="#F44336" /></TouchableOpacity>
      </View>
      <View style={styles.lineRow}>
        <View style={styles.lineField}><Text style={styles.lineLabel}>Qty</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity onPress={() => handleCartQtyChange(item.id, (item.quantity || 1) - 1)}><AntDesign name="minuscircleo" size={20} color={COLORS.primaryThemeColor} /></TouchableOpacity>
            <TextInput style={styles.qtyInput} value={String(item.quantity || 1)} onChangeText={(t) => handleCartQtyChange(item.id, t)} keyboardType="numeric" selectTextOnFocus />
            <TouchableOpacity onPress={() => handleCartQtyChange(item.id, (item.quantity || 1) + 1)}><AntDesign name="pluscircleo" size={20} color={COLORS.primaryThemeColor} /></TouchableOpacity>
          </View>
        </View>
        <View style={styles.lineField}><Text style={styles.lineLabel}>Price</Text>
          <TextInput style={styles.priceInput} value={String(item.price || 0)} onChangeText={(t) => handleCartPriceChange(item.id, t)} keyboardType="numeric" selectTextOnFocus />
        </View>
        <View style={styles.lineField}><Text style={styles.lineLabel}>Subtotal</Text>
          <Text style={styles.subtotalText}>{currencySymbol} {((parseFloat(item.price) || 0) * (item.quantity || 1)).toFixed(3)}</Text>
        </View>
      </View>
    </View>
  );

  const _oldRenderLine = (line, index) => (
    <View key={index} style={styles.lineCard}>
      <View style={styles.lineRow}>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => openDropdown('product', index)}>
          <Text style={styles.lineName} numberOfLines={1}>
            {line.product_name || 'Tap to select product'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleBarcodeScan(index)} style={{ marginRight: 8 }}>
          <Icon name="barcode-scan" size={20} color={COLORS.primaryThemeColor} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleRemoveLine(index)}>
          <AntDesign name="close" size={16} color="#999" />
        </TouchableOpacity>
      </View>
      {line.product_id && (
        <View style={styles.lineFieldsRow}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Qty</Text>
            <TextInput
              style={styles.fieldInput}
              keyboardType="numeric"
              value={String(line.quantity)}
              onChangeText={(val) => handleLineFieldChange(index, 'quantity', val)}
              selectTextOnFocus
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Price</Text>
            <TextInput
              style={styles.fieldInput}
              keyboardType="numeric"
              value={String(line.price_unit)}
              onChangeText={(val) => handleLineFieldChange(index, 'price_unit', val)}
              selectTextOnFocus
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Subtotal</Text>
            <Text style={[styles.fieldValue, { fontFamily: FONT_FAMILY.urbanistBold }]}>
              {(Number(line.quantity || 0) * Number(line.price_unit || 0)).toFixed(3)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="New Estimate Purchase" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        <FormInput
          label="Vendor"
          placeholder="Select Vendor"
          dropIcon="menu-down"
          editable={false}
          value={vendor?.name || vendor?.label || ''}
          validate={errors.vendor}
          required
          onPress={() => openDropdown('vendor')}
        />
        <FormInput
          label="Warehouse"
          placeholder="Select Warehouse"
          dropIcon="menu-down"
          editable={false}
          value={warehouse?.name || warehouse?.label || ''}
          validate={errors.warehouse}
          required
          onPress={() => openDropdown('warehouse')}
        />
        <FormInput
          label="Payment Method"
          placeholder="Select Payment Method"
          dropIcon="menu-down"
          editable={false}
          value={paymentMethod?.name || paymentMethod?.label || ''}
          validate={errors.payment_method}
          required
          onPress={() => openDropdown('payment_method')}
        />
        <FormInput
          label="Vendor Reference"
          placeholder="Enter vendor reference (optional)"
          value={reference}
          onChangeText={setReference}
        />
        <FormInput
          label="Notes"
          placeholder="Enter notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {/* Product Lines */}
        {/* Products — Easy Sales style */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Products</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.addBtn} onPress={handleBarcodeScanNav}>
              <Icon name="barcode-scan" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={handleAddProductNav}>
              <AntDesign name="plus" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Add Product</Text>
            </TouchableOpacity>
          </View>
        </View>
        {cartProducts.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#888', padding: 20 }}>No products added yet</Text>
        ) : (
          <FlatList data={cartProducts} renderItem={renderProductLine} keyExtractor={(item) => String(item.id)} scrollEnabled={false} />
        )}

        {lines.length > 0 && (
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total: </Text>
            <Text style={styles.totalValue}>{computeTotal()}</Text>
          </View>
        )}

        <LoadingButton
          title="CREATE ESTIMATE PURCHASE"
          onPress={handleSubmit}
          marginTop={10}
          loading={isSubmitting}
        />
        <View style={{ height: 40 }} />

        <CustomListModal
          isVisible={isDropdownVisible}
          items={getDropdownItems()}
          title={getDropdownTitle()}
          onClose={() => setIsDropdownVisible(false)}
          onValueChange={handleDropdownSelect}
          onAddIcon={dropdownType === 'vendor' || dropdownType === 'product'}
          onAdd={dropdownType === 'vendor' ? () => { setIsDropdownVisible(false); setShowVendorModal(true); } : dropdownType === 'product' ? openCreateProduct : undefined}
        />

        {/* Create Vendor Modal */}
        <Modal visible={showVendorModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Create Vendor</Text>

              <Text style={styles.modalLabel}>Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Vendor name"
                placeholderTextColor="#999"
                value={newVendorName}
                onChangeText={setNewVendorName}
                autoFocus
              />

              <Text style={styles.modalLabel}>Phone</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Phone number"
                placeholderTextColor="#999"
                value={newVendorPhone}
                onChangeText={setNewVendorPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.modalLabel}>Email</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Email address"
                placeholderTextColor="#999"
                value={newVendorEmail}
                onChangeText={setNewVendorEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.modalLabel}>Company</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Company name"
                placeholderTextColor="#999"
                value={newVendorCompany}
                onChangeText={setNewVendorCompany}
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowVendorModal(false); setNewVendorName(''); setNewVendorPhone(''); setNewVendorEmail(''); setNewVendorCompany(''); }}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleCreateVendor} disabled={creatingVendor}>
                  <Text style={styles.modalSaveText}>{creatingVendor ? 'Saving...' : 'Save'}</Text>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Easy Sales style product line cards
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryThemeColor, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, gap: 4 },
  addBtnText: { color: '#fff', fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold },
  lineCard: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  lineName: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#333' },
  lineField: { flex: 1, alignItems: 'center' },
  lineLabel: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginBottom: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, width: 50, textAlign: 'center', paddingVertical: 4, fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, backgroundColor: '#fff' },
  priceInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, width: 80, textAlign: 'center', paddingVertical: 4, fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, backgroundColor: '#fff' },
  subtotalText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistExtraBold, color: COLORS.primaryThemeColor },
  totalSection: { flexDirection: 'row', justifyContent: 'center', marginVertical: 10, padding: 10, backgroundColor: '#e9ecef', borderRadius: 8 },
  totalLabel: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#212529' },
  totalValue: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },
  // Vendor modal styles
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

export default EstimatePurchaseForm;
