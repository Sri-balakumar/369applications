import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { OverlayLoader } from '@components/Loader';
import { LoadingButton } from '@components/common/Button';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import {
  fetchApprovedSpareRequestsOdoo,
  approveSparePartRequestOdoo,
} from '@api/services/generalApi';

const STATE_COLORS = {
  draft: '#FF9800',
  requested: '#2196F3',
  approved: '#4CAF50',
  issued: '#9C27B0',
  returned: '#607D8B',
  done: '#4CAF50',
};

const SpareIssueListScreen = ({ navigation }) => {
  const currentUser = useAuthStore((state) => state.user);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const requests = await fetchApprovedSpareRequestsOdoo({ limit: 100 });
      setData(requests || []);
    } catch (err) {
      console.error('fetchSpareIssues error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const isCurrentUserAssigned = (item) => {
    const reqTo = item.requested_to;
    if (!reqTo || !currentUser) return false;
    if (reqTo.id && currentUser.uid && reqTo.id === currentUser.uid) return true;
    const reqToName = (reqTo.name || reqTo.label || '').toLowerCase();
    const uName = (currentUser.name || currentUser.login || '').toLowerCase();
    if (reqToName && uName && reqToName === uName) return true;
    return false;
  };

  const handleApprove = (item) => {
    Alert.alert(
      'Confirm Approval',
      `Are you sure you want to approve "${item.name || item.label}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Approve',
          onPress: async () => {
            setApprovingId(item.id);
            try {
              await approveSparePartRequestOdoo(item.id);
              Alert.alert('Success', 'Request approved. You can now issue spare parts.');
              fetchData();
            } catch (err) {
              Alert.alert('Error', err?.message || 'Failed to approve');
            } finally {
              setApprovingId(null);
            }
          },
        },
      ]
    );
  };

  const handleItemPress = (item) => {
    const state = (item.state || '').toLowerCase();
    if (state === 'approved' || state === 'issued') {
      if (isCurrentUserAssigned(item)) {
        navigation.navigate('SpareIssueForm', { requestId: item.id, requestData: item });
      } else {
        Alert.alert('Access Denied', `Only ${item.requested_to?.name || 'the assigned user'} can issue parts for this request.`);
      }
    } else if (state === 'draft' || state === 'requested') {
      if (isCurrentUserAssigned(item)) {
        Alert.alert('Approval Required', 'Please approve this request first before issuing parts.');
      } else {
        Alert.alert('Pending Approval', `This request is waiting for approval by ${item.requested_to?.name || 'the assigned user'}.`);
      }
    }
  };

  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    const state = (item.state || 'draft').toLowerCase();
    const stateColor = STATE_COLORS[state] || '#999';
    const assigned = isCurrentUserAssigned(item);
    const canApprove = assigned && (state === 'draft' || state === 'requested');
    const canIssue = assigned && (state === 'approved');

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.itemContainer, canIssue && styles.itemHighlight]}
        onPress={() => handleItemPress(item)}
      >
        <View style={styles.row}>
          <Text style={styles.head}>{item.name || '-'}</Text>
          <View style={[styles.badge, { backgroundColor: stateColor }]}>
            <Text style={styles.badgeText}>{state.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.content}>Customer: {item.partner_name || '-'}</Text>
          <Text style={styles.contentRight}>Parts: {item.line_ids?.length || 0}</Text>
        </View>
        {item.requested_by && (
          <Text style={styles.subContent}>Requested by: {item.requested_by.name || ''}</Text>
        )}
        {item.requested_to && (
          <Text style={styles.subContent}>Assigned to: {item.requested_to.name || ''}</Text>
        )}

        {canApprove && (
          <View style={styles.approveRow}>
            <LoadingButton
              backgroundColor="#4CAF50"
              title="Approve"
              onPress={() => handleApprove(item)}
              loading={approvingId === item.id}
            />
          </View>
        )}

        {canIssue && (
          <Text style={styles.issueHint}>Tap to issue spare parts</Text>
        )}

        {!assigned && (state === 'draft' || state === 'requested') && (
          <Text style={styles.waitingText}>Waiting for {item.requested_to?.name || 'assigned user'} to approve</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Spare Issued" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        {data.length === 0 && !loading ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message="No Spare Requests Found" />
        ) : (
          <FlashList
            data={formatData(data, 1)}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item, index) => item.id?.toString() || index.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={150}
          />
        )}
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: 'black', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2 },
    }),
    padding: 16,
  },
  itemHighlight: {
    borderWidth: 1.5,
    borderColor: '#4CAF50',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  head: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 16, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },
  content: { color: '#666', fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold },
  contentRight: { color: '#666', fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold },
  subContent: { color: '#999', fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium },
  approveRow: { marginTop: 10 },
  issueHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#4CAF50',
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center',
  },
  waitingText: {
    marginTop: 6,
    fontSize: 12,
    color: '#FF9800',
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontStyle: 'italic',
  },
});

export default SpareIssueListScreen;
