import React, { useState, useEffect } from 'react';
import { FlatList, View, Text as RNText } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { ListItem } from '@components/Options';
import { formatData } from '@utils/formatters';
import { EmptyItem } from '@components/common/empty';
import { fetchCustomerCategoryCounts } from '@api/services/generalApi';
import { useLoader } from '@hooks';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const CustomersPage1Screen = ({ navigation }) => {
  const [counts, setCounts] = useState({});
  const [loading, startLoading, stopLoading] = useLoader(false);

  useFocusEffect(
    React.useCallback(() => {
      loadCategoryCounts();
    }, [])
  );

  const loadCategoryCounts = async () => {
    startLoading();
    try {
      const data = await fetchCustomerCategoryCounts();
      setCounts(data);
    } catch (error) {
      console.error("Error loading category counts:", error);
    } finally {
      stopLoading();
    }
  };

  const customerOptions = [
    {
      title: 'New',
      image: require('@assets/images/Home/options/buy.png'),
      count: counts.new || 0,
      onPress: () => navigation.navigate('CustomerCategoryScreen', { category: 'new', categoryName: 'New Customers' }),
    },
    {
      title: 'Registered leads',
      image: require('@assets/images/Home/options/crm.png'),
      count: counts.registered_leads || 0,
      onPress: () => navigation.navigate('LeadsListScreen', { type: 'registered', categoryName: 'Registered Leads' }),
    },
    {
      title: 'Active Customers',
      image: require('@assets/images/Home/options/customer_visit.png'),
      count: counts.active_customers || 0,
      onPress: () => navigation.navigate('CustomersPage2Screen'),
    },
    {
      title: 'Open Leads',
      image: require('@assets/images/Home/options/task_manager.png'),
      count: counts.open_leads || 0,
      onPress: () => navigation.navigate('LeadsListScreen', { type: 'open', categoryName: 'Open Leads' }),
    },
    {
      title: 'Others',
      image: require('@assets/images/Home/options/inventory_management.png'),
      count: counts.others || 0,
      onPress: () => navigation.navigate('CustomerCategoryScreen', { category: 'others', categoryName: 'Other Customers' }),
    },
    {
      title: 'Customer Location Update',
      image: require('@assets/images/Home/options/market_study.png'),
      count: counts.customer_location_update || 0,
      onPress: () => navigation.navigate('CustomerScreen'),
    },
  ];

  const CategoryCard = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }

    return (
      <View
        style={{
          flex: 1,
          margin: 8,
        }}
      >
        <ListItem
          title={item.title}
          image={item.image}
          onPress={item.onPress}
        />
        {item.count > 0 && (
          <View
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              backgroundColor: COLORS.orange,
              borderRadius: 12,
              width: 24,
              height: 24,
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10,
            }}
          >
            <RNText
              style={{
                color: 'white',
                fontSize: 12,
                fontFamily: FONT_FAMILY.urbanistBold,
              }}
            >
              {item.count > 99 ? '99+' : item.count}
            </RNText>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Customers" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        <FlatList
          data={formatData(customerOptions, 2)}
          numColumns={2}
          renderItem={({ item }) => <CategoryCard item={item} />}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
          scrollEnabled={true}
        />
      </RoundedContainer>
    </SafeAreaView>
  );
};

export default CustomersPage1Screen;

