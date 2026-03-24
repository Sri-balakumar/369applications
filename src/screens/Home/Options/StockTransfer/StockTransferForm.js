import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Keyboard, FlatList, TouchableOpacity, Alert, TextInput } from 'react-native';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader, TitleWithButton } from '@components/Header';
import { DropdownSheet } from '@components/common/BottomSheets';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import SignaturePad from '@components/SignaturePad';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { AntDesign } from '@expo/vector-icons';
import {
  fetchCompaniesOdoo,
  fetchProductsOdoo,
  createStockTransferOdoo,
  fetchProductStockOdoo,
} from '@api/services/generalApi';

const StockTransferForm = ({ navigation, route }) => {
  const passedCompany = route?.params?.selectedCompany || null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [errors, setErrors] = useState({});
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [signatureBase64, setSignatureBase64] = useState('');
  const submittingRef = useRef(false);

  // Dropdown visibility
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownType, setDropdownType] = useState(null);
  const [editingLineIndex, setEditingLineIndex] = useState(null);

  // Form data - pre-fill from navigation params if available
  const [sourceCompany, setSourceCompany] = useState(passedCompany);
  const [destinationCompany, setDestinationCompany] = useState(null);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([]);

  useEffect(() => {
    loadDropdownData();
  }, []);

  const loadDropdownData = async () => {
    setIsLoading(true);
    try {
      const [companiesData, productsData] = await Promise.all([
        fetchCompaniesOdoo(),
        fetchProductsOdoo({ limit: 200 }),
      ]);
      setCompanies(companiesData);
      setProducts(productsData.map(p => ({
        id: p.id,
        label: p.product_name || p.name || '',
        name: p.product_name || p.name || '',
        uom_id: p.uom?.uom_id || null,
        uom_name: p.uom?.uom_name || '',
        standard_price: p.standard_price || 0,
      })));
    } catch (error) {
      console.error('Error loading dropdown data:', error);
      showToastMessage('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const openDropdown = (type, lineIndex = null) => {
    setDropdownType(type);
    setEditingLineIndex(lineIndex);
    setIsDropdownVisible(true);
  };

  const handleDropdownSelect = (item) => {
    switch (dropdownType) {
      case 'source_company':
        setSourceCompany(item);
        if (errors.source_company) setErrors(prev => ({ ...prev, source_company: null }));
        break;
      case 'destination_company':
        setDestinationCompany(item);
        if (errors.destination_company) setErrors(prev => ({ ...prev, destination_company: null }));
        // Refresh stock availability for all existing product lines with new company
        if (item?.id && lines.length > 0) {
          const productIds = lines
            .filter(l => l.product_id)
            .map(l => l.product_id);
          if (productIds.length > 0) {
            fetchProductStockOdoo(productIds, item.id).then(stockMap => {
              setLines(prev => prev.map(l => {
                if (!l.product_id) return l;
                const avail = stockMap[l.product_id] || 0;
                const qty = Number(l.quantity || 0);
                return {
                  ...l,
                  available_qty: avail,
                  stock_status: qty <= 0 ? null
                    : avail >= qty ? 'available'
                    : avail > 0 ? 'partial' : 'unavailable',
                };
              }));
            }).catch(err => {
              console.error('Error refreshing stock for new company:', err);
            });
          }
        }
        break;
      case 'product':
        if (editingLineIndex !== null) {
          const updatedLines = [...lines];
          updatedLines[editingLineIndex] = {
            ...updatedLines[editingLineIndex],
            product_id: item.id,
            product_name: item.label,
            uom_id: item.uom_id,
            uom_name: item.uom_name,
            unit_price: item.standard_price || 0,
            available_qty: null,
            stock_status: null,
          };
          setLines(updatedLines);
          // Fetch stock availability from source company
          if (destinationCompany?.id && item.id) {
            fetchProductStockOdoo([item.id], destinationCompany.id).then(stockMap => {
              const qty = stockMap[item.id] || 0;
              setLines(prev => {
                const copy = [...prev];
                if (copy[editingLineIndex]?.product_id === item.id) {
                  copy[editingLineIndex] = {
                    ...copy[editingLineIndex],
                    available_qty: qty,
                    stock_status: qty >= Number(copy[editingLineIndex].quantity || 1) ? 'available'
                      : qty > 0 ? 'partial' : 'unavailable',
                  };
                }
                return copy;
              });
            });
          }
        }
        break;
    }
    setIsDropdownVisible(false);
  };

  const getDropdownItems = () => {
    switch (dropdownType) {
      case 'source_company':
      case 'destination_company':
        return companies;
      case 'product':
        return products;
      default:
        return [];
    }
  };

  const getDropdownTitle = () => {
    switch (dropdownType) {
      case 'source_company': return 'Select Requesting Company';
      case 'destination_company': return 'Select Request From';
      case 'product': return 'Select Product';
      default: return 'Select';
    }
  };

  const handleAddLine = () => {
    setLines(prev => [
      ...prev,
      {
        product_id: null,
        product_name: '',
        quantity: '1',
        uom_id: null,
        uom_name: '',
        unit_price: '0',
      },
    ]);
  };

  const handleRemoveLine = (index) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleLineFieldChange = (index, field, value) => {
    const updatedLines = [...lines];
    updatedLines[index] = { ...updatedLines[index], [field]: value };
    // Recalculate stock_status when quantity changes
    if (field === 'quantity' && updatedLines[index].available_qty != null) {
      const avail = updatedLines[index].available_qty;
      const qty = Number(value || 0);
      updatedLines[index].stock_status = qty <= 0 ? null
        : avail >= qty ? 'available'
        : avail > 0 ? 'partial' : 'unavailable';
    }
    setLines(updatedLines);
  };

  const validateForm = () => {
    Keyboard.dismiss();
    const newErrors = {};
    if (!sourceCompany) newErrors.source_company = 'Required';
    if (!destinationCompany) newErrors.destination_company = 'Required';
    if (sourceCompany && destinationCompany && sourceCompany.id === destinationCompany.id) {
      newErrors.destination_company = 'Must differ from source';
    }
    if (lines.length === 0) {
      showToastMessage('Please add at least one product line');
      return false;
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].product_id) {
        showToastMessage(`Please select a product for line ${i + 1}`);
        return false;
      }
      if (!lines[i].quantity || Number(lines[i].quantity) <= 0) {
        showToastMessage(`Quantity must be positive for line ${i + 1}`);
        return false;
      }
      if (!lines[i].uom_id) {
        showToastMessage(`No UOM found for product in line ${i + 1}. Please re-select the product.`);
        return false;
      }
    }
    if (!signatureBase64) {
      showToastMessage('Please provide your signature before sending');
      return false;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    // Synchronous guard - prevents double tap (setState is async)
    if (submittingRef.current) return;
    if (!validateForm()) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const data = {
        requesting_company_id: sourceCompany.id,
        source_company_id: destinationCompany.id,
        note: note || '',
        requester_signature: signatureBase64 || '',
        lines: lines.map(l => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          uom_id: l.uom_id,
          unit_price: Number(l.unit_price || 0),
        })),
      };

      await createStockTransferOdoo(data);
      showToastMessage('Stock Request sent successfully');
      navigation.goBack();
    } catch (error) {
      console.error('Error creating stock request:', error);
      const msg = error?.message || 'Failed to create stock request';
      showToastMessage(msg.length > 120 ? msg.substring(0, 120) + '...' : msg);
      Alert.alert('Error', msg);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const computeTotal = () => {
    return lines.reduce((sum, l) => {
      return sum + (Number(l.quantity || 0) * Number(l.unit_price || 0));
    }, 0).toFixed(2);
  };

  const getStatusColor = (status) => {
    if (status === 'available') return '#198754';
    if (status === 'partial') return '#fd7e14';
    return '#dc3545';
  };

  const getStatusBg = (status) => {
    if (status === 'available') return '#d1e7dd';
    if (status === 'partial') return '#fff3cd';
    return '#f8d7da';
  };

  const getStatusLabel = (status) => {
    if (status === 'available') return 'Available';
    if (status === 'partial') return 'Partial';
    return 'Unavailable';
  };

  const renderLine = (line, index) => (
    <View key={index} style={styles.lineCard}>
      {/* Product select + delete */}
      <View style={styles.lineRow}>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => openDropdown('product', index)}>
          <Text style={styles.productText} numberOfLines={1}>
            {line.product_name || 'Tap to select product'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleRemoveLine(index)}>
          <AntDesign name="close" size={16} color="#999" />
        </TouchableOpacity>
      </View>

      {line.product_id && (
        <>
          {/* Info row: UoM + Available + Status */}
          <View style={styles.lineInfoRow}>
            {line.uom_name ? <Text style={styles.infoText}>{line.uom_name}</Text> : null}
            <Text style={styles.infoText}>  |  Avail: <Text style={{ color: line.stock_status ? getStatusColor(line.stock_status) : '#212529', fontFamily: FONT_FAMILY.urbanistBold }}>{line.available_qty != null ? line.available_qty : '—'}</Text></Text>
            {line.stock_status && (
              <Text style={[styles.infoText, { color: getStatusColor(line.stock_status), fontFamily: FONT_FAMILY.urbanistBold }]}>
                {'  '}({getStatusLabel(line.stock_status)})
              </Text>
            )}
          </View>

          {/* Qty + Price row */}
          <View style={styles.lineFieldsRow}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Qty</Text>
              <TextInput
                style={styles.fieldInput}
                keyboardType="numeric"
                value={String(line.quantity)}
                onChangeText={(val) => handleLineFieldChange(index, 'quantity', val)}
                selectTextOnFocus
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Price</Text>
              <Text style={styles.fieldValue}>{Number(line.unit_price || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Subtotal</Text>
              <Text style={[styles.fieldValue, { fontFamily: FONT_FAMILY.urbanistBold }]}>
                {(Number(line.quantity || 0) * Number(line.unit_price || 0)).toFixed(2)}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader
        title="New Stock Request"
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      <RoundedScrollContainer scrollEnabled={scrollEnabled}>
        <FormInput
          label="Requesting Company"
          placeholder="Select Requesting Company"
          dropIcon="menu-down"
          editable={false}
          value={sourceCompany?.label || sourceCompany?.name || ''}
          validate={errors.source_company}
          required
          onPress={() => openDropdown('source_company')}
        />
        <FormInput
          label="Request From"
          placeholder="Select Request From"
          dropIcon="menu-down"
          editable={false}
          value={destinationCompany?.label || destinationCompany?.name || ''}
          validate={errors.destination_company}
          required
          onPress={() => openDropdown('destination_company')}
        />
        <FormInput
          label="Notes"
          placeholder="Enter notes (optional)"
          value={note}
          onChangeText={setNote}
          multiline
        />

        {/* Transfer Lines */}
        <TitleWithButton
          label="Add Product Line"
          onPress={handleAddLine}
        />
        {lines.map((line, index) => renderLine(line, index))}

        {lines.length > 0 && (
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total Value: </Text>
            <Text style={styles.totalValue}>{computeTotal()}</Text>
          </View>
        )}

        {/* Signature Section */}
        <View
          style={styles.signatureSection}
          onStartShouldSetResponder={() => {
            // Re-enable scroll when user taps signature section area (not canvas)
            if (!scrollEnabled) setScrollEnabled(true);
            return false;
          }}
        >
          <Text style={styles.signatureSectionTitle}>YOUR SIGNATURE (REQUIRED TO SEND)</Text>
          <SignaturePad
            setScrollEnabled={setScrollEnabled}
            setUrl={setSignatureUrl}
            title="Signature"
            previousSignature={signatureUrl || ''}
            onSignatureBase64={(sig) => setSignatureBase64(sig)}
          />
        </View>

        <View
          onStartShouldSetResponder={() => {
            if (!scrollEnabled) setScrollEnabled(true);
            return false;
          }}
        >
          <LoadingButton
            title="SIGN & SEND REQUEST"
            onPress={() => {
              setScrollEnabled(true);
              handleSubmit();
            }}
            marginTop={10}
            loading={isSubmitting}
          />
        </View>
        <View style={{ height: 40 }} />

        <DropdownSheet
          isVisible={isDropdownVisible}
          items={getDropdownItems()}
          title={getDropdownTitle()}
          onClose={() => setIsDropdownVisible(false)}
          onValueChange={handleDropdownSelect}
          search={dropdownType === 'product'}
        />
      </RoundedScrollContainer>
      <OverlayLoader visible={isLoading || isSubmitting} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  lineCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  lineInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  infoText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#6c757d',
  },
  lineFieldsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 12,
  },
  fieldGroup: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#212529',
  },
  fieldInput: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#212529',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 10,
    padding: 10,
    backgroundColor: '#e9ecef',
    borderRadius: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#212529',
  },
  totalValue: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  signatureSection: {
    marginTop: 20,
    borderTopWidth: 2,
    borderTopColor: COLORS.primaryThemeColor,
    paddingTop: 12,
  },
  signatureSectionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
});

export default StockTransferForm;
