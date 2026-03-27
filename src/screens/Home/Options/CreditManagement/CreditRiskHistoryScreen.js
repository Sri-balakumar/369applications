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
import { fetchCreditRiskHistoryOdoo } from '@api/services/generalApi';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const RISK_LEVEL_COLORS = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
};

const RISK_LEVEL_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const CreditRiskHistoryScreen = ({ navigation }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const history = await fetchCreditRiskHistoryOdoo({ searchText: search, limit: 100 });
      setData(history || []);
    } catch (err) {
      console.error('fetchCreditRiskHistory error:', err);
      showToastMessage(err?.message || 'Failed to fetch risk history');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(searchText); }, [fetchData]));

  const handleSearch = () => { fetchData(searchText); };

  const renderItem = ({ item }) => {
    const oldLevel = (item.old_risk_level || '').toLowerCase();
    const newLevel = (item.new_risk_level || '').toLowerCase();
    const oldColor = RISK_LEVEL_COLORS[oldLevel] || '#999';
    const newColor = RISK_LEVEL_COLORS[newLevel] || '#999';

    return (
      <View style={styles.itemContainer}>
        {/* Customer Name */}
        <View style={styles.row}>
          <Icon name="account" size={16} color={COLORS.primaryThemeColor} />
          <Text style={styles.head} numberOfLines={1}>{item.partner_name || '-'}</Text>
        </View>

        {/* Risk Level Change */}
        <View style={styles.changeRow}>
          <View style={[styles.levelBadge, { backgroundColor: oldColor }]}>
            <Text style={styles.levelText}>{RISK_LEVEL_LABELS[oldLevel] || oldLevel || '-'}</Text>
          </View>
          <Icon name="arrow-right" size={18} color="#888" style={{ marginHorizontal: 8 }} />
          <View style={[styles.levelBadge, { backgroundColor: newColor }]}>
            <Text style={styles.levelText}>{RISK_LEVEL_LABELS[newLevel] || newLevel || '-'}</Text>
          </View>
        </View>

        {/* Risk Score Change */}
        <View style={styles.row}>
          <Text style={styles.label}>Risk Score</Text>
          <Text style={styles.scoreText}>
            {(item.old_risk_score || 0).toFixed(1)}%  →  {(item.new_risk_score || 0).toFixed(1)}%
          </Text>
        </View>

        {/* Date */}
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.dateText}>{item.change_date ? item.change_date.split(' ')[0] : '-'}</Text>
        </View>

        {/* Reason */}
        {item.reason ? (
          <View style={styles.reasonRow}>
            <Icon name="information-outline" size={14} color="#888" />
            <Text style={styles.reasonText} numberOfLines={2}>{item.reason}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Risk History" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by customer..."
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
            message="No Risk History Found"
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
    marginLeft: 6,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    paddingVertical: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  levelBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
  },
  levelText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  label: {
    color: '#555',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  scoreText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    color: COLORS.primaryThemeColor,
  },
  dateText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  reasonText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#666',
    marginLeft: 6,
    flex: 1,
    fontStyle: 'italic',
  },
});

export default CreditRiskHistoryScreen;
