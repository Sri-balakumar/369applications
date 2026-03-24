import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';
import { format } from 'date-fns';
import { truncateString } from '@utils/common';

const STATE_BADGE = {
  draft: { label: 'Draft', bg: '#6c757d' },
  audited: { label: 'Audited', bg: '#28a745' },
  rejected: { label: 'Rejected', bg: '#dc3545' },
};

const formatAmount = (val) => {
  const n = Number(val || 0).toFixed(2);
  const [intPart, decPart] = n.split('.');
  // Indian grouping: last 3 digits, then groups of 2
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (rest ? ',' : '') + last3;
  return formatted + '.' + decPart;
};

const AuditList = ({ item, onPress }) => {

  const rawDate = item?.date || item?.transaction_date;
  const formattedDate = rawDate ? format(new Date(rawDate), 'dd MMMM yyyy') : 'N/A';

  let customerName = truncateString(item?.customer_name || '', 15);
  let supplierName = truncateString(item?.supplier_name || '', 15);
  let chartAccountName = truncateString(item?.chart_of_accounts_name || '', 15);

  const state = item?.state || 'draft';
  const badge = STATE_BADGE[state] || STATE_BADGE.draft;

  return (
    <TouchableOpacity onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <View style={styles.topRow}>
          <Text style={styles.sequenceNo}>{item?.sequence_no}</Text>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={styles.statusText}>{badge.label}</Text>
          </View>
        </View>
        <View style={{ justifyContent: 'space-between', flexDirection: 'row', flex: 1 }}>
          <Text style={styles.names}>{customerName || supplierName || chartAccountName}</Text>
          <Text style={styles.date}>{formattedDate}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.transactionSeq}>{item?.inv_sequence_no || 'N/A'}</Text>
          <Text style={styles.amount}>
            {'\u20B9'} {formatAmount(item?.amount)}
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
      android: {
        elevation: 4,
      },
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
  sequenceNo: {
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
  names: {
    color: '#666666',
    marginBottom: 5,
    fontSize:15,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionSeq: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#666666',
  },
  amount: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#212529',
  },
  date: {
    color: '#666666',
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
});

export default AuditList;
