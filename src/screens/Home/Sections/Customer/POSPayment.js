import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet, Modal, FlatList } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { COLORS } from '@constants/theme';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import {
  fetchPosPaymentMethodsOdoo,
  createPosOrderOdoo,
  createPosPaymentOdoo,
  createPaymentWithSignatureOdoo,
} from '@api/services/generalApi';
import { useProductStore } from '@stores/product';
import Toast from 'react-native-toast-message';
import SignaturePad from '@components/SignaturePad';
import usePaymentSignatureLocation from '@hooks/usePaymentSignatureLocation';

const POSPayment = ({ navigation, route }) => {
  const [invoiceChecked, setInvoiceChecked] = useState(false);
  const { orderId: existingOrderId, products = [], customer: initialCustomer, sessionId } = route?.params || {};
  const [customer, setCustomer] = useState(initialCustomer);
  const openCustomerSelector = () => {
    navigation.navigate('CustomerScreen', {
      selectMode: true,
      onSelect: (selected) => {
        setCustomer(selected);
      },
    });
  };
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [paying, setPaying] = useState(false);
  const { clearProducts } = useProductStore();
  const [inputAmount, setInputAmount] = useState('');
  const {
    signatureBase64,
    setSignatureBase64,
    scrollEnabled,
    setScrollEnabled,
    captureLocation,
  } = usePaymentSignatureLocation();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const methods = await fetchPosPaymentMethodsOdoo();
        if (mounted) {
          setPaymentMethods(methods);
          // Auto-select first cash method
          const cashMethod = methods.find(m => m.type === 'cash') || methods[0];
          if (cashMethod) setSelectedPaymentMethod(cashMethod);
        }
      } catch (e) {
        console.warn('Failed to load payment methods', e?.message || e);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const computeTotal = () => (products || []).reduce((s, p) => s + ((p.price || 0) * (p.quantity || p.qty || 0)), 0);
  const paidAmount = parseFloat(inputAmount) || 0;
  const total = computeTotal();
  const remaining = total - paidAmount;

  // Select payment method based on mode
  const handleModeChange = (mode) => {
    setPaymentMode(mode);
    let method = null;
    if (mode === 'cash') {
      method = paymentMethods.find(m => m.type === 'cash');
    } else if (mode === 'card') {
      method = paymentMethods.find(m => m.type === 'bank');
    } else {
      method = paymentMethods.find(m => m.type === 'pay_later') || paymentMethods[0];
    }
    setSelectedPaymentMethod(method || paymentMethods[0] || null);
  };

  const handleKeypad = (val) => {
    if (val === 'C') return setInputAmount('');
    if (val === '⌫') return setInputAmount(inputAmount.slice(0, -1));
    if (val === '+10') return setInputAmount(((parseFloat(inputAmount) || 0) + 10).toString());
    if (val === '+20') return setInputAmount(((parseFloat(inputAmount) || 0) + 20).toString());
    if (val === '+50') return setInputAmount(((parseFloat(inputAmount) || 0) + 50).toString());
    if (val === '+/-') {
      if (inputAmount.startsWith('-')) setInputAmount(inputAmount.slice(1));
      else setInputAmount('-' + inputAmount);
      return;
    }
    if (val === '.') {
      if (!inputAmount.includes('.')) setInputAmount(inputAmount + '.');
      return;
    }
    setInputAmount(inputAmount + val);
  };

  const keypadRows = [
    ['1', '2', '3', '+10'],
    ['4', '5', '6', '+20'],
    ['7', '8', '9', '+50'],
    ['+/-', '0', '.', '⌫'],
  ];

  const handlePay = async () => {
    setPaying(true);
    let createdOrderId = existingOrderId;
    const payAmount = paidAmount || total;
    const partnerId = customer?.id || customer?._id || null;

    try {
      // Step 1: Create POS order in Odoo (if session available)
      if (sessionId && !existingOrderId) {
        try {
          const lines = products.map(p => ({
            product_id: p.id,
            qty: p.quantity || p.qty || 1,
            price: p.price || 0,
            name: p.name || '',
          }));
          const orderResp = await createPosOrderOdoo({ sessionId, partnerId, lines });
          if (orderResp && orderResp.result) {
            createdOrderId = orderResp.result;
            console.log('POS Order created:', createdOrderId);
          }
        } catch (orderErr) {
          console.warn('POS order creation failed (continuing with payment):', orderErr?.message);
        }
      }

      // Step 2: Create POS payment (if order was created)
      if (createdOrderId && selectedPaymentMethod) {
        try {
          await createPosPaymentOdoo({
            orderId: createdOrderId,
            amount: payAmount,
            paymentMethodId: selectedPaymentMethod.id,
          });
          console.log('POS Payment created for order:', createdOrderId);
        } catch (payErr) {
          console.warn('POS payment creation failed:', payErr?.message);
        }
      }

      // Step 3: Create account.payment with signature and location
      try {
        const location = await captureLocation();
        await createPaymentWithSignatureOdoo({
          partnerId,
          amount: payAmount,
          paymentType: 'inbound',
          ref: createdOrderId ? `POS-${createdOrderId}` : '',
          customerSignature: signatureBase64 || null,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          locationName: location?.locationName || '',
        });
      } catch (sigErr) {
        console.warn('Signature payment creation failed:', sigErr?.message);
      }

    } catch (e) {
      console.warn('Payment flow error:', e?.message);
    } finally {
      setPaying(false);
    }

    navigation.navigate('POSReceiptScreen', {
      orderId: createdOrderId,
      products,
      customer,
      amount: payAmount,
      paymentMode,
      invoiceChecked,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <NavigationHeader title="Payment" onBackPress={() => navigation.goBack()} />
      <ScrollView style={{ flex: 1, backgroundColor: COLORS.white }} scrollEnabled={scrollEnabled} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Large Amount Display */}
        <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 12 }}>
          <Text style={{ fontSize: 60, fontWeight: 'bold', color: '#222' }}>{computeTotal().toFixed(3)} ج.ع.</Text>
        </View>

        {/* Payment Mode Cards */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 18 }}>
          <TouchableOpacity onPress={() => handleModeChange('cash')} style={[styles.modeCard, paymentMode === 'cash' && styles.modeCardSelected]}>
            <Text style={styles.modeCardIcon}>💵</Text>
            <Text style={[styles.modeCardText, paymentMode === 'cash' && styles.modeCardTextSelected]}>Cash</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleModeChange('card')} style={[styles.modeCard, paymentMode === 'card' && styles.modeCardSelected]}>
            <Text style={styles.modeCardIcon}>💳</Text>
            <Text style={[styles.modeCardText, paymentMode === 'card' && styles.modeCardTextSelected]}>Card</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleModeChange('account')} style={[styles.modeCard, paymentMode === 'account' && styles.modeCardSelected]}>
            <Text style={styles.modeCardIcon}>🏦</Text>
            <Text style={[styles.modeCardText, paymentMode === 'account' && styles.modeCardTextSelected]}>Customer Account</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Input and Keypad */}
        <View style={{ alignItems: 'center', marginBottom: 18 }}>
          <View style={{
            width: '80%',
            backgroundColor: '#f6f8fa',
            borderRadius: 18,
            padding: 20,
            alignItems: 'center',
            marginBottom: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 4,
          }}>
            <Text style={{ fontSize: 26, color: '#222', marginBottom: 8, fontWeight: 'bold' }}>
              {paymentMode === 'account' ? 'Customer Account' : paymentMode === 'card' ? 'Card' : 'Cash'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
              <Text style={{ fontSize: 36, color: '#222', textAlign: 'center', flex: 1, fontWeight: 'bold' }}>{inputAmount || '0.000'} ج.ع.</Text>
              {inputAmount ? (
                <TouchableOpacity onPress={() => setInputAmount('')} style={{ marginLeft: 8 }}>
                  <Text style={{ fontSize: 28, color: '#c00', fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {remaining < 0 ? (
              <>
                <Text style={{ color: 'green', fontSize: 22, marginTop: 6 }}>Change</Text>
                <Text style={{ color: 'green', fontSize: 26, fontWeight: 'bold', marginBottom: 8 }}>{Math.abs(remaining).toFixed(3)} ج.ع.</Text>
              </>
            ) : (
              <>
                <Text style={{ color: '#c00', fontSize: 22, marginTop: 6 }}>Remaining</Text>
                <Text style={{ color: '#c00', fontSize: 26, fontWeight: 'bold', marginBottom: 8 }}>{remaining.toFixed(3)} ج.ع.</Text>
              </>
            )}
          </View>

          {/* Keypad */}
          <View style={{
            backgroundColor: '#f6f8fa',
            borderRadius: 18,
            padding: 18,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.10,
            shadowRadius: 6,
            elevation: 3,
            marginTop: 4,
          }}>
            {keypadRows.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 12 }}>
                {row.map((key) => {
                  const isAction = key === 'C' || key === '⌫' || key.startsWith('+');
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => handleKeypad(key)}
                      style={{
                        width: 80,
                        height: 64,
                        backgroundColor: isAction ? '#2b6cb0' : '#fff',
                        borderRadius: 14,
                        marginHorizontal: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: isAction ? '#255a95' : '#eee',
                        shadowColor: isAction ? '#2b6cb0' : '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isAction ? 0.18 : 0.08,
                        shadowRadius: 4,
                        elevation: isAction ? 2 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 28, color: isAction ? '#fff' : '#222', fontWeight: key.startsWith('+') || isAction ? 'bold' : 'normal' }}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* Customer/Invoice/Validate */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 18, marginTop: 10 }}>
            <TouchableOpacity onPress={openCustomerSelector} style={{
              flex: 1,
              marginRight: 8,
              backgroundColor: '#f6f8fa',
              borderRadius: 16,
              paddingVertical: 24,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#eee',
              elevation: 2,
              flexDirection: 'column',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Customer</Text>
              <Text style={{ fontSize: 22, color: '#444', marginTop: 4 }}>{customer?.name || 'Select'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setInvoiceChecked(!invoiceChecked)}
              style={{
                flex: 1,
                marginLeft: 8,
                backgroundColor: '#f6f8fa',
                borderRadius: 16,
                paddingVertical: 24,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#eee',
                flexDirection: 'row',
                justifyContent: 'center',
                elevation: 2,
              }}
            >
              <View style={{ marginRight: 16 }}>
                <View style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  borderWidth: 3,
                  borderColor: invoiceChecked ? '#2b6cb0' : '#aaa',
                  backgroundColor: invoiceChecked ? '#2b6cb0' : '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {invoiceChecked ? (
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>✓</Text>
                  ) : null}
                </View>
              </View>
              <View>
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Invoice</Text>
              </View>
            </TouchableOpacity>
          </View>
        <View style={{ marginHorizontal: 18, marginTop: 18 }}>
          <SignaturePad
            setUrl={() => {}}
            setScrollEnabled={setScrollEnabled}
            title="Customer Signature"
            onSignatureBase64={setSignatureBase64}
          />
        </View>
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <Button title="Validate" onPress={handlePay} loading={paying} style={{ width: '90%', paddingVertical: 16, borderRadius: 10 }} textStyle={{ fontSize: 20 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default POSPayment;

const styles = StyleSheet.create({
  modeCard: { flex: 1, marginHorizontal: 6, backgroundColor: '#f6f8fa', borderRadius: 12, paddingVertical: 18, alignItems: 'center', borderWidth: 2, borderColor: '#eee', elevation: 2 },
  modeCardSelected: { backgroundColor: '#2b6cb0', borderColor: '#255a95' },
  modeCardIcon: { fontSize: 28, marginBottom: 8 },
  modeCardText: { color: '#222', fontWeight: '700', fontSize: 18 },
  modeCardTextSelected: { color: '#fff' },
});
