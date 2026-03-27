import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useCurrencyStore } from '@stores/currency';
import { fetchCreditExceededOdoo } from '@api/services/generalApi';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const RISK_LEVEL_COLORS = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
};

const RISK_LEVEL_LABELS = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
};

const CreditExceededScreen = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const customers = await fetchCreditExceededOdoo({ searchText: search, limit: 200 });
      setData(customers || []);
    } catch (err) {
      console.error('fetchCreditExceeded error:', err);
      showToastMessage(err?.message || 'Failed to fetch data');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(searchText); }, [fetchData]));

  const handleSearch = () => { fetchData(searchText); };

  const renderItem = ({ item }) => {
    const riskLevel = (item.risk_level || 'low').toLowerCase();
    const riskColor = RISK_LEVEL_COLORS[riskLevel] || '#999';
    const riskLabel = RISK_LEVEL_LABELS[riskLevel] || 'Unknown';

    return (
      <View style={[styles.itemContainer, item.is_credit_hold && styles.holdBorder]}>
        {/* Name + Risk Badge */}
        <View style={styles.row}>
          <Text style={styles.head} numberOfLines={1}>{item.name || '-'}</Text>
          <View style={[styles.badge, { backgroundColor: riskColor }]}>
            <Text style={styles.badgeText}>{riskLabel}</Text>
          </View>
        </View>

        {/* Credit Info */}
        <View style={styles.row}>
          <Text style={styles.label}>Credit Limit</Text>
          <Text style={styles.value}>{currencySymbol} {(item.custom_credit_limit || 0).toFixed(3)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Current Due</Text>
          <Text style={[styles.value, { color: '#F44336' }]}>{currencySymbol} {(item.total_due || 0).toFixed(3)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Available Credit</Text>
          <Text style={[styles.value, { color: (item.available_credit || 0) < 0 ? '#F44336' : '#4CAF50' }]}>
            {currencySymbol} {(item.available_credit || 0).toFixed(3)}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Risk Score</Text>
          <Text style={[styles.value, { color: riskColor }]}>{(item.risk_score || 0).toFixed(1)}%</Text>
        </View>

        {/* Contact & Status Row */}
        <View style={styles.detailsRow}>
          {item.email ? (
            <View style={styles.contactRow}>
              <Icon name="email-outline" size={13} color="#888" />
              <Text style={styles.contactText} numberOfLines={1}>{item.email}</Text>
            </View>
          ) : null}
          {item.phone ? (
            <View style={styles.contactRow}>
              <Icon name="phone-outline" size={13} color="#888" />
              <Text style={styles.contactText}>{item.phone}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footerRow}>
          {item.country ? (
            <View style={styles.contactRow}>
              <Icon name="map-marker-outline" size={13} color="#888" />
              <Text style={styles.contactText}>{item.country}</Text>
            </View>
          ) : null}
          {item.is_credit_hold ? (
            <View style={[styles.holdBadge]}>
              <Icon name="lock" size={12} color="#fff" />
              <Text style={styles.holdText}>On Hold</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Credit Limit Exceeded" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        {/* Search */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search customer..."
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
            message="No customers with credit limits set"
          />
        ) : (
          <FlashList
            data={data}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item) => item.id?.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={200}
          />
        )}
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
  holdBorder: {
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
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
  label: {
    color: '#555',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  value: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    color: COLORS.primaryThemeColor,
  },
  detailsRow: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginLeft: 4,
  },
  holdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  holdText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginLeft: 4,
  },
});

export default CreditExceededScreen;
