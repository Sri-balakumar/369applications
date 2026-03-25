import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView } from '@components/containers';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchRepairProductsOdoo } from '@api/services/generalApi';

const TABS = ['Services', 'Spare Parts'];

const ProductListScreen = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState('Services');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');

  const loadData = useCallback(async (search) => {
    try {
      const type = activeTab === 'Services' ? 'service' : 'spare';
      const data = await fetchRepairProductsOdoo({ type, limit: 100, searchText: search || '' });
      setProducts(data);
    } catch (err) {
      console.error('ProductList error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadData(searchText);
  }, [activeTab]));

  const onRefresh = () => { setRefreshing(true); loadData(searchText); };

  const handleSearch = () => { setLoading(true); loadData(searchText); };

  const isSpare = activeTab === 'Spare Parts';

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader title="Products" onBackPress={() => navigation.goBack()} />

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => { setActiveTab(tab); setProducts([]); }}
          >
            <MaterialIcons
              name={tab === 'Services' ? 'miscellaneous-services' : 'settings'}
              size={16}
              color={activeTab === tab ? '#714B67' : '#999'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or code..."
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchText(''); setLoading(true); loadData(''); }}>
              <MaterialIcons name="close" size={18} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.countText}>{products.length} items</Text>
      </View>

      {loading && !refreshing ? (
        <OverlayLoader visible={true} />
      ) : (
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Table Header */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: isSpare ? 750 : 550 }}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { width: 100 }]}>Internal Ref</Text>
                <Text style={[styles.headerCell, { width: 200 }]}>Name</Text>
                <Text style={[styles.headerCell, { width: 90, textAlign: 'right' }]}>Sales Price</Text>
                <Text style={[styles.headerCell, { width: 80, textAlign: 'right' }]}>Cost</Text>
                {isSpare && (
                  <>
                    <Text style={[styles.headerCell, { width: 80, textAlign: 'right' }]}>On Hand</Text>
                    <Text style={[styles.headerCell, { width: 90, textAlign: 'right' }]}>Forecasted</Text>
                  </>
                )}
              </View>

              {/* Rows */}
              {products.length > 0 ? (
                products.map(p => (
                  <View key={p.id} style={styles.tableRow}>
                    <Text style={[styles.cell, { width: 100, color: '#714B67' }]} numberOfLines={1}>{p.default_code || '-'}</Text>
                    <Text style={[styles.cell, { width: 200 }]} numberOfLines={2}>{p.name}</Text>
                    <Text style={[styles.cell, { width: 90, textAlign: 'right' }]}>{p.list_price.toFixed(3)}</Text>
                    <Text style={[styles.cell, { width: 80, textAlign: 'right' }]}>{p.cost.toFixed(3)}</Text>
                    {isSpare && (
                      <>
                        <Text style={[styles.cell, { width: 80, textAlign: 'right', fontWeight: '600', color: p.qty_on_hand > 0 ? '#2E7D32' : '#C62828' }]}>
                          {p.qty_on_hand.toFixed(3)}
                        </Text>
                        <Text style={[styles.cell, { width: 90, textAlign: 'right', color: p.forecasted < 0 ? '#C62828' : '#333' }]}>
                          {p.forecasted.toFixed(3)}
                        </Text>
                      </>
                    )}
                  </View>
                ))
              ) : (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>No {activeTab.toLowerCase()} found</Text>
                </View>
              )}
            </View>
          </ScrollView>
          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  tabRow: {
    flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#714B67' },
  tabText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999' },
  tabTextActive: { color: '#714B67', fontFamily: FONT_FAMILY.urbanistBold },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EEE',
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5',
    borderRadius: 8, paddingHorizontal: 10, height: 38,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333', marginLeft: 6 },
  countText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginLeft: 10 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#F9F5F8', paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  headerCell: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#555' },
  tableRow: {
    flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0', backgroundColor: '#FFF',
  },
  cell: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333' },
  emptyRow: { padding: 30, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999' },
});

export default ProductListScreen;
