import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Keyboard, TouchableOpacity, Alert, Image } from 'react-native';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { CustomListModal } from '@components/Modal';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import {
  fetchProductCategoriesOdoo,
  fetchUomsOdoo,
  fetchTaxesOdoo,
  fetchPurchaseTaxesOdoo,
  createProductOdoo,
} from '@api/services/generalApi';

const ProductCreationForm = ({ navigation }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const submittingRef = useRef(false);

  // Dropdown data
  const [categories, setCategories] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [salesTaxes, setSalesTaxes] = useState([]);
  const [purchaseTaxes, setPurchaseTaxes] = useState([]);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownType, setDropdownType] = useState(null);

  // Form fields
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState(null);
  const [salesPrice, setSalesPrice] = useState('');
  const [cost, setCost] = useState('');
  const [barcode, setBarcode] = useState('');
  const [internalRef, setInternalRef] = useState('');
  const [uom, setUom] = useState(null);
  const [salesTax, setSalesTax] = useState(null);
  const [purchaseTax, setPurchaseTax] = useState(null);
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);

  useEffect(() => {
    Promise.all([
      fetchProductCategoriesOdoo(),
      fetchUomsOdoo(),
      fetchTaxesOdoo(),
      fetchPurchaseTaxesOdoo(),
    ]).then(([cats, uomList, sTaxes, pTaxes]) => {
      setCategories((cats || []).map(c => ({ id: c.id, name: c.name || '', label: c.name || '' })));
      setUoms(uomList || []);
      setSalesTaxes((sTaxes || []).map(t => ({ id: t.id, name: t.name || '', label: t.name || '' })));
      setPurchaseTaxes((pTaxes || []).map(t => ({ id: t.id, name: t.name || '', label: t.name || '' })));
    }).catch(() => {});
  }, []);

  const handlePickImage = () => {
    Alert.alert('Select Image', 'Choose an option', [
      { text: 'Camera', onPress: () => openCamera() },
      { text: 'Gallery', onPress: () => openGallery() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result?.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      setImageUri(asset.uri);
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      setImageBase64(b64);
    } catch (err) {
      console.error('Camera error:', err);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  const openGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Gallery permission is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result?.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      setImageUri(asset.uri);
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      setImageBase64(b64);
    } catch (err) {
      console.error('Gallery error:', err);
      Alert.alert('Error', 'Failed to open gallery');
    }
  };

  const handleDropdownSelect = (item) => {
    if (dropdownType === 'category') {
      setCategory(item);
      if (errors.category) setErrors(prev => ({ ...prev, category: null }));
    } else if (dropdownType === 'uom') {
      setUom(item);
    } else if (dropdownType === 'salesTax') {
      setSalesTax(item);
    } else if (dropdownType === 'purchaseTax') {
      setPurchaseTax(item);
    }
    setIsDropdownVisible(false);
  };

  const openDropdown = (type) => {
    setDropdownType(type);
    setIsDropdownVisible(true);
  };

  const getDropdownItems = () => {
    if (dropdownType === 'category') return categories;
    if (dropdownType === 'uom') return uoms;
    if (dropdownType === 'salesTax') return salesTaxes;
    if (dropdownType === 'purchaseTax') return purchaseTaxes;
    return [];
  };

  const getDropdownTitle = () => {
    if (dropdownType === 'category') return 'Select Category';
    if (dropdownType === 'uom') return 'Select Unit of Measure';
    if (dropdownType === 'salesTax') return 'Select Sales Tax';
    if (dropdownType === 'purchaseTax') return 'Select Purchase Tax';
    return '';
  };

  const validateForm = () => {
    Keyboard.dismiss();
    const newErrors = {};
    if (!productName.trim()) newErrors.name = 'Required';
    if (!category) newErrors.category = 'Required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!validateForm()) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const productId = await createProductOdoo({
        name: productName.trim(),
        categId: category.id,
        listPrice: salesPrice || undefined,
        standardPrice: cost || undefined,
        barcode: barcode || undefined,
        defaultCode: internalRef || undefined,
        uomId: uom?.id || undefined,
        taxesId: salesTax ? [salesTax.id] : undefined,
        supplierTaxesId: purchaseTax ? [purchaseTax.id] : undefined,
        image: imageBase64 || undefined,
        descriptionSale: description || undefined,
      });
      showToastMessage('Product created successfully');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to create product');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="New Product" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        {/* Product Image */}
        <TouchableOpacity style={styles.imagePickerContainer} onPress={handlePickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.productImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <MaterialIcons name="add-a-photo" size={32} color="#999" />
              <Text style={styles.imagePlaceholderText}>Add Image</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Mandatory Fields */}
        <FormInput label="Product Name" placeholder="Enter product name" value={productName}
          onChangeText={(val) => { setProductName(val); if (errors.name) setErrors(prev => ({ ...prev, name: null })); }}
          validate={errors.name} required />
        <FormInput label="Category" placeholder="Select category" dropIcon="menu-down" editable={false}
          value={category?.name || ''} validate={errors.category} required onPress={() => openDropdown('category')} />

        {/* Optional Fields */}
        <FormInput label="Sales Price" placeholder="0.00" value={salesPrice} onChangeText={setSalesPrice} keyboardType="numeric" />
        <FormInput label="Cost" placeholder="0.00" value={cost} onChangeText={setCost} keyboardType="numeric" />
        <FormInput label="Barcode" placeholder="Enter barcode" value={barcode} onChangeText={setBarcode} />
        <FormInput label="Internal Reference" placeholder="e.g. PROD-001" value={internalRef} onChangeText={setInternalRef} />
        <FormInput label="Unit of Measure" placeholder="Select UoM" dropIcon="menu-down" editable={false}
          value={uom?.name || ''} onPress={() => openDropdown('uom')} />
        <FormInput label="Sales Tax" placeholder="Select sales tax" dropIcon="menu-down" editable={false}
          value={salesTax?.name || ''} onPress={() => openDropdown('salesTax')} />
        <FormInput label="Purchase Tax" placeholder="Select purchase tax" dropIcon="menu-down" editable={false}
          value={purchaseTax?.name || ''} onPress={() => openDropdown('purchaseTax')} />
        <FormInput label="Description" placeholder="Product description (optional)" value={description}
          onChangeText={setDescription} multiline />

        <LoadingButton title="CREATE PRODUCT" onPress={handleSubmit} marginTop={10} loading={isSubmitting} />
        <View style={{ height: 40 }} />

        <CustomListModal isVisible={isDropdownVisible} items={getDropdownItems()} title={getDropdownTitle()}
          onClose={() => setIsDropdownVisible(false)} onValueChange={handleDropdownSelect} onAddIcon={false} />
      </RoundedScrollContainer>
      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  imagePickerContainer: { alignItems: 'center', marginVertical: 12 },
  productImage: { width: 120, height: 120, borderRadius: 12, backgroundColor: '#eee' },
  imagePlaceholder: { width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginTop: 4 },
});

export default ProductCreationForm;
