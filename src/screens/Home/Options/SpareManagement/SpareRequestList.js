import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';

const STATE_COLORS = {
  draft: '#FF9800',
  requested: '#2196F3',
  approved: '#4CAF50',
  rejected: '#F44336',
  done: '#4CAF50',
};

const SpareRequestList = ({ item, onPress }) => {
  const stateColor = STATE_COLORS[item?.state] || '#999';

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.row}>
        <Text style={styles.head}>{item?.name || '-'}</Text>
        <View style={[styles.badge, { backgroundColor: stateColor }]}>
          <Text style={styles.badgeText}>{(item?.state || 'draft').toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.content}>Customer: {item?.partner_name || '-'}</Text>
        <Text style={styles.contentRight}>Parts: {item?.line_count || 0}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.content}>Job Card: {item?.job_card_name || '-'}</Text>
        <Text style={styles.contentRight}>{item?.request_date ? item.request_date.split(' ')[0] : '-'}</Text>
      </View>
      {item?.requested_by ? (
        <Text style={styles.subContent}>Requested by: {item.requested_by}</Text>
      ) : null}
      {item?.requested_to ? (
        <Text style={styles.subContent}>Requested to: {item.requested_to}</Text>
      ) : null}
    </TouchableOpacity>
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  head: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 16,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  content: {
    color: '#666',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  contentRight: {
    color: '#666',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  subContent: {
    color: '#999',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
});

export default SpareRequestList;
