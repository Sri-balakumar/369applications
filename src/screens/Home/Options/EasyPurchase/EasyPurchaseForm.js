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

  const handleQuantityChange = (productId, quantity) => {
    const updatedQty = Math.max(0, isNaN(parseInt(quantity)) ? 0 : parseInt(quantity));
    const product = products.find((p) => p.id === productId);
    if (product) addProduct({ ...product, quantity: updatedQty });
  };

  const handlePriceChange = (productId, price) => {
    const updatedPrice = isNaN(parseFloat(price)) ? 0 : parseFloat(price);
    const product = products.find((p) => p.id === productId);
    if (product) addProduct({ ...product, price: updatedPrice });
  };

  const handleDelete = (productId) => { removeProduct(productId); };

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
    <View style={s.lineCard}>
      <View style={s.lineRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.lineName} numberOfLines={1}>{item?.name?.trim() || item?.display_name || '-'}</Text>
        </View>
        <TouchableOpacity onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={20} color="#F44336" />
        </TouchableOpacity>
      </View>
      <View style={s.lineRow}>
        <View style={s.lineField}>
          <Text style={s.lineLabel}>Qty</Text>
          <View style={s.qtyRow}>
            <TouchableOpacity onPress={() => handleQuantityChange(item.id, (item.quantity || 1) - 1)}>
              <AntDesign name="minuscircleo" size={20} color={COLORS.primaryThemeColor} />
            </TouchableOpacity>
            <TextInput
              style={s.qtyInput}
              value={String(item.quantity || 1)}
              onChangeText={(text) => handleQuantityChange(item.id, text)}
              keyboardType="numeric"
              selectTextOnFocus
            />
            <TouchableOpacity onPress={() => handleQuantityChange(item.id, (item.quantity || 1) + 1)}>
              <AntDesign name="pluscircleo" size={20} color={COLORS.primaryThemeColor} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={s.lineField}>
          <Text style={s.lineLabel}>Price</Text>
          <TextInput
            style={s.priceInput}
            value={String(item.price || 0)}
            onChangeText={(text) => handlePriceChange(item.id, text)}
            keyboardType="numeric"
            selectTextOnFocus
          />
        </View>
        <View style={s.lineField}>
          <Text style={s.lineLabel}>Subtotal</Text>
          <Text style={s.subtotalText}>{currencySymbol} {((parseFloat(item.price) || 0) * (item.quantity || 1)).toFixed(3)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Easy Purchase" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — purchase will sync when you reconnect" />
      <RoundedScrollContainer>
        {/* Vendor section */}
        <View style={s.sectionCard}>
          <FormInput label="Vendor" placeholder="Select vendor" editable={false} dropIcon="menu-down" required
            value={vendor?.name || vendor?.label || ''}
            onPress={() => navigation.navigate('CustomerScreen', {
              selectMode: true,
              companyId: warehouse?.company_id || null,
              onSelect: (selected) => { setVendor(selected); },
            })} />

          <FormInput label="Payment Method" placeholder="Select" editable={false} dropIcon="menu-down"
            value={paymentMethod?.label || ''}
            onPress={() => { setDropdownType('payment'); setIsDropdownVisible(true); }} />

          <FormInput label="Warehouse" placeholder="Select" editable={false} dropIcon="menu-down"
            value={warehouse?.label || ''}
            onPress={() => { setDropdownType('warehouse'); setIsDropdownVisible(true); }} />

          <FormInput label="Vendor Reference" placeholder="e.g. PO-42" value={vendorRef} onChangeText={setVendorRef} />
        </View>

        {/* Products section */}
        <View style={s.sectionCard}>
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
            <Text style={s.emptyText}>No products added yet</Text>
          ) : (
            <FlatList data={products} renderItem={renderProductRow} keyExtractor={(item) => String(item.id)} scrollEnabled={false} />
          )}
        </View>

        {/* Totals section */}
        <View style={s.sectionCard}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Untaxed Amount</Text>
            <Text style={s.totalValue}>{currencySymbol} {total.toFixed(3)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Tax</Text>
            <Text style={s.totalValue}>{currencySymbol} 0.000</Text>
          </View>
          <View style={[s.totalRow, s.grandTotalRow]}>
            <Text style={s.grandTotalLabel}>Total</Text>
            <Text style={s.grandTotalValue}>{currencySymbol} {total.toFixed(3)}</Text>
          </View>
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
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryThemeColor,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 20,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  lineCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  lineName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  lineField: {
    flex: 1,
    alignItems: 'center',
  },
  lineLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginBottom: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    width: 50,
    textAlign: 'center',
    paddingVertical: 4,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    backgroundColor: '#fff',
  },
  priceInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    width: 80,
    textAlign: 'center',
    paddingVertical: 4,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    backgroundColor: '#fff',
  },
  subtotalText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    color: COLORS.primaryThemeColor,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#666',
  },
  totalValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 4,
    paddingTop: 10,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  grandTotalValue: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    color: COLORS.primaryThemeColor,
  },
});

export default EasyPurchaseForm;
