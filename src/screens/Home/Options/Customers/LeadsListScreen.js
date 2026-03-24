import React, { useEffect, useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { fetchRegisteredLeads, fetchOpenLeads } from '@api/services/generalApi';
import { useDataFetching, useDebouncedSearch } from '@hooks';
import Text from '@components/Text';
import { TouchableOpacity, ActivityIndicator, View } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { Button, FABButton } from '@components/common/Button';
import CustomerAvatar from '@components/common/CustomerAvatar';

const LeadsListScreen = ({ navigation, route }) => {
  const isFocused = useIsFocused();
  const { type, categoryName } = route.params || {};

  const fetchDataHandler = useCallback(
    (params) => {
      if (type === 'registered') {
        return fetchRegisteredLeads(params);
      }
      return fetchOpenLeads(params);
    },
    [type]
  );

  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchDataHandler);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text }),
    500
  );

  useFocusEffect(
    useCallback(() => {
      fetchData({ searchText });
    }, [searchText, type])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData({ searchText });
    }
  }, [isFocused, searchText, type]);

  const handleLoadMore = () => {
    fetchMoreData({ searchText });
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => {}}>
        <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection: 'row' }}>
          <CustomerAvatar imageBase64={item?.image} width={40} height={40} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: FONT_FAMILY.urbanistBold,
                    fontSize: 14,
                    color: COLORS.primaryThemeColor,
                    marginBottom: 4,
                  }}
                >
                  {item?.name?.trim() || '-'}
                </Text>
                <Text
                  style={{
                    fontFamily: FONT_FAMILY.urbanistBold,
                    fontSize: 12,
                    color: COLORS.gray,
                    marginBottom: 2,
                  }}
                >
                  {item?.contactName || '-'}
                </Text>
                <Text
                  style={{
                    fontFamily: FONT_FAMILY.urbanistBold,
                    fontSize: 11,
                    color: COLORS.gray,
                  }}
                >
                  {item?.email || item?.phone || '-'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                {item?.expectedRevenue > 0 && (
                  <Text
                    style={{
                      fontFamily: FONT_FAMILY.urbanistBold,
                      fontSize: 13,
                      color: COLORS.green,
                      marginBottom: 4,
                    }}
                  >
                    ${item.expectedRevenue.toFixed(2)}
                  </Text>
                )}
                <Text
                  style={{
                    fontFamily: FONT_FAMILY.urbanistBold,
                    fontSize: 12,
                    color: COLORS.orange,
                    backgroundColor: '#FFF3E0',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}
                >
                  {item?.stage || 'New'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <EmptyState
      imageSource={require('@assets/images/EmptyData/empty_data.png')}
      message={`No ${categoryName || 'leads'} found`}
    />
  );

  const renderContent = () => (
    <FlashList
      data={formatData(data, 1)}
      numColumns={1}
      renderItem={renderItem}
      keyExtractor={(item, index) => index.toString()}
      contentContainerStyle={{ paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      ListFooterComponent={
        loading && <ActivityIndicator size="large" color={COLORS.orange} />
      }
      estimatedItemSize={100}
    />
  );

  const renderLeads = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader title={categoryName || 'Leads'} onBackPress={() => navigation.goBack()} />
      <SearchContainer
        placeholder={`Search ${categoryName || 'leads'}`}
        onChangeText={handleSearchTextChange}
      />
      <RoundedContainer>{renderLeads()}</RoundedContainer>
    </SafeAreaView>
  );
};

export default LeadsListScreen;

