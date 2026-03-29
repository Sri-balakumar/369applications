import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import Toast from 'react-native-toast-message';
import { createInvoiceFromQuotationOdoo, fetchSaleOrderDetailOdoo } from '@api/services/generalApi';
import BelowCostApprovalModal from '@components/BelowCostApprovalModal';
import { checkBelowCostLines } from '@utils/belowCostCheck';

const DirectInvoiceScreen = ({ route, navigation }) => {
  const quotationId = route?.params?.quotation_id;
  const [loading, setLoading] = useState(false);
  const [showBelowCostModal, setShowBelowCostModal] = useState(false);
  const [belowCostLines, setBelowCostLines] = useState([]);
  const [orderTotal, setOrderTotal] = useState(0);

  const executeInvoice = async () => {
    try {
      const result = await createInvoiceFromQuotationOdoo(quotationId);
      if (result && result.result) {
        Toast.show({ type: 'success', text1: 'Invoice Created', text2: `Invoice ID: ${result.result}` });
        navigation.navigate('SalesInvoiceReceiptScreen', {
          invoiceId: result.result,
          orderId: quotationId,
        });
      } else {
        console.error('Direct Invoice API error:', result);
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to create invoice' });
      }
    } catch (err) {
      console.error('Direct Invoice API exception:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to create invoice' });
    }
  };

  const handlePress = async () => {
    if (!quotationId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No quotation ID found', position: 'bottom' });
      return;
    }

    setLoading(true);
    try {
      // Fetch the quotation's order lines to check costs
      const soRecord = await fetchSaleOrderDetailOdoo(quotationId);
      if (soRecord && soRecord.order_lines_detail && soRecord.order_lines_detail.length > 0) {
        const linesToCheck = soRecord.order_lines_detail.map(l => ({
          product_id: Array.isArray(l.product_id) ? l.product_id[0] : l.product_id,
          product_name: Array.isArray(l.product_id) ? l.product_id[1] : (l.name || ''),
          price_unit: l.price_unit || 0,
          qty: l.product_uom_qty || 1,
        }));

        const result = await checkBelowCostLines(linesToCheck);
        if (result.hasBelowCost) {
          setBelowCostLines(result.belowCostLines);
          setOrderTotal(soRecord.amount_total || 0);
          setLoading(false);
          setShowBelowCostModal(true);
          return;
        }
      }
    } catch (err) {
      console.log('[DirectInvoice] Below cost check failed, proceeding:', err?.message);
    }

    await executeInvoice();
    setLoading(false);
  };

  const handleBelowCostApprove = async () => {
    setShowBelowCostModal(false);
    setLoading(true);
    await executeInvoice();
    setLoading(false);
    setBelowCostLines([]);
  };

  const handleBelowCostReject = async () => {
    setShowBelowCostModal(false);
    Alert.alert('Invoice Rejected', 'The below-cost invoice has been rejected.');
    setBelowCostLines([]);
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Direct Invoice" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        <View style={{ margin: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 20 }}>
            Quotation ID: {quotationId || 'N/A'}
          </Text>
          <Button
            title="Direct Invoice"
            backgroundColor="#FF9800"
            disabled={!quotationId || loading}
            onPress={handlePress}
          />
        </View>
      </RoundedScrollContainer>
      <OverlayLoader visible={loading} />
      <BelowCostApprovalModal
        visible={showBelowCostModal}
        belowCostLines={belowCostLines}
        orderTotal={orderTotal}
        currency=""
        onApprove={handleBelowCostApprove}
        onReject={handleBelowCostReject}
        onCancel={() => { setShowBelowCostModal(false); setBelowCostLines([]); }}
      />
    </SafeAreaView>
  );
};

export default DirectInvoiceScreen;
