import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { FABButton } from '@components/common/Button';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { formatData } from '@utils/formatters';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AnimatedLoader from '@components/Loader/AnimatedLoader';
import MobileRepairList from './MobileRepairList';
import { fetchJobCardsListOdoo } from '@api/services/generalApi';

const MobileRepairScreen = ({ navigation }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const result = await fetchJobCardsListOdoo({ searchText: search, limit: 50 });
      setData(result || []);
    } catch (error) {
      console.error('Error fetching job cards:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData(searchText);
    }, [])
  );

  const handleSearch = () => {
    fetchData(searchText);
  };

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    return (
      <MobileRepairList
        item={item}
        onPress={() => navigation.navigate('MobileRepairDetails', { jobCardId: item.id })}
      />
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Mobile Repair"
        logo={false}
        onBackPress={() => navigation.goBack()}
        refreshIcon
        refreshPress={() => fetchData(searchText)}
      />
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#999" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ref, customer..."
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchText(''); fetchData(''); }}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <RoundedContainer>
        {loading ? (
          <View style={styles.loadingContainer}>
            <AnimatedLoader visible={true} animationSource={require('@assets/animations/loading.json')} />
          </View>
        ) : data.length === 0 ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty_data.png')} message="No job cards found" />
        ) : (
          <FlashList
            data={formatData(data, 1)}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={120}
          />
        )}
      </RoundedContainer>
      <FABButton onPress={() => navigation.navigate('MobileRepairForm')} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  searchContainer: { paddingHorizontal: 20, paddingBottom: 10 },
  searchInputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    borderRadius: 12, paddingHorizontal: 12, height: 48, elevation: 3,
  },
  searchInput: {
    flex: 1, fontFamily: FONT_FAMILY.urbanistMedium, fontSize: 15, color: '#333', paddingVertical: 0,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
});

export default MobileRepairScreen;
