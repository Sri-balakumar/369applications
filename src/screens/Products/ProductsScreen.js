import React, { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { NavigationHeader } from '@components/Header';
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

const ProductsScreen = ({ navigation, route }) => {
  const { fromCustomerDetails } = route.params || {};
  const initialPosCategoryId = route?.params?.posCategoryId || '';
  const categoryId = route?.params?.id || '';
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(initialPosCategoryId);

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

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, categoryId, posCategoryId: selectedCategory }),
    500
  );

  useFocusEffect(
    useCallback(() => {
      fetchData({ searchText, categoryId, posCategoryId: selectedCategory });
    }, [searchText, selectedCategory])
  );

  useEffect(() => {
    if (isFocused) fetchData({ searchText, categoryId, posCategoryId: selectedCategory });
  }, [isFocused, searchText, selectedCategory]);

  const handleCategoryPress = (catId) => {
    setSelectedCategory(catId);
  };

  const handleLoadMore = () => {
    fetchMoreData({ searchText, categoryId, posCategoryId: selectedCategory });
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
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat._id}
                style={[s.categoryChip, selectedCategory === cat._id && s.categoryChipActive]}
                onPress={() => handleCategoryPress(cat._id)}
              >
                <Text style={[s.categoryText, selectedCategory === cat._id && s.categoryTextActive]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
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
