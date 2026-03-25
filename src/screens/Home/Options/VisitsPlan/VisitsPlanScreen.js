import React, { useCallback, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { VerticalScrollableCalendar } from '@components/Calendar';
import { NavigationHeader } from '@components/Header';
import { ConfirmationModal, RulesModal } from '@components/Modal';
import { Button, FABButton } from '@components/common/Button';
import { useFocusEffect } from '@react-navigation/native';
import { useDataFetching } from '@hooks';
import { fetchVisitPlansOdoo, sendVisitPlansForApprovalOdoo } from '@api/services/generalApi';
import { FlashList } from '@shopify/flash-list';
import VisitPlanList from './VisitPlanList';
import { formatData } from '@utils/formatters';
import { EmptyState, EmptyItem } from '@components/common/empty';
import { formatDate } from 'date-fns';
import { showToast } from '@utils/common';
import { COLORS } from '@constants/theme';

const VisitsPlanScreen = ({ navigation }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [date, setDate] = useState(new Date());
    const formattedDate = formatDate(date, 'yyyy-MM-dd');
    const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);

    const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchVisitPlansOdoo);

    const visitPlansNew = data.filter(visitPlan => visitPlan.approval_status === 'new');
    const allPending = data.every(visitPlan => visitPlan.approval_status === 'pending');

    const visitPlanIdsForApproval = visitPlansNew.map(visitPlan => visitPlan.id);

    useFocusEffect(
        useCallback(() => {
            fetchData({ date: formattedDate });
        }, [date])
    );

    const handleLoadMore = () => {
        fetchMoreData({ date: formattedDate });
    };

    const renderItem = ({ item }) => {
        if (item.empty) {
            return <EmptyItem />;
        }
        return <VisitPlanList item={item} onPress={() => navigation.navigate('VisitPlanDetails', { id: item.id })} />;
    };

    const renderEmptyState = () => (
        <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message={'No Visits Plan Found....'} />
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
                loading && (
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />
                    </View>
                )
            }
            estimatedItemSize={100}
        />
    );

    const renderVisitPlan = () => {
        if (data.length === 0 && !loading) {
            return renderEmptyState();
        }
        return renderContent();
    };

    const updatePendingApproval = async () => {
        setIsConfirmationModalVisible(false);
        try {
            await sendVisitPlansForApprovalOdoo(visitPlanIdsForApproval);
            showToast({ type: 'success', message: 'Visit plans sent for approval', title: 'Success' });
            fetchData({ date: formattedDate });
        } catch (error) {
            console.error('Error updating approval status:', error);
            showToast({ type: 'error', message: 'Failed to update approval status', title: 'Error' });
        }
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title="Visits Plan"
                logo={false}
                onBackPress={() => navigation.goBack()}
            />
            <Button
                width="40%"
                height={40}
                alignSelf="flex-end"
                marginVertical={0}
                marginBottom={10}
                marginHorizontal={20}
                title="Send for Approval"
                backgroundColor={allPending || visitPlanIdsForApproval.length === 0 ? COLORS.buttonDisabled : COLORS.orange}
                onPress={() => setIsConfirmationModalVisible(true)}
                disabled={allPending || visitPlanIdsForApproval.length === 0}
            />
            <RoundedContainer borderTopLeftRadius={20} borderTopRightRadius={20}>
                <View style={{ marginVertical: 15 }}>
                    <VerticalScrollableCalendar date={date} onChange={newDate => setDate(newDate)} />
                </View>
                {renderVisitPlan()}
            </RoundedContainer>
            <FABButton onPress={() => navigation.navigate('VisitPlanForm')} />
            <RulesModal isVisible={isVisible} onClose={() => setIsVisible(!isVisible)} />
            <ConfirmationModal
                isVisible={isConfirmationModalVisible}
                onCancel={() => setIsConfirmationModalVisible(false)}
                onConfirm={updatePendingApproval}
            />
        </SafeAreaView>
    );
};

export default VisitsPlanScreen;
