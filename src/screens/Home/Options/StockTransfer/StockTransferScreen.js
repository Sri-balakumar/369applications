import React, { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { FABButton } from '@components/common/Button';
import Text from '@components/Text';
import { fetchStockTransfersOdoo, fetchCompaniesOdoo } from '@api/services/generalApi';
import StockTransferList from './StockTransferList';
import { useDataFetching } from '@hooks';
import AnimatedLoader from '@components/Loader/AnimatedLoader';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const StockTransferScreen = ({ navigation }) => {
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchStockTransfersOdoo);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null); // null = All

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const list = await fetchCompaniesOdoo();
      setCompanies(list);
    } catch (e) {
      console.error('Error loading companies:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData(selectedCompany ? { companyId: selectedCompany.id } : {});
    }, [selectedCompany])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData(selectedCompany ? { companyId: selectedCompany.id } : {});
    }
  }, [isFocused]);

  const handleCompanySelect = (company) => {
    setSelectedCompany(company);
    fetchData(company ? { companyId: company.id } : {});
  };

  const handleLoadMore = () => {
    fetchMoreData(selectedCompany ? { companyId: selectedCompany.id } : {});
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return (
      <StockTransferList
        item={item}
        onPress={() => navigation.navigate('StockTransferDetails', { id: item._id, selectedCompanyId: selectedCompany?.id || null })}
      />
    );
  };

  const renderEmptyState = () => (
    <EmptyState
      imageSource={require('@assets/images/EmptyData/transaction_empty.png')}
      message={'No Stock Requests Found'}
    />
  );

  const renderCompanySwitcher = () => (
    <View style={styles.switcherContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherScroll}>
        <TouchableOpacity
          style={[styles.companyChip, !selectedCompany && styles.companyChipActive]}
          onPress={() => handleCompanySelect(null)}
        >
          <Text style={[styles.companyChipText, !selectedCompany && styles.companyChipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {companies.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.companyChip, selectedCompany?.id === c.id && styles.companyChipActive]}
            onPress={() => handleCompanySelect(c)}
          >
            <Text style={[styles.companyChipText, selectedCompany?.id === c.id && styles.companyChipTextActive]}>
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
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
      ListHeaderComponent={renderCompanySwitcher}
      ListFooterComponent={
        loading && (
          <AnimatedLoader
            visible={loading}
            animationSource={require('@assets/animations/loading.json')}
          />
        )
      }
      estimatedItemSize={100}
    />
  );

  const renderTransfers = () => {
    if (data.length === 0 && !loading) {
      return (
        <>
          {renderCompanySwitcher()}
          {renderEmptyState()}
        </>
      );
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Stock Transfer Request"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer>
        {renderTransfers()}
        <FABButton onPress={() => navigation.navigate('StockTransferForm', {
          selectedCompany: selectedCompany,
        })} />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  switcherContainer: {
    marginBottom: 8,
  },
  switcherScroll: {
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 8,
  },
  companyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f3f5',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  companyChipActive: {
    backgroundColor: COLORS.primaryThemeColor,
    borderColor: COLORS.primaryThemeColor,
  },
  companyChipText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#495057',
  },
  companyChipTextActive: {
    color: '#fff',
  },
});

export default StockTransferScreen;
