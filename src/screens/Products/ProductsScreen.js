import React, { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet, Alert, Image, TextInput as RNTextInput } from 'react-native';
import Modal from 'react-native-modal';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { NavigationHeader } from '@components/Header';
import OfflineBanner from '@components/common/OfflineBanner';
import { ProductsList } from '@components/Product';
import { fetchProductsOdoo, fetchProductByBarcodeOdoo, fetchPosCategoriesOdoo, updatePosCategoryOdoo } from '@api/services/generalApi';
import { isOnline } from '@utils/networkStatus';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import prodStyles from './styles';
import { EmptyState } from '@components/common/empty';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import { showToastMessage } from '@components/Toast';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';

const ODOO_COLORS = [
  '#FFFFFF', '#F06050', '#F4A460', '#F7CD1F', '#6CC1ED', '#814968',
  '#EB7E7F', '#2C8397', '#475577', '#D6145F', '#30C381', '#9365B8',
];

const ProductsScreen = ({ navigation, route }) => {
  const { fromCustomerDetails } = route.params || {};
  const initialPosCategoryId = route?.params?.posCategoryId || '';
  const initialCategorySource = route?.params?.categorySource || null;
  const categoryId = route?.params?.id || '';
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(initialPosCategoryId);
  const [selectedCategorySource, setSelectedCategorySource] = useState(initialCategorySource);

  // Edit-category modal state
  const [isEditCatVisible, setIsEditCatVisible] = useState(false);
  const [editCatName, setEditCatName] = useState('');
  const [editCatColor, setEditCatColor] = useState(0);
  const [editCatImage, setEditCatImage] = useState(null);
  const [editCatImageUri, setEditCatImageUri] = useState(null);
  const [savingCat, setSavingCat] = useState(false);

  // Load POS categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await fetchPosCategoriesOdoo();
        setCategories(cats || []);
      } catch (e) { /* ignore */ }
    };
    loadCategories();
  }, []);

  // Build fetch params that route the selected category to the correct field
  const buildParams = (extra = {}) => {
    const base = { searchText: extra.searchText ?? searchText, ...extra };
    if (selectedCategory) {
      if (selectedCategorySource === 'pos.category') {
        base.posCategoryId = selectedCategory;
      } else {
        base.categoryId = selectedCategory;
      }
    } else if (categoryId) {
      base.categoryId = categoryId;
    }
    return base;
  };

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData(buildParams({ searchText: text })),
    500
  );

  useFocusEffect(
    useCallback(() => {
      fetchData(buildParams());
    }, [searchText, selectedCategory, selectedCategorySource])
  );

  useEffect(() => {
    if (isFocused) fetchData(buildParams());
  }, [isFocused, searchText, selectedCategory, selectedCategorySource]);

  const handleCategoryPress = (catId) => {
    setSelectedCategory(catId);
    // Find the source for this category to know which Odoo field to filter on
    const cat = (categories || []).find(c => (c._id || c.id) === catId);
    const src = cat?._source || 'product.category';
    console.log('[ProductsScreen] Category tapped:', catId, 'source:', src, 'cat:', cat?.name);
    setSelectedCategorySource(src);
  };

  const openEditCategory = () => {
    const cat = (categories || []).find(c => (c._id || c.id) === selectedCategory);
    if (!cat) return;
    setEditCatName(cat.name || '');
    setEditCatColor(cat.color ?? 0);
    setEditCatImage(cat.image_base64 || null);
    setEditCatImageUri(cat.image_url || null);
    setIsEditCatVisible(true);
  };

