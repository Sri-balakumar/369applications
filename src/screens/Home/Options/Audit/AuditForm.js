import { View, StyleSheet, Keyboard, FlatList, TouchableOpacity, Image, ActivityIndicator, ScrollView, Modal, TextInput } from 'react-native'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { RoundedScrollContainer, SafeAreaView } from '@components/containers'
import { NavigationHeader } from '@components/Header'
import { TextInput as FormInput } from '@components/common/TextInput'
import { COLORS, FONT_FAMILY } from '@constants/theme'
import { Button, LoadingButton } from '@components/common/Button'
import SignaturePad from '@components/SignaturePad'
import Text from '@components/Text'
import * as FileSystem from 'expo-file-system'
import { fetchBills } from '@api/details/detailApi'
import { format } from 'date-fns'
import { useAuthStore } from '@stores/auth';
import { ActionModal } from '@components/Modal'
import { formatData } from '@utils/formatters'
import { AntDesign } from '@expo/vector-icons';
import { post } from '@api/services/utils'
import Toast from 'react-native-toast-message'
import { showToast } from '@utils/common'
import { fetchInvoiceByIdOdoo, createAuditingOdoo, fetchPostedMovesOdoo, uploadAuditAttachmentsOdoo } from '@api/services/generalApi'

const TABS = [
  'Transaction Lines',
  '8. Partner Signature',
  '9. Cashier Signature *',
  'Source Voucher / Invoice',
];

const FieldRow = ({ label, value, isCurrency }) => (
  <View style={fStyles.row}>
    <Text style={fStyles.label}>{label}</Text>
    <Text style={[fStyles.value, isCurrency && fStyles.bold]}>{value || '\u2014'}</Text>
  </View>
);

const fStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dee2e6' },
  label: { flex: 1.2, fontSize: 13, color: '#495057', fontFamily: FONT_FAMILY.urbanistSemiBold },
  value: { flex: 1, fontSize: 13, color: '#212529', fontFamily: FONT_FAMILY.urbanistMedium, textAlign: 'right' },
  bold: { fontFamily: FONT_FAMILY.urbanistBold },
});

