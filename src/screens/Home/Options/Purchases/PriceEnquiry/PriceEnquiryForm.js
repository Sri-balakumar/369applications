import { StyleSheet, View, FlatList, TouchableOpacity, Image, Keyboard } from "react-native";
import React, { useState } from "react";
import { RoundedScrollContainer, SafeAreaView } from "@components/containers";
import { NavigationHeader } from "@components/Header";
import { TextInput as FormInput } from "@components/common/TextInput";
import { LoadingButton } from "@components/common/Button";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { useAuthStore } from "@stores/auth";
import { OverlayLoader } from "@components/Loader";
import { ActionModal } from "@components/Modal";
import SignaturePad from "@components/SignaturePad";
import Text from "@components/Text";
import { AntDesign } from "@expo/vector-icons";
import { format } from "date-fns";
import { formatData } from "@utils/formatters";
import Toast from "react-native-toast-message";
import { createProductEnquiryOdoo } from "@api/services/generalApi";

const PriceEnquiryForm = ({ navigation }) => {
  const currentUser = useAuthStore((state) => state.user);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productDetails, setProductDetails] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerNo, setCustomerNo] = useState("");
  const [writingUrl, setWritingUrl] = useState("");
  const [imageUrls, setImageUrls] = useState([]);
  const [errors, setErrors] = useState({});

  const validate = () => {
    Keyboard.dismiss();
    let isValid = true;
    const newErrors = {};

    if (!productDetails.trim()) {
      newErrors.productDetails = "Product name & details is required";
      isValid = false;
    }
    if (!customerName.trim()) {
      newErrors.customerName = "Customer name is required";
      isValid = false;
    }
    if (!customerNo.trim()) {
      newErrors.customerNo = "Customer number is required";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await createProductEnquiryOdoo({
        date: format(new Date(), "yyyy-MM-dd"),
        type: "product_enquiry",
        customer_name: customerName,
        customer_no: customerNo,
        sale_price: 0,
        product_name: productDetails,
        image_url: writingUrl || false,
        attachments: imageUrls,
      });

      console.log("[PriceEnquiry] Created Odoo record:", result);

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Enquiry submitted successfully",
        position: "bottom",
      });
      navigation.goBack();
    } catch (error) {
      console.error("[PriceEnquiry] Submit error:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error?.message || "Failed to submit enquiry",
        position: "bottom",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteImage = (index) => {
    const newImageUrls = [...imageUrls];
    newImageUrls.splice(index, 1);
    setImageUrls(newImageUrls);
  };

  const renderImageItem = ({ item, index }) => {
    if (item.empty) {
      return <View style={styles.itemInvisible} />;
    }
    return (
      <View style={styles.imageContainer}>
        <Image source={{ uri: item }} style={styles.image} />
        <TouchableOpacity style={styles.deleteIconContainer} onPress={() => handleDeleteImage(index)}>
          <AntDesign name="delete" size={20} color="white" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Product Enquiry"
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      <RoundedScrollContainer scrollEnabled={scrollEnabled}>
        <FormInput
          label={"Date"}
          editable={false}
          value={format(new Date(), "yyyy-MM-dd")}
        />
        <FormInput
          label={"Product Name & Details"}
          placeholder={"Enter product name and details"}
          value={productDetails}
          onChangeText={setProductDetails}
          multiline={true}
          numberOfLines={4}
          validate={errors.productDetails}
        />

        <SignaturePad
          setScrollEnabled={setScrollEnabled}
          setUrl={setWritingUrl}
          title={"Write Here"}
        />

        <FormInput
          label={"Customer Name"}
          placeholder={"Enter customer name"}
          value={customerName}
          onChangeText={setCustomerName}
          validate={errors.customerName}
        />
        <FormInput
          label={"Customer Number"}
          placeholder={"Enter customer number"}
          value={customerNo}
          onChangeText={setCustomerNo}
          validate={errors.customerNo}
        />

        <ActionModal
          title={"Upload Image"}
          setImageUrl={(url) => setImageUrls((prev) => [...prev, url])}
        />

        {imageUrls.length > 0 && (
          <View style={styles.uploadsContainer}>
            <Text style={styles.uploadsLabel}>Uploads</Text>
            <FlatList
              data={formatData(imageUrls, 4)}
              numColumns={4}
              keyExtractor={(item, index) => index.toString()}
              contentContainerStyle={{ padding: 10 }}
              showsVerticalScrollIndicator={false}
              renderItem={renderImageItem}
            />
          </View>
        )}

        <LoadingButton
          title="SUBMIT"
          onPress={handleSubmit}
          marginTop={10}
          loading={isSubmitting}
          backgroundColor={COLORS.primaryThemeColor}
        />
      </RoundedScrollContainer>
      <OverlayLoader visible={isSubmitting} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  uploadsContainer: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: "#BBB7B7",
    backgroundColor: "white",
    marginVertical: 5,
  },
  uploadsLabel: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.black,
    paddingHorizontal: 10,
    marginTop: 5,
  },
  imageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    margin: 8,
  },
  image: {
    width: 90,
    height: 90,
    borderRadius: 8,
  },
  deleteIconContainer: {
    position: "absolute",
    top: -10,
    right: -10,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 12,
    padding: 5,
  },
  itemInvisible: {
    backgroundColor: "transparent",
    flex: 1,
    margin: 8,
  },
});

export default PriceEnquiryForm;
