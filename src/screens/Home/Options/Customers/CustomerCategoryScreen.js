import React, { useEffect, useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { fetchCustomersByCategory, fetchNewCustomers } from '@api/services/generalApi';
import { useDataFetching, useDebouncedSearch } from '@hooks';
import Text from '@components/Text';
import { TouchableOpacity, ActivityIndicator, View } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { Button } from '@components/common/Button';
import CustomerAvatar from '@components/common/CustomerAvatar';

const CustomerCategoryScreen = ({ navigation, route }) => {
  const isFocused = useIsFocused();
  const { category, categoryName } = route.params || {};

  const fetchDataHandler = useCallback(
    (params) => {
      if (category === 'new') {
        return fetchNewCustomers(params);
      }
      return fetchCustomersByCategory({ ...params, category });
    },
    [category]
  );

  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchDataHandler);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text }),
    500
  );

  useFocusEffect(
    useCallback(() => {
      fetchData({ searchText });
    }, [searchText, category])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData({ searchText });
    }
  }, [isFocused, searchText, category]);

  const handleLoadMore = () => {
    fetchMoreData({ searchText });
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          navigation.navigate('CustomerDetails', { details: item });
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', margin: 5 }}>
          <CustomerAvatar imageBase64={item?.image} width={45} height={45} />
          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: FONT_FAMILY.urbanistBold,
                fontSize: 14,
                color: COLORS.primaryThemeColor,
              }}
            >
              {item?.name?.trim() || '-'}
            </Text>
            <Text
              style={{
                fontFamily: FONT_FAMILY.urbanistBold,
                fontSize: 12,
                color: COLORS.gray,
              }}
            >
              {item?.phone || item?.email || '-'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <EmptyState
      imageSource={require('@assets/images/EmptyData/empty_data.png')}
      message={`No ${categoryName || 'customers'} found`}
    />
  );

  const renderContent = () => (
    <FlashList
      data={formatData(data, 1)}
      numColumns={1}
      renderItem={renderItem}
      keyExtractor={(item, index) => index.toString()}
      contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      ListFooterComponent={
        loading && <ActivityIndicator size="large" color={COLORS.orange} />
      }
      estimatedItemSize={100}
    />
  );

  const renderCustomers = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader title={categoryName || 'Customers'} onBackPress={() => navigation.goBack()} />
      <SearchContainer
        placeholder={`Search ${categoryName || 'customers'}`}
        onChangeText={handleSearchTextChange}
      />
      <RoundedContainer>
        {renderCustomers()}
      </RoundedContainer>
    </SafeAreaView>
  );
};

export default CustomerCategoryScreen;

