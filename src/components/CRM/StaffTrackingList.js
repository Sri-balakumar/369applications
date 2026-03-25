import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';
import { formatDate } from '@utils/common/date';
import { MaterialIcons } from '@expo/vector-icons';

const StaffTrackingList = ({ item, onPress }) => {
  const isCheckIn = item?.status === 'check_in';

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <View style={styles.headerRow}>
          <Text style={styles.head}>{item?.employee?.name || item?.employee_name || '-'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isCheckIn ? '#4CAF50' : '#FF5722' }]}>
            <Text style={styles.statusText}>{isCheckIn ? 'Check In' : 'Check Out'}</Text>
          </View>
        </View>
        <View style={styles.rightColumn}>
          <View style={styles.infoRow}>
            <MaterialIcons name="access-time" size={14} color="#666666" />
            <Text style={styles.content}>
              {item?.check_in_time ? formatDate(item?.check_in_time, 'dd MMM yyyy HH:mm') : '-'}
            </Text>
          </View>
          <Text style={styles.contentRight}>{item?.department?.department_name || '-'}</Text>
        </View>
      </View>
      <View style={styles.locationRow}>
        <MaterialIcons name="location-on" size={14} color="#666666" />
        <Text style={styles.locationText} numberOfLines={1}>
          {item?.location_name || 'Location not available'}
        </Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rightColumn: {
    justifyContent: 'space-between',
    flexDirection: 'row',
    flex: 1,
  },
  head: {
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
    color: 'white',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  content: {
    color: '#666666',
    marginBottom: 5,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform: 'capitalize',
    marginLeft: 4,
  },
  contentRight: {
    color: '#666666',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 14,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  locationText: {
    color: '#666666',
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 13,
    marginLeft: 4,
    flex: 1,
  },
});

export default StaffTrackingList;
