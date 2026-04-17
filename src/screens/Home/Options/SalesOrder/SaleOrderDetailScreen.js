import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Platform, Alert, Keyboard } from 'react-native';
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
  createBelowCostApprovalLogOdoo,
} from '@api/services/generalApi';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import OfflineBanner from '@components/common/OfflineBanner';
import { StyledAlertModal } from '@components/Modal';
import { isOnline } from '@utils/networkStatus';
import { showToastMessage } from '@components/Toast';
import { useCurrencyStore } from '@stores/currency';
import { useProductStore } from '@stores/product';
import BelowCostApprovalModal from '@components/BelowCostApprovalModal';
import { checkBelowCostLines } from '@utils/belowCostCheck';

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
  const routeOrderId = route?.params?.orderId;
  const [orderId, setOrderId] = useState(routeOrderId);
  const currencySymbol = useCurrencyStore((state) => state.currency) || 'OMR';

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState(null);
  const [showBelowCostModal, setShowBelowCostModal] = useState(false);
  const [belowCostLines, setBelowCostLines] = useState([]);
  const [belowCostAction, setBelowCostAction] = useState(null); // 'confirm' or 'invoice'

  // Editable lines state: { [lineId]: { qty, price_unit } }
  const [editedLines, setEditedLines] = useState({});
  const [deletedLineIds, setDeletedLineIds] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  const SO_CART_KEY = `__so_edit_${orderId}__`;
  const { getCurrentCart, setCurrentCustomer, loadCustomerCart, clearProducts } = useProductStore();
  const initialLoadDone = useRef(false);

  // Refs for auto-save (to access latest state in debounced/async calls)
  const editedLinesRef = useRef({});
  const deletedLineIdsRef = useRef([]);
  const hasChangesRef = useRef(false);
  const autoSaveTimer = useRef(null);
  const savingRef = useRef(false);

  useEffect(() => { editedLinesRef.current = editedLines; }, [editedLines]);
  useEffect(() => { deletedLineIdsRef.current = deletedLineIds; }, [deletedLineIds]);
  useEffect(() => { hasChangesRef.current = hasChanges; }, [hasChanges]);

  const fetchDetail = useCallback(async (showLoader = true) => {
    if (!orderId) return;
    if (showLoader) setLoading(true);
    try {
      // If the order was offline-created, check if it has synced and got a real ID
      let resolvedId = orderId;
      if (String(orderId).startsWith('offline_')) {
        try {
          const AsyncStorageLocal = require('@react-native-async-storage/async-storage').default;
          const mapRaw = await AsyncStorageLocal.getItem('@offline_id_map');
          if (mapRaw) {
            const map = JSON.parse(mapRaw);
            if (map[orderId] !== undefined) {
              resolvedId = map[orderId];
              console.log('[SaleOrderDetail] Resolved offline ID', orderId, '→', resolvedId);
              setOrderId(resolvedId);
            }
          }
        } catch (_) {}
      }
      const data = await fetchSaleOrderDetailOdoo(resolvedId);
      // If no invoice_ids but SO is confirmed, check for invoices by origin
      if (data && (!data.invoice_ids || data.invoice_ids.length === 0) && (data.state === 'sale' || data.state === 'done') && data.name) {
        try {
          const invResp = await searchInvoicesByOriginOdoo(data.name);
          if (invResp && invResp.length > 0) {
            data.invoice_ids = invResp.map(inv => inv.id);
          }
        } catch (e) { /* ignore */ }
      }
      // Preserve the more advanced state if Odoo returns a less advanced one.
      // This prevents "Confirm Order" from reappearing after the user already confirmed offline.
      if (data) {
        const stateRank = { draft: 0, sent: 1, sale: 2, done: 3, cancel: 3 };
        try {
          const AsyncStorageLocal2 = require('@react-native-async-storage/async-storage').default;
          const cachedKey2 = `@cache:saleOrderDetail:${String(resolvedId || orderId)}`;
          const cachedRaw2 = await AsyncStorageLocal2.getItem(cachedKey2);
          if (cachedRaw2) {
            const cached2 = JSON.parse(cachedRaw2);
            const cachedRank = stateRank[cached2.state] ?? 0;
            const freshRank = stateRank[data.state] ?? 0;
            if (cachedRank > freshRank) {
              console.log('[SaleOrderDetail] Preserving cached state:', cached2.state, 'over Odoo state:', data.state);
              data.state = cached2.state;
              // Also try to re-confirm in Odoo silently
              if (data.state === 'sale' && (data.state !== cached2.state)) {
                try {
                  const { confirmSaleOrderOdoo: confirmFn } = require('@api/services/generalApi');
                  confirmFn(resolvedId).catch(() => {});
                } catch (_) {}
              }
            }
          }
        } catch (_) {}
      }

      // Preserve local offline invoice marker if the fresh data has no real invoices.
      // This keeps "View Invoice" visible until the real Odoo invoice is created.
      if (data && (!data.invoice_ids || data.invoice_ids.length === 0)) {
        if (createdInvoiceId === 'offline_inv') {
          data.invoice_status = 'invoiced';
          data.invoice_ids = ['offline_inv'];
        } else {
          // Also check the cached detail for offline_inv marker
          try {
            const AsyncStorageLocal = require('@react-native-async-storage/async-storage').default;
            const cachedKey = `@cache:saleOrderDetail:${String(resolvedId || orderId)}`;
            const cachedRaw = await AsyncStorageLocal.getItem(cachedKey);
            if (cachedRaw) {
              const cached = JSON.parse(cachedRaw);
              if (cached.invoice_status === 'invoiced' && cached.invoice_ids?.includes('offline_inv')) {
                data.invoice_status = 'invoiced';
                data.invoice_ids = ['offline_inv'];
                setCreatedInvoiceId('offline_inv');
              }
            }
          } catch (_) {}
        }
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

  // On focus: check if products were added via POSProducts, then always refresh
  useFocusEffect(useCallback(() => {
    const handleFocus = async () => {
      const isFirstLoad = !initialLoadDone.current;
      if (isFirstLoad) {
        initialLoadDone.current = true;
      }

      // Returning from product picker — check for added products
      if (!isFirstLoad) {
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
      }
      // Always fetch latest data from Odoo
      await fetchDetail(isFirstLoad);
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

  // Get numeric value for calculations (handles raw string input during typing)
  const getNumericValue = (line, field) => {
    const val = getLineValue(line, field);
    if (typeof val === 'string') return parseFloat(val) || 0;
    return val;
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
    debouncedAutoSave();
  };

  const handleUndoDelete = (lineId) => {
    setDeletedLineIds(prev => prev.filter(id => id !== lineId));
    if (Object.keys(editedLines).length === 0 && deletedLineIds.length <= 1) {
      setHasChanges(false);
    }
  };

  // Silent auto-save using refs for latest state
  const autoSave = useCallback(async () => {
    if (!hasChangesRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const currentEdited = editedLinesRef.current;
      const currentDeleted = deletedLineIdsRef.current;
      const changes = Object.entries(currentEdited)
        .filter(([lineId]) => !currentDeleted.includes(Number(lineId)))
        .map(([lineId, vals]) => ({
          lineId: Number(lineId),
          qty: vals.qty !== undefined ? Number(vals.qty) : undefined,
          price_unit: vals.price_unit !== undefined ? Number(vals.price_unit) : undefined,
        }));

      await updateSaleOrderLinesOdoo(orderId, {
        changes,
        deletions: currentDeleted,
      });

      await fetchDetail(false);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to save changes.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [orderId, fetchDetail]);

  // Debounced auto-save for rapid actions (+/- buttons, delete)
  const debouncedAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => autoSave(), 500);
  }, [autoSave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, []);

  const getOrderLinesToCheck = () => {
    return (record?.order_lines_detail || [])
      .filter(l => !(l.name || '').toLowerCase().includes('down payment'))
      .map(l => ({
        product_id: Array.isArray(l.product_id) ? l.product_id[0] : l.product_id,
        product_name: Array.isArray(l.product_id) ? l.product_id[1] : (l.name || ''),
        price_unit: l.price_unit || 0,
        qty: l.product_uom_qty || 1,
      }));
  };

  const executeConfirmOrder = async () => {
    setConfirming(true);
    try {
      if (hasChangesRef.current) {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        await autoSave();
      }
      const companyId = record?.company_id ? (Array.isArray(record.company_id) ? record.company_id[0] : record.company_id) : null;
      const confirmRes = await confirmSaleOrderOdoo(orderId, companyId);
      console.log('[ConfirmOrder] SO confirmed, proceeding to create invoice...');
      setConfirming(false);
      // If the confirm was queued offline, skip the invoice step and just tell
      // the user the confirm + invoice will happen when they reconnect.
      if (confirmRes && typeof confirmRes === 'object' && confirmRes.offline) {
        showToastMessage('Confirmation queued. Invoice will be created when you reconnect.');
        // Refresh so the cached 'sale' state shows.
        try { const rec = await fetchSaleOrderDetailOdoo(orderId); setRecord(rec); } catch (_) {}
        return;
      }
      // Automatically create invoice after confirming
      await executeCreateInvoice();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to confirm order.');
      setConfirming(false);
    }
  };

  const handleConfirmOrder = async () => {
    // Check for below-cost lines before confirming
    try {
      const linesToCheck = getOrderLinesToCheck();
      const result = await checkBelowCostLines(linesToCheck);
      if (result.hasBelowCost) {
        setBelowCostLines(result.belowCostLines);
        setBelowCostAction('confirm');
        setShowBelowCostModal(true);
        return;
      }
    } catch (err) {
      console.log('[SaleOrderDetail] Below cost check failed, proceeding:', err?.message);
    }
    await executeConfirmOrder();
  };

  const handleBelowCostApprove = async (approvalData) => {
    setShowBelowCostModal(false);
    // Log below-cost approval to Odoo
    try {
      const detailsText = belowCostLines.map(l =>
        `Product: ${l.productName} | Price: ${l.unitPrice.toFixed(3)} | Cost: ${l.costPrice.toFixed(3)} | Min Required: ${l.costPrice.toFixed(3)} | Margin: ${l.marginPercent.toFixed(2)}% | Qty: ${l.qty}`
      ).join('\n');
      await createBelowCostApprovalLogOdoo({
        saleOrderId: orderId,
        approverId: approvalData.approverId,
        reason: approvalData.reason || '',
        action: 'approved',
        belowCostDetails: detailsText,
      });
      console.log('[SaleOrderDetail] Below-cost approval log saved for SO:', orderId);
    } catch (logErr) {
      console.error('[SaleOrderDetail] Failed to save approval log:', logErr?.message);
    }
    if (belowCostAction === 'confirm') {
      await executeConfirmOrder();
    } else if (belowCostAction === 'invoice') {
      await executeCreateInvoice();
    }
    setBelowCostLines([]);
    setBelowCostAction(null);
  };

  const handleBelowCostReject = async (rejectData) => {
    setShowBelowCostModal(false);
    // Log rejection to Odoo
    try {
      const detailsText = belowCostLines.map(l =>
        `Product: ${l.productName} | Price: ${l.unitPrice.toFixed(3)} | Cost: ${l.costPrice.toFixed(3)} | Margin: ${l.marginPercent.toFixed(2)}% | Qty: ${l.qty}`
      ).join('\n');
      await createBelowCostApprovalLogOdoo({
        saleOrderId: orderId,
        approverId: rejectData.approverId,
        reason: rejectData.reason || '',
        action: 'rejected',
        belowCostDetails: detailsText,
      });
    } catch (logErr) {
      console.error('[SaleOrderDetail] Failed to save rejection log:', logErr?.message);
    }
    Alert.alert('Rejected', 'The below-cost action has been rejected.');
    setBelowCostLines([]);
    setBelowCostAction(null);
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

  const executeCreateInvoice = async () => {
    setInvoicing(true);
    try {
      // If the order hasn't synced yet (still offline ID), treat as offline
      const isOfflineOrder = String(orderId).startsWith('offline_');
      const online = await isOnline();
      if (!online || isOfflineOrder) {
        const od = buildOrderData();
        const idStr = String(orderId);

        // Mark as invoiced in cached list so the list shows "INVOICED" badge
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const raw = await AsyncStorage.getItem('@cache:saleOrders');
          if (raw) {
            const list = JSON.parse(raw);
            const idx = list.findIndex((o) => String(o.id) === idStr);
            if (idx >= 0) {
              list[idx] = { ...list[idx], invoice_status: 'invoiced', invoice_ids: ['offline_inv'] };
              await AsyncStorage.setItem('@cache:saleOrders', JSON.stringify(list));
            }
          }
          // Update detail cache too
          const detailKey = `@cache:saleOrderDetail:${idStr}`;
          const rawD = await AsyncStorage.getItem(detailKey);
          if (rawD) {
            const prev = JSON.parse(rawD);
            await AsyncStorage.setItem(detailKey, JSON.stringify({ ...prev, invoice_status: 'invoiced', invoice_ids: ['offline_inv'] }));
          }
        } catch (_) {}

        // Update local state so buttons switch to "View Invoice"
        setCreatedInvoiceId('offline_inv');
        if (record) {
          setRecord({ ...record, invoice_status: 'invoiced', invoice_ids: ['offline_inv'] });
        }

        showToastMessage('Invoice generated locally');
        navigation.navigate('SalesInvoiceReceiptScreen', { orderId, orderData: od });
        setInvoicing(false);
        return;
      }

      const od = buildOrderData();
      console.log('[Invoice] Captured orderData with', od.lines.length, 'lines before create');
      const companyId = record?.company_id ? (Array.isArray(record.company_id) ? record.company_id[0] : record.company_id) : null;
      await validateSaleOrderPickingsOdoo(orderId);
      const result = await createInvoiceFromQuotationOdoo(orderId, companyId);
      const invoiceId = result?.result;
      if (invoiceId) {
        setCreatedInvoiceId(invoiceId);
        fetchDetail(false);
        navigation.navigate('SalesInvoiceReceiptScreen', { invoiceId, orderId, orderData: od });
      } else {
        await fetchDetail(false);
        showToastMessage('Invoice created successfully');
      }
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to create invoice.');
    } finally {
      setInvoicing(false);
    }
  };

  const handleCreateInvoice = async () => {
    // Check for below-cost lines first
    setInvoicing(true);
    try {
      const linesToCheck = getOrderLinesToCheck();
      const result = await checkBelowCostLines(linesToCheck);
      if (result.hasBelowCost) {
        setBelowCostLines(result.belowCostLines);
        setBelowCostAction('invoice');
        setInvoicing(false);
        setShowBelowCostModal(true);
        return;
      }
    } catch (err) {
      console.log('[SaleOrderDetail] Below cost check failed, proceeding:', err?.message);
    }
    setInvoicing(false);
    await executeCreateInvoice();
  };

  const handleViewInvoice = () => {
    const idStr = String(record?.id || orderId || '');
    const invoiceId = createdInvoiceId || (record?.invoice_ids?.length > 0 ? record.invoice_ids[record.invoice_ids.length - 1] : null);
    // Offline-created orders don't have a real invoice yet — still navigate,
    // the receipt screen renders a synthetic preview from the cached order.
    const od = buildOrderData();
    console.log('[Invoice] View - Passing orderData with', od.lines.length, 'lines', 'offlineOrder=', idStr.startsWith('offline_'));
    navigation.navigate('SalesInvoiceReceiptScreen', { invoiceId, orderId, orderData: od });
  };

  const [cancelling, setCancelling] = useState(false);
  const [showCancelAlert, setShowCancelAlert] = useState(false);
  const handleCancelOrder = () => { setShowCancelAlert(true); };
  const executeCancelOrder = async () => {
    setShowCancelAlert(false);
    setCancelling(true);
    try {
      await cancelSaleOrderOdoo(orderId);
      showToastMessage('Order cancelled successfully');
      await fetchDetail(false);
    } catch (err) {
      showToastMessage(err?.message || 'Failed to cancel order.');
    } finally {
      setCancelling(false);
    }
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
      const qty = getNumericValue(line, 'qty');
      const price = getNumericValue(line, 'price_unit');
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
  console.log('[SaleOrderDetail] state:', state, 'isDraft:', isDraft, 'isConfirmed:', isConfirmed, 'hasInvoice:', hasInvoice, 'invoiceStatus:', invoiceStatus, 'invoiceCount:', invoiceCount, 'createdInvoiceId:', createdInvoiceId);

  return (
    <SafeAreaView>
      <NavigationHeader title={record.name || `SO-${record.id}`} onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — changes will sync when you reconnect" onOnline={() => fetchDetail(false)} />
      <RoundedScrollContainer>

        {/* Status Badge */}
        <View style={styles.statusRow}>
          {hasInvoice && (
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
              <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                {String(record?.id || orderId || '').startsWith('offline_') ? 'Ref: -' : `Ref: ${record?.name || '-'}`}
              </Text>
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Date</Text>
              <Text style={styles.fieldValue}>{dateStr}</Text>
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Company</Text>
              <Text style={styles.fieldValue}>{companyName}</Text>
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
              const numQty = getNumericValue(line, 'qty');
              const numPrice = getNumericValue(line, 'price_unit');
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
                          <TouchableOpacity onPress={() => { updateLineField(line.id, 'qty', Math.max(0, numQty - 1)); debouncedAutoSave(); }}>
                            <AntDesign name="minuscircleo" size={20} color={COLORS.primaryThemeColor} />
                          </TouchableOpacity>
                          <TextInput
                            style={styles.editInput}
                            value={String(qty)}
                            onChangeText={(text) => updateLineField(line.id, 'qty', text)}
                            keyboardType="decimal-pad"
                            onBlur={autoSave}
                            onSubmitEditing={autoSave}
                          />
                          <TouchableOpacity onPress={() => { updateLineField(line.id, 'qty', numQty + 1); debouncedAutoSave(); }}>
                            <AntDesign name="pluscircleo" size={20} color={COLORS.primaryThemeColor} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={styles.editField}>
                        <Text style={styles.editFieldLabel}>Price</Text>
                        <TextInput
                          style={styles.editInput}
                          value={String(price)}
                          onChangeText={(text) => updateLineField(line.id, 'price_unit', text)}
                          keyboardType="decimal-pad"
                          onBlur={autoSave}
                          onSubmitEditing={autoSave}
                        />
                      </View>
                      <View style={styles.editField}>
                        <Text style={styles.editFieldLabel}>Subtotal</Text>
                        <Text style={styles.lineSubtotal}>{currencySymbol} {(numQty * numPrice).toFixed(3)}</Text>
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

        {/* Confirm Order Button — only if draft AND no invoices yet */}
        {isDraft && !hasInvoice && (
          <View style={{ marginVertical: 8 }}>
            <Button
              backgroundColor={COLORS.primaryThemeColor}
              title="Confirm Order"
              onPress={handleConfirmOrder}
              loading={confirming}
            />
          </View>
        )}

        {/* Cancel Order Button — only if draft AND no invoices yet */}
        {isDraft && !hasInvoice && (
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

        {/* View Invoice Button — show whenever invoices exist */}
        {hasInvoice && (
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
      <BelowCostApprovalModal
        visible={showBelowCostModal}
        belowCostLines={belowCostLines}
        orderTotal={record?.amount_total || 0}
        currency={currencySymbol}
        onApprove={handleBelowCostApprove}
        onReject={handleBelowCostReject}
        onCancel={() => { setShowBelowCostModal(false); setBelowCostLines([]); setBelowCostAction(null); }}
      />
      <StyledAlertModal
        isVisible={showCancelAlert}
        message="Are you sure you want to cancel this order?"
        confirmText="YES, CANCEL"
        cancelText="NO"
        destructive
        onConfirm={executeCancelOrder}
        onCancel={() => setShowCancelAlert(false)}
      />
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
