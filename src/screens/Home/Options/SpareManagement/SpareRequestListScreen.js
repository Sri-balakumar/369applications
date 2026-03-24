import React, { useState, useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { FABButton } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import { fetchSparePartRequestsOdoo } from '@api/services/generalApi';
import SpareRequestList from './SpareRequestList';

const SpareRequestListScreen = ({ navigation }) => {
  const isFocused = useIsFocused();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const result = await fetchSparePartRequestsOdoo({ searchText: search });
      setData(result || []);
    } catch (err) {
      console.error('fetchSparePartRequests error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData(searchText);
    }, [])
  );

  const handleSearch = (text) => {
    setSearchText(text);
    fetchData(text);
  };

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    return (
      <SpareRequestList
        item={item}
        onPress={() => navigation.navigate('SpareRequestDetails', { id: item.id })}
      />
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Spare Parts Requests" onBackPress={() => navigation.goBack()} />
      <SearchContainer placeholder="Search requests..." onChangeText={handleSearch} />
      <RoundedContainer>
        {data.length === 0 && !loading ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message="No Spare Part Requests Found" />
        ) : (
          <FlashList
            data={formatData(data, 1)}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={120}
          />
        )}
        <FABButton onPress={() => navigation.navigate('SpareRequestForm')} />
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default SpareRequestListScreen;