const pickEditCatImage = async () => {
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
        const resized = await manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 128, height: 128 } }],
          { compress: 0.8, format: SaveFormat.PNG, base64: true }
        );
        setEditCatImageUri(resized.uri);
        setEditCatImage(resized.base64);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const saveEditCategory = async () => {
    const name = editCatName.trim();
    if (!name) return;
    setSavingCat(true);
    try {
      const result = await updatePosCategoryOdoo(selectedCategory, {
        name,
        color: editCatColor,
        image: editCatImage,
      });
      if (result?.offline) {
        showToastMessage('Category saved offline. Will sync when online.');
      } else {
        showToastMessage('Category updated successfully');
      }
      setIsEditCatVisible(false);
      // Refresh the category list and products under this category
      const cats = await fetchPosCategoriesOdoo();
      setCategories(cats || []);
      fetchData(buildParams());
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to update category');
    } finally {
      setSavingCat(false);
    }
  };

  const handleLoadMore = () => {
    fetchMoreData(buildParams());
  };

  const handleScan = async (code) => {
    try {
      const products = await fetchProductByBarcodeOdoo(code);
      if (products && products.length > 0) {
        navigation.navigate('ProductDetail', { detail: products[0], fromCustomerDetails });
      } else {
        showToastMessage('No Products found for this Barcode');
      }
    } catch (error) {
      showToastMessage(`Error fetching product: ${error.message}`);
    }
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <View style={[prodStyles.itemStyle, prodStyles.itemInvisible]} />;
    }
    return (
      <ProductsList
        item={item}
        onPress={() =>
          navigation.navigate('ProductDetail', { detail: item, fromCustomerDetails })
        }
      />
    );
  };

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty_data.png')} message={''} />
  );

  const renderContent = () => (
    <FlashList
      data={formatData(data, 3)}
      numColumns={3}
      renderItem={renderItem}
      keyExtractor={(item, index) => index.toString()}
      contentContainerStyle={{ padding: 8, paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      estimatedItemSize={180}
    />
  );

  const renderProducts = () => {
    if (data.length === 0 && !loading) return renderEmptyState();
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Products" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — showing cached products" />
      <SearchContainer
        placeholder="Search Products"
        onChangeText={handleSearchTextChange}
        value={searchText}
        rightIcon={
          <TouchableOpacity onPress={() => navigation.navigate('Scanner')} style={{ paddingRight: 8 }}>
            <MaterialCommunityIcons name="barcode-scan" size={22} color={COLORS.primaryThemeColor} />
          </TouchableOpacity>
        }
      />
      {/* POS Category Filter */}
      {categories.length > 0 && (
        <View style={s.categoryBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryScroll} style={{ flex: 1 }}>
            <TouchableOpacity
              style={[s.categoryChip, !selectedCategory && s.categoryChipActive]}
              onPress={() => handleCategoryPress('')}
            >
              <Text style={[s.categoryText, !selectedCategory && s.categoryTextActive]}>All</Text>
            </TouchableOpacity>
            {categories.map((cat) => {
              const isActive = selectedCategory === cat._id;
              const catColor = ODOO_COLORS[cat.color] || null;
              const hasColor = cat.color > 0 && catColor;
              return (
                <TouchableOpacity
                  key={cat._id}
                  style={[
                    s.categoryChip,
                    hasColor && { backgroundColor: catColor, borderColor: catColor },
                    isActive && !hasColor && s.categoryChipActive,
                    isActive && hasColor && { borderColor: '#333', borderWidth: 2.5 },
                  ]}
                  onPress={() => handleCategoryPress(cat._id)}
                >
                  <Text style={[
                    s.categoryText,
                    hasColor && { color: '#fff' },
                    isActive && s.categoryTextActive,
                  ]}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {selectedCategory ? (
            <TouchableOpacity onPress={openEditCategory} style={s.editBtn}>
              <MaterialIcons name="edit" size={20} color={COLORS.primaryThemeColor} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}
      <RoundedContainer>
        {renderProducts()}
      </RoundedContainer>

      {/* Edit Category Modal */}
      <Modal
        isVisible={isEditCatVisible}
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.4}
        onBackdropPress={() => setIsEditCatVisible(false)}
        onBackButtonPress={() => setIsEditCatVisible(false)}
        style={{ margin: 24, justifyContent: 'center' }}
      >
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
          <Text style={{ fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: '#222', marginBottom: 16 }}>
            Edit Category
          </Text>

          <Text style={s.catFormLabel}>Category Name *</Text>
          <RNTextInput
            style={s.catFormInput}
            placeholder="e.g. Soft Drinks"
            placeholderTextColor="#aaa"
            value={editCatName}
            onChangeText={setEditCatName}
          />

          <Text style={s.catFormLabel}>Color</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {ODOO_COLORS.map((hex, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => setEditCatColor(idx)}
                style={{
                  width: 32, height: 32, borderRadius: 16, backgroundColor: hex,
                  borderWidth: idx === 0 ? 1.5 : (editCatColor === idx ? 3 : 0),
                  borderColor: idx === 0 ? '#ccc' : '#333',
                  justifyContent: 'center', alignItems: 'center',
                }}
              >
                {editCatColor === idx && (
                  <MaterialIcons name="check" size={18} color={idx === 0 ? '#333' : '#fff'} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.catFormLabel}>Image</Text>
          <View style={{ marginBottom: 16 }}>
            {editCatImageUri ? (
              <View>
                <Image source={{ uri: editCatImageUri }} style={{ width: 90, height: 90, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' }} />
                <View style={{ flexDirection: 'row', justifyContent: 'center', width: 90, marginTop: 4, gap: 8 }}>
                  <TouchableOpacity onPress={pickEditCatImage} style={{ padding: 4 }}>
                    <MaterialIcons name="edit" size={20} color={COLORS.primaryThemeColor} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditCatImage(null); setEditCatImageUri(null); }} style={{ padding: 4 }}>
                    <MaterialIcons name="delete" size={20} color="#F44336" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickEditCatImage}
                style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed' }}
              >
                <MaterialIcons name="add-a-photo" size={28} color="#aaa" />
                <Text style={{ fontSize: 10, color: '#aaa', marginTop: 4, fontFamily: FONT_FAMILY.urbanistMedium }}>Add Image</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
            <TouchableOpacity onPress={() => setIsEditCatVisible(false)} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#999' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveEditCategory}
              disabled={savingCat || !editCatName.trim()}
              style={{
                paddingHorizontal: 20, paddingVertical: 10,
                backgroundColor: COLORS.primaryThemeColor, borderRadius: 10,
                opacity: editCatName.trim() ? 1 : 0.5,
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' }}>
                {savingCat ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  categoryBar: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  catFormLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#555',
    marginBottom: 4,
    marginTop: 8,
  },
  catFormInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistRegular,
    color: '#333',
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categoryChipActive: {
    backgroundColor: COLORS.primaryThemeColor,
    borderColor: COLORS.primaryThemeColor,
  },
  categoryText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#555',
  },
  categoryTextActive: {
    color: '#fff',
  },
});

export default ProductsScreen;
