import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  BackHandler,
} from "react-native";
import {
  CarouselPagination,
  ImageContainer,
  Header,
  NavigationBar,
} from "@components/Home";
import { fetchPosCategoriesOdoo } from "@api/services/generalApi";
import { RoundedContainer, SafeAreaView } from "@components/containers";
import { formatData } from "@utils/formatters";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { showToastMessage } from "@components/Toast";
import { CategoryList } from "@components/Categories";
import { useLoader } from "@hooks";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { fetchProductDetailsByBarcode } from "@api/details/detailApi";
import { OverlayLoader } from "@components/Loader";
import Text from "@components/Text";

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
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress
    );
    return () => backHandler.remove();
  }, [handleBackPress]);

  useEffect(() => {
    const backPressTimer = setTimeout(() => {
      setBackPressCount(0);
    }, 2000);
    return () => clearTimeout(backPressTimer);
  }, [backPressCount]);

  useEffect(() => {
    if (backPressCount === 1) {
      showToastMessage("Press back again to exit");
    }
  }, [backPressCount]);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [])
  );

  useEffect(() => {
    if (isFocused) {
      loadCategories();
    }
  }, [isFocused]);

  const navigateToScreen = (screenName) => {
    navigation.navigate(screenName);
  };

  const [detailLoading, startLoading, stopLoading] = useLoader(false);

  const handleScan = async (code) => {
    startLoading();
    try {
      const productDetails = await fetchProductDetailsByBarcode(code);
      if (productDetails.length > 0) {
        const details = productDetails[0];
        navigation.navigate('ProductDetail', { detail: details })
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
    if (item.empty) {
      return <View style={styles.itemInvisible} />;
    }
    return (
      <CategoryList
        item={item}
        onPress={() => navigation.navigate("Products", { posCategoryId: item._id })}
      />
    );
  };

  return (
    <SafeAreaView backgroundColor={'#fff'}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Fixed top section */}
        <View>
          <Header />
          <NavigationBar
            onSearchPress={() => navigation.navigate("Products")}
            onOptionsPress={() => navigation.navigate("OptionsScreen")}
            onScannerPress={() => navigation.navigate("Scanner", { onScan: handleScan })}
          />
          <CarouselPagination />

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <ImageContainer
              source={require("@assets/images/Home/section/customer.png")}
              onPress={() => navigateToScreen("SalesOrderChoice")}
              backgroundColor="#4CAF50"
              title="Sales Order"
            />
            <ImageContainer
              source={require("@assets/images/Home/section/services.png")}
              onPress={() => navigateToScreen("ServicesScreen")}
              backgroundColor="#FF9800"
              title="Services"
            />
            <ImageContainer
              source={require("@assets/images/Home/section/inventory_management.png")}
              onPress={() => navigateToScreen("ProductCreationForm")}
              backgroundColor="#9C27B0"
              title="Add Product"
            />
          </View>

          {/* Categories Heading Bar */}
          <View style={styles.categoriesHeading}>
            <Text style={styles.categoriesHeadingText}>Categories</Text>
          </View>
        </View>

        {/* Scrollable Categories Grid */}
        <FlatList
          data={formatData(categories, 3)}
          numColumns={3}
          renderItem={renderCategoryItem}
          keyExtractor={(item, index) => item._id?.toString() || index.toString()}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        />

        {/* Fixed Version Text */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </View>

        <OverlayLoader visible={detailLoading} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  itemInvisible: {
    flex: 1,
    margin: 6,
    backgroundColor: "transparent",
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginHorizontal: 12,
    marginTop: 8,
  },
  categoriesHeading: {
    backgroundColor: COLORS.primaryThemeColor,
    marginTop: 14,
    marginHorizontal: 0,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  categoriesHeadingText: {
    fontSize: 17,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
  },
  versionContainer: {
    position: 'absolute',
    bottom: 65,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  versionText: {
    color: '#999',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
});

export default HomeScreen;
