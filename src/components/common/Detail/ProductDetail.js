import React, { useState, useEffect } from 'react';
import { View, Image, TouchableOpacity, Modal, StyleSheet, Dimensions, ActivityIndicator, Platform } from 'react-native';
import Text from '@components/Text';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchInventoryDetailsByName, fetchProductDetails } from '@api/details/detailApi';
import { fetchProductDetailsOdoo } from '@api/services/generalApi';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { OverlayLoader } from '@components/Loader';
import { CustomListModal, EmployeeListModal } from '@components/Modal';
import { reasons } from '@constants/dropdownConst';
import { fetchEmployeesDropdown } from '@api/dropdowns/dropdownApi';
import { Button } from '../Button';
import { useProductStore } from '@stores/product';
import { useCurrencyStore } from '@stores/currency';
import { MaterialIcons } from '@expo/vector-icons';

const ProductDetail = ({ navigation, route }) => {
  const { detail = {}, fromCustomerDetails = {} } = route?.params || {};
  const [details, setDetails] = useState(detail || {});
  const [loading, setLoading] = useState(false);
  const [getDetail, setGetDetail] = useState(null);
  const [isVisibleCustomListModal, setIsVisibleCustomListModal] = useState(false);
  const [isVisibleEmployeeListModal, setIsVisibleEmployeeListModal] = useState(false);
  const [employee, setEmployee] = useState([]);
  const currentUser = useAuthStore(state => state.user);
  const currency = useCurrencyStore((state) => state.currency);
  const addProductStore = useProductStore((state) => state.addProduct);

  const isResponsibleOrEmployee = (inventoryDetails) => {
    const responsiblePersonId = inventoryDetails?.responsible_person?._id;
    const employeeIds = inventoryDetails?.employees?.map((e) => e._id) || [];
    const tempAssigneeIds = inventoryDetails?.temp_assignee?.map((t) => t._id) || [];
    return (
      currentUser &&
      (currentUser.related_profile._id === responsiblePersonId ||
        employeeIds.includes(currentUser.related_profile._id) ||
        tempAssigneeIds.includes(currentUser.related_profile._id))
    );
  };

  const isOdooProduct = !!detail.id && !detail._id;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const employeeDropdown = await fetchEmployeesDropdown();
        const extract = employeeDropdown.map((e) => ({ id: e._id, label: e.name }));
        setEmployee(extract);
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };
    fetchData();
  }, []);

  const handleBoxOpeningRequest = (value) => {
    if (value) {
      navigation.navigate("InventoryForm", { reason: value, inventoryDetails: getDetail });
    }
  };

  const handleSelectTemporaryAssignee = (value) => {};

  const productDetails = async () => {
    try {
      const productId = detail?._id;
      if (!productId) return;
      const response = await fetchProductDetails(productId);
      setDetails(response[0] || {});
    } catch (e) {
      console.error("Error fetching product details:", e);
    }
  };

  useEffect(() => {
    if (isOdooProduct) {
      const loadOdooDetails = async () => {
        setLoading(true);
        try {
          const od = await fetchProductDetailsOdoo(detail.id);
          setDetails({
            ...detail,
            id: detail.id,
            product_name: od?.product_name || detail.product_name || detail.name,
            image_url: od?.image_url || detail.image_url,
            cost: od?.price ?? detail.price ?? 0,
            sale_price: od?.price ?? detail.price ?? 0,
            minimal_sales_price: od?.minimal_sales_price ?? null,
            inventory_ledgers: od?.inventory_ledgers || [],
            total_product_quantity: od?.total_product_quantity ?? 0,
            inventory_box_products_details: od?.inventory_box_products_details || [],
            product_code: od?.product_code || detail.code || detail.default_code || null,
            barcode: od?.barcode || detail.barcode || '',
            uom: od?.uom || detail.uom || null,
            categ_id: od?.categ_id || (detail.categ_id && Array.isArray(detail.categ_id) ? detail.categ_id : null),
            product_description: od?.product_description || '',
          });
        } catch (e) {
          console.error('Error loading Odoo product details:', e);
          setDetails({
            ...detail,
            id: detail.id,
            product_name: detail.product_name || detail.name,
            image_url: detail.image_url,
            cost: detail.price ?? 0,
            sale_price: detail.price ?? 0,
            minimal_sales_price: null,
            inventory_ledgers: [],
            total_product_quantity: 0,
            uom: detail.uom || null,
          });
        } finally {
          setLoading(false);
        }
      };
      loadOdooDetails();
    } else if (detail?._id) {
      productDetails();
    } else {
      setDetails(detail || {});
    }
  }, [detail, isOdooProduct]);

  const handleBoxNamePress = async (boxName, warehouseId) => {
    setLoading(true);
    try {
      const inventoryDetails = await fetchInventoryDetailsByName(boxName, warehouseId);
      if (inventoryDetails.length > 0) {
        const d = inventoryDetails[0];
        setGetDetail(d);
        if (isResponsibleOrEmployee(d)) {
          setIsVisibleCustomListModal(true);
        } else {
          navigation.navigate("InventoryDetails", { inventoryDetails: d });
        }
      } else {
        showToastMessage("No inventory box found for this box no");
      }
    } catch (error) {
      console.error("Error fetching inventory details by name:", error);
      showToastMessage("Error fetching inventory details");
    } finally {
      setLoading(false);
    }
  };

  const renderStockDetails = () => {
    const { inventory_ledgers = [] } = details || {};
    const filteredLedgers = inventory_ledgers.filter(
      l => l?.warehouse_name?.toLowerCase() !== 'inv adj' && l?.warehouse_name?.toLowerCase() !== 'inventory adjustment'
    );
    if (!filteredLedgers || filteredLedgers.length === 0) return null;

    return (
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Warehouse Stock</Text>
        {filteredLedgers.map((ledger, index) => (
          <View key={index} style={s.warehouseRow}>
            <View style={s.warehouseInfo}>
              <MaterialIcons name="warehouse" size={18} color={COLORS.primaryThemeColor} />
              <Text style={s.warehouseName}>{ledger?.warehouse_name || '-'}</Text>
            </View>
            <Text style={s.warehouseQty}>{ledger?.total_warehouse_quantity}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderInventoryBoxDetails = () => {
    if (details?.inventory_box_products_details?.length > 0) {
      return (
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>Inventory Boxes</Text>
          {details.inventory_box_products_details.map((boxDetail, index) => {
            const boxNames = Array.isArray(boxDetail.box_name) ? boxDetail.box_name : [(boxDetail.box_name || '-')];
            return boxNames.map((boxName, idx) => (
              <View key={`${index}-${idx}`} style={s.warehouseRow}>
                <Text style={s.warehouseName}>{boxDetail?.warehouse_name || '-'}</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={s.boxBtn}
                  onPress={() => handleBoxNamePress(boxName, boxDetail?.warehouse_id || '')}
                >
                  <Text style={s.boxBtnText}>Box: {boxName}</Text>
                </TouchableOpacity>
              </View>
            ));
          })}
        </View>
      );
    }
    return null;
  };

  const handleAddProduct = () => {
    const { getCurrentCart, addProduct, setCurrentCustomer } = useProductStore.getState();
    if (Object.keys(fromCustomerDetails).length > 0) {
      const customerId = fromCustomerDetails.id || fromCustomerDetails._id;
      if (customerId) setCurrentCustomer(customerId);
    }
    const currentProducts = getCurrentCart();
    let uomData = null;
    if (details?.uom?.uom_id) {
      uomData = details.uom;
    } else if (Array.isArray(details?.uom) && details.uom.length >= 2) {
      uomData = { uom_id: details.uom[0], uom_name: details.uom[1] };
    }
    const newProduct = {
      id: details.id ?? details._id,
      name: details.product_name || details.name,
      quantity: 1,
      price: details.cost ?? details.price ?? 0,
      imageUrl: details.image_url,
      uom: uomData,
      inventory_ledgers: details.inventory_ledgers || [],
    };
    if (!newProduct.id) { showToastMessage('Product ID missing, cannot add to cart'); return; }
    const exist = currentProducts.some((p) => p.id === newProduct.id);
    if (exist) {
      showToastMessage('Product already added');
    } else {
      addProduct(newProduct);
      if (Object.keys(fromCustomerDetails).length > 0) {
        navigation.navigate('CustomerDetails', { details: fromCustomerDetails });
      } else {
        navigation.navigate('CustomerScreen');
      }
    }
  };

  const handleAddToPosCart = () => {
    const { getCurrentCart, addProduct, setCurrentCustomer } = useProductStore.getState();
    const isSaleOrderEdit = fromCustomerDetails?.id?.toString().startsWith('__so_edit_');
    setCurrentCustomer(isSaleOrderEdit ? fromCustomerDetails.id : 'pos_guest');
    const currentProducts = getCurrentCart();
    const newProduct = {
      id: details.id ?? details._id,
      name: details.product_name || details.name,
      quantity: 1,
      price: details.cost ?? details.price ?? 0,
      imageUrl: details.image_url,
      tax_percent: details.tax_percent || 0,
    };
    if (!newProduct.id) { showToastMessage('Product ID missing, cannot add to cart'); return; }
    const exist = currentProducts.some((p) => p.id === newProduct.id);
    if (exist) {
      showToastMessage('Product already added');
    } else {
      addProduct(newProduct);
      showToastMessage(isSaleOrderEdit ? 'Added to order lines' : 'Added to POS cart');
      if (isSaleOrderEdit) { navigation.pop(2); } else { navigation.goBack(); }
    }
  };

  const [isImageModalVisible, setImageModalVisible] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);

  // Derive display values
  const categoryName = details?.category?.category_name
    || (Array.isArray(details?.categ_id) ? details.categ_id[1] : null)
    || details?.category_name
    || 'N/A';
  const priceValue = (details.cost ?? details.price ?? 0);
  const barcodeValue = details.barcode || details.product_code || details.code || details.default_code || 'N/A';
  const stockQty = details.total_product_quantity ?? 0;

  const DetailRow = ({ icon, label, value, valueColor }) => (
    <View style={s.detailRow}>
      <View style={s.detailLabelRow}>
        <MaterialIcons name={icon} size={18} color="#999" style={{ marginRight: 8 }} />
        <Text style={s.detailLabel}>{label}</Text>
      </View>
      <Text style={[s.detailValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Product Details" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        {details && Object.keys(details).length > 0 ? (
          <>
            {/* Image Card */}
            <View style={s.imageCard}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setImageModalVisible(true)}>
                <View style={s.imageContainer}>
                  {isImageLoading && (
                    <ActivityIndicator size="large" color={COLORS.primaryThemeColor} style={{ position: 'absolute' }} />
                  )}
                  <Image
                    source={
                      details.image_url
                        ? { uri: details.image_url }
                        : require('@assets/images/error/error.png')
                    }
                    style={s.productImage}
                    resizeMode="contain"
                    onLoadStart={() => setIsImageLoading(true)}
                    onLoadEnd={() => setIsImageLoading(false)}
                  />
                </View>
              </TouchableOpacity>
              <Text style={s.productName}>
                {(details.product_name || details.name || 'Product').trim()}
              </Text>
              {details.product_description ? (
                <Text style={s.productDesc}>{details.product_description}</Text>
              ) : null}
            </View>

            {/* Details Card */}
            {!route?.params?.fromPOS && (
              <View style={s.sectionCard}>
                <Text style={s.sectionTitle}>Details</Text>
                <DetailRow icon="category" label="Category" value={categoryName} />
                <DetailRow icon="attach-money" label="Price" value={`${Number(priceValue).toFixed(3)} ${currency || ''}`} valueColor={COLORS.primaryThemeColor} />
                <DetailRow icon="qr-code" label="Barcode" value={barcodeValue} />
                <DetailRow icon="inventory" label="Stock on Hand" value={String(stockQty)} valueColor={stockQty > 0 ? '#4CAF50' : '#F44336'} />
              </View>
            )}

            {route?.params?.fromPOS && (
              <View style={s.sectionCard}>
                <DetailRow icon="category" label="Category" value={categoryName} />
                <DetailRow icon="attach-money" label="Price" value={`${Number(priceValue).toFixed(3)} ${currency || ''}`} valueColor={COLORS.primaryThemeColor} />
              </View>
            )}

            {renderStockDetails()}
            {renderInventoryBoxDetails()}

            {details.alternateproduct?.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionTitle}>Alternate Products</Text>
                {details.alternateproduct.map((product) => (
                  <Text key={product._id || product.id} style={s.altProduct}>{product?.product_name}</Text>
                ))}
              </View>
            )}

            <View style={{ height: 10 }} />
            {route?.params?.fromPOS ? (
              fromCustomerDetails?.id?.toString().startsWith('__so_edit_') ? (
                <Button title={'Add to Order Lines'} onPress={handleAddToPosCart} />
              ) : (
                <Button title={'Add to POS Cart'} onPress={handleAddToPosCart} />
              )
            ) : (
              <Button title={'Add Products'} onPress={handleAddProduct} />
            )}
            <View style={{ height: 30 }} />
          </>
        ) : !loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: 16, color: '#999', textAlign: 'center' }}>
              No product details available.
            </Text>
          </View>
        ) : null}
      </RoundedScrollContainer>

      {/* Fullscreen image modal */}
      <Modal visible={isImageModalVisible} transparent={true} animationType="fade">
        <View style={s.imageModalBg}>
          <TouchableOpacity style={s.imageCloseBtn} onPress={() => setImageModalVisible(false)}>
            <MaterialIcons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Image
            source={details.image_url ? { uri: details.image_url } : require('@assets/images/error/error.png')}
            style={s.fullImage}
            resizeMode="contain"
          />
        </View>
      </Modal>

      <CustomListModal
        isVisible={isVisibleCustomListModal}
        items={reasons}
        title="Select Reason"
        onClose={() => setIsVisibleCustomListModal(false)}
        onValueChange={handleBoxOpeningRequest}
        onAdd={() => { setIsVisibleEmployeeListModal(true); setIsVisibleCustomListModal(false); }}
      />
      <EmployeeListModal
        isVisible={isVisibleEmployeeListModal}
        items={employee}
        boxId={getDetail?._id}
        title="Select Assignee"
        onClose={() => setIsVisibleEmployeeListModal(false)}
        onValueChange={handleSelectTemporaryAssignee}
      />

      {loading && <OverlayLoader visible={true} backgroundColor={true} />}
    </SafeAreaView>
  );
};

export default ProductDetail;

const { width, height } = Dimensions.get('window');

const s = StyleSheet.create({
  // Image Card
  imageCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
    }),
  },
  imageContainer: {
    width: '100%',
    height: 240,
    backgroundColor: '#f9f9f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productImage: {
    width: '80%',
    height: 220,
  },
  productName: {
    fontSize: 20,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  productDesc: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },

  // Section Card
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
    }),
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    marginBottom: 14,
  },

  // Detail Row
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  detailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailLabel: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#666',
  },
  detailValue: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    textAlign: 'right',
    flex: 1,
  },

  // Warehouse Stock
  warehouseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  warehouseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  warehouseName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
    marginLeft: 8,
  },
  warehouseQty: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },

  // Box Button
  boxBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  boxBtnText: {
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    fontSize: 14,
  },

  // Alt products
  altProduct: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#555',
    paddingVertical: 4,
  },

  // Image Modal
  imageModalBg: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  fullImage: {
    width: Math.min(width * 0.9, 900),
    height: Math.min(height * 0.65, 800),
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  imageCloseBtn: {
    position: 'absolute',
    top: 28,
    right: 18,
    zIndex: 10,
    padding: 8,
  },
});
