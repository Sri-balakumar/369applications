import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { RoundedScrollContainer } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { FABButton } from '@components/common/Button';
import CalendarScreen from '@components/Calendar/CalendarScreen';

const CashCollectionScreen = ({ navigation }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [cashEntries, setCashEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch cash collection entries for the selected date
  const fetchEntriesForDate = async (dateString) => {
    setLoading(true);
    try {
      console.log('[CashCollection] Fetching entries for date:', dateString);
      // TODO: Replace with actual API call
      // const entries = await fetchCashCollectionOdoo({ date: dateString });

      // Placeholder data for now
      const entries = [];
      setCashEntries(entries || []);
    } catch (error) {
      console.error('Failed to fetch cash collection entries:', error);
      setCashEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (day) => {
    console.log('[CashCollection] Date selected:', day.dateString);
    setSelectedDate(day.dateString);
    fetchEntriesForDate(day.dateString);
  };

  const handleAddEntry = () => {
    navigation.navigate('CashCollectionForm', { date: selectedDate });
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateText}>No Cash Collections Found</Text>
      {selectedDate && (
        <Text style={styles.emptyStateSubText}>
          Select a date from the calendar to view collections
        </Text>
      )}
    </View>
  );

  const renderCashEntry = (entry) => (
    <TouchableOpacity
      key={entry.id}
      style={styles.entryItem}
      onPress={() => navigation.navigate('CashCollectionForm', { collectionData: entry })}
    >
      <View style={styles.entryContent}>
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName}>{entry.customer_name || '-'}</Text>
          <Text style={styles.entryDetails}>Amount: AED {entry.amount || '0.00'}</Text>
          <Text style={styles.entryDetails}>Payment Method: {entry.payment_method || '-'}</Text>
        </View>
        <View style={styles.entryRight}>
          <Text style={styles.amountText}>AED {entry.amount || '0.00'}</Text>
          <Text style={styles.dateText}>{entry.date}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader
        title="Cash Collection"
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
          ) : !selectedDate ? (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateText}>Select a date to view collections</Text>
            </View>
          ) : cashEntries.length === 0 ? (
            renderEmptyState()
          ) : (
            <View>
              <Text style={styles.sectionTitle}>Cash Collections</Text>
              {cashEntries.map((entry) => renderCashEntry(entry))}
            </View>
          )}
        </View>
      </RoundedScrollContainer>

      {/* Floating Action Button */}
      <FABButton onPress={handleAddEntry} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
  },
  calendarContainer: {
    marginBottom: 20,
  },
  calendar: {
    marginBottom: 10,
  },
  contentContainer: {
    paddingHorizontal: 15,
    paddingBottom: 100,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.gray,
    marginBottom: 8,
  },
  emptyStateSubText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  entryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.lightGray,
    marginBottom: 10,
  },
  entryContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerName: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
    color: COLORS.black,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  entryDetails: {
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 2,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  entryRight: {
    alignItems: 'flex-end',
    minWidth: 100,
  },
  amountText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: COLORS.green,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
});

export default CashCollectionScreen;
