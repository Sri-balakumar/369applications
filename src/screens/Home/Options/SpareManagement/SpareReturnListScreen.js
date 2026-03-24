import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { FABButton } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import {
  fetchApprovedSpareRequestsOdoo,
  fetchSpareRequestLinesOdoo,
} from '@api/services/generalApi';

const SpareReturnListScreen = ({ navigation }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const requests = await fetchApprovedSpareRequestsOdoo({ limit: 100 });

      const returnedItems = [];
      for (const req of requests) {
        if (req.line_ids && req.line_ids.length > 0) {
          try {
            const lines = await fetchSpareRequestLinesOdoo(req.line_ids);
            for (const line of lines) {
              if (line.returned_qty > 0) {
                returnedItems.push({
                  id: `${req.id}_${line.id}`,
                  request_name: req.name || '',
                  state: req.state || '',
                  product_name: line.product_name || '-',
                  issued_qty: line.issued_qty || 0,
                  returned_qty: line.returned_qty || 0,
                  partner_name: req.partner_name || '',
                });
              }
            }
          } catch (e) {
            console.warn('Failed to fetch lines for request', req.id);
          }
        }
      }
      setData(returnedItems);
    } catch (err) {
      console.error('fetchSpareReturns error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    return (
      <TouchableOpacity activeOpacity={0.8} style={styles.itemContainer}>
        <View style={styles.row}>
          <Text style={styles.head}>{item.request_name || '-'}</Text>
          <View style={[styles.badge, { backgroundColor: '#FF9800' }]}>
            <Text style={styles.badgeText}>RETURNED</Text>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.content}>Product: {item.product_name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.content}>Issued: {item.issued_qty}</Text>
          <Text style={styles.contentRight}>Returned: {item.returned_qty}</Text>
        </View>
        {item.partner_name ? <Text style={styles.subContent}>Customer: {item.partner_name}</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Spare Returns" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        {data.length === 0 && !loading ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message="No Spare Returns Found" />
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
      </RoundedContainer>
      <FABButton onPress={() => navigation.navigate('SpareReturnForm')} />
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  head: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 16, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },
  content: { color: '#666', fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold },
  contentRight: { color: '#666', fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold },
  subContent: { color: '#999', fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium },
});

export default SpareReturnListScreen;
