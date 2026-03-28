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
  fetchPosCategoriesOdoo,
  updateProductOdoo,
} from '@api/services/generalApi';

const ProductEditForm = ({ navigation, route }) => {
  const { product } = route?.params || {};
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const submittingRef = useRef(false);

  // Dropdown data
  const [categories, setCategories] = useState([]);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  // Form fields - pre-filled from product
  const [productName, setProductName] = useState(product?.product_name || product?.name || '');
  const [category, setCategory] = useState(null);
  const [salesPrice, setSalesPrice] = useState(String(product?.sale_price ?? product?.price ?? product?.list_price ?? ''));
  const [cost, setCost] = useState(String(product?.cost ?? product?.standard_price ?? ''));
  const [barcode, setBarcode] = useState(product?.barcode || '');
  const [internalRef, setInternalRef] = useState(product?.product_code || product?.code || product?.default_code || '');
  const [onHandQty] = useState(String(product?.total_product_quantity ?? product?.qty_available ?? 0));
  const [imageUri, setImageUri] = useState(product?.image_url || null);
  const [imageBase64, setImageBase64] = useState(null);

  useEffect(() => {
    fetchPosCategoriesOdoo().then((cats) => {
      const mapped = (cats || []).map(c => ({
        id: c._id || c.id,
        name: c.category_name || c.name || '',
        label: c.category_name || c.name || '',
      }));
      setCategories(mapped);
      // Try to match existing category by name
      const catName = product?.category_name
        || (Array.isArray(product?.categ_id) ? product.categ_id[1] : null);
      if (catName) {
        const match = mapped.find(c => c.name === catName);
        if (match) setCategory(match);
      }
    }).catch((e) => { console.error('[ProductEdit] Failed to load categories:', e?.message); });
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
      if (status !== 'granted') { Alert.alert('Permission Required', 'Camera permission is required.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result?.canceled || !result.assets?.[0]) return;
      setImageUri(result.assets[0].uri);
      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      setImageBase64(b64);
    } catch (err) { Alert.alert('Error', 'Failed to open camera'); }
  };

  const openGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Gallery permission is required.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result?.canceled || !result.assets?.[0]) return;
      setImageUri(result.assets[0].uri);
      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      setImageBase64(b64);
    } catch (err) { Alert.alert('Error', 'Failed to open gallery'); }
  };

  const handleDropdownSelect = (item) => {
    setCategory(item);
    if (errors.category) setErrors(prev => ({ ...prev, category: null }));
    setIsDropdownVisible(false);
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
      await updateProductOdoo(product.id, {
        name: productName.trim(),
        posCategoryId: category.id,
        listPrice: salesPrice || undefined,
        standardPrice: cost || undefined,
        barcode: barcode || undefined,
        defaultCode: internalRef || undefined,
        image: imageBase64 || undefined,
      });
      showToastMessage('Product updated successfully');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to update product');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Edit Product" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        {/* Product Image */}
        <TouchableOpacity style={styles.imagePickerContainer} onPress={handlePickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.productImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <MaterialIcons name="add-a-photo" size={32} color="#999" />
              <Text style={styles.imagePlaceholderText}>Change Image</Text>
            </View>
          )}
        </TouchableOpacity>

        <FormInput label="Product Name" placeholder="Enter product name" value={productName}
          onChangeText={(val) => { setProductName(val); if (errors.name) setErrors(prev => ({ ...prev, name: null })); }}
          validate={errors.name} required />
        <FormInput label="Category" placeholder="Select category" dropIcon="menu-down" editable={false}
          value={category?.name || ''} validate={errors.category} required onPress={() => setIsDropdownVisible(true)} />
        <FormInput label="Sales Price" placeholder="0.000" value={salesPrice} onChangeText={setSalesPrice} keyboardType="decimal-pad" />
        <FormInput label="Cost" placeholder="0.000" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
        <FormInput label="On Hand Quantity" placeholder="0" value={onHandQty} editable={false} />
        <FormInput label="Barcode" placeholder="Enter barcode" value={barcode} onChangeText={setBarcode}
          onScanPress={() => navigation.navigate('Scanner', {
            onScan: async (scannedBarcode) => { setBarcode(scannedBarcode); navigation.goBack(); }
          })} />
        <FormInput label="Internal Reference" placeholder="e.g. PROD-001" value={internalRef} onChangeText={setInternalRef} />

        <LoadingButton title="UPDATE PRODUCT" onPress={handleSubmit} marginTop={10} loading={isSubmitting} />
        <View style={{ height: 40 }} />

        <CustomListModal isVisible={isDropdownVisible} items={categories} title="Select Category"
          onClose={() => setIsDropdownVisible(false)} onValueChange={handleDropdownSelect} />
      </RoundedScrollContainer>
      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  imagePickerContainer: {
    alignSelf: 'center', marginBottom: 16, borderRadius: 12, overflow: 'hidden',
    width: 120, height: 120, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
  },
  productImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderText: { fontSize: 12, color: '#999', marginTop: 4, fontFamily: FONT_FAMILY.urbanistMedium },
});

export default ProductEditForm;
