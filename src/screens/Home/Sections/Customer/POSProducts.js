import React, { useEffect, useCallback, useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet as RNStyleSheet } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
import { fetchProductsOdoo, fetchProductCategoriesOdoo } from '@api/services/generalApi';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import styles from './styles';
import { EmptyState } from '@components/common/empty';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import { useProductStore } from '@stores/product';
import Toast from 'react-native-toast-message';
import { Button } from '@components/common/Button';
import Text from '@components/Text';

const POSProducts = ({ navigation, route }) => {
  const { openingAmount, sessionId, fromCustomerDetails } = route?.params || {};
  const customerId = fromCustomerDetails?.id || fromCustomerDetails?._id || null;
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);
  const { addProduct, setCurrentCustomer, clearProducts } = useProductStore();

  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, categoryId: selectedCategoryId }),
    500
  );

  // Load categories once
  useEffect(() => {
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const cats = await fetchProductCategoriesOdoo();
        console.log('[POSProducts] categories loaded:', cats?.length);
        setCategories(cats || []);
      } catch (err) {
        console.error('[POSProducts] categories error:', err);
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setCurrentCustomer(customerId || 'pos_guest');
      fetchData({ searchText, categoryId: selectedCategoryId });
    }, [searchText, selectedCategoryId, customerId])
  );

  useEffect(() => {
    if (isFocused) fetchData({ searchText, categoryId: selectedCategoryId });
  }, [isFocused, searchText, selectedCategoryId]);

  const handleLoadMore = () => fetchMoreData({ searchText, categoryId: selectedCategoryId });

  const handleCategoryPress = (catId) => {
    const newId = selectedCategoryId === catId ? '' : catId;
    setSelectedCategoryId(newId);
    fetchData({ searchText, categoryId: newId });
  };

  const handleAdd = (p) => {
    const product = {
      id: p.id,
      name: p.product_name || p.name,
      price: p.price || p.list_price || 0,
      quantity: 1,
      imageUrl: p.imageUrl || p.image_url || p.image || '',
      tax_percent: p.tax_percent || 0,
    };
    addProduct(product);
    Toast.show({ type: 'success', text1: 'Added', text2: product.name });
  };

  const renderItem = ({ item }) => {
    if (item.empty) return <View style={[styles.itemStyle, styles.itemInvisible]} />;
    return (
      <ProductsList
        item={item}
        onPress={() => navigation.navigate('ProductDetail', { detail: item, fromPOS: true, fromCustomerDetails })}
        showQuickAdd
        onQuickAdd={handleAdd}
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
      <SearchContainer placeholder="Search Products" onChangeText={handleSearchTextChange} value={searchText} />

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
              const catId = cat._id || cat.id;
              const isActive = selectedCategoryId === catId;
              return (
                <TouchableOpacity
                  key={catId}
                  style={[catStyles.chip, isActive && catStyles.chipActive]}
                  onPress={() => handleCategoryPress(catId)}
                >
                  <Text style={[catStyles.chipText, isActive && catStyles.chipTextActive]} numberOfLines={1}>
                    {cat.category_name || cat.name}
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
      <View style={{ padding: 12, backgroundColor: COLORS.white }}>
        <OverlayLoader visible={loading} />
        <View style={{ marginTop: 12 }}>
          {customerId ? (
            <Button
              title="Done"
              onPress={() => navigation.goBack()}
            />
          ) : (
            <Button
              title="View Cart"
              onPress={() => navigation.navigate('POSCartSummary', {
                openingAmount,
                sessionId,
                clearCart: clearProducts
              })}
            />
          )}
        </View>
      </View>
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

export default POSProducts;
