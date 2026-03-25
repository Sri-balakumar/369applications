import React, { useEffect, useCallback } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
import { fetchProductsOdoo, fetchProductByBarcodeOdoo } from '@api/services/generalApi';
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
import { COLORS } from '@constants/theme';

const ProductsScreen = ({ navigation, route }) => {
  const { fromCustomerDetails } = route.params || {};
  const posCategoryId = route?.params?.posCategoryId || '';
  const categoryId = route?.params?.id || '';
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, categoryId, posCategoryId }),
    500
  );

  useFocusEffect(
    useCallback(() => {
      fetchData({ searchText, categoryId, posCategoryId });
    }, [searchText, posCategoryId])
  );

  useEffect(() => {
    if (isFocused) fetchData({ searchText, categoryId, posCategoryId });
  }, [isFocused, searchText, posCategoryId]);

  const handleLoadMore = () => {
    fetchMoreData({ searchText, categoryId, posCategoryId });
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
      <RoundedContainer>
        {renderProducts()}
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default ProductsScreen;
