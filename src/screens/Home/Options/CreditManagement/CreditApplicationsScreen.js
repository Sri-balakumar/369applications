import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import { FABButton } from '@components/common/Button';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useCurrencyStore } from '@stores/currency';
import { fetchCreditApplicationsOdoo } from '@api/services/generalApi';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const STATE_COLORS = {
  draft: '#FF9800',
  submitted: '#2196F3',
  approved: '#4CAF50',
  rejected: '#F44336',
  expired: '#999',
  cancelled: '#F44336',
  cancel: '#F44336',
};

const CreditApplicationsScreen = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const applications = await fetchCreditApplicationsOdoo({ searchText: search, limit: 100 });
      setData(applications || []);
    } catch (err) {
      console.error('fetchCreditApplications error:', err);
      showToastMessage(err?.message || 'Failed to fetch credit applications');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(searchText); }, [fetchData]));

  const handleSearch = () => {
    fetchData(searchText);
  };

  const renderItem = ({ item }) => {
    const state = (item.state || 'draft').toLowerCase();
    const stateColor = STATE_COLORS[state] || '#999';

    return (
      <View style={styles.itemContainer}>
        <View style={styles.row}>
          <Text style={styles.head} numberOfLines={1}>{item.name || '-'}</Text>
          <View style={[styles.badge, { backgroundColor: stateColor }]}>
            <Text style={styles.badgeText}>{state.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.content} numberOfLines={1}>
            <Icon name="account" size={14} color="#888" /> {item.partner_name || '-'}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.subContent}>Credit Limit: {currencySymbol} {(item.credit_limit || 0).toFixed(3)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.subContent}>Submitted: {item.submission_date ? item.submission_date.split(' ')[0] : '-'}</Text>
          {item.credit_expiry_date ? (
            <Text style={styles.subContent}>Expires: {item.credit_expiry_date}</Text>
          ) : null}
        </View>

        {item.company_name ? (
          <View style={styles.companyRow}>
            <Icon name="domain" size={14} color="#888" />
            <Text style={styles.companyText} numberOfLines={1}>{item.company_name}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="All Applications" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or customer..."
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
            <Icon name="magnify" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {data.length === 0 && !loading ? (
          <EmptyState
            imageSource={require('@assets/images/EmptyData/empty.png')}
            message="No Credit Applications Found"
          />
        ) : (
          <FlashList
            data={data}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item) => item.id?.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={150}
          />
        )}
        <FABButton onPress={() => navigation.navigate('CreditFacilityForm')} />
        <OverlayLoader visible={loading} />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchButton: {
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 10,
    padding: 10,
    marginLeft: 8,
  },
  itemContainer: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: 'black', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2 },
    }),
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  head: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  content: {
    color: '#333',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    flex: 1,
  },
  subContent: {
    color: '#999',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  companyText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginLeft: 4,
    flex: 1,
  },
});

export default CreditApplicationsScreen;
