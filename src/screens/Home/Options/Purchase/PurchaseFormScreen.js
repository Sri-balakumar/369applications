import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, TextInput as RNTextInput, Platform, ScrollView } from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { TextInput as FormInput } from '@components/common/TextInput';
import { CustomListModal } from '@components/Modal';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  fetchCustomersOdoo,
  fetchProductsOdoo,
  createPurchaseOrderOdoo,
  sendRfqPurchaseOrderOdoo,
  confirmPurchaseOrderOdoo,
} from '@api/services/generalApi';

const pad = (n) => String(n).padStart(2, '0');
const formatOdooDate = (d) => {
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const formatDisplayDate = (d) => {
  if (!d) return '';
  return `${d.toLocaleDateString()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const PurchaseFormScreen = ({ navigation }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [errors, setErrors] = useState({});

  // Dropdown data
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);

  // Modals
  const [isVendorListVisible, setIsVendorListVisible] = useState(false);
  const [isProductListVisible, setIsProductListVisible] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState(null);

  // Header fields
  const [vendor, setVendor] = useState(null);
  const [vendorRef, setVendorRef] = useState('');
  const [orderDeadline, setOrderDeadline] = useState(new Date());
  const [expectedArrival, setExpectedArrival] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [notes, setNotes] = useState('');

  // Lines: [{ product_id, product_name, product_qty, price_unit }]
  const [lines, setLines] = useState([]);

  // iOS inline pickers
  const [showOrderDeadlinePicker, setShowOrderDeadlinePicker] = useState(false);
  const [showArrivalPicker, setShowArrivalPicker] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [v, p] = await Promise.all([
          fetchCustomersOdoo({ offset: 0, limit: 200 }),
          fetchProductsOdoo({ offset: 0, limit: 200 }),
        ]);
        setVendors((v || []).map((c) => ({ id: c.id, _id: c.id, name: c.name || '', label: c.name || '' })));
        setProducts((p || []).map((x) => ({
          id: x.id,
          _id: x.id,
          name: x.product_name || x.name || '',
          label: x.product_name || x.name || '',
          price: x.price ?? x.list_price ?? 0,
        })));
      } catch (e) { /* ignore */ }
    })();
  }, []);

  // Totals
  const untaxed = lines.reduce((sum, l) => sum + (l.product_qty || 0) * (l.price_unit || 0), 0);
  const tax = 0; // Odoo will compute the real tax on save
  const total = untaxed + tax;

  // ─── Line operations ────────────────────────────────────────
  const openAddLine = () => { setEditingLineIndex(null); setIsProductListVisible(true); };

  const handleProductPick = (product) => {
    if (editingLineIndex !== null) {
      // Replace product on existing row
      setLines((prev) => prev.map((l, i) => i === editingLineIndex
        ? { ...l, product_id: product.id, product_name: product.name, price_unit: l.price_unit || product.price || 0 }
        : l));
    } else {
      setLines((prev) => [
        ...prev,
        { product_id: product.id, product_name: product.name, product_qty: 1, price_unit: product.price || 0 },
      ]);
    }
    setIsProductListVisible(false);
    setEditingLineIndex(null);
  };

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((l, i) => i === index ? { ...l, ...patch } : l));
  };
  const removeLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Date picking ──────────────────────────────────────────
  const pickDate = (current, onChange) => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        is24Hour: true,
        onChange: (_, date) => {
          if (!date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            onChange: (_, time) => {
              if (!time) return;
              const merged = new Date(date);
              merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
              onChange(merged);
            },
          });
        },
      });
    }
  };

  // ─── Submit ────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!vendor) e.vendor = 'Vendor is required';
    if (lines.length === 0) e.lines = 'Add at least one product';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const persist = async () => {
    return await createPurchaseOrderOdoo({
      partnerId: vendor.id,
      orderLines: lines.map((l) => ({
        product_id: l.product_id,
        product_qty: parseFloat(l.product_qty) || 1,
        price_unit: parseFloat(l.price_unit) || 0,
      })),
      partnerRef: vendorRef || undefined,
      dateOrder: formatOdooDate(orderDeadline),
      datePlanned: formatOdooDate(expectedArrival),
      notes: notes || undefined,
    });
  };

  const handleSaveDraft = async () => {
    if (submittingRef.current) return;
    if (!validate()) return;
    submittingRef.current = true; setIsSubmitting(true);
    try {
      const id = await persist();
      showToastMessage('RFQ saved');
      navigation.replace('PurchaseDetailScreen', { orderId: id });
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to save RFQ');
    } finally {
      submittingRef.current = false; setIsSubmitting(false);
    }
  };

  const handleSendRfq = async () => {
    if (submittingRef.current) return;
    if (!validate()) return;
    submittingRef.current = true; setIsSubmitting(true);
    try {
      const id = await persist();
      try { await sendRfqPurchaseOrderOdoo(id); } catch (_) {}
      showToastMessage('RFQ sent');
      navigation.replace('PurchaseDetailScreen', { orderId: id });
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to send RFQ');
    } finally {
      submittingRef.current = false; setIsSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (submittingRef.current) return;
    if (!validate()) return;
    submittingRef.current = true; setIsSubmitting(true);
    try {
      const id = await persist();
      await confirmPurchaseOrderOdoo(id);
      showToastMessage('Purchase Order confirmed');
      navigation.replace('PurchaseDetailScreen', { orderId: id });
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to confirm order');
    } finally {
      submittingRef.current = false; setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="New Purchase Order" onBackPress={() => navigation.goBack()} logo={false} />

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>

        {/* Header */}
        <Text style={styles.sectionTitle}>Request for Quotation</Text>
        <View style={styles.card}>
          <FormInput
            label="Vendor"
            placeholder="Select vendor"
            editable={false}
            value={vendor?.name || ''}
            dropIcon="menu-down"
            validate={errors.vendor}
            required
            onPress={() => setIsVendorListVisible(true)}
          />
          <FormInput
            label="Vendor Reference"
            placeholder="e.g. RFQ-42"
            value={vendorRef}
            onChangeText={setVendorRef}
          />
          <TouchableOpacity onPress={() => Platform.OS === 'android' ? pickDate(orderDeadline, setOrderDeadline) : setShowOrderDeadlinePicker(true)}>
            <FormInput
              label="Order Deadline"
              placeholder="Select date"
              editable={false}
              value={formatDisplayDate(orderDeadline)}
              dropIcon="calendar"
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Platform.OS === 'android' ? pickDate(expectedArrival, setExpectedArrival) : setShowArrivalPicker(true)}>
            <FormInput
              label="Expected Arrival"
              placeholder="Select date"
              editable={false}
              value={formatDisplayDate(expectedArrival)}
              dropIcon="calendar"
            />
          </TouchableOpacity>
        </View>

        {Platform.OS === 'ios' && showOrderDeadlinePicker && (
          <DateTimePicker value={orderDeadline} mode="datetime" onChange={(_, d) => { setShowOrderDeadlinePicker(false); if (d) setOrderDeadline(d); }} />
        )}
        {Platform.OS === 'ios' && showArrivalPicker && (
          <DateTimePicker value={expectedArrival} mode="datetime" onChange={(_, d) => { setShowArrivalPicker(false); if (d) setExpectedArrival(d); }} />
        )}

        {/* Products */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Products</Text>
          <TouchableOpacity onPress={openAddLine} style={styles.addLineBtn}>
            <MaterialIcons name="add" size={18} color="#fff" />
            <Text style={styles.addLineText}>Add product</Text>
          </TouchableOpacity>
        </View>
        {errors.lines ? (
          <Text style={styles.errorText}>{errors.lines}</Text>
        ) : null}

        <View style={styles.card}>
          {lines.length === 0 ? (
            <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: 10 }}>No product lines yet.</Text>
          ) : (
            <>
              <View style={[styles.lineRow, styles.lineHeader]}>
                <Text style={[styles.colName, styles.colHeader]}>Product</Text>
                <Text style={[styles.colQty, styles.colHeader]}>Qty</Text>
                <Text style={[styles.colPrice, styles.colHeader]}>Price</Text>
                <View style={styles.colTrash} />
              </View>
              {lines.map((l, i) => (
                <View key={i} style={styles.lineRow}>
                  <Text style={styles.colName} numberOfLines={2}>{l.product_name}</Text>
                  <RNTextInput
                    style={[styles.colQty, styles.lineInput]}
                    value={String(l.product_qty)}
                    keyboardType="numeric"
                    onChangeText={(t) => updateLine(i, { product_qty: t.replace(/[^0-9.]/g, '') })}
                  />
                  <RNTextInput
                    style={[styles.colPrice, styles.lineInput]}
                    value={String(l.price_unit)}
                    keyboardType="numeric"
                    onChangeText={(t) => updateLine(i, { price_unit: t.replace(/[^0-9.]/g, '') })}
                  />
                  <TouchableOpacity style={styles.colTrash} onPress={() => removeLine(i)}>
                    <MaterialIcons name="delete" size={18} color="#F44336" />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Terms */}
        <Text style={styles.sectionTitle}>Terms & Conditions</Text>
        <View style={styles.card}>
          <RNTextInput
            placeholder="Enter any notes for the vendor..."
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={3}
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Untaxed Amount</Text><Text style={styles.totalValue}>{untaxed.toFixed(3)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax</Text><Text style={styles.totalValue}>{tax.toFixed(3)}</Text></View>
          <View style={[styles.totalRow, styles.grandTotalRow]}><Text style={styles.grandLabel}>Total</Text><Text style={styles.grandValue}>{total.toFixed(3)}</Text></View>
        </View>

        {/* Actions */}
        <View style={{ gap: 10, marginTop: 10 }}>
          <LoadingButton title="SAVE AS DRAFT" onPress={handleSaveDraft} loading={isSubmitting} />
          <LoadingButton title="SEND RFQ" backgroundColor="#2196F3" onPress={handleSendRfq} loading={isSubmitting} />
          <LoadingButton title="CONFIRM ORDER" backgroundColor="#4CAF50" onPress={handleConfirm} loading={isSubmitting} />
        </View>
      </ScrollView>

      {/* Pickers */}
      <CustomListModal
        isVisible={isVendorListVisible}
        items={vendors}
        title="Select Vendor"
        onClose={() => setIsVendorListVisible(false)}
        onValueChange={(item) => { setVendor(item); setIsVendorListVisible(false); if (errors.vendor) setErrors((p) => ({ ...p, vendor: null })); }}
        onAddIcon={false}
      />
      <CustomListModal
        isVisible={isProductListVisible}
        items={products}
        title="Select Product"
        onClose={() => { setIsProductListVisible(false); setEditingLineIndex(null); }}
        onValueChange={handleProductPick}
        onAddIcon={false}
      />

      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    marginBottom: 6,
    marginLeft: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  addLineBtn: {
    backgroundColor: COLORS.primaryThemeColor,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    marginBottom: 6,
  },
  addLineText: { color: '#fff', fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 4 },
  errorText: { color: '#F44336', fontSize: 12, marginLeft: 6, marginBottom: 4 },
  lineRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  lineHeader: { borderBottomColor: '#ddd' },
  colHeader: { fontSize: 11, color: '#888', fontFamily: FONT_FAMILY.urbanistBold, textTransform: 'uppercase' },
  colName: { flex: 2, fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistMedium },
  colQty: { width: 60, textAlign: 'center', fontSize: 13, color: '#333' },
  colPrice: { width: 80, textAlign: 'right', fontSize: 13, color: '#333' },
  colTrash: { width: 36, alignItems: 'center' },
  lineInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 4, marginHorizontal: 4,
  },
  notesInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    minHeight: 70, padding: 10, fontSize: 14, color: '#333',
    textAlignVertical: 'top',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: '#888', fontFamily: FONT_FAMILY.urbanistMedium },
  totalValue: { fontSize: 13, color: '#333', fontFamily: FONT_FAMILY.urbanistSemiBold },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 6 },
  grandLabel: { fontSize: 15, color: '#2e2a4f', fontFamily: FONT_FAMILY.urbanistBold },
  grandValue: { fontSize: 15, color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold },
});

export default PurchaseFormScreen;
