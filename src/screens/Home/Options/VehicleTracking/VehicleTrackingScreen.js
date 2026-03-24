import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { RoundedScrollContainer } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { FABButton } from '@components/common/Button';
import { fetchVehicleTrackingTripsOdoo } from '@api/services/generalApi';
import CalendarScreen from '@components/Calendar/CalendarScreen';
import { vehicleTrackingStyles as styles } from './styles';

const VehicleTrackingScreen = ({ navigation }) => {
  const isFocused = useIsFocused();
  const [selectedDate, setSelectedDate] = useState(null);
  const [vehicleEntries, setVehicleEntries] = useState([]);
  const [loading, setLoading] = useState(false);


  // Fetch vehicle tracking entries for the selected date
  const fetchEntriesForDate = async (dateString) => {
    setLoading(true);
    try {
      // Odoo expects date in YYYY-MM-DD format
      console.log('[VehicleTracking] Fetching entries for date:', dateString);
      const entries = await fetchVehicleTrackingTripsOdoo({ date: dateString });
      console.log('[VehicleTracking] Fetched entries:', entries);
      setVehicleEntries(entries || []);
    } catch (error) {
      console.error('Failed to fetch vehicle tracking entries:', error);
      setVehicleEntries([]);
    } finally {
      setLoading(false);
    }
  };


  const handleDateSelect = (day) => {
    console.log('[VehicleTracking] Date selected:', day.dateString);
    setSelectedDate(day.dateString);
    fetchEntriesForDate(day.dateString);
  };

  const handleAddEntry = () => {
    // Navigate to add vehicle tracking entry form
    navigation.navigate('VehicleTrackingForm');
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateText}>No Entries Found</Text>
    </View>
  );


  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader
        title="Vehicle Tracking"
        navigation={navigation}
      />

      <RoundedScrollContainer style={styles.content}>
        {/* Calendar Section */}
        <View style={styles.calendarContainer}>
          <CalendarScreen
            onDayPress={handleDateSelect}
            style={styles.calendar}
          />
        </View>

        {/* Content Section */}
        <View style={styles.contentContainer}>
          {loading ? (
            <OverlayLoader visible={true} />
          ) : vehicleEntries.length === 0 ? (
            renderEmptyState()
          ) : (
            <View>
              {/* In Progress Section */}
              <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 6, color: COLORS.primaryThemeColor }}>In Progress</Text>
              {vehicleEntries.filter(entry => entry.start_trip && !entry.end_trip).length === 0 && (
                <Text style={{ color: COLORS.gray, marginBottom: 12 }}>No in-progress trips</Text>
              )}
              {vehicleEntries.filter(entry => entry.start_trip && !entry.end_trip).map((entry) => (
                <View
                  key={entry.id}
                  style={[styles.entryItem, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 8, backgroundColor: COLORS.lightGray, marginBottom: 10 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.entryDetails, { fontWeight: 'bold', fontSize: 16, marginBottom: 2 }]}>{entry.driver_name || '-'}</Text>
                    <Text style={styles.entryDetails}>From: {entry.source_name || '-'}</Text>
                    <Text style={styles.entryDetails}>To: {entry.destination_name || '-'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', minWidth: 100 }}>
                    <Text style={[styles.entryTitle, { fontWeight: 'bold', fontSize: 15 }]}>{entry.vehicle_name || entry.number_plate || 'Vehicle'}</Text>
                    <Text style={[styles.entryDetails, { fontSize: 12, color: COLORS.gray }]}>{entry.date}</Text>
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <Text style={{ color: COLORS.primaryThemeColor, fontWeight: 'bold', fontSize: 12 }}>
                      In Progress
                    </Text>
                  </View>
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                    <Text
                      style={{ width: '100%', height: '100%' }}
                      onPress={() => navigation.navigate('VehicleTrackingForm', { tripData: entry })}
                    >
                      {/* Invisible overlay for click */}
                    </Text>
                  </View>
                </View>
              ))}

              {/* Completed Section */}
              <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 6, color: COLORS.green }}>Completed</Text>
              {vehicleEntries.filter(entry => entry.end_trip).length === 0 && (
                <Text style={{ color: COLORS.gray, marginBottom: 12 }}>No completed trips</Text>
              )}
              {vehicleEntries.filter(entry => entry.end_trip).map((entry) => (
                <View
                  key={entry.id}
                  style={[styles.entryItem, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 8, backgroundColor: COLORS.lightGray, marginBottom: 10 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.entryDetails, { fontWeight: 'bold', fontSize: 16, marginBottom: 2 }]}>{entry.driver_name || '-'}</Text>
                    <Text style={styles.entryDetails}>From: {entry.source_name || '-'}</Text>
                    <Text style={styles.entryDetails}>To: {entry.destination_name || '-'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', minWidth: 100 }}>
                    <Text style={[styles.entryTitle, { fontWeight: 'bold', fontSize: 15 }]}>{entry.vehicle_name || entry.number_plate || 'Vehicle'}</Text>
                    <Text style={[styles.entryDetails, { fontSize: 12, color: COLORS.gray }]}>{entry.date}</Text>
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <Text style={{ color: COLORS.green, fontWeight: 'bold', fontSize: 12 }}>
                      Completed
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </RoundedScrollContainer>

      {/* Floating Action Button */}
      <FABButton onPress={handleAddEntry} />
    </SafeAreaView>
  );
};

export default VehicleTrackingScreen;