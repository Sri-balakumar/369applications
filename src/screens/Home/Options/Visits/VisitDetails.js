import React, { useCallback, useState } from 'react';
import { Image, TouchableOpacity, View } from 'react-native';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationHeader } from '@components/Header';
import { DetailField } from '@components/common/Detail';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { showToast } from '@utils/common';
import { fetchCustomerVisitDetailsOdoo, markCustomerVisitAsDoneOdoo, resetCustomerVisitToDraftOdoo } from '@api/services/generalApi';
import { LoadingButton } from '@components/common/Button';
import { ConfirmationModal } from '@components/Modal';
import { OverlayLoader } from '@components/Loader';
import useAuthStore from '@stores/auth/useAuthStore';
import Text from '@components/Text';

const VisitDetails = ({ navigation, route }) => {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.is_admin || false;

  const initialDetails = route?.params?.visitDetails;
  const visitId = route?.params?.visitId || initialDetails?.id;
  const [details, setDetails] = useState(initialDetails || {});
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState(null);

  const fetchDetails = async () => {
    try {
      const updatedDetails = await fetchCustomerVisitDetailsOdoo(visitId);
      if (updatedDetails) {
        setDetails(updatedDetails);
      }
    } catch (error) {
      console.error('Error fetching visit details:', error);
      showToastMessage('Failed to fetch visit details');
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (visitId) {
        fetchDetails();
      }
    }, [visitId])
  );

  const handleMapIconPress = () => {
    if (details?.longitude && details?.latitude) {
      navigation.navigate('MapViewScreen', { latitude: details.latitude, longitude: details.longitude });
    } else {
      showToastMessage('The visit does not have location details');
    }
  };

  const handleMarkAsDone = async () => {
    setIsConfirmationModalVisible(false);
    setIsLoading(true);
    try {
      await markCustomerVisitAsDoneOdoo(visitId);
      showToast({ type: 'success', message: 'Visit marked as done successfully', title: 'Success' });
      fetchDetails();
    } catch (error) {
      console.error('Error marking visit as done:', error);
      showToast({ type: 'error', message: 'Failed to mark visit as done', title: 'Error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetToDraft = async () => {
    setIsConfirmationModalVisible(false);
    setIsLoading(true);
    try {
      await resetCustomerVisitToDraftOdoo(visitId);
      showToast({ type: 'success', message: 'Visit reset to draft successfully', title: 'Success' });
      fetchDetails();
    } catch (error) {
      console.error('Error resetting visit to draft:', error);
      showToast({ type: 'error', message: 'Failed to reset visit to draft', title: 'Error' });
    } finally {
      setIsLoading(false);
    }
  };

  const openConfirmationModal = (action) => {
    setConfirmationAction(action);
    setIsConfirmationModalVisible(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <NavigationHeader
        title="Customer Visits Details"
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      <RoundedScrollContainer>
        <TouchableOpacity onPress={handleMapIconPress} activeOpacity={0.7}>
          <Image
            style={{ alignSelf: 'flex-end', height: 35, width: 30, tintColor: COLORS.orange, marginBottom: 15 }}
            source={require('@assets/icons/common/map_icon.png')}
          />
        </TouchableOpacity>
        <DetailField label="Date & Time" value={formatDateTime(details?.date_time)} />
        <DetailField label="Employee Name" value={details?.employee?.name?.trim() || '-'} multiline />
        <DetailField label="Customer Name" value={details?.customer?.name?.trim() || '-'} multiline />
        <DetailField label="Location" value={details?.location_name || '-'} />
        <DetailField label="Visit Purpose" value={details?.purpose?.name || '-'} />
        <DetailField label="Visit Status" value={details?.state || '-'} />
        <DetailField label="Remarks" value={details?.remarks || '-'} multiline numberOfLines={5} textAlignVertical={'top'} />

        {isAdmin && (
          <View style={{ marginTop: 30, marginBottom: 20 }}>
            {details?.state !== 'done' && (
              <LoadingButton
                width="100%"
                marginVertical={10}
                title="Mark as Done"
                onPress={() => openConfirmationModal('done')}
                backgroundColor={COLORS.primary}
              />
            )}
            {details?.state !== 'draft' && (
              <LoadingButton
                width="100%"
                marginVertical={10}
                title="Reset to Draft"
                onPress={() => openConfirmationModal('draft')}
                backgroundColor={COLORS.orange}
              />
            )}
          </View>
        )}

        <OverlayLoader visible={isLoading} />
        <ConfirmationModal
          headerMessage={
            confirmationAction === 'done'
              ? 'Are you sure you want to mark this visit as done?'
              : 'Are you sure you want to reset this visit to draft?'
          }
          isVisible={isConfirmationModalVisible}
          onCancel={() => setIsConfirmationModalVisible(false)}
          onConfirm={confirmationAction === 'done' ? handleMarkAsDone : handleResetToDraft}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default VisitDetails;
