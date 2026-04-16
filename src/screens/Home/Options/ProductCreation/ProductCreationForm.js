import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Keyboard, TouchableOpacity, Alert, Image, TextInput as RNTextInput } from 'react-native';
import Modal from 'react-native-modal';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import OfflineBanner from '@components/common/OfflineBanner';
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
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import {
  fetchPosCategoriesOdoo,
  fetchUomsOdoo,
  fetchTaxesOdoo,
  fetchPurchaseTaxesOdoo,
  createProductOdoo,
  createPosCategoryOdoo,
  updatePosCategoryOdoo,
} from '@api/services/generalApi';
import { isOnline } from '@utils/networkStatus';
import { useAuthStore } from '@stores/auth';

const ProductCreationForm = ({ navigation }) => {
  const user = useAuthStore((state) => state.user);
  const currentCompanyId = user?.company_id || null;
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
  const [isAddCategoryVisible, setIsAddCategoryVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCatParentId, setNewCatParentId] = useState(null);
  const [newCatColor, setNewCatColor] = useState(0);
  const [newCatImage, setNewCatImage] = useState(null);
  const [newCatImageUri, setNewCatImageUri] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isParentCatVisible, setIsParentCatVisible] = useState(false);

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
  const [onHandQty, setOnHandQty] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);

  useEffect(() => {
    Promise.all([
      fetchPosCategoriesOdoo(),
      fetchUomsOdoo(),
      fetchTaxesOdoo(),
      fetchPurchaseTaxesOdoo(),
    ]).then(([cats, uomList, sTaxes, pTaxes]) => {
      setCategories((cats || []).map(c => ({ id: c._id || c.id, _id: c._id || c.id, name: c.category_name || c.name || '', label: c.category_name || c.name || '', image_url: c.image_url, image_base64: c.image_base64, parent_id: c.parent_id, color: c.color, _source: c._source })));
      setUoms(uomList || []);
      setSalesTaxes((sTaxes || []).map(t => ({ id: t.id, name: t.name || '', label: t.name || '' })));
      setPurchaseTaxes((pTaxes || []).map(t => ({ id: t.id, name: t.name || '', label: t.name || '' })));
    }).catch(() => {});
  }, []);

  const handlePickImage = async () => {
    const online = await isOnline();
    if (!online) {
      Alert.alert(
        'You\'re Offline',
        'Can\'t add image right now. Please add the image once you\'re connected to the internet.'
      );
      return;
    }
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

  // Odoo POS category color palette (indices 0-11, matching Odoo exactly)
  const ODOO_COLORS = [
    '#FFFFFF', // 0: No color
    '#F06050', // 1: Red
    '#F4A460', // 2: Orange
    '#F7CD1F', // 3: Yellow
    '#6CC1ED', // 4: Light blue
    '#814968', // 5: Purple
    '#EB7E7F', // 6: Salmon
    '#2C8397', // 7: Teal
    '#475577', // 8: Dark blue-gray
    '#D6145F', // 9: Magenta
    '#30C381', // 10: Green
    '#9365B8', // 11: Violet
  ];

  const resetCategoryForm = () => {
    setNewCategoryName('');
    setNewCatParentId(null);
    setNewCatColor(0);
    setNewCatImage(null);
    setNewCatImageUri(null);
    setEditingCategory(null);
  };

  const openCategoryForm = (cat = null) => {
    if (cat) {
      setEditingCategory(cat);
      setNewCategoryName(cat.name || cat.label || '');
      setNewCatParentId(cat.parent_id ? (Array.isArray(cat.parent_id) ? cat.parent_id[0] : cat.parent_id) : null);
      setNewCatColor(cat.color ?? 0);
      setNewCatImageUri(cat.image_url || null);
      setNewCatImage(cat.image_base64 || null);
    } else {
      resetCategoryForm();
    }
    setIsDropdownVisible(false);
    setIsAddCategoryVisible(true);
  };

  const pickCategoryImage = async () => {
    const online = await isOnline();
    if (!online) {
      Alert.alert(
        'You\'re Offline',
        'Can\'t add image right now. Please add the image once you\'re connected to the internet.'
      );
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.5,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        // Resize to 128x128 for Odoo's image_128 field
        const resized = await manipulateAsync(
          asset.uri,
          [{ resize: { width: 128, height: 128 } }],
          { compress: 0.8, format: SaveFormat.PNG, base64: true }
        );
        console.log('[CategoryImage] Resized to 128x128, base64 length:', resized.base64?.length);
        setNewCatImageUri(resized.uri);
        setNewCatImage(resized.base64);
      }
    } catch (e) {
      console.error('[CategoryImage] Pick error:', e);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleSaveCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setIsCreatingCategory(true);
    try {
      console.log('[CategoryForm] Saving with image size:', newCatImage ? newCatImage.length : 'no image');
      const vals = { name, parentId: newCatParentId, color: newCatColor, image: newCatImage };
      let createResult;
      if (editingCategory) {
        const updateResult = await updatePosCategoryOdoo(editingCategory.id, vals);
        if (updateResult?.offline) {
          showToastMessage('Category saved offline. Will sync when online.');
        } else {
          showToastMessage('Category updated successfully');
        }
      } else {
        createResult = await createPosCategoryOdoo(vals);
        if (createResult?.offline) {
          showToastMessage('Category saved offline. Will sync when online.');
        } else {
          showToastMessage('Category created successfully');
        }
      }
      // Refresh categories — fetchPosCategoriesOdoo now returns cached list when offline
      // which already includes the just-created offline category
      const cats = await fetchPosCategoriesOdoo();
      const mapped = (cats || []).map(c => ({ id: c._id || c.id, _id: c._id || c.id, name: c.category_name || c.name || '', label: c.category_name || c.name || '', parent_id: c.parent_id, color: c.color, image_url: c.image_url, image_base64: c.image_base64, _source: c._source }));
      setCategories(mapped);
      if (!editingCategory) {
        // Prefer the offline id if we just created one offline
        const targetId = createResult?.offline ? createResult.id : null;
        const created = targetId
          ? mapped.find(c => (c._id || c.id) === targetId)
          : mapped.find(c => c.name === name);
        if (created) setCategory(created);
      }
      setIsAddCategoryVisible(false);
      resetCategoryForm();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to save category');
    } finally {
      setIsCreatingCategory(false);
    }
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
      const categoryIdToSend = category?.id || category?._id;
      const isPosCategory = category?._source === 'pos.category';
      console.log('[ProductCreate] Category:', categoryIdToSend, 'source:', category?._source);
      const productId = await createProductOdoo({
        name: productName.trim(),
        // If it's a POS category, send as posCategoryId. Otherwise send as categId.
        categId: isPosCategory ? undefined : categoryIdToSend,
        posCategoryId: isPosCategory ? categoryIdToSend : undefined,
        listPrice: salesPrice || undefined,
        standardPrice: cost || undefined,
        barcode: barcode || undefined,
        defaultCode: internalRef || undefined,
        uomId: uom?.id || undefined,
        taxesId: salesTax ? [salesTax.id] : undefined,
        supplierTaxesId: purchaseTax ? [purchaseTax.id] : undefined,
        image: imageBase64 || undefined,
        descriptionSale: description || undefined,
        onHandQty: onHandQty || undefined,
        companyId: currentCompanyId || undefined,
      });
      if (productId?.offline) {
        showToastMessage('Product saved offline. Will sync when online.');
      } else {
        showToastMessage('Product created successfully');
      }
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
      <OfflineBanner message="OFFLINE MODE — product will sync when you reconnect" />
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
        <FormInput label="Sales Price" placeholder="0.000" value={salesPrice} onChangeText={setSalesPrice} keyboardType="numeric" />
        <FormInput label="Cost" placeholder="0.000" value={cost} onChangeText={setCost} keyboardType="numeric" />
        <FormInput label="On Hand Quantity" placeholder="0" value={onHandQty} onChangeText={setOnHandQty} keyboardType="numeric" />
        <FormInput label="Barcode" placeholder="Enter barcode" value={barcode} onChangeText={setBarcode}
          onScanPress={() => navigation.navigate('Scanner', {
            onScan: async (scannedBarcode) => { setBarcode(scannedBarcode); navigation.goBack(); }
          })} />
        <FormInput label="Internal Reference" placeholder="e.g. PROD-001" value={internalRef} onChangeText={setInternalRef} />

        <LoadingButton title="CREATE PRODUCT" onPress={handleSubmit} marginTop={10} loading={isSubmitting} />
        <View style={{ height: 40 }} />

        <CustomListModal isVisible={isDropdownVisible} items={getDropdownItems()} title={getDropdownTitle()}
          onClose={() => setIsDropdownVisible(false)} onValueChange={handleDropdownSelect}
          onAddIcon={dropdownType === 'category'}
          onAdd={() => openCategoryForm(null)}
          onEdit={dropdownType === 'category' ? (item) => openCategoryForm(item) : undefined} />

        {/* Add/Edit Category Modal */}
        <Modal isVisible={isAddCategoryVisible} animationIn="zoomIn" animationOut="zoomOut"
          backdropOpacity={0.4} onBackdropPress={() => { setIsAddCategoryVisible(false); resetCategoryForm(); }}
          onBackButtonPress={() => { setIsAddCategoryVisible(false); resetCategoryForm(); }}
          style={{ margin: 24, justifyContent: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: '#222', marginBottom: 16 }}>
              {editingCategory ? 'Edit Category' : 'New Category'}
            </Text>

            {/* Category Name */}
            <Text style={catFormLabel}>Category Name *</Text>
            <RNTextInput
              style={catFormInput}
              placeholder="e.g. Soft Drinks"
              placeholderTextColor="#aaa"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              autoFocus={!editingCategory}
            />

            {/* Parent Category */}
            <Text style={catFormLabel}>Parent Category</Text>
            <TouchableOpacity style={[catFormInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => setIsParentCatVisible(true)}>
              <Text style={{ fontSize: 15, color: newCatParentId ? '#333' : '#aaa', fontFamily: FONT_FAMILY.urbanistRegular, flex: 1 }}>
                {newCatParentId ? (categories.find(c => c.id === newCatParentId)?.name || 'Selected') : 'Select parent (optional)'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={24} color="#999" />
            </TouchableOpacity>

            {/* Parent Category Dropdown Modal */}
            <CustomListModal
              isVisible={isParentCatVisible}
              items={[{ id: null, name: 'None', label: 'None' }, ...categories.filter(c => c.id !== editingCategory?.id)]}
              title="Select Parent Category"
              onClose={() => setIsParentCatVisible(false)}
              onValueChange={(item) => { setNewCatParentId(item.id); setIsParentCatVisible(false); }}
              onAddIcon={false}
            />

            {/* Color */}
            <Text style={catFormLabel}>Color</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {ODOO_COLORS.map((hex, idx) => (
                <TouchableOpacity key={idx} onPress={() => setNewCatColor(idx)}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: hex,
                    borderWidth: idx === 0 ? 1.5 : (newCatColor === idx ? 3 : 0),
                    borderColor: idx === 0 ? '#ccc' : '#333',
                    justifyContent: 'center', alignItems: 'center' }}>
                  {newCatColor === idx && (
                    <MaterialIcons name="check" size={18} color={idx === 0 ? '#333' : '#fff'} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Image */}
            <Text style={catFormLabel}>Image</Text>
            <View style={{ marginBottom: 16 }}>
              {newCatImageUri ? (
                <View>
                  <Image source={{ uri: newCatImageUri }} style={{ width: 90, height: 90, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'center', width: 90, marginTop: 4, gap: 8 }}>
                    <TouchableOpacity onPress={pickCategoryImage} style={{ padding: 4 }}>
                      <MaterialIcons name="edit" size={20} color={COLORS.primaryThemeColor} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setNewCatImage(null); setNewCatImageUri(null); }} style={{ padding: 4 }}>
                      <MaterialIcons name="delete" size={20} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={pickCategoryImage}
                  style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed' }}>
                  <MaterialIcons name="add-a-photo" size={28} color="#aaa" />
                  <Text style={{ fontSize: 10, color: '#aaa', marginTop: 4, fontFamily: FONT_FAMILY.urbanistMedium }}>Add Image</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity onPress={() => { setIsAddCategoryVisible(false); resetCategoryForm(); }}
                style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#999' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveCategory} disabled={isCreatingCategory || !newCategoryName.trim()}
                style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.primaryThemeColor, borderRadius: 10, opacity: newCategoryName.trim() ? 1 : 0.5 }}>
                <Text style={{ fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' }}>
                  {isCreatingCategory ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </RoundedScrollContainer>
      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

const catFormLabel = { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#555', marginBottom: 4, marginTop: 8 };
const catFormInput = { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, fontFamily: FONT_FAMILY.urbanistRegular, color: '#333', marginBottom: 8 };

const styles = StyleSheet.create({
  imagePickerContainer: { alignItems: 'center', marginVertical: 12 },
  productImage: { width: 120, height: 120, borderRadius: 12, backgroundColor: '#eee' },
  imagePlaceholder: { width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginTop: 4 },
});

export default ProductCreationForm;
