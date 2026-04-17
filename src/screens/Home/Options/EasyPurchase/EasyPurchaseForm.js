import React, { useState, useEffect, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, FlatList, Alert, StyleSheet, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import { Button } from '@components/common/Button';
import { CustomListModal } from '@components/Modal';
import { OverlayLoader } from '@components/Loader';
import OfflineBanner from '@components/common/OfflineBanner';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { useProductStore } from '@stores/product';
import { useCurrencyStore } from '@stores/currency';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  fetchEasyPurchasePaymentMethodsOdoo,
  fetchWarehousesOdoo,
  createEasyPurchaseOdoo,
  fetchProductByBarcodeOdoo,
} from '@api/services/generalApi';

const EASY_PURCHASE_CUSTOMER_ID = '__easy_purchase__';

const EasyPurchaseForm = ({ navigation }) => {
  const currentUser = useAuthStore((s) => s.user);
  const currencySymbol = useCurrencyStore((s) => s.currencySymbol) || '$';

  const { getCurrentCart, setCurrentCustomer, loadCustomerCart, removeProduct, addProduct, clearProducts } = useProductStore();

  const [vendor, setVendor] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [warehouse, setWarehouse] = useState(null);
  const [vendorRef, setVendorRef] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [paymentMethods, setPaymentMethods] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [dropdownType, setDropdownType] = useState('');
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  useEffect(() => {
    setCurrentCustomer(EASY_PURCHASE_CUSTOMER_ID);
    loadCustomerCart(EASY_PURCHASE_CUSTOMER_ID, []);
  }, []);

  useFocusEffect(useCallback(() => { setCurrentCustomer(EASY_PURCHASE_CUSTOMER_ID); }, []));

  const products = getCurrentCart();

  useEffect(() => {
    (async () => {
      const [pmData, whData] = await Promise.all([
        fetchEasyPurchasePaymentMethodsOdoo(),
        fetchWarehousesOdoo(),
      ]);
      setPaymentMethods(pmData.map((pm) => ({ id: pm.id, label: pm.name, is_default: pm.is_default })));
      setWarehouses(whData.map((w) => ({ id: w.id, label: w.name, code: w.code, company_id: w.company_id })));
      const defPm = pmData.find((pm) => pm.is_default);
      if (defPm) setPaymentMethod({ id: defPm.id, label: defPm.name });
      if (whData.length > 0) setWarehouse({ id: whData[0].id, label: whData[0].name, company_id: whData[0].company_id });
    })();
  }, []);

  const total = products.reduce((sum, p) => sum + (parseFloat(p.price) || 0) * (p.quantity || 1), 0);

  const handleQuantityChange = (product, delta) => {
    const newQty = Math.max(1, (product.quantity || 1) + delta);
    addProduct({ ...product, quantity: newQty });
  };

  const handlePriceChange = (product, newPrice) => {
    addProduct({ ...product, price: newPrice });
  };

  const handleSubmit = async () => {
    if (!vendor) { Alert.alert('Missing Data', 'Please select a vendor.'); return; }
    if (products.length === 0) { Alert.alert('No Products', 'Please add at least one product.'); return; }
    setIsSubmitting(true);
    try {
      const orderLines = products.map((p) => ({
        product_id: p.id,
        product_name: p.name || p.display_name || '',
        qty: p.quantity || 1,
        price_unit: parseFloat(p.price) || 0,
      }));
      const result = await createEasyPurchaseOdoo({
        partnerId: vendor.id || vendor._id,
        orderLines,
        warehouseId: warehouse?.id || undefined,
        warehouseCompanyId: warehouse?.company_id || undefined,
        paymentMethodId: paymentMethod?.id || undefined,
        vendorRef: vendorRef || undefined,
      });
      if (!result) { Alert.alert('Error', 'Failed to create easy purchase.'); return; }
      const isOffline = typeof result === 'object' && result?.offline;
      clearProducts();
      if (isOffline) {
        Alert.alert('Saved Offline', 'Easy purchase saved locally. Will sync when you reconnect.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        Alert.alert('Purchase Created', `Easy purchase created.\nID: ${result}`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to create easy purchase.');
    } finally { setIsSubmitting(false); }
  };

  const handleScan = async (code) => {
    try {
      const found = await fetchProductByBarcodeOdoo(code);
      if (found && found.length > 0) {
        const p = found[0];
        addProduct({ id: p.id, name: p.product_name || p.name, price: String(p.standard_price || p.price || 0), quantity: 1, image_url: p.image_url });
      } else { Alert.alert('Not Found', 'Product not found for this barcode'); }
    } catch (e) { Alert.alert('Error', e?.message || 'Barcode lookup failed'); }
  };

  const renderProductRow = ({ item }) => (
    <View style={s.productRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.productName} numberOfLines={2}>{item.name || item.display_name || '-'}</Text>
        <View style={s.qtyRow}>
          <TouchableOpacity onPress={() => handleQuantityChange(item, -1)} style={s.qtyBtn}><AntDesign name="minus" size={14} color="#333" /></TouchableOpacity>
          <Text style={s.qtyText}>{item.quantity || 1}</Text>
          <TouchableOpacity onPress={() => handleQuantityChange(item, 1)} style={s.qtyBtn}><AntDesign name="plus" size={14} color="#333" /></TouchableOpacity>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <TextInput style={s.priceInput} value={String(item.price || 0)} keyboardType="numeric"
          onChangeText={(t) => handlePriceChange(item, t)} />
        <Text style={s.lineTotal}>{currencySymbol} {((parseFloat(item.price) || 0) * (item.quantity || 1)).toFixed(3)}</Text>
      </View>
      <TouchableOpacity onPress={() => removeProduct(item.id)} style={{ paddingLeft: 8 }}>
        <Ionicons name="trash-outline" size={20} color="#e74c3c" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Easy Purchase" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — purchase will sync when you reconnect" />
      <RoundedScrollContainer>
        {/* Vendor */}
        <FormInput label="Vendor" placeholder="Select vendor" editable={false} dropIcon="menu-down" required
          value={vendor?.name || vendor?.label || ''}
          onPress={() => navigation.navigate('CustomerScreen', {
            selectMode: true,
            onSelect: (selected) => { setVendor(selected); },
          })} />

        {/* Payment Method */}
        <FormInput label="Payment Method" placeholder="Select" editable={false} dropIcon="menu-down"
          value={paymentMethod?.label || ''}
          onPress={() => { setDropdownType('payment'); setIsDropdownVisible(true); }} />

        {/* Warehouse */}
        <FormInput label="Warehouse" placeholder="Select" editable={false} dropIcon="menu-down"
          value={warehouse?.label || ''}
          onPress={() => { setDropdownType('warehouse'); setIsDropdownVisible(true); }} />

        {/* Vendor Ref */}
        <FormInput label="Vendor Reference" placeholder="e.g. PO-42" value={vendorRef} onChangeText={setVendorRef} />

        {/* Products */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Products</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('Scanner', { onScan: handleScan })}>
              <Icon name="barcode-scan" size={16} color="#fff" />
              <Text style={s.addBtnText}>Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('POSProducts', { fromCustomerDetails: { id: EASY_PURCHASE_CUSTOMER_ID, name: 'Easy Purchase' } })}>
              <AntDesign name="plus" size={16} color="#fff" />
              <Text style={s.addBtnText}>Add Product</Text>
            </TouchableOpacity>
          </View>
        </View>

        {products.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#888', padding: 20 }}>No products added yet</Text>
        ) : (
          <FlatList data={products} renderItem={renderProductRow} keyExtractor={(item) => String(item.id)} scrollEnabled={false} />
        )}

        {/* Total */}
        <View style={s.totalCard}>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.totalValue}>{currencySymbol} {total.toFixed(3)}</Text>
        </View>

        {/* Submit */}
        <Button backgroundColor={COLORS.primaryThemeColor} title="Create Purchase" onPress={handleSubmit} loading={isSubmitting} marginTop={10} />
        <View style={{ height: 40 }} />

        {/* Dropdown Modal */}
        <CustomListModal
          isVisible={isDropdownVisible}
          title={dropdownType === 'payment' ? 'Payment Method' : 'Warehouse'}
          items={dropdownType === 'payment' ? paymentMethods : warehouses}
          onClose={() => setIsDropdownVisible(false)}
          onValueChange={(item) => {
            if (dropdownType === 'payment') setPaymentMethod(item);
            else setWarehouse(item);
            setIsDropdownVisible(false);
          }}
          onAddIcon={false}
        />
      </RoundedScrollContainer>
      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryThemeColor, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, gap: 4 },
  addBtnText: { color: '#fff', fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold },
  productRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8 },
  productName: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333', marginBottom: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#333', minWidth: 20, textAlign: 'center' },
  priceInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, textAlign: 'right', minWidth: 70, color: '#333' },
  lineTotal: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor, marginTop: 4 },
  totalCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 12 },
  totalLabel: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f' },
  totalValue: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },
});

export default EasyPurchaseForm;
