import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';
import { format } from 'date-fns';
import { truncateString } from '@utils/common';

const STATE_BADGE = {
  draft: { label: 'Draft', bg: '#6c757d' },
  sent: { label: 'Sent', bg: '#0d6efd' },
  done: { label: 'Done', bg: '#28a745' },
  rejected: { label: 'Rejected', bg: '#dc3545' },
  cancel: { label: 'Cancelled', bg: '#adb5bd' },
};

const URGENCY_COLORS = {
  normal: null,
  urgent: '#fd7e14',
  critical: '#dc3545',
};

const formatAmount = (val) => {
  const n = Number(val || 0).toFixed(2);
  const [intPart, decPart] = n.split('.');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (rest ? ',' : '') + last3;
  return formatted + '.' + decPart;
};

const StockTransferList = ({ item, onPress }) => {
  const rawDate = item?.date;
  const formattedDate = rawDate
    ? format(new Date(rawDate), 'dd MMM yyyy')
    : 'N/A';

  const requestingName = truncateString(item?.requesting_company_name || '', 15);
  const sourceName = truncateString(item?.source_company_name || '', 15);

  const state = item?.state || 'draft';
  const badge = STATE_BADGE[state] || STATE_BADGE.draft;
  const urgencyColor = URGENCY_COLORS[item?.urgency];

  return (
    <TouchableOpacity onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <View style={styles.topRow}>
          <Text style={styles.reference}>{item?.name || 'New'}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {urgencyColor && (
              <View style={[styles.statusBadge, { backgroundColor: urgencyColor }]}>
                <Text style={styles.statusText}>{item.urgency.toUpperCase()}</Text>
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={styles.statusText}>{badge.label}</Text>
            </View>
          </View>
        </View>
        <View style={styles.middleRow}>
          <Text style={styles.companies}>
            {requestingName} {'\u2192'} {sourceName}
          </Text>
          <Text style={styles.date}>{formattedDate}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.noteText} numberOfLines={1}>
            {item?.note || ''}
          </Text>
          <Text style={styles.amount}>
            {item?.currency_name || '\u20B9'} {formatAmount(item?.total_value)}
          </Text>
        </View>
      </View>
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
      ios: {
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
      },
    }),
    padding: 20,
  },
  leftColumn: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  reference: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 17,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  middleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  companies: {
    color: '#666666',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    flex: 1,
  },
  date: {
    color: '#666666',
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 13,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    flex: 1,
    marginRight: 8,
  },
  amount: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#212529',
  },
});

export default StockTransferList;
