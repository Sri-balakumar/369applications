import React, { useState, useEffect } from 'react';
import { FlatList, View, Text as RNText, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { ListItem } from '@components/Options';
import { formatData } from '@utils/formatters';
import { EmptyItem } from '@components/common/empty';
import { fetchCustomerCategoryCounts } from '@api/services/generalApi';
import { useLoader } from '@hooks';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import axios from 'axios';
import { getOdooAuthHeaders } from '@api/config/odooConfig';
import { ODOO_BASE_URL } from '@api/config/odooConfig';
import { AntDesign } from '@expo/vector-icons';

const CustomersPage2Screen = ({ navigation }) => {
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
      const headers = await getOdooAuthHeaders();
      const response = await axios.post(
        `${ODOO_BASE_URL}/web/dataset/call_kw`,
        {
          jsonrpc: "2.0",
          method: "call",
          params: {
            model: "res.partner",
            method: "search_read",
            args: [[]],
            kwargs: {
              fields: ["id", "customer_category"],
              limit: 10000,
            },
          },
        },
        { headers }
      );

      if (!response.data.error) {
        const partners = response.data.result || [];
        const categoryCounts = {
          active_qualified: 0,
          inactive_qualified: 0,
          active_not_qualified: 0,
          inactive_not_qualified: 0,
        };

        partners.forEach((p) => {
          if (p.customer_category === 'active_qualified') {
            categoryCounts.active_qualified++;
          } else if (p.customer_category === 'inactive_qualified') {
            categoryCounts.inactive_qualified++;
          } else if (p.customer_category === 'active_not_qualified') {
            categoryCounts.active_not_qualified++;
          } else if (p.customer_category === 'inactive_not_qualified') {
            categoryCounts.inactive_not_qualified++;
          }
        });

        setCounts(categoryCounts);
      }
    } catch (error) {
      console.error("Error loading category counts:", error);
    } finally {
      stopLoading();
    }
  };

  const customerOptions = [
    {
      title: 'All Customers',
      image: require('@assets/images/Home/options/customer_visit.png'),
      count: 0,
      onPress: () => navigation.navigate('CustomerScreen'),
    },
    {
      title: 'Active Qualified',
      image: require('@assets/images/Home/options/crm.png'),
      count: counts.active_qualified || 0,
      onPress: () => navigation.navigate('CustomerCategoryScreen', { category: 'active_qualified', categoryName: 'Active Qualified Customers' }),
    },
    {
      title: 'In Active Qualified',
      image: require('@assets/images/Home/options/box_inspection.png'),
      count: counts.inactive_qualified || 0,
      onPress: () => navigation.navigate('CustomerCategoryScreen', { category: 'inactive_qualified', categoryName: 'Inactive Qualified Customers' }),
    },
    {
      title: 'Active Not Qualified',
      image: require('@assets/images/Home/options/price_enquiry.png'),
      count: counts.active_not_qualified || 0,
      onPress: () => navigation.navigate('CustomerCategoryScreen', { category: 'active_not_qualified', categoryName: 'Active Not Qualified Customers' }),
    },
    {
      title: 'InActive Not Qualified',
      image: require('@assets/images/Home/options/attendance.png'),
      count: counts.inactive_not_qualified || 0,
      onPress: () => navigation.navigate('CustomerCategoryScreen', { category: 'inactive_not_qualified', categoryName: 'Inactive Not Qualified Customers' }),
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
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.lightGray,
          backgroundColor: COLORS.white,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <AntDesign name="arrowleft" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <RNText
          style={{
            fontSize: 18,
            fontFamily: FONT_FAMILY.urbanistBold,
            color: COLORS.black,
            flex: 1,
            marginLeft: 16,
          }}
        >
          Active Customers
        </RNText>
      </View>
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

export default CustomersPage2Screen;

