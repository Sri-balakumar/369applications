import React, { useEffect, useCallback, useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet as RNStyleSheet } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
import { fetchProductsOdoo, fetchPosCategoriesOdoo } from '@api/services/generalApi';
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

const ODOO_COLORS = [
  '#FFFFFF', '#F06050', '#F4A460', '#F7CD1F', '#6CC1ED', '#814968',
  '#EB7E7F', '#2C8397', '#475577', '#D6145F', '#30C381', '#9365B8',
];

const POSProducts = ({ navigation, route }) => {
  const { openingAmount, sessionId, fromCustomerDetails } = route?.params || {};
  const customerId = fromCustomerDetails?.id || fromCustomerDetails?._id || null;
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);
  const { addProduct, setCurrentCustomer, clearProducts } = useProductStore();

  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedCategorySource, setSelectedCategorySource] = useState(null);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  const buildParams = (extra = {}) => {
    const base = { searchText: extra.searchText ?? searchText, ...extra };
    if (selectedCategoryId) {
      if (selectedCategorySource === 'pos.category') {
        base.posCategoryId = selectedCategoryId;
      } else {
        base.categoryId = selectedCategoryId;
      }
    }
    return base;
  };

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData(buildParams({ searchText: text })),
    500
  );

  // Load categories once
  useEffect(() => {
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const cats = await fetchPosCategoriesOdoo();
        console.log('[POSProducts] POS categories loaded:', cats?.length);
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
      fetchData(buildParams());
    }, [searchText, selectedCategoryId, selectedCategorySource, customerId])
  );

  useEffect(() => {
    if (isFocused) fetchData(buildParams());
  }, [isFocused, searchText, selectedCategoryId, selectedCategorySource]);

  const handleLoadMore = () => fetchMoreData(buildParams());

  const handleCategoryPress = (catId) => {
    const newId = selectedCategoryId === catId ? '' : catId;
    setSelectedCategoryId(newId);
    const cat = (categories || []).find((c) => (c._id || c.id) === catId);
    setSelectedCategorySource(cat?._source || 'product.category');
  };

  const handleAdd = (p) => {
    console.log('[POSProducts] Adding product - raw data:', JSON.stringify({ id: p.id, price: p.price, list_price: p.list_price, lst_price: p.lst_price, standard_price: p.standard_price }));
    const product = {
      id: p.id,
      name: p.product_name || p.name,
      price: p.lst_price || p.list_price || p.price || 0,
      quantity: 1,
      imageUrl: p.imageUrl || p.image_url || p.image || '',
      tax_percent: p.tax_percent || 0,
    };
    console.log('[POSProducts] Final price used:', product.price);
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
              const catColor = ODOO_COLORS[cat.color] || null;
              const hasColor = cat.color > 0 && catColor;
              return (
                <TouchableOpacity
                  key={catId}
                  style={[
                    catStyles.chip,
                    hasColor && { backgroundColor: catColor, borderColor: catColor },
                    isActive && !hasColor && catStyles.chipActive,
                    isActive && hasColor && { borderColor: '#333', borderWidth: 2.5 },
                  ]}
                  onPress={() => handleCategoryPress(catId)}
                >
                  <Text style={[
                    catStyles.chipText,
                    hasColor && { color: '#fff' },
                    isActive && catStyles.chipTextActive,
                  ]} numberOfLines={1}>
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
