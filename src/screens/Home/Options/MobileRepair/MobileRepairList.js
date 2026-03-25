import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

const getStageColor = (name) => {
  if (!name) return '#999';
  const n = name.toLowerCase().trim();
  if (n.includes('draft')) return '#FF9800';
  if (n.includes('inspect')) return '#2196F3';
  if (n.includes('quotation') || n.includes('quote')) return '#9C27B0';
  if (n.includes('repair') || n.includes('progress')) return '#FF5722';
  if (n.includes('complete') || n.includes('done')) return '#4CAF50';
  if (n.includes('cancel')) return '#F44336';
  return '#999';
};

const MobileRepairList = ({ item, onPress }) => {
  const stageColor = getStageColor(item?.stage_name);
  const priorityCount = parseInt(item?.priority, 10) || 0;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.card}>
      {/* Row 1: Job Card No + Status + Priority */}
      <View style={styles.topRow}>
        <Text style={styles.ref}>{item?.ref || '-'}</Text>
        <View style={styles.topRight}>
          {priorityCount > 0 && (
            <View style={styles.priorityRow}>
              {Array.from({ length: priorityCount }).map((_, i) => (
                <MaterialIcons key={i} name="star" size={14} color="#FFC107" />
              ))}
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: stageColor }]}>
            <Text style={styles.badgeText}>{item?.stage_name || 'Draft'}</Text>
          </View>
        </View>
      </View>

      {/* Row 2: Customer + Brand + Model */}
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Customer</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{item?.partner_name || '-'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Brand</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{item?.device_brand || '-'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Model</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{item?.device_model || '-'}</Text>
        </View>
      </View>

      {/* Row 3: Receiving Date + Expected Date + Assigned To */}
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Receiving Date</Text>
          <Text style={styles.infoValue}>{item?.receiving_date || '-'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Expected Date</Text>
          <Text style={styles.infoValue}>{item?.expected_delivery_date || '-'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Assigned To</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{item?.assigned_to || '-'}</Text>
        </View>
      </View>

      {/* Row 4: Repair Team + Total Amount */}
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Repair Team</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{item?.repair_team || '-'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Total Amount</Text>
          <Text style={[styles.infoValue, styles.amountText]}>
            {item?.total_amount ? parseFloat(item.total_amount).toFixed(3) : '0.000'}
          </Text>
        </View>
        <View style={styles.infoItem} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 12,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: 'black', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2 },
    }),
    padding: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingBottom: 8,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ref: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  priorityRow: {
    flexDirection: 'row',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoItem: {
    flex: 1,
    paddingRight: 4,
  },
  infoLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.black,
  },
  amountText: {
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
});

export default MobileRepairList;
