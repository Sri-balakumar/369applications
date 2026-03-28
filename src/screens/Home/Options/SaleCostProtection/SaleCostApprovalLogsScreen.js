import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, Platform, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { OverlayLoader } from '@components/Loader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchSaleCostApprovalLogsOdoo } from '@api/services/generalApi';

const ACTION_COLORS = {
  approved: '#4CAF50',
  rejected: '#F44336',
  reset: '#FF9800',
};

const ACTION_LABELS = {
  approved: 'APPROVED',
  rejected: 'REJECTED',
  reset: 'RESET',
};

const SaleCostApprovalLogsScreen = ({ navigation }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const data = await fetchSaleCostApprovalLogsOdoo({ limit: 100 });
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching approval logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchLogs(true);
  }, [fetchLogs]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = dateStr.split(' ')[0];
    return d ? d.split('-').reverse().join('-') : '-';
  };

  const renderItem = ({ item }) => {
    const orderName = Array.isArray(item.sale_order_id) ? item.sale_order_id[1] : '-';
    const customerName = Array.isArray(item.partner_id) ? item.partner_id[1] : '-';
    const approverName = Array.isArray(item.approver_id) ? item.approver_id[1] : '-';
    const salesperson = Array.isArray(item.salesperson_id) ? item.salesperson_id[1] : '-';
    const action = item.action || 'approved';
    const actionColor = ACTION_COLORS[action] || '#999';
    const actionLabel = ACTION_LABELS[action] || action.toUpperCase();

    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.orderName}>{orderName}</Text>
          <View style={[s.badge, { backgroundColor: actionColor }]}>
            <Text style={s.badgeText}>{actionLabel}</Text>
          </View>
        </View>

        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.label}>Customer</Text>
            <Text style={s.value}>{customerName}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Date</Text>
            <Text style={s.value}>{formatDate(item.approval_date)}</Text>
          </View>
        </View>

        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.label}>Approver</Text>
            <Text style={s.value}>{approverName}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Salesperson</Text>
            <Text style={s.value}>{salesperson}</Text>
          </View>
        </View>

        {item.order_amount_total ? (
          <View style={s.row}>
            <View style={s.col}>
              <Text style={s.label}>Order Total</Text>
              <Text style={[s.value, { color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold }]}>
                {Number(item.order_amount_total).toFixed(3)}
              </Text>
            </View>
          </View>
        ) : null}

        {item.reason ? (
          <View style={s.reasonBox}>
            <Text style={s.label}>Reason</Text>
            <Text style={s.reasonText}>{item.reason}</Text>
          </View>
        ) : null}

        {item.below_cost_details ? (
          <View style={s.reasonBox}>
            <Text style={s.label}>Below Cost Details</Text>
            <Text style={s.reasonText}>{item.below_cost_details}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  if (loading && logs.length === 0) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Cost Protection Logs" onBackPress={() => navigation.goBack()} />
        <OverlayLoader visible={true} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView>
      <NavigationHeader title="Cost Protection Logs" onBackPress={() => navigation.goBack()} />
      <FlatList
        data={logs}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primaryThemeColor]} />}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>No approval logs found</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderName: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  col: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginBottom: 2,
  },
  value: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
  },
  reasonBox: {
    marginTop: 4,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#555',
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
  },
});

export default SaleCostApprovalLogsScreen;
