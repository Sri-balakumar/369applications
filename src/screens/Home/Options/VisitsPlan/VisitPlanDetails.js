import React, { useState, useCallback } from 'react';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { useFocusEffect } from '@react-navigation/native';
import { DetailField } from '@components/common/Detail';
import { formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchVisitPlanDetailsOdoo, approveVisitPlanOdoo } from '@api/services/generalApi';
import { OverlayLoader } from '@components/Loader';
import { LoadingButton } from '@components/common/Button';
import { ConfirmationModal } from '@components/Modal';
import { showToast } from '@utils/common';
import { NavigationHeader } from '@components/Header';
import useAuthStore from '@stores/auth/useAuthStore';

const VisitPlanDetails = ({ navigation, route }) => {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.is_admin || false;

  const { id } = route?.params;
  const [details, setDetails] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
  const [showButton, setShowButton] = useState({
    approveButton: false,
    visitButton: false,
  });

  const fetchDetails = async (id) => {
    setIsLoading(true);
    try {
      const updatedDetails = await fetchVisitPlanDetailsOdoo(id);
      if (updatedDetails) {
        setDetails(updatedDetails);
        setShowButton({
          approveButton: updatedDetails?.approval_status === 'pending',
          visitButton: updatedDetails?.approval_status === 'approved' && updatedDetails?.visit_status === 'not_visited',
        });
      }
    } catch (error) {
      console.error('Error fetching visit plan details:', error);
      showToastMessage('Failed to fetch visit plan details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (id) {
        fetchDetails(id);
      }
    }, [id])
  );

  const updateApprovalStatus = async () => {
    setIsConfirmationModalVisible(false);
    try {
      await approveVisitPlanOdoo(id);
      showToast({ type: 'success', message: 'Visit plan approved successfully', title: 'Success' });
      fetchDetails(id);
    } catch (error) {
      console.error('Error updating approval status:', error);
      showToast({ type: 'error', message: 'Failed to approve visit plan', title: 'Error' });
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Visit Plan Details"
        onBackPress={() => navigation.goBack()}
        logo={false}
      />

      <RoundedScrollContainer>
        <DetailField label="Visit Date" value={formatDateTime(details?.visit_date)} />
        <DetailField multiline label="Customer Name" value={details?.customer?.name?.trim() || '-'} />
        <DetailField label="Assigned To" value={details?.employee?.name || '-'} />
        <DetailField label="Approval Status" value={details?.approval_status || '-'} />
        <DetailField label="Visit Purpose" value={details?.purpose?.name || '-'} />
        <DetailField label="Visit Status" value={details?.visit_status || '-'} />
        <DetailField
          label="Remarks"
          value={details?.remarks || '-'}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
        {showButton.approveButton && isAdmin &&
          <LoadingButton
            width="50%"
            alignSelf="center"
            marginVertical={50}
            title="Approve"
            onPress={() => setIsConfirmationModalVisible(true)}
          />}
        {showButton.visitButton &&
          <LoadingButton
            width="50%"
            alignSelf="center"
            marginVertical={50}
            title="New Visit"
            onPress={() => navigation.navigate('VisitForm', { visitPlanId: id })}
          />}
        <OverlayLoader visible={isLoading} />
        <ConfirmationModal
          headerMessage='Are you sure want to Approve'
          isVisible={isConfirmationModalVisible}
          onCancel={() => setIsConfirmationModalVisible(false)}
          onConfirm={updateApprovalStatus}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default VisitPlanDetails;
