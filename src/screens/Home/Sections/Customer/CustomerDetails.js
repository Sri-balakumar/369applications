import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, Image, Alert, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearCartFromStorage } from '@api/customer/cartApi';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { DetailField } from '@components/common/Detail';
import { Button } from '@components/common/Button';

import { useProductStore } from '@stores/product';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { EmptyState } from '@components/common/empty';
import { COLORS } from '@constants/theme';
import styles from './styles';
import { useAuthStore } from '@stores/auth';
import { createSaleOrderOdoo, confirmSaleOrderOdoo, createInvoiceFromQuotationOdoo } from '@api/services/generalApi';
import Toast from 'react-native-toast-message';
import { useCurrencyStore } from '@stores/currency';

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

  // Set current customer and load their cart when component mounts
  useEffect(() => {
    if (details?.id || details?._id) {
      const customerId = details.id || details._id;
      setCurrentCustomer(customerId);
      
      // Try to load saved cart from AsyncStorage
      loadCartFromStorage(customerId);
    }
  }, [details]);
  
  // Get current customer's products
  const products = getCurrentCart();
  
  // Save cart to AsyncStorage whenever it changes
  useEffect(() => {
    if (details?.id || details?._id) {
      const customerId = details.id || details._id;
      saveCartToStorage(customerId, products);
    }
  }, [products, details]);

  const loadCartFromStorage = async (customerId) => {
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
  

  const handleDelete = (productId) => {
    removeProduct(productId);
  };

  const handleQuantityChange = (productId, quantity) => {
    const updatedQuantity = Math.max(0, isNaN(parseInt(quantity)) ? 0 : parseInt(quantity));
    const product = products.find(p => p.id === productId);
    addProduct({ ...product, quantity: updatedQuantity });
  };

  const handlePriceChange = (productId, price) => {
    const updatedPrice = isNaN(parseFloat(price)) ? 0 : parseFloat(price);
    const product = products.find(p => p.id === productId);
    addProduct({ ...product, price: updatedPrice });
  };

  // Calculate amounts using actual product tax rates from Odoo
  const calculateAmounts = () => {
    let untaxedAmount = 0;
    let taxAmount = 0;
    let totalQuantity = 0;

    products.forEach(product => {
      const lineUntaxed = product.price * product.quantity;
      const taxRate = (product.tax_percent || 0) / 100;
      untaxedAmount += lineUntaxed;
      taxAmount += lineUntaxed * taxRate;
      totalQuantity += product.quantity;
    });

    const totalAmount = untaxedAmount + taxAmount;
    return { untaxedAmount, taxAmount, totalAmount, totalQuantity };
  };

  const { untaxedAmount, taxAmount, totalAmount, totalQuantity } = calculateAmounts();
  // console.log("🚀 ~ CustomerDetails ~ totalQuantity:", totalQuantity)

  const renderItem = ({ item }) => (
    <View style={styles.productContainer}>
      <View style={styles.row}>
        <View style={styles.imageWrapper}>
          <Image source={{ uri: item.imageUrl }} style={styles.productImage} />
        </View>
        <View style={styles.productDetails}>
          <Text style={styles.productName}>{item?.name?.trim()}</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity onPress={() => handleQuantityChange(item.id, item.quantity - 1)}>
              <AntDesign name="minus" size={20} color="black" />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Quantity"
              value={item.quantity.toString()}
              onChangeText={(text) => handleQuantityChange(item.id, text)}
              keyboardType="numeric"
            />
            <TouchableOpacity onPress={() => handleQuantityChange(item.id, item.quantity + 1)}>
              <AntDesign name="plus" size={20} color="black" />
            </TouchableOpacity>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.label}>Price</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Price"
              value={item.price.toString()}
              onChangeText={(text) => handlePriceChange(item.id, text)}
              keyboardType="numeric"
            />
            <Text style={styles.aedLabel}>{currency}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={24} color={COLORS.black} />
        </TouchableOpacity>
      </View>
    </View>
  );

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

    setIsPlacingOrder(true);
    try {
      const orderItems = products.map((product) => ({
        product_id: product.id,
        qty: product.quantity,
        price_unit: product.price,
        product_uom_qty: product.quantity,
      }));

      let warehouseId = currentUser?.warehouse?.warehouse_id || currentUser?.warehouse?.id || null;

      console.log('[PlaceOrder] Creating sale order in Odoo, customerId:', customerId, 'items:', orderItems.length);

      // Step 1: Create sale order in Odoo
      const odooOrderId = await createSaleOrderOdoo({
        partnerId: customerId,
        orderLines: orderItems,
        warehouseId: warehouseId || undefined,
      });

      if (!odooOrderId) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to create sale order in Odoo', position: 'bottom' });
        return;
      }

      console.log('[PlaceOrder] Sale order created:', odooOrderId);
      clearProducts();
      const custId = details?.id || details?._id;
      if (custId) await clearCartFromStorage(custId);
      Alert.alert('Order Created', `Sale Order created successfully.\nOrder ID: ${odooOrderId}`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      console.error('[PlaceOrder] Error:', err?.message || err);
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to create sale order', position: 'bottom' });
    } finally {
      setIsPlacingOrder(false);
    }
  }

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

    setIsDirectInvoicing(true);
    try {
      const orderItems = products.map((product) => ({
        product_id: product.id,
        qty: product.quantity,
        price_unit: product.price,
        product_uom_qty: product.quantity,
      }));

      let warehouseId = currentUser?.warehouse?.warehouse_id || currentUser?.warehouse?.id || null;

      console.log('[DirectInvoice] Creating sale order in Odoo, customerId:', customerId);

      // Step 1: Create sale order in Odoo
      const odooOrderId = await createSaleOrderOdoo({
        partnerId: customerId,
        orderLines: orderItems,
        warehouseId: warehouseId || undefined,
      });

      if (!odooOrderId) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to create sale order', position: 'bottom' });
        return;
      }
      console.log('[DirectInvoice] Sale order created:', odooOrderId);

      // Step 2: Confirm the sale order
      await confirmSaleOrderOdoo(odooOrderId);
      console.log('[DirectInvoice] Sale order confirmed:', odooOrderId);

      // Step 3: Create invoice directly
      const invoiceResult = await createInvoiceFromQuotationOdoo(odooOrderId);
      console.log('[DirectInvoice] Invoice result:', invoiceResult);

      if (invoiceResult && invoiceResult.result) {
        clearProducts();
        const custId = details?.id || details?._id;
        if (custId) await clearCartFromStorage(custId);
        Alert.alert('Invoice Created', 'Invoice created successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to create invoice', position: 'bottom' });
      }
    } catch (err) {
      console.error('[DirectInvoice] Error:', err?.message || err);
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to create direct invoice', position: 'bottom' });
    } finally {
      setIsDirectInvoicing(false);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Order Summary" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        <TouchableOpacity style={styles.itemContainer} activeOpacity={0.7}>
          <DetailField label="Customer Name" value={details.name} multiline={true} />
         <DetailField
  label="MOB"
  value={details.customer_mobile || details.mobile || details.phone || '-'}
/>

        </TouchableOpacity>
        <Button
          title="Add Product(s)"
          width="50%"
          alignSelf="flex-end"
          marginTop={10}
          onPress={() => navigation.navigate('Products', { fromCustomerDetails: details })}
        />
        {products.length === 0 ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty_cart.png')} message="Items are empty" />
        ) : (
          <View style={styles.itemContainer}>
            <Text style={styles.totalItemsText}>Total {products.length} item{products.length !== 1 ? 's' : ''}</Text>
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.flatListContent}
              showsVerticalScrollIndicator={false}
            />
            {products.length > 0 && (
              <View style={styles.footerContainer}>
                <View style={styles.totalPriceContainer}>
                  <View style={styles.footerRow}>
                    <Text style={styles.footerLabel}>Untaxed Amount:</Text>
                    <Text style={styles.footerLabel}>{untaxedAmount.toFixed(2)} {currency}</Text>
                  </View>
                  <View style={styles.footerRow}>
                    <Text style={styles.footerLabel}>Taxes:</Text>
                    <Text style={styles.footerLabel}>{taxAmount.toFixed(2)} {currency}</Text>
                  </View>
                  <View style={styles.footerRow}>
                    <Text style={styles.totalPriceLabel}>Total Amount:</Text>
                    <Text style={styles.totalPriceLabel}>{totalAmount.toFixed(2)} {currency}</Text>
                  </View>
                </View>
                <View style={{ gap: 10 }}>
                  <Button backgroundColor={COLORS.primaryThemeColor} title={'Place Order'} onPress={placeOrder} loading={isPlacingOrder} />
                  <Button backgroundColor={'#FF9800'} title={'Direct Invoice'} onPress={handleDirectInvoice} loading={isDirectInvoicing} />
                </View>
              </View>
            )}
          </View>
        )}
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default CustomerDetails;
