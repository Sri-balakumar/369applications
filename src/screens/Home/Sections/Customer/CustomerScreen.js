import React, { useState, useEffect, useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { fetchCustomersOdoo } from '@api/services/generalApi';

import { useDataFetching, useDebouncedSearch } from '@hooks';
import Text from '@components/Text';
import { TouchableOpacity, ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import CustomerAvatar from '@components/common/CustomerAvatar';
import { MaterialIcons } from '@expo/vector-icons';
import ContactsSheet from '@screens/Home/Options/WhatsApp/ContactsSheet';
import OfflineBanner from '@components/common/OfflineBanner';

const CustomerScreen = ({ navigation, route }) => {
  const [showContacts, setShowContacts] = useState(false);
  const [editContactId, setEditContactId] = useState(null);
  const isFocused = useIsFocused();
  const companyId = route?.params?.companyId || null;
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchCustomersOdoo);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, companyId }),
    500
  );

  useFocusEffect(
    useCallback(() => {
      fetchData({ searchText, companyId });
    }, [searchText, companyId])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData({ searchText });
    }
  }, [isFocused, searchText]);

  const handleLoadMore = () => {
    fetchMoreData({ searchText });
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    const phone = item?.phone || item?.mobile || '';
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => {
          if (route?.params?.selectMode && typeof route.params.onSelect === 'function') {
            route.params.onSelect(item);
            navigation.goBack();
            return;
          }
          navigation.navigate('CustomerDetails', { details: item });
        }}
      >
        <CustomerAvatar imageBase64={item?.image} width={50} height={50} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {item?.name?.trim() || '-'}
          </Text>
          {phone ? (
            <View style={styles.phoneRow}>
              <MaterialIcons name="phone" size={14} color="#999" style={{ marginRight: 4 }} />
              <Text style={styles.phone}>{phone}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={(e) => {
            e.stopPropagation && e.stopPropagation();
            setEditContactId(item.id);
            setShowContacts(true);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="edit" size={18} color={COLORS.primaryThemeColor} />
        </TouchableOpacity>
        <MaterialIcons name="chevron-right" size={22} color="#ccc" />
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <EmptyState
      imageSource={require('@assets/images/EmptyData/empty_data.png')}
      message={''}
    />
  );

  const renderContent = () => (
    <FlashList
      data={formatData(data, 1)}
      numColumns={1}
      renderItem={renderItem}
      keyExtractor={(item, index) => index.toString()}
      contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      ListFooterComponent={
        loading && <ActivityIndicator size="large" color={COLORS.orange} />
      }
      estimatedItemSize={80}
    />
  );

  const renderCustomers = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Customers" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — showing cached customers" onOnline={() => fetchData({ searchText, companyId })} />
      <SearchContainer
        placeholder="Search Customers"
        onChangeText={handleSearchTextChange}
      />
      <RoundedContainer>
        <View style={{ flex: 1 }}>
          {renderCustomers()}
          <TouchableOpacity style={styles.fab} onPress={() => { setEditContactId(null); setShowContacts(true); }} activeOpacity={0.8}>
            <MaterialIcons name="person-add" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </RoundedContainer>
      <ContactsSheet visible={showContacts} onClose={() => setShowContacts(false)} initialView="form" initialContactId={editContactId} onSaved={() => fetchData({ searchText })} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 4,
    marginVertical: 5,
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 4 },
    }),
  },
  info: {
    flex: 1,
    marginLeft: 14,
  },
  name: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 15,
    color: COLORS.primaryThemeColor,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  phone: {
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 13,
    color: '#888',
  },
  editBtn: {
    padding: 8,
    marginRight: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primaryThemeColor,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 10,
  },
});

export default CustomerScreen;
