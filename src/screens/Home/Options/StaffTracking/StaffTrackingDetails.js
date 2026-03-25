import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { formatDate } from '@utils/common/date';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';

const StaffTrackingDetails = ({ navigation, route }) => {
  const { trackingDetails } = route?.params || {};

  const DetailRow = ({ icon, iconType = 'material', label, value }) => (
    <View style={styles.detailRow}>
      <View style={styles.iconContainer}>
        {iconType === 'material' ? (
          <MaterialIcons name={icon} size={20} color={COLORS.primaryThemeColor} />
        ) : (
          <FontAwesome5 name={icon} size={18} color={COLORS.primaryThemeColor} />
        )}
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value || 'N/A'}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Tracking Details"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Staff Tracking Information</Text>
          </View>

          <DetailRow
            icon="person"
            label="Employee"
            value={trackingDetails?.employee?.name || trackingDetails?.employee_name}
          />

          <DetailRow
            icon="access-time"
            label="Check-In Time"
            value={trackingDetails?.check_in_time ? formatDate(trackingDetails.check_in_time, 'dd-MM-yyyy hh:mm:ss') : 'N/A'}
          />

          <DetailRow
            icon="access-time"
            label="Check-Out Time"
            value={trackingDetails?.check_out_time ? formatDate(trackingDetails.check_out_time, 'dd-MM-yyyy hh:mm:ss') : 'N/A'}
          />

          <DetailRow
            icon="location-on"
            label="Location"
            value={trackingDetails?.location_name}
          />

          <DetailRow
            icon="map-marker-alt"
            iconType="fontawesome"
            label="Coordinates"
            value={trackingDetails?.latitude && trackingDetails?.longitude
              ? `${trackingDetails.latitude}, ${trackingDetails.longitude}`
              : 'N/A'}
          />

          <DetailRow
            icon="notes"
            label="Remarks"
            value={trackingDetails?.remarks}
          />
        </View>
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default StaffTrackingDetails;

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    paddingBottom: 12,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.black,
  },
});
