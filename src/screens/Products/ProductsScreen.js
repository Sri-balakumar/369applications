import React, { useEffect, useCallback, useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet as RNStyleSheet } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
import { fetchProductsOdoo, fetchProductByBarcodeOdoo, fetchProductCategoriesOdoo } from '@api/services/generalApi';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import styles from './styles';
import { EmptyState } from '@components/common/empty';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import { showToastMessage } from '@components/Toast';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';

const ProductsScreen = ({ navigation, route }) => {
  const { fromCustomerDetails } = route.params || {};
  const posCategoryId = route?.params?.posCategoryId || '';
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);

  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(route?.params?.id || '');

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, categoryId: selectedCategoryId, posCategoryId }),
    500
  );

  // Load categories once
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await fetchProductCategoriesOdoo();
        setCategories(cats || []);
      } catch (err) {
        console.error('[ProductsScreen] categories error:', err);
      }
    };
    loadCategories();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData({ searchText, categoryId: selectedCategoryId, posCategoryId });
    }, [selectedCategoryId, searchText, posCategoryId])
  );

  useEffect(() => {
    if (isFocused) fetchData({ searchText, categoryId: selectedCategoryId, posCategoryId });
  }, [isFocused, selectedCategoryId, searchText, posCategoryId]);

  const handleCategoryPress = (catId) => {
    const newId = selectedCategoryId === catId ? '' : catId;
    setSelectedCategoryId(newId);
    fetchData({ searchText, categoryId: newId, posCategoryId });
  };

  const handleLoadMore = () => {
    fetchMoreData({ searchText, categoryId: selectedCategoryId, posCategoryId });
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
      return <View style={[styles.itemStyle, styles.itemInvisible]} />;
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
      contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      estimatedItemSize={100}
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

      {/* Category Chips */}
      {categories.length > 0 && (
        <View style={catStyles.container}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={catStyles.scrollContent}
          >
            <TouchableOpacity
              style={[catStyles.chip, !selectedCategoryId && catStyles.chipActive]}
              onPress={() => handleCategoryPress('')}
            >
              <Text style={[catStyles.chipText, !selectedCategoryId && catStyles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {categories.map((cat) => {
              const isActive = selectedCategoryId === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[catStyles.chip, isActive && catStyles.chipActive]}
                  onPress={() => handleCategoryPress(cat.id)}
                >
                  <Text style={[catStyles.chipText, isActive && catStyles.chipTextActive]} numberOfLines={1}>
                    {cat.name}
                  </Text>
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

const catStyles = RNStyleSheet.create({
  container: {
    backgroundColor: '#fff',
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chipActive: {
    backgroundColor: COLORS.primaryThemeColor,
    borderColor: COLORS.primaryThemeColor,
  },
  chipText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#555',
  },
  chipTextActive: {
    color: '#fff',
  },
});

export default ProductsScreen;
