import React, { useEffect, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { NavigationHeader } from "@components/Header";
import { useDataFetching } from '@hooks';
import { fetchCategoriesOdoo } from "@api/services/generalApi";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import { CategoryList } from "@components/Categories";
import { EmptyItem, EmptyState } from "@components/common/empty";
import { FlashList } from "@shopify/flash-list";
import { formatData } from '@utils/formatters';
import { COLORS } from '@constants/theme';

const NUM_COLUMNS = 3;

const CategoriesScreen = ({ navigation }) => {
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchCategoriesOdoo);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLoadMore = () => {
    fetchMoreData();
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return (
      <CategoryList
        item={item}
        onPress={() => navigation.navigate("Products", { id: item._id })}
      />
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Categories" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        {data.length === 0 && !loading ? (
          <EmptyState
            imageSource={require("@assets/images/EmptyData/empty_data.png")}
            message="No categories available"
          />
        ) : (
          <FlashList
            data={formatData(data, NUM_COLUMNS)}
            numColumns={NUM_COLUMNS}
            renderItem={renderItem}
            keyExtractor={(item, index) => item._id?.toString() || index.toString()}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.2}
            contentContainerStyle={{ padding: 8, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={loading && <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />}
            estimatedItemSize={120}
          />
        )}
      </RoundedContainer>
    </SafeAreaView>
  );
};

export default CategoriesScreen;
