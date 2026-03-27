import React, { useState, useCallback, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import {
  fetchSaleOrderDetailOdoo,
  confirmSaleOrderOdoo,
  createInvoiceFromQuotationOdoo,
  updateSaleOrderLinesOdoo,
  fetchProductByBarcodeOdoo,
  searchInvoicesByOriginOdoo,
  validateSaleOrderPickingsOdoo,
  cancelSaleOrderOdoo,
} from '@api/services/generalApi';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCurrencyStore } from '@stores/currency';
import { useProductStore } from '@stores/product';

const STATE_LABELS = {
  draft: 'QUOTATION',
  sent: 'SENT',
  sale: 'SALES ORDER',
  done: 'LOCKED',
  cancel: 'CANCELLED',
};

const STATE_COLORS = {
  draft: '#FF9800',
  sent: '#2196F3',
  sale: '#4CAF50',
  done: '#607D8B',
  cancel: '#F44336',
};

const SaleOrderDetailScreen = ({ navigation, route }) => {
  const { orderId } = route?.params || {};
  const currencySymbol = useCurrencyStore((state) => state.currency) || 'OMR';

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState(null);

  // Editable lines state: { [lineId]: { qty, price_unit } }
  const [editedLines, setEditedLines] = useState({});
  const [deletedLineIds, setDeletedLineIds] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  const SO_CART_KEY = `__so_edit_${orderId}__`;
  const { getCurrentCart, setCurrentCustomer, loadCustomerCart, clearProducts } = useProductStore();
  const initialLoadDone = useRef(false);

  const fetchDetail = useCallback(async (showLoader = true) => {
    if (!orderId) return;
    if (showLoader) setLoading(true);
    try {
      const data = await fetchSaleOrderDetailOdoo(orderId);
      // If no invoice_ids but SO is confirmed, check for invoices by origin
      if (data && (!data.invoice_ids || data.invoice_ids.length === 0) && (data.state === 'sale' || data.state === 'done') && data.name) {
        try {
          const invResp = await searchInvoicesByOriginOdoo(data.name);
          if (invResp && invResp.length > 0) {
            data.invoice_ids = invResp.map(inv => inv.id);
          }
        } catch (e) { /* ignore */ }
      }
      setRecord(data);
      setEditedLines({});
      setDeletedLineIds([]);
      setHasChanges(false);
    } catch (err) {
      console.error('[SaleOrderDetail] error:', err);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [orderId]);

  // On focus: check if products were added via POSProducts, then refresh
  useFocusEffect(useCallback(() => {
    const handleFocus = async () => {
      if (!initialLoadDone.current) {
        // First mount — just load the detail
        initialLoadDone.current = true;
        await fetchDetail(true);
        return;
      }

      // Returning from product picker — check for added products
      setCurrentCustomer(SO_CART_KEY);
      const addedProducts = getCurrentCart();
      if (addedProducts && addedProducts.length > 0) {
        try {
          setSaving(true);
          const additions = addedProducts.map(p => ({
            product_id: p.id,
            qty: p.quantity || 1,
            price_unit: p.price || 0,
          }));
          await updateSaleOrderLinesOdoo(orderId, { additions });
          clearProducts();
        } catch (err) {
          Alert.alert('Error', err?.message || 'Failed to add products.');
        } finally {
          setSaving(false);
        }
      }
      // Refresh without full-screen loader to avoid blank flash
      await fetchDetail(false);
    };
    handleFocus();
  }, [orderId, fetchDetail]));

  const handleBarcodeScan = () => {
    navigation.navigate('Scanner', {
      onScan: async (barcode) => {
        const results = await fetchProductByBarcodeOdoo(barcode);
        if (results && results.length > 0) {
          const p = results[0];
          setCurrentCustomer(SO_CART_KEY);
          loadCustomerCart(SO_CART_KEY, []);
          const { addProduct } = useProductStore.getState();
          addProduct({ id: p.id, name: p.product_name, price: p.price || 0, quantity: 1 });
          navigation.goBack();
        } else {
          Alert.alert('Not Found', 'Product not found for this barcode');
        }
      }
    });
  };

  const getLineValue = (line, field) => {
    if (editedLines[line.id] && editedLines[line.id][field] !== undefined) {
      return editedLines[line.id][field];
    }
    if (field === 'qty') return line.product_uom_qty || 0;
    if (field === 'price_unit') return line.price_unit || 0;
    return 0;
  };

  const updateLineField = (lineId, field, value) => {
    setEditedLines(prev => ({
      ...prev,
      [lineId]: { ...prev[lineId], [field]: value },
    }));
    setHasChanges(true);
  };

  const handleDeleteLine = (lineId) => {
    setDeletedLineIds(prev => [...prev, lineId]);
    setHasChanges(true);
  };

  const handleUndoDelete = (lineId) => {
    setDeletedLineIds(prev => prev.filter(id => id !== lineId));
    if (Object.keys(editedLines).length === 0 && deletedLineIds.length <= 1) {
      setHasChanges(false);
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const changes = Object.entries(editedLines)
        .filter(([lineId]) => !deletedLineIds.includes(Number(lineId)))
        .map(([lineId, vals]) => ({
          lineId: Number(lineId),
          qty: vals.qty !== undefined ? Number(vals.qty) : undefined,
          price_unit: vals.price_unit !== undefined ? Number(vals.price_unit) : undefined,
        }));

      await updateSaleOrderLinesOdoo(orderId, {
        changes,
        deletions: deletedLineIds,
      });

      Alert.alert('Saved', 'Order lines updated successfully.');
      await fetchDetail();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (hasChanges) {
      Alert.alert('Unsaved Changes', 'Please save your changes before confirming.');
      return;
    }
    setConfirming(true);
    try {
      const companyId = record?.company_id ? (Array.isArray(record.company_id) ? record.company_id[0] : record.company_id) : null;
      await confirmSaleOrderOdoo(orderId, companyId);
      Alert.alert('Order Confirmed', 'Quotation has been confirmed as a Sales Order.', [
        { text: 'OK', onPress: () => fetchDetail() },
      ]);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to confirm order.');
    } finally {
      setConfirming(false);
    }
  };

  const buildOrderData = () => ({
    name: record?.name || '',
    partnerId: Array.isArray(record?.partner_id) ? record.partner_id[0] : null,
    partnerName: Array.isArray(record?.partner_id) ? record.partner_id[1] : '-',
    partnerPhone: record?.partner_phone || '',
    companyName: Array.isArray(record?.company_id) ? record.company_id[1] : '-',
    invoiceDate: record?.date_order ? record.date_order.split(' ')[0].split('-').reverse().join('-') : '-',
    amountUntaxed: record?.amount_untaxed || 0,
    amountTax: record?.amount_tax || 0,
    amountTotal: record?.amount_total || 0,
    lines: (record?.order_lines_detail || [])
      .filter(l => !(l.name || '').toLowerCase().includes('down payment'))
      .map(l => ({
        id: l.id,
        productName: Array.isArray(l.product_id) ? l.product_id[1] : (l.name || '-'),
        quantity: l.product_uom_qty || 0,
        priceUnit: l.price_unit || 0,
        discount: l.discount || 0,
        subtotal: l.price_subtotal || 0,
      })),
  });

  const handleCreateInvoice = async () => {
    setInvoicing(true);
    try {
      // CAPTURE order data FIRST before any async state changes
      const od = buildOrderData();
      console.log('[Invoice] Captured orderData with', od.lines.length, 'lines before create');
      const companyId = record?.company_id ? (Array.isArray(record.company_id) ? record.company_id[0] : record.company_id) : null;
      // Validate deliveries (auto-deliver) so stock.quant updates (supports negative stock)
      await validateSaleOrderPickingsOdoo(orderId);
      const result = await createInvoiceFromQuotationOdoo(orderId, companyId);
      const invoiceId = result?.result;
      if (invoiceId) {
        setCreatedInvoiceId(invoiceId);
        fetchDetail(false); // Refresh in background, don't await
        navigation.navigate('SalesInvoiceReceiptScreen', { invoiceId, orderId, orderData: od });
      } else {
        await fetchDetail(false);
        Alert.alert('Invoice Created', 'Invoice created successfully.');
      }
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to create invoice.');
    } finally {
      setInvoicing(false);
    }
  };

  const handleViewInvoice = () => {
    const invoiceId = createdInvoiceId || (record?.invoice_ids?.length > 0 ? record.invoice_ids[record.invoice_ids.length - 1] : null);
    if (invoiceId) {
      const od = buildOrderData();
      console.log('[Invoice] View - Passing orderData with', od.lines.length, 'lines');
      navigation.navigate('SalesInvoiceReceiptScreen', { invoiceId, orderId, orderData: od });
    }
  };

  const [cancelling, setCancelling] = useState(false);
  const handleCancelOrder = () => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
          setCancelling(true);
          try {
            await cancelSaleOrderOdoo(orderId);
            Alert.alert('Order Cancelled', 'The order has been cancelled successfully.');
            await fetchDetail(false);
          } catch (err) {
            Alert.alert('Error', err?.message || 'Failed to cancel order.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  if (!record) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Sale Order" onBackPress={() => navigation.goBack()} />
        <OverlayLoader visible={true} />
      </SafeAreaView>
    );
  }

  const state = (record.state || 'draft').toLowerCase();
  const stateColor = STATE_COLORS[state] || '#999';
  const stateLabel = STATE_LABELS[state] || state.toUpperCase();
  const partnerName = Array.isArray(record.partner_id) ? record.partner_id[1] : '-';
  const warehouseName = Array.isArray(record.warehouse_id) ? record.warehouse_id[1] : '-';
  const companyName = Array.isArray(record.company_id) ? record.company_id[1] : '-';
  const currencyName = Array.isArray(record.currency_id) ? record.currency_id[1] : '-';
  const customerRef = record.client_order_ref || '';
  const rawDate = record.date_order ? record.date_order.split(' ')[0] : '';
  const dateStr = rawDate ? rawDate.split('-').reverse().join('-') : '-';
  const invoiceStatus = record.invoice_status || '';
  const invoiceCount = record.invoice_ids?.length || 0;

  const lines = (record.order_lines_detail || []).filter(l => {
    const name = (l.name || '').toLowerCase();
    return !name.includes('down payment') && !name.includes('down_payment');
  });
  const visibleLines = lines.filter(l => !deletedLineIds.includes(l.id));

  // Calculate totals locally when there are unsaved edits
  let untaxed, taxes, total;
  if (hasChanges) {
    untaxed = visibleLines.reduce((sum, line) => {
      const qty = getLineValue(line, 'qty');
      const price = getLineValue(line, 'price_unit');
      return sum + (qty * price);
    }, 0);
    // Use ratio from Odoo's original amounts for tax estimate
    const origUntaxed = record.amount_untaxed || 0;
    const origTax = record.amount_tax || 0;
    const taxRate = origUntaxed > 0 ? (origTax / origUntaxed) : 0;
    taxes = untaxed * taxRate;
    total = untaxed + taxes;
  } else {
    untaxed = record.amount_untaxed || 0;
    taxes = record.amount_tax || 0;
    total = record.amount_total || 0;
  }

  const isDraft = state === 'draft' || state === 'sent';
  const isConfirmed = state === 'sale' || state === 'done';
  const hasInvoice = !!createdInvoiceId || invoiceStatus === 'invoiced' || invoiceCount > 0;
  const canInvoice = isConfirmed && !hasInvoice;

  return (
    <SafeAreaView>
      <NavigationHeader title={record.name || `SO-${record.id}`} onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>

        {/* Status Badge */}
        <View style={styles.statusRow}>
          {isConfirmed && hasInvoice && (
            <View style={[styles.badge, { backgroundColor: '#009688', marginRight: 6 }]}>
              <Text style={styles.badgeText}>INVOICED</Text>
            </View>
          )}
          {isConfirmed && invoiceStatus === 'to_invoice' && (
            <View style={[styles.badge, { backgroundColor: '#FF5722', marginRight: 6 }]}>
              <Text style={styles.badgeText}>TO INVOICE</Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: stateColor }]}>
            <Text style={styles.badgeText}>{stateLabel}</Text>
          </View>
        </View>

        {/* Details Card */}
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Customer</Text>
              <Text style={styles.fieldValue}>{partnerName}</Text>
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Date</Text>
              <Text style={styles.fieldValue}>{dateStr}</Text>
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Warehouse</Text>
              <Text style={styles.fieldValue}>{warehouseName}</Text>
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Company</Text>
              <Text style={styles.fieldValue}>{companyName}</Text>
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Customer Reference</Text>
              <Text style={styles.fieldValue}>{customerRef || '-'}</Text>
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Currency</Text>
              <Text style={styles.fieldValue}>{currencyName}</Text>
            </View>
          </View>
        </View>

        {/* Product Lines Card */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Order Lines</Text>
            {isDraft && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.addProductBtn} onPress={handleBarcodeScan}>
                  <Icon name="barcode-scan" size={14} color="#fff" />
                  <Text style={styles.addProductText}>Scan</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addProductBtn}
                  onPress={() => {
                    setCurrentCustomer(SO_CART_KEY);
                    loadCustomerCart(SO_CART_KEY, []);
                    navigation.navigate('POSProducts', {
                      fromCustomerDetails: { id: SO_CART_KEY, name: 'Sale Order' },
                    });
                  }}
                >
                  <AntDesign name="plus" size={14} color="#fff" />
                  <Text style={styles.addProductText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {visibleLines.length === 0 ? (
            <Text style={styles.emptyText}>No product lines</Text>
          ) : (
            visibleLines.map((line, idx) => {
              const productName = Array.isArray(line.product_id) ? line.product_id[1] : (line.name || '-');
              const qty = getLineValue(line, 'qty');
              const price = getLineValue(line, 'price_unit');
              const subtotal = line.price_subtotal || 0;
              const discount = line.discount || 0;
              const isDeleted = deletedLineIds.includes(line.id);

              if (isDraft) {
                return (
                  <View key={line.id || idx} style={styles.editLineItem}>
                    <View style={styles.editLineHeader}>
                      <Text style={styles.lineName} numberOfLines={2}>{productName}</Text>
                      <TouchableOpacity onPress={() => handleDeleteLine(line.id)}>
                        <Ionicons name="trash-outline" size={20} color="#F44336" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.editLineFields}>
                      <View style={styles.editField}>
                        <Text style={styles.editFieldLabel}>Qty</Text>
                        <View style={styles.qtyRow}>
                          <TouchableOpacity onPress={() => updateLineField(line.id, 'qty', Math.max(0, qty - 1))}>
                            <AntDesign name="minuscircleo" size={20} color={COLORS.primaryThemeColor} />
                          </TouchableOpacity>
                          <TextInput
                            style={styles.editInput}
                            value={String(qty)}
                            onChangeText={(text) => updateLineField(line.id, 'qty', parseFloat(text) || 0)}
                            keyboardType="numeric"
                          />
                          <TouchableOpacity onPress={() => updateLineField(line.id, 'qty', qty + 1)}>
                            <AntDesign name="pluscircleo" size={20} color={COLORS.primaryThemeColor} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={styles.editField}>
                        <Text style={styles.editFieldLabel}>Price</Text>
                        <TextInput
                          style={styles.editInput}
                          value={String(price)}
                          onChangeText={(text) => updateLineField(line.id, 'price_unit', parseFloat(text) || 0)}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.editField}>
                        <Text style={styles.editFieldLabel}>Subtotal</Text>
                        <Text style={styles.lineSubtotal}>{currencySymbol} {(qty * price).toFixed(3)}</Text>
                      </View>
                    </View>
                  </View>
                );
              }

              // Read-only for confirmed orders
              return (
                <View key={line.id || idx} style={styles.lineItem}>
                  <Text style={styles.lineName} numberOfLines={2}>{productName}</Text>
                  <View style={styles.lineDetails}>
                    <Text style={styles.lineDetail}>Qty: {qty}</Text>
                    <Text style={styles.lineDetail}>Price: {currencySymbol} {price.toFixed(3)}</Text>
                    {discount > 0 && <Text style={styles.lineDetail}>Disc: {discount}%</Text>}
                    <Text style={styles.lineSubtotal}>{currencySymbol} {subtotal.toFixed(3)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Totals Card */}
        <View style={styles.card}>
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Total:</Text>
            <Text style={styles.grandTotalValue}>{currencySymbol} {total.toFixed ? total.toFixed(3) : '0.000'}</Text>
          </View>
        </View>

        {/* Save Changes Button */}
        {isDraft && hasChanges && (
          <View style={{ marginVertical: 8 }}>
            <Button
              backgroundColor="#2196F3"
              title="Save Changes"
              onPress={handleSaveChanges}
              loading={saving}
            />
          </View>
        )}

        {/* Confirm Order Button */}
        {isDraft && (
          <View style={{ marginVertical: 8 }}>
            <Button
              backgroundColor={COLORS.primaryThemeColor}
              title="Confirm Order"
              onPress={handleConfirmOrder}
              loading={confirming}
            />
          </View>
        )}

        {/* Cancel Order Button */}
        {isDraft && (
          <View style={{ marginVertical: 8 }}>
            <Button
              backgroundColor="#F44336"
              title="Cancel Order"
              onPress={handleCancelOrder}
              loading={cancelling}
            />
          </View>
        )}

        {/* Create Invoice Button */}
        {canInvoice && (
          <View style={{ marginVertical: 8 }}>
            <Button
              backgroundColor="#FF5722"
              title="Create Invoice"
              onPress={handleCreateInvoice}
              loading={invoicing}
            />
          </View>
        )}

        {/* View Invoice Button (when invoiced) */}
        {isConfirmed && hasInvoice && (
          <View style={{ marginVertical: 8 }}>
            <Button
              backgroundColor="#009688"
              title="View Invoice"
              onPress={handleViewInvoice}
            />
          </View>
        )}

      </RoundedScrollContainer>
      <OverlayLoader visible={confirming || invoicing || saving || cancelling} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
    }),
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  fieldCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  addProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryThemeColor,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addProductText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  // Editable line styles
  editLineItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  editLineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  editLineFields: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editField: {
    flex: 1,
    alignItems: 'center',
  },
  editFieldLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginBottom: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    width: 60,
    textAlign: 'center',
    paddingVertical: 4,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    backgroundColor: '#fff',
  },
  // Read-only line styles
  lineItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#eee',
  },
  lineName: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    marginBottom: 4,
    flex: 1,
  },
  lineDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  lineDetail: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#666',
  },
  lineSubtotal: {
    fontSize: 13,
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

export default SaleOrderDetailScreen;
