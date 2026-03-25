import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Keyboard, TouchableOpacity, Alert, TextInput, Platform } from 'react-native';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { CustomListModal } from '@components/Modal';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { format } from 'date-fns';
import {
  fetchVendorBillsWithReturnableFilterOdoo,
  fetchVendorBillLinesOdoo,
  fetchWarehousesSessionOdoo,
  fetchPurchaseOrderWarehouseOdoo,
  createQuickPurchaseReturnOdoo,
  fetchAlreadyReturnedQtysOdoo,
} from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';

const QuickPurchaseReturnForm = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const submittingRef = useRef(false);

  const [bills, setBills] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownType, setDropdownType] = useState(null);

  const [selectedBill, setSelectedBill] = useState(null);
  const [warehouse, setWarehouse] = useState(null);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [returnDate, setReturnDate] = useState(new Date());
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  useEffect(() => {
    fetchVendorBillsWithReturnableFilterOdoo({ limit: 100 }).then(data => setBills(data || [])).catch(() => {});
    fetchWarehousesSessionOdoo().then(data => {
      setWarehouses((data || []).map(w => ({ id: w.id, name: w.name || '', label: w.name || '' })));
    }).catch(() => {});
  }, []);

  const mapBillLines = (billLines, returnedQtys) => {
    return billLines.map(l => {
      const purchased = l.quantity || 0;
      const alreadyReturned = returnedQtys[l.id] || 0;
      const returnable = Math.max(0, purchased - alreadyReturned);
      return {
        source_invoice_line_id: l.id,
        product_id: Array.isArray(l.product_id) ? l.product_id[0] : l.product_id,
        product_name: Array.isArray(l.product_id) ? l.product_id[1] : (l.name || '-'),
        description: l.name || '',
        purchased_qty: purchased,
        already_returned_qty: alreadyReturned,
        returnable_qty: returnable,
        return_qty: '0',
        price_unit: l.price_unit || 0,
        uom_id: Array.isArray(l.product_uom_id) ? l.product_uom_id[0] : (l.product_uom_id || false),
      };
    });
  };

  const handleBillSelect = async (bill) => {
    setSelectedBill(bill);
    setIsDropdownVisible(false);
    if (errors.bill) setErrors(prev => ({ ...prev, bill: null }));
    setLoadingLines(true);
    try {
      const [billLines, poWarehouse, returnedQtys] = await Promise.all([
        fetchVendorBillLinesOdoo(bill.id),
        bill.invoice_origin ? fetchPurchaseOrderWarehouseOdoo(bill.invoice_origin) : Promise.resolve(null),
        fetchAlreadyReturnedQtysOdoo(bill.id),
      ]);
      setLines(mapBillLines(billLines, returnedQtys));
      if (poWarehouse) setWarehouse(poWarehouse);
    } catch (err) {
      console.error('Error loading bill lines:', err);
      showToastMessage('Failed to load bill lines');
      setLines([]);
    } finally {
      setLoadingLines(false);
    }
  };

  const handleReloadLines = async () => {
    if (!selectedBill) return;
    setLoadingLines(true);
    try {
      const [billLines, returnedQtys] = await Promise.all([
        fetchVendorBillLinesOdoo(selectedBill.id),
        fetchAlreadyReturnedQtysOdoo(selectedBill.id),
      ]);
      setLines(mapBillLines(billLines, returnedQtys));
    } catch (err) {
      console.error('Error reloading lines:', err);
    } finally {
      setLoadingLines(false);
    }
  };

  const handleDropdownSelect = (item) => {
    if (dropdownType === 'bill') {
      handleBillSelect(item);
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

  const getDropdownItems = () => dropdownType === 'bill' ? bills : dropdownType === 'warehouse' ? warehouses : [];
  const getDropdownTitle = () => dropdownType === 'bill' ? 'Select Vendor Bill' : 'Select Warehouse';

  const handleReturnQtyChange = (index, value) => {
    const updated = [...lines];
    const qty = parseFloat(value) || 0;
    updated[index] = { ...updated[index], return_qty: String(Math.min(qty, updated[index].returnable_qty)) };
    setLines(updated);
  };

  const handleReturnAll = () => {
    setLines(lines.map(l => ({ ...l, return_qty: String(l.returnable_qty) })));
  };

  const computeTotal = () => lines.reduce((sum, l) => sum + (Number(l.return_qty || 0) * Number(l.price_unit || 0)), 0).toFixed(3);

  const validateForm = () => {
    Keyboard.dismiss();
    const newErrors = {};
    if (!selectedBill) newErrors.bill = 'Required';
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
      await createQuickPurchaseReturnOdoo({
        sourceInvoiceId: selectedBill.id,
        warehouseId: warehouse.id,
        notes: notes || undefined,
        date: format(returnDate, 'yyyy-MM-dd'),
        lines: lines.filter(l => Number(l.return_qty) > 0).map(l => ({
          source_invoice_line_id: l.source_invoice_line_id,
          product_id: l.product_id,
          description: l.description,
          purchased_qty: l.purchased_qty,
          already_returned_qty: l.already_returned_qty,
          returnable_qty: l.returnable_qty,
          return_qty: Number(l.return_qty),
          price_unit: l.price_unit,
          uom_id: l.uom_id,
        })),
      });
      showToastMessage('Purchase Return created successfully');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to create return');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const billCurrency = selectedBill?.currency_id ? (Array.isArray(selectedBill.currency_id) ? selectedBill.currency_id[1] : selectedBill.currency_id) : '';
  const billVendor = selectedBill?.partner_id ? (Array.isArray(selectedBill.partner_id) ? selectedBill.partner_id[1] : selectedBill.partner_id) : '';

  return (
    <SafeAreaView>
      <NavigationHeader title="New Purchase Return" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        <FormInput label="Vendor Bill" placeholder="Select a posted Vendor Bill" dropIcon="menu-down" editable={false}
          value={selectedBill?.label || selectedBill?.name || ''} validate={errors.bill} required onPress={() => openDropdown('bill')} />
        <FormInput label="Return Date" placeholder="Select Date" dropIcon="calendar" editable={false}
          value={format(returnDate, 'yyyy-MM-dd')} onPress={() => setIsDatePickerVisible(true)} />

        {selectedBill && (
          <View style={styles.invoiceDetailsCard}>
            <Text style={styles.sectionTitle}>Invoice Details</Text>
            <View style={styles.detailRow}>
              <View style={styles.detailCol}><Text style={styles.detailLabel}>Vendor</Text><Text style={styles.detailValue}>{billVendor || '-'}</Text></View>
              <View style={styles.detailCol}><Text style={styles.detailLabel}>Invoice Date</Text><Text style={styles.detailValue}>{selectedBill.invoice_date || '-'}</Text></View>
            </View>
            <View style={styles.detailRow}>
              <View style={styles.detailCol}><Text style={styles.detailLabel}>Currency</Text><Text style={styles.detailValue}>{billCurrency || currencySymbol}</Text></View>
              <View style={styles.detailCol}><Text style={styles.detailLabel}>Warehouse</Text><Text style={styles.detailValue}>{warehouse?.name || warehouse?.label || '-'}</Text></View>
            </View>
          </View>
        )}

        <FormInput label="Warehouse" placeholder="Select Warehouse" dropIcon="menu-down" editable={false}
          value={warehouse?.name || warehouse?.label || ''} validate={errors.warehouse} required onPress={() => openDropdown('warehouse')} />
        <FormInput label="Notes" placeholder="Enter notes (optional)" value={notes} onChangeText={setNotes} multiline />

        {selectedBill && lines.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Products to Return</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={handleReloadLines} style={[styles.returnAllBtn, { backgroundColor: '#6c757d' }]}>
                  <Text style={styles.returnAllText}>Reload Lines</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleReturnAll} style={styles.returnAllBtn}>
                  <Text style={styles.returnAllText}>Return All</Text>
                </TouchableOpacity>
              </View>
            </View>
            {lines.map((line, index) => (
              <View key={index} style={styles.lineCard}>
                <Text style={styles.productText} numberOfLines={2}>{line.product_name}</Text>
                <View style={styles.lineInfoRow}>
                  <Text style={styles.infoText}>Purchased: {line.purchased_qty}</Text>
                  <Text style={styles.infoText}>Returned: {line.already_returned_qty}</Text>
                  <Text style={styles.infoText}>Returnable: {line.returnable_qty}</Text>
                </View>
                <View style={styles.lineInfoRow}>
                  <Text style={styles.infoText}>Unit Price: {currencySymbol} {line.price_unit.toFixed(3)}</Text>
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
                      {currencySymbol} {(Number(line.return_qty || 0) * line.price_unit).toFixed(3)}
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

        {loadingLines && <Text style={{ textAlign: 'center', color: '#999', paddingVertical: 20 }}>Loading bill lines...</Text>}

        <LoadingButton title="CREATE PURCHASE RETURN" onPress={handleSubmit} marginTop={10} loading={isSubmitting} />
        <View style={{ height: 40 }} />

        <CustomListModal isVisible={isDropdownVisible} items={getDropdownItems()} title={getDropdownTitle()}
          onClose={() => setIsDropdownVisible(false)} onValueChange={handleDropdownSelect} onAddIcon={false} />
        <DateTimePickerModal isVisible={isDatePickerVisible} mode="date" date={returnDate}
          onConfirm={(date) => { setIsDatePickerVisible(false); setReturnDate(date); }}
          onCancel={() => setIsDatePickerVisible(false)} />
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
  invoiceDetailsCard: { backgroundColor: '#f8f9fa', borderRadius: 10, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: '#e0e0e0' },
  detailRow: { flexDirection: 'row', marginBottom: 8 },
  detailCol: { flex: 1 },
  detailLabel: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginBottom: 2 },
  detailValue: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333' },
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

export default QuickPurchaseReturnForm;