const AuditForm = ({ navigation }) => {

  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [isSubmiting, setIsSubmiting] = useState(false);
  const [url, setUrl] = useState('')
  const [cashierUrl, setCashierUrl] = useState('')
  const [activeTab, setActiveTab] = useState(0)
  const [customerSignedBy, setCustomerSignedBy] = useState('')
  const [cashierSignedBy, setCashierSignedBy] = useState('')
  const [imageUrls, setImageUrls] = useState([])
  const [displayBillDetails, setDisplayBillDetails] = useState({})
  const [showRefDropdown, setShowRefDropdown] = useState(false)
  const [refSearchQuery, setRefSearchQuery] = useState('')
  const [postedMoves, setPostedMoves] = useState([])
  const [movesLoading, setMovesLoading] = useState(false)
  const [odooMoveId, setOdooMoveId] = useState(null)
  const [customerSigBase64, setCustomerSigBase64] = useState('')
  const [cashierSigBase64, setCashierSigBase64] = useState('')
  const [isCourier, setIsCourier] = useState(false)
  const [courierProofUri, setCourierProofUri] = useState('')
  const [collectionType, setCollectionType] = useState(null);
  console.log("Collection Type: ", collectionType)
  const [errors, setErrors] = useState({});
  const [ledger, setLedger] = useState({})
  const [imageLoading, setImageLoading] = useState(true);
  const [scannedBillDetails, setScannedBillDetails] = useState({});
  console.log("🚀 ~ Audit Form ~ scannedBillDetails:", JSON.stringify(scannedBillDetails, null, 2));
  const [remarks, setRemarks] = useState('')
  const [splittedBillName, setSplittedBillName] = useState('')
  const loginUser = useAuthStore(state => state.user)
  const warehouseId = loginUser?.warehouse?.warehouse_id
  const restoredRef = useRef(false);

  // Persist critical form state before opening picker (survives Android process death)
  const FORM_DRAFT_KEY = 'audit_form_draft';

  const saveFormDraft = useCallback(async () => {
    try {
      const draft = {
        imageUrls, odooMoveId, displayBillDetails, scannedBillDetails,
        customerSignedBy, cashierSignedBy, remarks, activeTab,
        isCourier, courierProofUri,
      };
      await AsyncStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
      console.log('[AuditForm] Draft saved');
    } catch (e) {
      console.warn('[AuditForm] Failed to save draft:', e?.message);
    }
  }, [imageUrls, odooMoveId, displayBillDetails, scannedBillDetails, customerSignedBy, cashierSignedBy, remarks, activeTab, isCourier, courierProofUri]);

  const clearFormDraft = useCallback(async () => {
    try { await AsyncStorage.removeItem(FORM_DRAFT_KEY); } catch (e) { /* ignore */ }
  }, []);

  // Restore draft on mount (handles Android process death)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FORM_DRAFT_KEY);
        if (raw) {
          restoredRef.current = true;
          const draft = JSON.parse(raw);
          if (draft.imageUrls?.length) setImageUrls(draft.imageUrls);
          if (draft.odooMoveId) setOdooMoveId(draft.odooMoveId);
          if (draft.displayBillDetails && Object.keys(draft.displayBillDetails).length) setDisplayBillDetails(draft.displayBillDetails);
          if (draft.scannedBillDetails && Object.keys(draft.scannedBillDetails).length) setScannedBillDetails(draft.scannedBillDetails);
          if (draft.customerSignedBy) setCustomerSignedBy(draft.customerSignedBy);
          if (draft.cashierSignedBy) setCashierSignedBy(draft.cashierSignedBy);
          if (draft.remarks) setRemarks(draft.remarks);
          if (draft.activeTab != null) setActiveTab(draft.activeTab);
          if (draft.isCourier) setIsCourier(draft.isCourier);
          if (draft.courierProofUri) setCourierProofUri(draft.courierProofUri);
          console.log('[AuditForm] Draft restored');
          // Clear the draft after restoring so it doesn't keep restoring
          await AsyncStorage.removeItem(FORM_DRAFT_KEY);
        }
      } catch (e) {
        console.warn('[AuditForm] Failed to restore draft:', e?.message);
      }
    })();
  }, []);

  // Default cashier name to logged-in user (matches Odoo: default=lambda self: self.env.user.name)
  useEffect(() => {
    const userName = loginUser?.related_profile?.name || loginUser?.name || '';
    if (userName && !cashierSignedBy) {
      setCashierSignedBy(userName);
    }
  }, [loginUser]);

  useEffect(() => {
    // Skip the initial reset if we restored from a draft
    if (restoredRef.current) {
      restoredRef.current = false;
      return;
    }
    resetFormState();
  }, [splittedBillName]);

  // clear all states when scan another data
  const resetFormState = () => {
    setImageUrls([]);
    setDisplayBillDetails({});
    setScannedBillDetails({});
    setCollectionType(null);
    setErrors({});
    setLedger({});
    setRemarks('');
    setOdooMoveId(null);
    setIsCourier(false);
    setCourierProofUri('');
    // Reset partner name (will be auto-filled when transaction is selected)
    setCustomerSignedBy('');
    // Re-default cashier name to logged-in user
    setCashierSignedBy(loginUser?.related_profile?.name || loginUser?.name || '');
    clearFormDraft();
  };

  // Open the transaction reference dropdown
  const handleOpenRefDropdown = async () => {
    setShowRefDropdown(true);
    setRefSearchQuery('');
    if (postedMoves.length === 0) {
      setMovesLoading(true);
      try {
        const moves = await fetchPostedMovesOdoo();
        setPostedMoves(moves);
      } catch (error) {
        console.error('Failed to fetch posted moves:', error);
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load transactions', position: 'bottom' });
      } finally {
        setMovesLoading(false);
      }
    }
  };

  // Handle selecting a transaction from the dropdown
  const handleSelectTransaction = async (move) => {
    setShowRefDropdown(false);
    resetFormState();
    setOdooMoveId(move.id);
    try {
      const invoice = await fetchInvoiceByIdOdoo(move.id);
      if (invoice) {
        setDisplayBillDetails({
          displayName: invoice.partner_name || move.partner_name || '',
          documentNumber: invoice.name || move.name || '',
          totalAmount: invoice.amount_total || move.amount_total || 0,
        });
        setScannedBillDetails({
          untaxed_total_amount: invoice.amount_untaxed || 0,
          tax_amount: invoice.amount_tax || 0,
          invoice_date: invoice.invoice_date || move.invoice_date || '',
          customer_name: invoice.partner_name || move.partner_name || '',
          payment_method: invoice.payment_method || '',
        });
        // Auto-fill partner name (matches Odoo _fill_from_move: customer_signed_by = partner.name)
        const partnerName = invoice.partner_name || move.partner_name || '';
        if (partnerName) setCustomerSignedBy(partnerName);
        Toast.show({ type: 'success', text1: 'Transaction Loaded', text2: move.name, position: 'bottom' });
      }
    } catch (error) {
      console.error('Error fetching transaction details:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load transaction details', position: 'bottom' });
    }
  };

  const filteredMoves = postedMoves.filter((m) =>
    m.name.toLowerCase().includes(refSearchQuery.toLowerCase()) ||
    m.partner_name.toLowerCase().includes(refSearchQuery.toLowerCase())
  );

  // Function to handle scanned data
  const handleScan = async (data) => {
    console.log("Data : ", data)

    // Odoo invoice QR detection (URL like /customer-invoices/1 or plain number)
    const odooUrlMatch = data.match(/\/customer-invoices\/(\d+)/);
    const isPlainId = /^\d+$/.test(data.trim());
    if (odooUrlMatch || isPlainId) {
      resetFormState();
      const invoiceId = odooUrlMatch ? parseInt(odooUrlMatch[1], 10) : parseInt(data.trim(), 10);
      setOdooMoveId(invoiceId);
      try {
        const invoice = await fetchInvoiceByIdOdoo(invoiceId);
        if (invoice) {
          setDisplayBillDetails({
            displayName: invoice.partner_name || '',
            documentNumber: invoice.name || '',
            totalAmount: invoice.amount_total || 0,
          });
          setScannedBillDetails({
            untaxed_total_amount: invoice.amount_untaxed || 0,
            tax_amount: invoice.amount_tax || 0,
            payment_method: invoice.payment_method || '',
          });
          // Auto-fill partner name from invoice
          if (invoice.partner_name) setCustomerSignedBy(invoice.partner_name);
          Toast.show({ type: 'success', text1: 'Invoice Loaded', text2: invoice.name, position: 'bottom' });
        } else {
          Toast.show({ type: 'error', text1: 'Error', text2: 'No invoice found', position: 'bottom' });
        }
      } catch (error) {
        console.error('Odoo invoice fetch error:', error);
        Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to fetch invoice', position: 'bottom' });
      }
      return;
    }

    // UAE backend bill format: "Invoice-203", "Vendor Bill-45", etc.
    const billParts = data.split('-')
    const billName = billParts[0]
    console.log("BillName : ", billName)
    const billSequence = billParts.slice(1).join('-')
    console.log("Bill Sequence : ", billSequence)
    setSplittedBillName(billName)
    resetFormState();

    try {
      let response, billDetails;
      switch (billName) {
        case "Invoice":
          response = await fetchBills.invoiceDetails(billSequence);
          billDetails = response[0];
          break;

        case "Vendor Bill":
          response = await fetchBills.vendorDetails(billSequence);
          billDetails = response[0];
          break;

        case "Sales Return":
          response = await fetchBills.salesReturnDetails(billSequence);
          billDetails = response[0];
          break;

        case "Purchase Return":
          response = await fetchBills.purchaseReturnDetails(billSequence);
          billDetails = response[0];
          break;

        case "CAPREC":
          response = await fetchBills.capitalRecieptsDetails(billSequence);
          billDetails = response[0];
          break;

        case "Cash rec":
          response = await fetchBills.cashReceiptsDetails(billSequence);
          billDetails = response[0];
          break;

        case "Cash pay":
          response = await fetchBills.cashPaymentsDetails(billSequence);
          billDetails = response[0];
          break;

        case "Bankpay":
          response = await fetchBills.expenseDetails(billSequence);
          billDetails = response[0];
          break;

        case "Bank rec":
          response = await fetchBills.capitalRecieptsDetails(billSequence);
          billDetails = response[0];
          break;

        case "SALPAY":
          response = await fetchBills.salaryPaymentDetails(billSequence);
          billDetails = response[0];
          break;

        case "E/PPAY":
          response = await fetchBills.salaryAdvancePaymentDetails(billSequence);
          billDetails = response[0];
          break;

        case "CHEQREC":
          response = await fetchBills.chequeLedgerDetails(billSequence);
          billDetails = response[0];
          break;

        case "CUSTREC":
          response = await fetchBills.customerReceiptsDetails(billSequence);
          billDetails = response[0];
          break;

        case "CUSTPAY":
          response = await fetchBills.customerPaymentDetails(billSequence);
          billDetails = response[0];
          break;

        case "SUPREC":
          response = await fetchBills.supplierReceiptsDetails(billSequence);
          billDetails = response[0];
          break;

        case "SUPPAY":
          response = await fetchBills.supplierPaymentsDetails(billSequence);
          billDetails = response[0];
          break;

        case "CAPPAY":
          response = await fetchBills.capitalPaymentDetails(billSequence);
          billDetails = response[0];
          break;

        case "JobInvoice":
          response = await fetchBills.jobInvoiceDetails(billSequence);
          billDetails = response[0];
          break;

        case "PETTYALLOT":
          response = await fetchBills.pettyCashAllotmentDetails(billSequence);
          billDetails = response[0];
          break;

        case "PETEXP":
          response = await fetchBills.pettyCashExpenseDetails(billSequence);
          billDetails = response[0];
          break;

        case "CASRET": //petty cash return
          response = await fetchBills.pettyCashReturnDetails(billSequence);
          billDetails = response[0];
          break;

        case "PETTYTRANS":
          response = await fetchBills.pettyCashTransferDetails(billSequence);
          billDetails = response[0];
          break;

        case "Spare Issue":
          response = await fetchBills.sparePartsIssueDetails(billSequence);
          if (response[0]) {
            const spareAuditDetail = await fetchBills.sparePartsIssueAuditDetails(response[0]?._id)
            billDetails = spareAuditDetail[0];
          }
          break;

        case "Stock rec":
          response = await fetchBills.stockTransferDetails(billSequence);
          billDetails = response[0];
          break;

        case "Fund rec":
          response = await fetchBills.fundTransferDetails(billSequence);
          billDetails = response[0];
          break;

        // latest update keys  
        case "JOBREC":
          response = await fetchBills.jobRegisterPaymentDetails(billSequence);
          billDetails = response[0];
          break;  

        case "Service ReturnSRN":
          response = await fetchBills.serviceReturnDetails(billSequence);
          billDetails = response[0];
          break;  

        case "PAYMENT RECIEPTRP":
          response = await fetchBills.paymentReceiptDetails(billSequence);
          billDetails = response[0];
          break;     

        default:
          console.log("Unknown bill type");
      }
      if (billDetails) {
        setScannedBillDetails(billDetails)
        const transactionDetails = {
          displayName: billDetails?.customer?.customer_name ||
            billDetails?.supplier?.supplier_name ||
            billDetails?.capital_chart_of_account_name ||
            billDetails?.expense_chart_of_account_name ||
            billDetails?.chart_of_account_name ||
            billDetails?.chart_of_accounts_name ||
            billDetails?.sales_person?.sales_person_name ||
            billDetails?.created_by?.created_by_name || '',
          documentNumber: billDetails.sequence_no || '',
          totalAmount: billDetails.total_amount || billDetails.amount || billDetails?.spare_parts_line?.[0]?.totalCount?.[0]?.total_calculated_amounts || billDetails?.debit ||
            billDetails?.total_purchase_cost || '',
          businessType: billDetails.bussiness_type_id || '',
          paymentMethod: billDetails?.payment_method_id ||
            billDetails?.register_payments?.[0]?.payment_method_id ||
            billDetails?.transaction_type_id ||
            billDetails?.paid_through_chart_of_account_id || '',
          ledgerId: billDetails?.capital_chart_of_account_id ||
            billDetails?.expense_chart_of_account_id ||
            billDetails?.chart_of_account_id ||
            billDetails?.chart_of_accounts_id ||
            billDetails?.ledger_id || '',
          isEstimation: billDetails?.is_estimation
        };
        const collectionTypeResponse = await fetchBills.collectionTypeDetails(transactionDetails.businessType, transactionDetails.paymentMethod);
        const collectionResponseData = collectionTypeResponse[0];

        if (billName === 'JobInvoice') {
          if (transactionDetails.isEstimation) {
            setCollectionType(collectionTypeResponse[0]);
          } else {
            setCollectionType(collectionTypeResponse[1]);
          }
        } else {
          setCollectionType(collectionResponseData);
        }

        if (transactionDetails.ledgerId) {
          const ledgerTypeResponse = await fetchBills.ledgerTypeDetails(transactionDetails.ledgerId);
          const ledgerTypeResponseData = ledgerTypeResponse[0]?.auditing_ledger;
          setLedger(ledgerTypeResponseData);
        }
        setDisplayBillDetails(transactionDetails);

        // Clear errors for all fields if they are not empty
        for (const field in transactionDetails) {
          if (transactionDetails[field]) {
            updateErrorState(null, field);
          }
        }
        // Clear errors for collection type if it's not empty
        if (collectionResponseData?.collection_type_name) {
          updateErrorState(null, 'collectionType');
        }
      }
      // console.log("Customer:", customer);
    } catch (error) {
      console.log('Error fetching customer details:', error);
    }
  };

  const updateErrorState = (error, input) => {
    setErrors((prevState) => ({ ...prevState, [input]: error }));
  };

  const validate = () => { // Function to validate form
    Keyboard.dismiss();
    let isValid = true;
    const errorMessages = {
      displayName: "Partner name is required",
      documentNumber: "Transaction reference is required",
      totalAmount: "Total amount is required",
    };

    // Must have a transaction selected (move_id is required in Odoo)
    if (!odooMoveId && !displayBillDetails?.documentNumber) {
      Toast.show({ type: 'error', text1: 'No Transaction', text2: 'Please select a transaction before submitting', position: 'bottom' });
      return false;
    }

    // Ensure displayBillDetails is not undefined/null
    if (!displayBillDetails || typeof displayBillDetails !== 'object') {
      console.error("Error: displayBillDetails is undefined or not an object.");
      updateErrorState("Please select a transaction", "displayBillDetails");
      return false;
    }

    // Check if this is an Odoo dropdown selection (no splittedBillName means it came from dropdown)
    const isOdooDropdownSelection = !splittedBillName && displayBillDetails?.documentNumber;

    for (const field in errorMessages) {
      // Skip displayName validation for Spare Issue, E/PPAY, or Odoo dropdown selections
      if (field === "displayName" && (splittedBillName === "Spare Issue" || splittedBillName === 'E/PPAY' || isOdooDropdownSelection)) {
        continue;
      }

      if (!displayBillDetails[field]) {
        updateErrorState(errorMessages[field], field);
        isValid = false;
      }
    }

    if (scannedBillDetails?.job_registrations?.[0]?.warehouse_id || scannedBillDetails?.warehouse || scannedBillDetails?.from_warehouse_id) {
      const warehouses_id = scannedBillDetails?.warehouse?.warehouses_id || scannedBillDetails?.to_warehouse_id || scannedBillDetails?.job_registrations?.[0]?.warehouse_id;
      const from_warehouse_id = scannedBillDetails?.from_warehouse_id || null;
      const to_warehouse_id = scannedBillDetails?.to_warehouse_id || null;

      if (warehouseId !== warehouses_id && warehouseId !== to_warehouse_id && warehouseId !== from_warehouse_id) {
        console.log("Condition triggered: Warehouse ID doesn't match either the warehouse or from_warehouse_id.");
        showToast({
          type: "error",
          title: "Error",
          message: "Warehouse doesn't match the logged-in user's warehouse.",
        });
        isValid = false;
      } else {
        console.log("Condition not triggered: Warehouse ID matches.");
      }
    }

    if (isValid) {
      handleSubmitAudit();
    } else {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Please fill all required fields', position: 'bottom' });
    }
  };

  const handleSubmitAudit = async () => {
    try {
      setIsSubmiting(true);
      console.log('[handleSubmitAudit] CALLED - starting submit...');

      // Convert courier proof URI to base64 if present
      let courierProofBase64 = null;
      if (isCourier && courierProofUri) {
        try {
          let readUri = courierProofUri;
          // Handle content:// URIs (from document picker) by copying to cache first
          if (courierProofUri.startsWith('content://')) {
            const fileName = courierProofUri.split('/').pop() || `courier_proof_${Date.now()}`;
            const cacheUri = `${FileSystem.cacheDirectory}courier_${Date.now()}_${fileName}`;
            await FileSystem.copyAsync({ from: courierProofUri, to: cacheUri });
            readUri = cacheUri;
          }
          // Handle data URIs (base64 already embedded)
          if (readUri.startsWith('data:')) {
            const commaIdx = readUri.indexOf(',');
            if (commaIdx > 0) {
              courierProofBase64 = readUri.substring(commaIdx + 1);
            }
          } else {
            courierProofBase64 = await FileSystem.readAsStringAsync(readUri, { encoding: FileSystem.EncodingType.Base64 });
          }
        } catch (e) {
          console.warn('[AuditForm] Failed to read courier proof as base64:', e?.message);
          Toast.show({ type: 'error', text1: 'Courier Proof Error', text2: 'Could not read courier proof image', position: 'bottom' });
        }
      }

      // Build data for Odoo audit.transaction model
      // Only move_id + signatures needed; Odoo auto-fills everything else via _fill_from_move()
      const auditingData = {
        move_id: odooMoveId || null,
        customer_signature: customerSigBase64 || null,
        customer_signed_by: customerSignedBy || '',
        customer_signed_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        cashier_signature: cashierSigBase64 || null,
        cashier_signed_by: cashierSignedBy || '',
        cashier_signed_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        is_courier: isCourier,
        courier_proof: courierProofBase64,
      };

      console.log("handle Auditing Data:", JSON.stringify(auditingData, null, 2));
      const result = await createAuditingOdoo(auditingData);
      if (result) {
        // Upload attachments if any
        let attachMsg = '';
        if (imageUrls && imageUrls.length > 0) {
          try {
            const attIds = await uploadAuditAttachmentsOdoo(result, imageUrls);
            if (attIds && attIds.length > 0) {
              attachMsg = ` with ${attIds.length} attachment(s)`;
            } else {
              Toast.show({
                type: 'error',
                text1: 'Attachment Warning',
                text2: 'Audit created but attachments failed to upload. Please try re-uploading.',
                position: 'bottom',
                visibilityTime: 4000,
              });
            }
          } catch (attachErr) {
            console.error('Attachment upload error:', attachErr);
            Toast.show({
              type: 'error',
              text1: 'Attachment Error',
              text2: attachErr?.message || 'Failed to upload attachments',
              position: 'bottom',
              visibilityTime: 4000,
            });
          }
        }
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: `Audit created successfully${attachMsg}`,
          position: 'bottom',
        });
        await clearFormDraft();
        navigation.navigate('AuditScreen');
      } else {
        Toast.show({
          type: 'error',
          text1: 'ERROR',
          text2: 'Audit creation failed',
          position: 'bottom',
        });
      }
    } catch (err) {
      console.error("Error submitting audit:", err);
      Toast.show({
        type: 'error',
        text1: 'ERROR',
        text2: err?.message || 'Audit creation failed',
        position: 'bottom',
      });
    } finally {
      setIsSubmiting(false);
    }
  }
  const handleDeleteImage = (index) => {
    const newImageUrls = [...imageUrls];
    newImageUrls.splice(index, 1);
    setImageUrls(newImageUrls);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setImageLoading(false);
    }, 1000);

    return () => clearTimeout(timeout);
  }, []);

  const ListAction = ({ image, onPress, index }) => {
    return (
      <View style={styles.listContainer} onPress={onPress}>
        {imageLoading && <ActivityIndicator size="small" color={'black'} style={{ position: 'absolute', top: 30 }} />}
        <Image source={{ uri: image }} style={styles.image}
          onLoad={() => setImageLoading(true)}
        />
        <View style={styles.deleteIconContainer}>
          <TouchableOpacity onPress={() => handleDeleteImage(index)}>
            <AntDesign name="delete" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderItem = ({ index, item }) => {
    if (item.empty) {
      return <View style={[styles.itemStyle, styles.itemInvisible]} />
    }
    return <ListAction image={item} index={index} />;
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Transaction Auditing"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer scrollEnabled={scrollEnabled}>

        {/* ─── Status Bar ─── */}
        <View style={styles.statusBar}>
          <View style={[styles.statusChip, styles.statusChipActive]}>
            <Text style={styles.statusChipTextActive}>Draft</Text>
          </View>
          <AntDesign name="right" size={12} color="#adb5bd" style={{ marginHorizontal: 4 }} />
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>Audited</Text>
          </View>
          <AntDesign name="right" size={12} color="#adb5bd" style={{ marginHorizontal: 4 }} />
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>Rejected</Text>
          </View>
        </View>

        {/* ─── Action Buttons ─── */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.btnPrimary} onPress={validate}>
            <Text style={styles.btnTextWhite}>Submit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnDanger} onPress={() => navigation.goBack()}>
            <Text style={styles.btnTextWhite}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnOutline}>
            <Text style={styles.btnTextDark}>Print Audit Voucher</Text>
          </TouchableOpacity>
        </View>

        {/* ─── TRANSACTION INFORMATION ─── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>TRANSACTION INFORMATION</Text>
          <View style={styles.divider} />

          {/* 1. Transaction Reference + Dropdown + Scan */}
          <Text style={styles.fieldLabel}>1. Transaction Reference</Text>
          <View style={styles.refRow}>
            <TouchableOpacity style={styles.refDropdownBtn} onPress={handleOpenRefDropdown}>
              <Text style={displayBillDetails?.documentNumber ? styles.refValueSelected : styles.refValue} numberOfLines={1}>
                {displayBillDetails?.documentNumber || 'Select transaction...'}
              </Text>
              <AntDesign name="down" size={14} color="#495057" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => navigation.navigate('InvoiceScannerScreen', { onScan: handleScan })}
            >
              <AntDesign name="scan1" size={16} color="#fff" />
              <Text style={styles.scanBtnText}>Scan</Text>
            </TouchableOpacity>
          </View>
          {errors.documentNumber && <Text style={styles.errorText}>{errors.documentNumber}</Text>}

          <FieldRow label="2. Audit Account Type" value={collectionType?.collection_type_name} />
          <FieldRow
            label="3. Partner"
            value={displayBillDetails?.displayName?.toUpperCase()?.trim()}
          />
          {errors.displayName && <Text style={styles.errorText}>{errors.displayName}</Text>}

          <FieldRow label="Transaction Date" value={format(new Date(), 'yyyy-MM-dd')} />
          <FieldRow label="Transaction Number / Ref" value={displayBillDetails?.documentNumber} />
          <FieldRow label="Journal" value={loginUser.company ? loginUser.company?.name : ''} />
          <FieldRow label="Company" value={loginUser.company ? loginUser.company?.name : ''} />

          <View style={[styles.divider, { marginTop: 8 }]} />

          <FieldRow
            label="4. Amount (before Tax)"
            value={`$ ${Number(scannedBillDetails?.untaxed_total_amount || 0).toFixed(2)}`}
            isCurrency
          />
          <FieldRow
            label="6. Total Amount"
            value={`$ ${displayBillDetails?.totalAmount ?? '0.00'}`}
            isCurrency
          />
          {errors.totalAmount && <Text style={styles.errorText}>{errors.totalAmount}</Text>}

          <FieldRow label="7. Salesperson / Creator" value={loginUser?.related_profile?.name} />
          <FieldRow label="Created By" value={loginUser?.related_profile?.name || loginUser?.name} />
          <FieldRow label="Payment Method" value={scannedBillDetails?.payment_method} />
        </View>

        {/* ─── Tabs ─── */}
        <View style={styles.tabsCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
            {TABS.map((tab, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => setActiveTab(idx)}
                style={[styles.tabItem, activeTab === idx && styles.tabItemActive]}
              >
                <Text style={[styles.tabText, activeTab === idx && styles.tabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.tabContent}>
            {/* Tab 0: Transaction Lines */}
            {activeTab === 0 && (
              <View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thCell, { flex: 2 }]}>Product</Text>
                  <Text style={[styles.thCell, { flex: 2 }]}>Description</Text>
                  <Text style={styles.thCell}>Quantity</Text>
                  <Text style={styles.thCell}>Unit Price</Text>
                  <Text style={styles.thCell}>Tax Amount</Text>
                  <Text style={styles.thCell}>Subtotal</Text>
                  <Text style={styles.thCell}>Account</Text>
                </View>
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>No transaction lines to display.</Text>
                </View>
              </View>
            )}

            {/* Tab 1: Partner Signature */}
            {activeTab === 1 && (
              <View>
                <Text style={styles.sigSectionHeader}>PARTNER DETAILS</Text>
                <View style={styles.sigDivider} />
                <FormInput
                  label={'Partner Name'}
                  placeholder={'Enter partner name'}
                  value={customerSignedBy}
                  onChangeText={(text) => setCustomerSignedBy(text)}
                />
                <FormInput
                  label={'Date Signed'}
                  editable={false}
                  value={format(new Date(), 'yyyy-MM-dd')}
                />

                {/* Courier Delivery */}
                <View style={styles.courierRow}>
                  <Text style={styles.courierLabel}>Courier Delivery</Text>
                  <TouchableOpacity
                    style={[styles.courierCheckbox, isCourier && styles.courierCheckboxActive]}
                    onPress={() => setIsCourier(!isCourier)}
                  >
                    {isCourier && <AntDesign name="check" size={14} color="#fff" />}
                  </TouchableOpacity>
                </View>
                {isCourier && (
                  <View style={styles.courierProofContainer}>
                    <Text style={styles.courierProofLabel}>Courier Proof</Text>
                    <ActionModal
                      title={'Upload Courier Proof'}
                      setImageUrl={(imgUrl) => setCourierProofUri(imgUrl)}
                      onBeforePicker={saveFormDraft}
                    />
                    {courierProofUri ? (
                      <View style={styles.courierProofPreview}>
                        <Image source={{ uri: courierProofUri }} style={styles.courierProofImage} />
                        <TouchableOpacity onPress={() => setCourierProofUri('')} style={styles.courierProofRemove}>
                          <AntDesign name="closecircle" size={18} color="#dc3545" />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                )}

                <SignaturePad
                  setScrollEnabled={setScrollEnabled}
                  setUrl={setUrl}
                  title={'Partner Signature'}
                  previousSignature={url || ''}
                  onSignatureBase64={(sig) => setCustomerSigBase64(sig)}
                />
              </View>
            )}

            {/* Tab 2: Cashier Signature */}
            {activeTab === 2 && (
              <View>
                <Text style={styles.sigSectionHeader}>CASHIER DETAILS</Text>
                <View style={styles.sigDivider} />
                <View style={styles.mandatoryBanner}>
                  <Text style={styles.mandatoryText}>
                    Cashier signature is <Text style={{ fontFamily: FONT_FAMILY.urbanistBold }}>mandatory</Text> before this transaction can be marked as Audited.
                  </Text>
                </View>
                <FormInput
                  label={'Cashier Name *'}
                  placeholder={'Enter cashier name'}
                  value={cashierSignedBy}
                  onChangeText={(text) => setCashierSignedBy(text)}
                />
                <FormInput
                  label={'Date Signed'}
                  editable={false}
                  value={format(new Date(), 'yyyy-MM-dd')}
                />
                <SignaturePad
                  setScrollEnabled={setScrollEnabled}
                  setUrl={setCashierUrl}
                  title={'Cashier Signature *'}
                  previousSignature={cashierUrl || ''}
                  onSignatureBase64={(sig) => setCashierSigBase64(sig)}
                />
              </View>
            )}

            {/* Tab 3: Source Voucher / Invoice */}
            {activeTab === 3 && (
              <View>
                <Text style={styles.attachHint}>
                  Attachments from the original transaction document are shown below.
                  These serve as proof of the audited transaction.
                </Text>
                <ActionModal title={'Attach file'} setImageUrl={(imgUrl) => setImageUrls(prev => [...prev, imgUrl])} onBeforePicker={saveFormDraft} />
                {imageUrls && imageUrls.length > 0 && (
                  <View style={styles.uploadsContainer}>
                    <Text style={styles.uploadsLabel}>Uploads</Text>
                    <FlatList
                      data={formatData(imageUrls, 4)}
                      numColumns={4}
                      keyExtractor={(item, index) => index.toString()}
                      contentContainerStyle={{ padding: 10 }}
                      showsVerticalScrollIndicator={false}
                      renderItem={renderItem}
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ─── Remarks ─── */}
        <FormInput label={'Remarks'} multiline={true} numberOfLines={5} onChangeText={(text) => setRemarks(text)} />

        {/* ─── Submit ─── */}
        <LoadingButton backgroundColor={COLORS.primaryThemeColor} title={'SUBMIT'} onPress={validate} loading={isSubmiting} />

      </RoundedScrollContainer>

      {/* ─── Transaction Reference Dropdown Modal ─── */}
      <Modal visible={showRefDropdown} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Transaction</Text>
              <TouchableOpacity onPress={() => setShowRefDropdown(false)}>
                <AntDesign name="close" size={20} color="#495057" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearchRow}>
              <AntDesign name="search1" size={16} color="#adb5bd" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search by reference or partner..."
                placeholderTextColor="#adb5bd"
                value={refSearchQuery}
                onChangeText={setRefSearchQuery}
                autoFocus
              />
            </View>
            {movesLoading ? (
              <ActivityIndicator size="large" color="#714B67" style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={filteredMoves}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.modalEmptyText}>No transactions found.</Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectTransaction(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalItemName}>{item.name}</Text>
                      <Text style={styles.modalItemPartner}>{item.partner_name || 'No Partner'}</Text>
                    </View>
                    <Text style={styles.modalItemAmount}>
                      $ {Number(item.amount_total).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

export default AuditForm

const styles = StyleSheet.create({
  /* ── Status Bar ── */
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#e9ecef',
  },
  statusChipActive: { backgroundColor: '#714B67' },
  statusChipText: { fontSize: 12, color: '#6c757d', fontFamily: FONT_FAMILY.urbanistSemiBold },
  statusChipTextActive: { fontSize: 12, color: '#fff', fontFamily: FONT_FAMILY.urbanistBold },

  /* ── Action Buttons ── */
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  btnPrimary: { backgroundColor: '#714B67', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 4 },
  btnDanger: { backgroundColor: '#dc3545', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 4 },
  btnOutline: { backgroundColor: '#f8f9fa', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 4, borderWidth: 1, borderColor: '#dee2e6' },
  btnTextWhite: { fontSize: 12, color: '#fff', fontFamily: FONT_FAMILY.urbanistBold },
  btnTextDark: { fontSize: 12, color: '#495057', fontFamily: FONT_FAMILY.urbanistBold },

  /* ── Section Card ── */
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#212529',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  divider: { height: 1, backgroundColor: '#dee2e6', marginVertical: 4 },

  /* ── Transaction Ref Row ── */
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
    gap: 8,
  },
  fieldLabel: { fontSize: 13, color: '#495057', fontFamily: FONT_FAMILY.urbanistSemiBold, marginTop: 10 },
  refDropdownBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#c5d0e6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  refValue: { fontSize: 13, color: '#adb5bd', fontFamily: FONT_FAMILY.urbanistMedium, flex: 1 },
  refValueSelected: { fontSize: 13, color: '#212529', fontFamily: FONT_FAMILY.urbanistSemiBold, flex: 1 },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryThemeColor,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  scanBtnText: { color: '#fff', fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold },
  errorText: { color: '#dc3545', fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, paddingLeft: 2, paddingTop: 2 },

  /* ── Tabs ── */
  tabsCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginBottom: 14,
    overflow: 'hidden',
  },
  tabBar: { borderBottomWidth: 1, borderBottomColor: '#dee2e6' },
  tabItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: '#714B67' },
  tabText: { fontSize: 12, color: '#6c757d', fontFamily: FONT_FAMILY.urbanistSemiBold },
  tabTextActive: { color: '#714B67', fontFamily: FONT_FAMILY.urbanistBold },
  tabContent: { padding: 16, minHeight: 120 },

  /* ── Transaction Lines Table ── */
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  thCell: { flex: 1, fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, color: '#495057' },
  emptyRow: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#adb5bd', fontFamily: FONT_FAMILY.urbanistMedium },

  /* ── Signature Section ── */
  sigSectionHeader: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#1B4F72',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sigDivider: { height: 2, backgroundColor: '#1B4F72', marginBottom: 12 },

  /* ── Mandatory Banner ── */
  mandatoryBanner: {
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffc107',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  mandatoryText: { fontSize: 13, color: '#856404', fontFamily: FONT_FAMILY.urbanistMedium },

  /* ── Courier Delivery ── */
  courierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  courierLabel: {
    fontSize: 13,
    color: '#495057',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  courierCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#adb5bd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  courierCheckboxActive: {
    backgroundColor: '#714B67',
    borderColor: '#714B67',
  },
  courierProofContainer: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  courierProofLabel: {
    fontSize: 13,
    color: '#495057',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    marginBottom: 8,
  },
  courierProofPreview: {
    marginTop: 8,
    alignItems: 'flex-start',
    position: 'relative',
  },
  courierProofImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  courierProofRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 10,
  },

  /* ── Attachments ── */
  attachHint: { fontSize: 13, color: '#6c757d', fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: 12, lineHeight: 20 },
  uploadsContainer: {
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: '#BBB7B7',
    backgroundColor: 'white',
    marginVertical: 5,
  },
  uploadsLabel: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, paddingHorizontal: 10, marginTop: 5 },

  /* ── Image List (for renderItem) ── */
  listContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', margin: 8 },
  image: { width: 90, height: 90, borderRadius: 8 },
  itemInvisible: { backgroundColor: 'transparent' },
  itemStyle: { flex: 1, alignItems: 'center', justifyContent: 'center', margin: 8 },
  deleteIconContainer: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 5,
  },

  /* ── Transaction Reference Dropdown Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#212529',
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#c5d0e6',
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#212529',
    padding: 0,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e9ecef',
  },
  modalItemName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#714B67',
  },
  modalItemPartner: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#6c757d',
    marginTop: 2,
  },
  modalItemAmount: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#212529',
  },
  modalEmptyText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#adb5bd',
    textAlign: 'center',
    marginTop: 40,
  },
});