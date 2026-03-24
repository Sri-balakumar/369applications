import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TabBar } from 'react-native-tab-view';
import { FABButton } from '@components/common/Button';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchAccountPaymentsOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const STATE_COLORS = {
  draft: '#FF9800',
  posted: '#4CAF50',
  sent: '#2196F3',
  reconciled: '#9C27B0',
  cancelled: '#F44336',
  canceled: '#F44336',
};

const PaymentList = ({ paymentType, navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const payments = await fetchAccountPaymentsOdoo({ paymentType, limit: 100 });
      setData(payments || []);
    } catch (err) {
      console.error('fetchPayments error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [paymentType]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
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
          <Text style={styles.content} numberOfLines={1}>{item.partner_name || '-'}</Text>
          <Text style={styles.amountText}>{currencySymbol} {item.amount?.toFixed(2) || '0.00'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.subContent}>{item.date || '-'}</Text>
          <Text style={styles.subContent}>{item.journal_name || '-'}</Text>
        </View>

        {item.ref ? (
          <Text style={styles.subContent} numberOfLines={1}>Ref: {item.ref}</Text>
        ) : null}

        {item.company_name ? (
          <View style={styles.companyRow}>
            <Icon name="domain" size={14} color="#888" />
            <Text style={styles.companyText} numberOfLines={1}>{item.company_name}</Text>
          </View>
        ) : null}

        {item.location_name ? (
          <View style={styles.locationRow}>
            <Icon name="map-marker" size={14} color={COLORS.primaryThemeColor} />
            <Text style={styles.locationText} numberOfLines={1}>{item.location_name}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <RoundedContainer>
      {data.length === 0 && !loading ? (
        <EmptyState
          imageSource={require('@assets/images/EmptyData/empty.png')}
          message={`No ${paymentType === 'inbound' ? 'Customer' : 'Vendor'} Payments Found`}
        />
      ) : (
        <FlashList
          data={formatData(data, 1)}
          numColumns={1}
          renderItem={renderItem}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={130}
        />
      )}
      <FABButton onPress={() => navigation.navigate('PaymentForm', { paymentType })} />
      <OverlayLoader visible={loading} />
    </RoundedContainer>
  );
};

const RegisterPaymentScreen = ({ navigation }) => {
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'customer', title: 'Customer' },
    { key: 'vendor', title: 'Vendor' },
  ]);

  const renderScene = ({ route }) => {
    switch (route.key) {
      case 'customer':
        return <PaymentList paymentType="inbound" navigation={navigation} />;
      case 'vendor':
        return <PaymentList paymentType="outbound" navigation={navigation} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Register Payment" onBackPress={() => navigation.goBack()} />
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        renderTabBar={props => (
          <TabBar
            {...props}
            scrollEnabled={false}
            style={{ backgroundColor: COLORS.primaryThemeColor }}
            indicatorStyle={{ backgroundColor: '#fff', height: 3 }}
            labelStyle={{ color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, textTransform: 'capitalize' }}
            pressColor={COLORS.primaryThemeColor}
          />
        )}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
      />
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
    marginRight: 8,
  },
  amountText: {
    color: COLORS.primaryThemeColor,
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.primaryThemeColor,
    marginLeft: 4,
    flex: 1,
  },
});

export default RegisterPaymentScreen;
