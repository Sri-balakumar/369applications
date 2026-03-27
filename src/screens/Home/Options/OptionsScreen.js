import React, { useState, useEffect } from 'react';
import { FlatList } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { ListItem } from '@components/Options';
import { formatData } from '@utils/formatters';
import { EmptyItem } from '@components/common/empty';
import { COLORS } from '@constants/theme';
import { useLoader } from '@hooks';
import { fetchProductByBarcodeOdoo } from '@api/services/generalApi';
import { showToastMessage } from '@components/Toast';
import { OverlayLoader } from '@components/Loader';
import { ConfirmationModal } from '@components/Modal';
import { useAuthStore } from '@stores/auth';
import { post } from '@api/services/utils';
import ContactsSheet from '@screens/Home/Options/WhatsApp/ContactsSheet';

const OptionsScreen = ({ navigation }) => {
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
  const [loading, startLoading, stopLoading] = useLoader(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const currentUser = useAuthStore(state => state.user);

  // Check if user is admin (works for both UAE admin and Odoo login)
  // For Odoo: check is_admin field from login response
  // For UAE: check if user_name/username/login is 'admin'
  const isAdmin = currentUser?.is_admin === true ||
                  currentUser?.user_name === 'admin' ||
                  currentUser?.username === 'admin' ||
                  currentUser?.login === 'admin';

  const handleScan = async (code) => {
    startLoading();
    try {
      const products = await fetchProductByBarcodeOdoo(code);
      if (products && products.length > 0) {
        navigation.navigate('ProductDetail', { detail: products[0] });
      } else {
        showToastMessage('No Products found for this Barcode');
      }
    } catch (error) {
      showToastMessage(`Error fetching product: ${error.message}`);
    } finally {
      stopLoading();
    }
  };

  const baseOptions = [
    { title: 'Search Products', image: require('@assets/images/Home/options/search_product.png'), onPress: () => navigation.navigate('Products') },
    { title: 'Scan Barcode', image: require('@assets/images/Home/options/scan_barcode.png'), onPress: () => navigation.navigate('Scanner') },
    { title: 'Customers', image: require('@assets/images/Home/options/customer_visit.png'), onPress: () => navigation.navigate('CustomersPage1Screen') },
    { title: 'Purchases', image: require('@assets/images/Home/options/product_purchase_requisition.png'), onPress: () => navigation.navigate('PurchasesScreen') },
    { title: 'Easy Sales', image: require('@assets/images/Home/options/buy.png'), onPress: () => navigation.navigate('EasySalesListScreen') },
    { title: 'Register Payment', image: require('@assets/images/Home/options/transaction_auditing.png'), onPress: () => navigation.navigate('RegisterPaymentScreen') },
    { title: 'Vehicle Tracking', image: require('@assets/images/Home/section/pickup.png'), onPress: () => navigation.navigate('VehicleTrackingScreen') },
    { title: 'Vehicle Maintenance', image: require('@assets/images/Home/section/service.png'), onPress: () => navigation.navigate('VehicleMaintenanceScreen') },
    { title: 'Visits Plan', image: require('@assets/images/Home/options/visits_plan.png'), onPress: () => navigation.navigate('VisitsPlanScreen') },
    { title: 'Customer Visits', image: require('@assets/images/Home/options/customer_visit.png'), onPress: () => navigation.navigate('VisitScreen') },
{ title: 'Stock Transfer', image: require('@assets/images/Home/options/inventory_management_1.png'), onPress: () => navigation.navigate('StockTransferScreen') },
    { title: 'Estimate Purchase', image: require('@assets/images/Home/options/product_purchase_requisition.png'), onPress: () => navigation.navigate('EstimatePurchaseListScreen') },
    { title: 'Estimate Sale', image: require('@assets/images/Home/options/buy.png'), onPress: () => navigation.navigate('EstimateSaleListScreen') },
    { title: 'Purchase Return', image: require('@assets/images/Home/options/product_purchase_requisition.png'), onPress: () => navigation.navigate('QuickPurchaseReturnListScreen') },
    { title: 'Sales Return', image: require('@assets/images/Home/options/buy.png'), onPress: () => navigation.navigate('QuickSalesReturnListScreen') },
    { title: 'Gross Profit', image: require('@assets/images/Home/options/transaction_auditing.png'), onPress: () => navigation.navigate('GrossProfitReportScreen') },
    { title: 'Partner Ledger', image: require('@assets/images/Home/options/transaction_auditing.png'), onPress: () => navigation.navigate('PartnerLedgerScreen') },
    { title: 'Credit Management', image: require('@assets/images/Home/options/transaction_auditing.png'), onPress: () => navigation.navigate('CreditManagementScreen') },
    { title: 'WhatsApp', image: require('@assets/icons/common/watsapp.png'), onPress: () => navigation.navigate('WhatsAppScreen') },
    { title: 'Contacts', image: require('@assets/images/Home/options/customer_visit.png'), onPress: () => setShowContacts(true) },
  ];

  // Add Staff Tracking option for admin users, My Location for non-admin users
  const options = isAdmin
    ? [
        ...baseOptions.slice(0, 6),
        { title: 'Staff Tracking', image: require('@assets/images/Home/options/attendance.png'), onPress: () => navigation.navigate('StaffTrackingScreen') },
        ...baseOptions.slice(6),
        { title: 'Banner Management', image: require('@assets/images/Home/options/market_study_1.png'), onPress: () => navigation.navigate('BannerManagementScreen') },
      ]
    : [
        ...baseOptions.slice(0, 6),
        { title: 'My Location', image: require('@assets/images/Home/options/customer_visit.png'), onPress: () => navigation.navigate('MyLocation') },
        ...baseOptions.slice(6),
      ];

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return <ListItem title={item.title} image={item.image} onPress={item.onPress} />;
  };

  const handleBoxInspectionStart = async () => {
    setIsLoading(true);
    try {
      const boxInspectionGroupingData = {
        start_date_time: new Date(),
        sales_person_id: currentUser.related_profile?._id || null,
        warehouse_id: currentUser.warehouse?.warehouse_id || null,
      };
      const response = await post('/createBoxInspectionGrouping', boxInspectionGroupingData);
      if (response.success) {
        navigation.navigate('BoxInspectionScreen', { groupId: response?.data?._id })
      }
    } catch (error) {
      console.log('API Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
      <NavigationHeader
        title="Options"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer backgroundColor={'#f5f5f5'}>
        <FlatList
          data={formatData(options, 3)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 10, paddingBottom: 100 }}
          renderItem={renderItem}
          numColumns={3}
          keyExtractor={(item, index) => index.toString()}
        />
        <OverlayLoader visible={loading || isLoading} />
      </RoundedContainer>

      <ContactsSheet visible={showContacts} onClose={() => setShowContacts(false)} />

      <ConfirmationModal
        onCancel={() => setIsConfirmationModalVisible(false)}
        isVisible={isConfirmationModalVisible}
        onConfirm={() => {
          handleBoxInspectionStart();
          setIsConfirmationModalVisible(false);
        }}
        headerMessage='Are you sure that you want to start Box Inspection?'
      />
    </SafeAreaView>
  );
};

export default OptionsScreen;
