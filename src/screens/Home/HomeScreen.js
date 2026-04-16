import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  BackHandler,
  ScrollView,
} from "react-native";
import {
  CarouselPagination,
  ImageContainer,
  Header,
  NavigationBar,
} from "@components/Home";
import { fetchPosCategoriesOdoo } from "@api/services/generalApi";
import { SafeAreaView } from "@components/containers";
import { formatData } from "@utils/formatters";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { showToastMessage } from "@components/Toast";
import { CategoryList } from "@components/Categories";
import { useLoader } from "@hooks";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { fetchProductDetailsByBarcode } from "@api/details/detailApi";
import { OverlayLoader } from "@components/Loader";
import Text from "@components/Text";
import { EmptyItem } from "@components/common/empty";

const HomeScreen = ({ navigation }) => {
  const [backPressCount, setBackPressCount] = useState(0);
  const isFocused = useIsFocused();
  const [categories, setCategories] = useState([]);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await fetchPosCategoriesOdoo();
      setCategories(cats || []);
    } catch (err) {
      console.error('[HomeScreen] categories error:', err);
    }
  }, []);

  const handleBackPress = useCallback(() => {
    if (navigation.isFocused()) {
      if (backPressCount === 0) {
        setBackPressCount(1);
        return true;
      } else if (backPressCount === 1) {
        BackHandler.exitApp();
      }
    }
    return false;
  }, [backPressCount, navigation]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", handleBackPress);
    return () => backHandler.remove();
  }, [handleBackPress]);

  useEffect(() => {
    const backPressTimer = setTimeout(() => { setBackPressCount(0); }, 2000);
    return () => clearTimeout(backPressTimer);
  }, [backPressCount]);

  useEffect(() => {
    if (backPressCount === 1) showToastMessage("Press back again to exit");
  }, [backPressCount]);

  useFocusEffect(useCallback(() => { loadCategories(); }, []));

  useEffect(() => {
    if (isFocused) loadCategories();
  }, [isFocused]);

  const [detailLoading, startLoading, stopLoading] = useLoader(false);

  const handleScan = async (code) => {
    startLoading();
    try {
      const productDetails = await fetchProductDetailsByBarcode(code);
      if (productDetails.length > 0) {
        navigation.navigate('ProductDetail', { detail: productDetails[0] });
      } else {
        showToastMessage("No Products found for this Barcode");
      }
    } catch (error) {
      showToastMessage(`Error fetching inventory details ${error.message}`);
    } finally {
      stopLoading();
    }
  };

  const renderCategoryItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    return (
      <CategoryList
        item={item}
        onPress={() => navigation.navigate("Products", {
          posCategoryId: item._id,
          categorySource: item._source || 'product.category',
        })}
      />
    );
  };

  return (
    <SafeAreaView backgroundColor={'#f5f6fa'}>
      <View style={{ flex: 1, backgroundColor: '#f5f6fa' }}>
        {/* Fixed Header */}
        <Header />
        <NavigationBar
          onSearchPress={() => navigation.navigate("Products")}
          onOptionsPress={() => navigation.navigate("OptionsScreen")}
          onScannerPress={() => navigation.navigate("Scanner", { onScan: handleScan })}
        />

        {/* Scrollable Content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          {/* Banner Carousel */}
          <CarouselPagination />

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <ImageContainer
              onPress={() => navigation.navigate("SalesOrderChoice")}
              backgroundColor="#4CAF50"
              title="Sales Order"
            />
            <ImageContainer
              onPress={() => navigation.navigate("ServicesScreen")}
              backgroundColor="#FF9800"
              title="Services"
            />
            <ImageContainer
              onPress={() => navigation.navigate("ProductCreationForm")}
              backgroundColor="#9C27B0"
              title="Add Product"
            />
          </View>

          {/* Categories Section */}
          <View style={styles.categoriesSection}>
            <Text style={styles.categoriesTitle}>Categories</Text>
            <FlatList
              data={formatData(categories, 3)}
              numColumns={3}
              renderItem={renderCategoryItem}
              keyExtractor={(item, index) => item._id?.toString() || index.toString()}
              scrollEnabled={false}
              contentContainerStyle={{ paddingHorizontal: 4 }}
            />
          </View>
        </ScrollView>

        {/* Version above tab bar */}
        <View style={styles.versionContainer}>
          <Text style={styles.poweredText}>Powered by 369ai | v1.0.0</Text>
        </View>

        <OverlayLoader visible={detailLoading} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  quickActions: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  categoriesSection: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 8,
    marginTop: 8,
    minHeight: 200,
  },
  categoriesTitle: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    marginBottom: 10,
    marginLeft: 8,
  },
  versionContainer: {
    position: 'absolute',
    bottom: 68,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  poweredText: {
    color: '#aaa',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
});

export default HomeScreen;
