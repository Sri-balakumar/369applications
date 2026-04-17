import React, { useState, useEffect, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, FlatList, Image, Alert, StyleSheet, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import { Button } from '@components/common/Button';
import { CustomListModal } from '@components/Modal';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { useProductStore } from '@stores/product';
import { useCurrencyStore } from '@stores/currency';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { format } from 'date-fns';

import {
  fetchEasySalesPaymentMethodsOdoo,
  fetchWarehousesOdoo,
  createEasySaleOdoo,
  fetchProductByBarcodeOdoo,
  createBelowCostApprovalLogOdoo,
} from '@api/services/generalApi';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import OfflineBanner from '@components/common/OfflineBanner';
import BelowCostApprovalModal from '@components/BelowCostApprovalModal';
import { checkBelowCostLines, generateBelowCostDetailsText } from '@utils/belowCostCheck';

const EASY_SALES_CUSTOMER_ID = '__easy_sales__';

const EasySalesForm = ({ navigation }) => {
  const currentUser = useAuthStore(state => state.user);
  const currency = useCurrencyStore((state) => state.currency) || '';
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';

  const {
    getCurrentCart,
    setCurrentCustomer,
    loadCustomerCart,
    removeProduct,
    addProduct,
    clearProducts,
  } = useProductStore();

  // Form state
  const [customer, setCustomer] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [warehouse, setWarehouse] = useState(null);
  const [customerRef, setCustomerRef] = useState('');
  const [date] = useState(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [showBelowCostModal, setShowBelowCostModal] = useState(false);
  const [belowCostLines, setBelowCostLines] = useState([]);
  const [pendingSaleData, setPendingSaleData] = useState(null);

  // Dropdown state
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [dropdownType, setDropdownType] = useState('');
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  // Set up product store for easy sales cart
  useEffect(() => {
    setCurrentCustomer(EASY_SALES_CUSTOMER_ID);
    loadCustomerCart(EASY_SALES_CUSTOMER_ID, []);
  }, []);

  // Reload cart when returning from Products screen
  useFocusEffect(
    useCallback(() => {
      setCurrentCustomer(EASY_SALES_CUSTOMER_ID);
    }, [])
  );

  const products = getCurrentCart();

  // Load payment methods and warehouses
  useEffect(() => {
    const loadData = async () => {
      const [pmData, warehouseData] = await Promise.all([
        fetchEasySalesPaymentMethodsOdoo(),
        fetchWarehousesOdoo(),
      ]);
      setPaymentMethods(pmData.map(pm => ({ id: pm.id, label: pm.name, is_default: pm.is_default })));
      setWarehouses(warehouseData.map(w => ({ id: w.id, label: w.name, code: w.code, company_id: w.company_id })));
      // Auto-select default payment method if available
      const defaultPm = pmData.find(pm => pm.is_default);
      if (defaultPm) {
        setPaymentMethod({ id: defaultPm.id, label: defaultPm.name });
      }
      // Auto-select first warehouse if available
      if (warehouseData.length > 0) {
        setWarehouse({ id: warehouseData[0].id, label: warehouseData[0].name, company_id: warehouseData[0].company_id });
      }
    };
    loadData();
  }, []);

  // Customer selector
  const openCustomerSelector = () => {
    navigation.navigate('CustomerScreen', {
      selectMode: true,
      onSelect: (selected) => {
        setCustomer(selected);
      },
    });
  };

  // Dropdown handlers
  const toggleDropdown = (type) => {
    setDropdownType(type);
    setIsDropdownVisible(true);
  };

  const handleDropdownSelect = (item) => {
    if (dropdownType === 'Payment Method') setPaymentMethod(item);
    if (dropdownType === 'Warehouse') setWarehouse(item);
    setIsDropdownVisible(false);
  };

  const getDropdownItems = () => {
    if (dropdownType === 'Payment Method') return paymentMethods;
    if (dropdownType === 'Warehouse') return warehouses;
    return [];
  };

  // Product line handlers
  const handleAddProduct = () => {
    navigation.navigate('POSProducts', { fromCustomerDetails: { id: EASY_SALES_CUSTOMER_ID, name: 'Easy Sales' } });
  };

  const handleBarcodeScan = () => {
    navigation.navigate('Scanner', {
      onScan: async (barcode) => {
        const results = await fetchProductByBarcodeOdoo(barcode);
        if (results && results.length > 0) {
          const p = results[0];
          addProduct({ id: p.id, name: p.product_name, price: p.price || 0, quantity: 1 });
          navigation.goBack();
        } else {
          Alert.alert('Not Found', 'Product not found for this barcode');
        }
      }
    });
  };

  const handleQuantityChange = (productId, quantity) => {
    const updatedQuantity = Math.max(0, isNaN(parseInt(quantity)) ? 0 : parseInt(quantity));
    const product = products.find(p => p.id === productId);
    if (product) addProduct({ ...product, quantity: updatedQuantity });
  };

  const handlePriceChange = (productId, price) => {
    const updatedPrice = isNaN(parseFloat(price)) ? 0 : parseFloat(price);
    const product = products.find(p => p.id === productId);
    if (product) addProduct({ ...product, price: updatedPrice });
  };

  const handleDelete = (productId) => {
    removeProduct(productId);
  };

  // Totals
  const untaxedAmount = products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
  const taxAmount = untaxedAmount * 0.05;
  const totalAmount = untaxedAmount + taxAmount;

  // Execute the sale creation
  const executeSale = async () => {
    setIsSubmitting(true);
    try {
      const orderLines = products.map(p => ({
        product_id: p.id,
        qty: p.quantity,
        price_unit: p.price,
      }));

      const customerId = customer.id || customer._id;
      console.log('[EasySales] Creating easy sale, customer:', customerId, 'lines:', orderLines.length);

      const createResult = await createEasySaleOdoo({
        partnerId: customerId,
        orderLines,
        warehouseId: warehouse?.id || undefined,
        warehouseCompanyId: warehouse?.company_id || undefined,
        paymentMethodId: paymentMethod?.id || undefined,
        customerRef: customerRef || undefined,
      });

      if (!createResult) {
        Alert.alert('Error', 'Failed to create easy sale in Odoo.');
        return null;
      }

      const isOfflineResult = typeof createResult === 'object' && createResult?.offline;
      const saleId = isOfflineResult ? createResult.id : createResult;

      console.log('[EasySales] Easy sale created:', saleId, isOfflineResult ? '(offline)' : '');
      clearProducts();
      if (isOfflineResult) {
        Alert.alert('Saved Offline', 'Easy sale saved locally. Will sync when you reconnect.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Sale Created', `Easy sale created successfully.\nSale ID: ${saleId}`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
      return saleId;
    } catch (err) {
      console.error('[EasySales] Error:', err?.message || err);
      Alert.alert('Error', err?.message || 'Failed to create easy sale.');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Sale
  const handleCreateSale = async () => {
    if (!customer) {
      Alert.alert('Missing Data', 'Please select a customer.');
      return;
    }
    if (products.length === 0) {
      Alert.alert('No Products', 'Please add at least one product.');
      return;
    }

    // Check for below-cost lines
    setIsSubmitting(true);
    try {
      const linesToCheck = products.map(p => ({
        product_id: p.id,
        product_name: p.name,
        price_unit: p.price,
        qty: p.quantity,
      }));

      const result = await checkBelowCostLines(linesToCheck);
      if (result.hasBelowCost) {
        setBelowCostLines(result.belowCostLines);
        setPendingSaleData(linesToCheck);
        setIsSubmitting(false);
        setShowBelowCostModal(true);
        return;
      }
    } catch (err) {
      console.log('[EasySales] Below cost check failed, proceeding:', err?.message);
    }

    await executeSale();
  };

  const handleBelowCostApprove = async ({ approverId, approverName, reason }) => {
    setShowBelowCostModal(false);
    const saleId = await executeSale();
    if (saleId) {
      try {
        await createBelowCostApprovalLogOdoo({
          saleOrderId: saleId,
          approverId,
          reason,
          action: 'approved',
          belowCostDetails: generateBelowCostDetailsText(belowCostLines),
        });
      } catch (e) { console.log('[EasySales] Failed to create approval log:', e?.message); }
    }
    setBelowCostLines([]);
    setPendingSaleData(null);
  };

  const handleBelowCostReject = async ({ approverId, approverName, reason }) => {
    setShowBelowCostModal(false);
    Alert.alert('Sale Rejected', 'The below-cost sale has been rejected.');
    setBelowCostLines([]);
    setPendingSaleData(null);
  };

  // Render product line
  const renderProductLine = ({ item }) => (
    <View style={styles.lineCard}>
      <View style={styles.lineRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.lineName} numberOfLines={1}>{item?.name?.trim()}</Text>
        </View>
        <TouchableOpacity onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={20} color="#F44336" />
        </TouchableOpacity>
      </View>
      <View style={styles.lineRow}>
        <View style={styles.lineField}>
          <Text style={styles.lineLabel}>Qty</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity onPress={() => handleQuantityChange(item.id, item.quantity - 1)}>
              <AntDesign name="minuscircleo" size={20} color={COLORS.primaryThemeColor} />
            </TouchableOpacity>
            <TextInput
              style={styles.qtyInput}
              value={item.quantity.toString()}
              onChangeText={(text) => handleQuantityChange(item.id, text)}
              keyboardType="numeric"
              selectTextOnFocus
            />
            <TouchableOpacity onPress={() => handleQuantityChange(item.id, item.quantity + 1)}>
              <AntDesign name="pluscircleo" size={20} color={COLORS.primaryThemeColor} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.lineField}>
          <Text style={styles.lineLabel}>Price</Text>
          <TextInput
            style={styles.priceInput}
            value={item.price.toString()}
            onChangeText={(text) => handlePriceChange(item.id, text)}
            keyboardType="numeric"
            selectTextOnFocus
          />
        </View>
        <View style={styles.lineField}>
          <Text style={styles.lineLabel}>Subtotal</Text>
          <Text style={styles.subtotalText}>{currencySymbol} {(item.price * item.quantity).toFixed(3)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Easy Sales" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — sale will sync when you reconnect" />
      <RoundedScrollContainer scrollEnabled={scrollEnabled}>

        {/* Form Fields */}
        <View style={styles.sectionCard}>
          <FormInput
            label="Customer"
            placeholder="Select Customer"
            dropIcon="chevron-down"
            editable={false}
            value={customer?.name?.trim() || ''}
            required
            onPress={openCustomerSelector}
          />
          <View style={styles.rowFields}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <FormInput
                label="Payment Method"
                placeholder="Select"
                dropIcon="menu-down"
                editable={false}
                value={paymentMethod?.label || ''}
                onPress={() => toggleDropdown('Payment Method')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormInput
                label="Warehouse"
                placeholder="Select"
                dropIcon="menu-down"
                editable={false}
                value={warehouse?.label || ''}
                onPress={() => toggleDropdown('Warehouse')}
              />
            </View>
          </View>
          <View style={styles.rowFields}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <FormInput
                label="Date"
                editable={false}
                value={format(date, 'yyyy-MM-dd')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormInput
                label="Customer Reference"
                placeholder="Reference"
                value={customerRef}
                onChangeText={setCustomerRef}
              />
            </View>
          </View>
          <FormInput
            label="Currency"
            editable={false}
            value={currency}
          />
        </View>

        {/* Products Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Products</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.addBtn} onPress={handleBarcodeScan}>
                <Icon name="barcode-scan" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Scan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={handleAddProduct}>
                <AntDesign name="plus" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add Product</Text>
              </TouchableOpacity>
            </View>
          </View>

          {products.length === 0 ? (
            <Text style={styles.emptyText}>No products added yet</Text>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id?.toString()}
              renderItem={renderProductLine}
              scrollEnabled={false}
            />
          )}
        </View>

        {/* Totals */}
        {products.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Untaxed Amount:</Text>
              <Text style={styles.totalValue}>{currencySymbol} {untaxedAmount.toFixed(3)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Taxes (5%):</Text>
              <Text style={styles.totalValue}>{currencySymbol} {taxAmount.toFixed(3)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>Total:</Text>
              <Text style={styles.grandTotalValue}>{currencySymbol} {totalAmount.toFixed(3)}</Text>
            </View>
          </View>
        )}

        {/* Create Sale Button */}
        <View style={{ marginVertical: 16 }}>
          <Button
            backgroundColor={COLORS.primaryThemeColor}
            title="Create Sale"
            onPress={handleCreateSale}
            loading={isSubmitting}
          />
        </View>

      </RoundedScrollContainer>

      {/* Dropdown Modal */}
      <CustomListModal
        isVisible={isDropdownVisible}
        items={getDropdownItems()}
        title={dropdownType || ''}
        onClose={() => setIsDropdownVisible(false)}
        onValueChange={handleDropdownSelect}
        onAddIcon={false}
      />

      <OverlayLoader visible={isSubmitting} />
      <BelowCostApprovalModal
        visible={showBelowCostModal}
        belowCostLines={belowCostLines}
        orderTotal={totalAmount}
        currency={currency}
        onApprove={handleBelowCostApprove}
        onReject={handleBelowCostReject}
        onCancel={() => { setShowBelowCostModal(false); setBelowCostLines([]); setPendingSaleData(null); }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
  rowFields: {
    flexDirection: 'row',
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

export default EasySalesForm;
