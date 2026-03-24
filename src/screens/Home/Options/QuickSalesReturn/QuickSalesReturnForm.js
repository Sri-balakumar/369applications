import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Keyboard, TouchableOpacity, Alert, TextInput } from 'react-native';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { CustomListModal } from '@components/Modal';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { AntDesign } from '@expo/vector-icons';
import {
  fetchPostedCustomerInvoicesForReturnOdoo,
  fetchCustomerInvoiceLinesOdoo,
  fetchWarehousesSessionOdoo,
  fetchSaleOrderWarehouseOdoo,
  createQuickSalesReturnOdoo,
} from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';

const QuickSalesReturnForm = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const submittingRef = useRef(false);

  const [invoices, setInvoices] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownType, setDropdownType] = useState(null);

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [warehouse, setWarehouse] = useState(null);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);
  const [loadingLines, setLoadingLines] = useState(false);

  useEffect(() => {
    fetchPostedCustomerInvoicesForReturnOdoo({ limit: 100 }).then(data => setInvoices(data || [])).catch(() => {});
    fetchWarehousesSessionOdoo().then(data => {
      setWarehouses((data || []).map(w => ({ id: w.id, name: w.name || '', label: w.name || '' })));
    }).catch(() => {});
  }, []);

  const handleInvoiceSelect = async (invoice) => {
    setSelectedInvoice(invoice);
    setIsDropdownVisible(false);
    if (errors.invoice) setErrors(prev => ({ ...prev, invoice: null }));
    setLoadingLines(true);
    try {
      const [invoiceLines, soWarehouse] = await Promise.all([
        fetchCustomerInvoiceLinesOdoo(invoice.id),
        invoice.invoice_origin ? fetchSaleOrderWarehouseOdoo(invoice.invoice_origin) : Promise.resolve(null),
      ]);
      setLines(invoiceLines.map(l => ({
        source_invoice_line_id: l.id,
        product_id: Array.isArray(l.product_id) ? l.product_id[0] : l.product_id,
        product_name: Array.isArray(l.product_id) ? l.product_id[1] : (l.name || '-'),
        description: l.name || '',
        sold_qty: l.quantity || 0,
        already_returned_qty: 0,
        returnable_qty: l.quantity || 0,
        return_qty: '0',
        price_unit: l.price_unit || 0,
        uom_id: Array.isArray(l.product_uom_id) ? l.product_uom_id[0] : (l.product_uom_id || false),
      })));
      if (soWarehouse) setWarehouse(soWarehouse);
    } catch (err) {
      console.error('Error loading invoice lines:', err);
      setLines([]);
    } finally {
      setLoadingLines(false);
    }
  };

  const handleDropdownSelect = (item) => {
    if (dropdownType === 'invoice') {
      handleInvoiceSelect(item);
      return;
    }
    if (dropdownType === 'warehouse') {
      setWarehouse(item);
      if (errors.warehouse) setErrors(prev => ({ ...prev, warehouse: null }));
    }
    setIsDropdownVisible(false);
  };

  const openDropdown = (type) => {
    setDropdownType(type);
    setIsDropdownVisible(true);
  };

  const getDropdownItems = () => dropdownType === 'invoice' ? invoices : dropdownType === 'warehouse' ? warehouses : [];
  const getDropdownTitle = () => dropdownType === 'invoice' ? 'Select Customer Invoice' : 'Select Warehouse';

  const handleReturnQtyChange = (index, value) => {
    const updated = [...lines];
    const qty = parseFloat(value) || 0;
    updated[index] = { ...updated[index], return_qty: String(Math.min(qty, updated[index].returnable_qty)) };
    setLines(updated);
  };

  const handleReturnAll = () => {
    setLines(lines.map(l => ({ ...l, return_qty: String(l.returnable_qty) })));
  };

  const computeTotal = () => lines.reduce((sum, l) => sum + (Number(l.return_qty || 0) * Number(l.price_unit || 0)), 0).toFixed(2);

  const validateForm = () => {
    Keyboard.dismiss();
    const newErrors = {};
    if (!selectedInvoice) newErrors.invoice = 'Required';
    if (!warehouse) newErrors.warehouse = 'Required';
    const hasReturnQty = lines.some(l => Number(l.return_qty) > 0);
    if (!hasReturnQty) { showToastMessage('Enter at least one return quantity'); return false; }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!validateForm()) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await createQuickSalesReturnOdoo({
        sourceInvoiceId: selectedInvoice.id,
        warehouseId: warehouse.id,
        notes: notes || undefined,
        lines: lines.filter(l => Number(l.return_qty) > 0).map(l => ({
          source_invoice_line_id: l.source_invoice_line_id,
          product_id: l.product_id,
          description: l.description,
          sold_qty: l.sold_qty,
          already_returned_qty: l.already_returned_qty,
          returnable_qty: l.returnable_qty,
          return_qty: Number(l.return_qty),
          price_unit: l.price_unit,
          uom_id: l.uom_id,
        })),
      });
      showToastMessage('Sales Return created successfully');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to create return');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="New Sales Return" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        <FormInput label="Customer Invoice" placeholder="Select a posted Customer Invoice" dropIcon="menu-down" editable={false}
          value={selectedInvoice?.label || selectedInvoice?.name || ''} validate={errors.invoice} required onPress={() => openDropdown('invoice')} />
        <FormInput label="Warehouse" placeholder="Select Warehouse" dropIcon="menu-down" editable={false}
          value={warehouse?.name || warehouse?.label || ''} validate={errors.warehouse} required onPress={() => openDropdown('warehouse')} />
        <FormInput label="Notes" placeholder="Enter notes (optional)" value={notes} onChangeText={setNotes} multiline />

        {selectedInvoice && lines.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Products to Return</Text>
              <TouchableOpacity onPress={handleReturnAll} style={styles.returnAllBtn}>
                <Text style={styles.returnAllText}>Return All</Text>
              </TouchableOpacity>
            </View>
            {lines.map((line, index) => (
              <View key={index} style={styles.lineCard}>
                <Text style={styles.productText} numberOfLines={2}>{line.product_name}</Text>
                <View style={styles.lineInfoRow}>
                  <Text style={styles.infoText}>Sold: {line.sold_qty}</Text>
                  <Text style={styles.infoText}>Returnable: {line.returnable_qty}</Text>
                  <Text style={styles.infoText}>Price: {currencySymbol} {line.price_unit.toFixed(2)}</Text>
                </View>
                <View style={styles.lineFieldsRow}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Return Qty</Text>
                    <TextInput style={styles.fieldInput} keyboardType="numeric" value={String(line.return_qty)}
                      onChangeText={(val) => handleReturnQtyChange(index, val)} selectTextOnFocus />
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Subtotal</Text>
                    <Text style={[styles.fieldValue, { fontFamily: FONT_FAMILY.urbanistBold }]}>
                      {currencySymbol} {(Number(line.return_qty || 0) * line.price_unit).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>Total Return: </Text>
              <Text style={styles.totalValue}>{currencySymbol} {computeTotal()}</Text>
            </View>
          </>
        )}

        {loadingLines && <Text style={{ textAlign: 'center', color: '#999', paddingVertical: 20 }}>Loading invoice lines...</Text>}

        <LoadingButton title="CREATE SALES RETURN" onPress={handleSubmit} marginTop={10} loading={isSubmitting} />
        <View style={{ height: 40 }} />

        <CustomListModal isVisible={isDropdownVisible} items={getDropdownItems()} title={getDropdownTitle()}
          onClose={() => setIsDropdownVisible(false)} onValueChange={handleDropdownSelect} onAddIcon={false} />
      </RoundedScrollContainer>
      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#333' },
  returnAllBtn: { backgroundColor: COLORS.primaryThemeColor, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  returnAllText: { color: '#fff', fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold },
  lineCard: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginVertical: 4, borderWidth: 1, borderColor: '#e0e0e0' },
  productText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor, marginBottom: 4 },
  lineInfoRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  infoText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#6c757d' },
  lineFieldsRow: { flexDirection: 'row', gap: 12 },
  fieldGroup: { flex: 1 },
  fieldLabel: { fontSize: 10, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginBottom: 2 },
  fieldValue: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#212529' },
  fieldInput: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#212529', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingVertical: 2 },
  totalSection: { flexDirection: 'row', justifyContent: 'center', marginVertical: 10, padding: 10, backgroundColor: '#e9ecef', borderRadius: 8 },
  totalLabel: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#212529' },
  totalValue: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },
});

export default QuickSalesReturnForm;
