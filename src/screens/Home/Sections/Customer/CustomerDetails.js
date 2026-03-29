import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, FlatList, TextInput, Image, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearCartFromStorage } from '@api/customer/cartApi';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';

import { useProductStore } from '@stores/product';
import { Ionicons, AntDesign, MaterialIcons } from '@expo/vector-icons';
import { EmptyState } from '@components/common/empty';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { createSaleOrderOdoo, confirmSaleOrderOdoo, createInvoiceFromQuotationOdoo, fetchProductByBarcodeOdoo, fetchSaleOrderDetailOdoo, validateSaleOrderPickingsOdoo } from '@api/services/generalApi';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Toast from 'react-native-toast-message';
import Text from '@components/Text';
import { useCurrencyStore } from '@stores/currency';
import { StyleSheet } from 'react-native';
import BelowCostApprovalModal from '@components/BelowCostApprovalModal';
import { checkBelowCostLines } from '@utils/belowCostCheck';

const CustomerDetails = ({ navigation, route }) => {
  const { details } = route?.params || {};
  const currentUser = useAuthStore(state => state.user);
  const {
    getCurrentCart,
    setCurrentCustomer,
    loadCustomerCart,
    removeProduct,
    addProduct,
    clearProducts
  } = useProductStore();
  const currency = useCurrencyStore((state) => state.currency) || '';
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isDirectInvoicing, setIsDirectInvoicing] = useState(false);
  const [showBelowCostModal, setShowBelowCostModal] = useState(false);
  const [belowCostLines, setBelowCostLines] = useState([]);
  const [belowCostAction, setBelowCostAction] = useState(null); // 'place' or 'invoice'

  useEffect(() => {
    if (details?.id || details?._id) {
      const customerId = details.id || details._id;
      setCurrentCustomer(customerId);
      loadCartFromStorageFn(customerId);
    }
  }, [details]);

  const products = getCurrentCart();

  useEffect(() => {
    if (details?.id || details?._id) {
      const customerId = details.id || details._id;
      saveCartToStorage(customerId, products);
    }
  }, [products, details]);

  const loadCartFromStorageFn = async (customerId) => {
    try {
      const savedCart = await AsyncStorage.getItem(`cart_${customerId}`);
      if (savedCart) {
        const cartData = JSON.parse(savedCart);
        loadCustomerCart(customerId, cartData);
      } else {
        loadCustomerCart(customerId, []);
      }
    } catch (error) {
      console.error('Error loading cart from storage:', error);
      loadCustomerCart(customerId, []);
    }
  };

  const saveCartToStorage = async (customerId, cartData) => {
    try {
      await AsyncStorage.setItem(`cart_${customerId}`, JSON.stringify(cartData));
    } catch (error) {
      console.error('Error saving cart to storage:', error);
    }
  };

  const handleBarcodeScan = () => {
    navigation.navigate('Scanner', {
      onScan: async (barcode) => {
        const results = await fetchProductByBarcodeOdoo(barcode);
        if (results && results.length > 0) {
          const p = results[0];
          addProduct({ id: p.id, name: p.product_name, price: p.price || 0, quantity: 1, imageUrl: p.image_url || '' });
          navigation.goBack();
        } else {
          Alert.alert('Not Found', 'Product not found for this barcode');
        }
      }
    });
  };

  const handleDelete = (productId) => { removeProduct(productId); };

  const handleQuantityChange = (productId, quantity) => {
    const updatedQuantity = Math.max(0, isNaN(parseInt(quantity)) ? 0 : parseInt(quantity));
    const product = products.find(p => p.id === productId);
    addProduct({ ...product, quantity: updatedQuantity });
  };

  const handlePriceChange = (productId, price) => {
    const product = products.find(p => p.id === productId);
    addProduct({ ...product, price });
  };

  const calculateAmounts = () => {
    let untaxedAmount = 0;
    let taxAmount = 0;
    let totalQuantity = 0;
    products.forEach(product => {
      const lineUntaxed = (parseFloat(product.price) || 0) * product.quantity;
      const taxRate = (product.tax_percent || 0) / 100;
      untaxedAmount += lineUntaxed;
      taxAmount += lineUntaxed * taxRate;
      totalQuantity += product.quantity;
    });
    const totalAmount = untaxedAmount + taxAmount;
    return { untaxedAmount, taxAmount, totalAmount, totalQuantity };
  };

  const { untaxedAmount, taxAmount, totalAmount } = calculateAmounts();

  const renderItem = ({ item }) => {
    const rawImg = item.imageUrl || item.image_url || null;
    let imageSource = require('@assets/images/error/error.png');
    if (rawImg && typeof rawImg === 'string') {
      if (rawImg.startsWith('data:') || rawImg.startsWith('http')) {
        imageSource = { uri: rawImg };
      } else if (rawImg.length > 100) {
        imageSource = { uri: `data:image/png;base64,${rawImg}` };
      }
    }
    return (
    <View style={s.productCard}>
      <View style={s.productRow}>
        <View style={s.imageWrapper}>
          <Image source={imageSource} style={s.productImage} />
        </View>
        <View style={s.productInfo}>
          <Text style={s.productName} numberOfLines={2}>{item?.name?.trim()}</Text>
          <View style={s.controlsRow}>
            <View style={s.qtySection}>
              <Text style={s.controlLabel}>Qty</Text>
              <View style={s.qtyControls}>
                <TouchableOpacity style={s.qtyBtn} onPress={() => handleQuantityChange(item.id, item.quantity - 1)}>
                  <AntDesign name="minus" size={14} color="#555" />
                </TouchableOpacity>
                <TextInput
                  style={s.qtyInput}
                  value={item.quantity.toString()}
                  onChangeText={(text) => handleQuantityChange(item.id, text)}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
                <TouchableOpacity style={s.qtyBtn} onPress={() => handleQuantityChange(item.id, item.quantity + 1)}>
                  <AntDesign name="plus" size={14} color="#555" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.priceSection}>
              <Text style={s.controlLabel}>Price</Text>
              <View style={s.priceRow}>
                <TextInput
                  style={s.priceInput}
                  value={String(item.price)}
                  onChangeText={(text) => handlePriceChange(item.id, text)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                <Text style={s.currencyLabel}>{currency}</Text>
              </View>
            </View>
            <View style={s.subtotalSection}>
              <Text style={s.controlLabel}>Subtotal</Text>
              <Text style={s.subtotalValue}>{((parseFloat(item.price) || 0) * item.quantity).toFixed(3)}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={20} color="#e74c3c" />
        </TouchableOpacity>
      </View>
    </View>
    );
  };

  const executePlaceOrder = async () => {
    const customerId = details?.id || details?._id || details?.customer_id || null;
    setIsPlacingOrder(true);
    try {
      const orderItems = products.map((product) => ({
        product_id: product.id, qty: product.quantity, price_unit: parseFloat(product.price) || 0, product_uom_qty: product.quantity,
      }));
      let warehouseId = currentUser?.warehouse?.warehouse_id || currentUser?.warehouse?.id || null;
      const odooOrderId = await createSaleOrderOdoo({ partnerId: customerId, orderLines: orderItems, warehouseId: warehouseId || undefined });
      if (!odooOrderId) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to create sale order in Odoo', position: 'bottom' });
        return;
      }
      clearProducts();
      const custId = details?.id || details?._id;
      if (custId) await clearCartFromStorage(custId);
      Alert.alert('Order Created', `Sale Order created successfully.\nOrder ID: ${odooOrderId}`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const errMsg = err?.message || 'Failed to create sale order';
      const userMsg = errMsg.includes('does not exist or has been deleted')
        ? 'Product not found in Odoo. Please clear the cart and re-add products from the catalog.'
        : errMsg;
      Toast.show({ type: 'error', text1: 'Error', text2: userMsg, position: 'bottom' });
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const placeOrder = async () => {
    if (products.length === 0) {
      Toast.show({ type: 'error', text1: 'Cart Empty', text2: 'Add products before placing order', position: 'bottom' });
      return;
    }
    const customerId = details?.id || details?._id || details?.customer_id || null;
    if (!customerId) {
      Toast.show({ type: 'error', text1: 'Missing Data', text2: 'Customer ID is required', position: 'bottom' });
      return;
    }
    // Check for below-cost lines
    const linesToCheck = products.map(p => ({
      product_id: p.id, product_name: p.name || p.display_name || '', price_unit: parseFloat(p.price) || 0, qty: p.quantity || 1,
    }));
    console.log('[PlaceOrder] Checking below cost for lines:', JSON.stringify(linesToCheck));
    try {
      const result = await checkBelowCostLines(linesToCheck);
      console.log('[PlaceOrder] Below cost result:', JSON.stringify(result));
      if (result.hasBelowCost) {
        console.log('[PlaceOrder] BELOW COST DETECTED - showing modal');
        setBelowCostLines(result.belowCostLines);
        setBelowCostAction('place');
        setShowBelowCostModal(true);
        return;
      }
      console.log('[PlaceOrder] No below cost lines, proceeding');
    } catch (err) {
      console.error('[PlaceOrder] Below cost check ERROR:', err?.message, err);
    }
    await executePlaceOrder();
  };

  const executeDirectInvoice = async () => {
    const customerId = details?.id || details?._id || details?.customer_id || null;
    setIsDirectInvoicing(true);
    try {
      const orderItems = products.map((product) => ({
        product_id: product.id, qty: product.quantity, price_unit: parseFloat(product.price) || 0, product_uom_qty: product.quantity,
      }));
      let warehouseId = currentUser?.warehouse?.warehouse_id || currentUser?.warehouse?.id || null;
      const odooOrderId = await createSaleOrderOdoo({ partnerId: customerId, orderLines: orderItems, warehouseId: warehouseId || undefined });
      if (!odooOrderId) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to create sale order', position: 'bottom' });
        return;
      }
      console.log('[DirectInvoice] === STARTING INVOICE FLOW for SO:', odooOrderId, '===');
      try { await confirmSaleOrderOdoo(odooOrderId); console.log('[DirectInvoice] SO confirmed'); } catch (e) { console.warn('[DirectInvoice] SO confirm warning:', e?.message); }
      try { await validateSaleOrderPickingsOdoo(odooOrderId); console.log('[DirectInvoice] Pickings validated'); } catch (e) { console.warn('[DirectInvoice] Picking validation warning:', e?.message); }
      console.log('[DirectInvoice] === CALLING createInvoiceFromQuotationOdoo ===');
      const invoiceResult = await createInvoiceFromQuotationOdoo(odooOrderId);
      console.log('[DirectInvoice] === INVOICE RESULT:', JSON.stringify(invoiceResult), '===');
      const invoiceId = invoiceResult?.result || null;
      const orderData = {
        name: '',
        partnerId: details?.id || details?._id || null,
        partnerName: details?.name || '-',
        partnerPhone: details?.phone || details?.mobile || details?.customer_mobile || '',
        companyName: currentUser?.company?.name || '-',
        invoiceDate: new Date().toISOString().split('T')[0].split('-').reverse().join('-'),
        amountUntaxed: untaxedAmount,
        amountTax: taxAmount,
        amountTotal: totalAmount,
        lines: products.map(p => ({
          id: p.id,
          productName: p.name || p.display_name || '-',
          quantity: p.quantity || 1,
          priceUnit: parseFloat(p.price) || 0,
          discount: p.discount || 0,
          subtotal: (parseFloat(p.price) || 0) * (p.quantity || 1),
        })),
      };
      console.log('[DirectInvoice] Built orderData with', orderData.lines.length, 'lines');
      clearProducts();
      const custId = details?.id || details?._id;
      if (custId) await clearCartFromStorage(custId);
      if (invoiceId) {
        navigation.navigate('SalesInvoiceReceiptScreen', { invoiceId, orderId: odooOrderId, orderData });
      } else {
        Alert.alert('Invoice Created', 'Invoice created successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err) {
      const errMsg = err?.message || 'Failed to create direct invoice';
      const userMsg = errMsg.includes('does not exist or has been deleted')
        ? 'Product not found in Odoo. Please clear the cart and re-add products from the catalog.'
        : errMsg;
      Toast.show({ type: 'error', text1: 'Error', text2: userMsg, position: 'bottom' });
    } finally {
      setIsDirectInvoicing(false);
    }
  };

  const handleDirectInvoice = async () => {
    if (products.length === 0) {
      Toast.show({ type: 'error', text1: 'Cart Empty', text2: 'Add products before creating an invoice', position: 'bottom' });
      return;
    }
    const customerId = details?.id || details?._id || details?.customer_id || null;
    if (!customerId) {
      Toast.show({ type: 'error', text1: 'Missing Data', text2: 'Customer ID is required', position: 'bottom' });
      return;
    }
    // Check for below-cost lines
    const linesToCheck = products.map(p => ({
      product_id: p.id, product_name: p.name || p.display_name || '', price_unit: parseFloat(p.price) || 0, qty: p.quantity || 1,
    }));
    console.log('[DirectInvoice] Checking below cost for lines:', JSON.stringify(linesToCheck));
    try {
      const result = await checkBelowCostLines(linesToCheck);
      console.log('[DirectInvoice] Below cost result:', JSON.stringify(result));
      if (result.hasBelowCost) {
        console.log('[DirectInvoice] BELOW COST DETECTED - showing modal');
        setBelowCostLines(result.belowCostLines);
        setBelowCostAction('invoice');
        setShowBelowCostModal(true);
        return;
      }
      console.log('[DirectInvoice] No below cost lines, proceeding');
    } catch (err) {
      console.error('[DirectInvoice] Below cost check ERROR:', err?.message, err);
    }
    await executeDirectInvoice();
  };

  const handleBelowCostApprove = async () => {
    setShowBelowCostModal(false);
    if (belowCostAction === 'place') {
      await executePlaceOrder();
    } else if (belowCostAction === 'invoice') {
      await executeDirectInvoice();
    }
    setBelowCostLines([]);
    setBelowCostAction(null);
  };

  const handleBelowCostReject = () => {
    setShowBelowCostModal(false);
    Alert.alert('Rejected', 'The below-cost sale has been rejected.');
    setBelowCostLines([]);
    setBelowCostAction(null);
  };

  const phone = details?.customer_mobile || details?.mobile || details?.phone || '-';

  return (
    <SafeAreaView>
      <NavigationHeader title="Order Summary" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        {/* Customer Info Card */}
        <View style={s.customerCard}>
          <View style={s.customerRow}>
            <View style={s.customerIcon}>
              <MaterialIcons name="person" size={24} color={COLORS.primaryThemeColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.customerName}>{details?.name || '-'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <MaterialIcons name="phone" size={14} color="#999" style={{ marginRight: 4 }} />
                <Text style={s.customerPhone}>{phone}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} onPress={handleBarcodeScan}>
            <Icon name="barcode-scan" size={20} color={COLORS.primaryThemeColor} />
            <Text style={s.actionBtnText}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { flex: 2 }]} onPress={() => navigation.navigate('Products', { fromCustomerDetails: details })}>
            <MaterialIcons name="add-shopping-cart" size={20} color={COLORS.primaryThemeColor} />
            <Text style={s.actionBtnText}>Add Product(s)</Text>
          </TouchableOpacity>
        </View>

        {products.length === 0 ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty_cart.png')} message="Items are empty" />
        ) : (
          <>
            {/* Items Header */}
            <View style={s.itemsHeader}>
              <Text style={s.itemsTitle}>{products.length} Item{products.length !== 1 ? 's' : ''}</Text>
            </View>

            {/* Product List */}
            <FlatList
              data={products}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderItem}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />

            {/* Totals Card */}
            <View style={s.totalsCard}>
              <View style={s.totalRow}>
                <Text style={s.grandTotalLabel}>Total Amount</Text>
                <Text style={s.grandTotalValue}>{totalAmount.toFixed(3)} {currency}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={{ gap: 10, marginTop: 8 }}>
              <Button backgroundColor={COLORS.primaryThemeColor} title={'Place Order'} onPress={placeOrder} loading={isPlacingOrder} />
              <Button backgroundColor={'#FF9800'} title={'Direct Invoice'} onPress={handleDirectInvoice} loading={isDirectInvoicing} />
            </View>
            <View style={{ height: 40 }} />
          </>
        )}
      </RoundedScrollContainer>
      <BelowCostApprovalModal
        visible={showBelowCostModal}
        belowCostLines={belowCostLines}
        orderTotal={totalAmount}
        currency={currency}
        onApprove={handleBelowCostApprove}
        onReject={handleBelowCostReject}
        onCancel={() => { setShowBelowCostModal(false); setBelowCostLines([]); setBelowCostAction(null); }}
      />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  // Customer Card
  customerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  customerRow: { flexDirection: 'row', alignItems: 'center' },
  customerIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primaryThemeColor + '15',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  customerName: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f' },
  customerPhone: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#888' },

  // Action Buttons
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, gap: 8,
    borderWidth: 1.5, borderColor: COLORS.primaryThemeColor + '40',
  },
  actionBtnText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },

  // Items Header
  itemsHeader: { marginBottom: 8 },
  itemsTitle: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#333' },

  // Product Card
  productCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#f0f0f0',
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    }),
  },
  productRow: { flexDirection: 'row', alignItems: 'flex-start' },
  imageWrapper: {
    width: 64, height: 64, borderRadius: 12, backgroundColor: '#f8f9fa',
    borderWidth: 1, borderColor: '#eee', overflow: 'hidden', marginRight: 12,
  },
  productImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  productInfo: { flex: 1 },
  productName: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f', marginBottom: 10 },
  controlsRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  controlLabel: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginBottom: 4 },

  // Qty Controls
  qtySection: {},
  qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 8, overflow: 'hidden' },
  qtyBtn: { width: 30, height: 32, justifyContent: 'center', alignItems: 'center' },
  qtyInput: {
    width: 38, height: 32, textAlign: 'center',
    fontFamily: FONT_FAMILY.urbanistSemiBold, fontSize: 14, color: '#333',
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fff',
  },

  // Price Controls
  priceSection: { flex: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  priceInput: {
    flex: 1, height: 32, borderRadius: 8, backgroundColor: '#f5f5f5',
    paddingHorizontal: 10, fontFamily: FONT_FAMILY.urbanistSemiBold, fontSize: 14, color: '#333',
  },
  currencyLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginLeft: 6 },

  // Subtotal
  subtotalSection: { alignItems: 'flex-end' },
  subtotalValue: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor, marginTop: 6 },

  // Delete
  deleteBtn: { padding: 6, marginLeft: 4 },

  // Totals Card
  totalsCard: {
    backgroundColor: '#f8f9fa', borderRadius: 14, padding: 16, marginTop: 8,
    borderWidth: 1, borderColor: '#eee',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  totalLabel: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666' },
  totalValue: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333' },
  divider: { height: 1, backgroundColor: '#ddd', marginVertical: 8 },
  grandTotalLabel: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f' },
  grandTotalValue: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistExtraBold, color: COLORS.primaryThemeColor },
});

export default CustomerDetails;
