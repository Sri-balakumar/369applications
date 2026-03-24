import React, { useCallback } from 'react';
import { FlatList, View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { FABButton } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';
import { useDataFetching } from '@hooks';
import { fetchProductEnquiriesOdoo } from '@api/services/generalApi';
import { useFocusEffect } from '@react-navigation/native';
import { formatDate } from '@utils/common/date';

const EnquiryItem = ({ item, onPress }) => (
  <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.card}>
    <View style={styles.cardRow}>
      <Text style={styles.productName} numberOfLines={2}>{item?.product_name || '-'}</Text>
      <Text style={styles.date}>{formatDate(item?.date) || '-'}</Text>
    </View>
    <View style={styles.cardRow}>
      <Text style={styles.label}>Customer: <Text style={styles.value}>{item?.customer_name || '-'}</Text></Text>
    </View>
    <View style={styles.cardRow}>
      <Text style={styles.label}>Phone: <Text style={styles.value}>{item?.customer_no || '-'}</Text></Text>
      {item?.sale_price > 0 && (
        <Text style={styles.price}>Price: {item.sale_price}</Text>
      )}
    </View>
  </TouchableOpacity>
);

const PriceEnquiryScreen = ({ navigation }) => {
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductEnquiriesOdoo);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const renderItem = ({ item }) => (
    <EnquiryItem
      item={item}
      onPress={() => {}}
    />
  );

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Product Enquiry"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer>
        {!loading && data.length === 0 ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message={'No Enquiries Yet'} />
        ) : (
          <FlatList
            data={data}
            renderItem={renderItem}
            keyExtractor={(item) => item._id?.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            onEndReached={() => fetchMoreData()}
            onEndReachedThreshold={0.3}
          />
        )}
        <FABButton onPress={() => navigation.navigate('PriceEnquiryForm')} />
        <OverlayLoader visible={loading && data.length === 0} />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 15,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: 'black', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2 },
    }),
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  productName: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 16,
    color: COLORS.black,
    flex: 1,
    marginRight: 10,
  },
  date: {
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 13,
    color: '#666666',
  },
  label: {
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 14,
    color: '#666666',
  },
  value: {
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 14,
    color: '#333333',
  },
  price: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 14,
    color: COLORS.primaryThemeColor,
  },
});

export default PriceEnquiryScreen;
