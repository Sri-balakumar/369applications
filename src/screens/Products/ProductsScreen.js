import React, { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { NavigationHeader } from '@components/Header';
import OfflineBanner from '@components/common/OfflineBanner';
import { ProductsList } from '@components/Product';
import { fetchProductsOdoo, fetchProductByBarcodeOdoo, fetchPosCategoriesOdoo } from '@api/services/generalApi';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryScroll}>
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
        </View>
      )}
      <RoundedContainer>
        {renderProducts()}
      </RoundedContainer>
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
  },
  categoryScroll: {
    paddingHorizontal: 12,
    gap: 8,
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
