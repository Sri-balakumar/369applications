import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, Dimensions, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { OverlayLoader } from '@components/Loader';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOdooBaseUrl } from '@api/config/odooConfig';

const { width } = Dimensions.get('window');
const scale = (size) => Math.round((width / 390) * size);

const MONTHS = [
  { label: 'January', value: 1 }, { label: 'February', value: 2 }, { label: 'March', value: 3 },
  { label: 'April', value: 4 }, { label: 'May', value: 5 }, { label: 'June', value: 6 },
  { label: 'July', value: 7 }, { label: 'August', value: 8 }, { label: 'September', value: 9 },
  { label: 'October', value: 10 }, { label: 'November', value: 11 }, { label: 'December', value: 12 },
];

const LateRecordsScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const currentUser = useAuthStore(state => state.user);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [showFilter, setShowFilter] = useState('none'); // 'none' | 'month' | 'employee'

  // Summary
  const [summary, setSummary] = useState({ totalLateDays: 0, totalDeduction: 0, totalLateMinutes: 0 });

  const getHeaders = async () => {
    const cookie = await AsyncStorage.getItem('odoo_cookie');
    return { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
  };

  const fetchLateRecords = async () => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const ODOO_URL = getOdooBaseUrl();

      // Build date range for selected month
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const endYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

      const domain = [
        ['is_late', '=', true],
        ['is_first_checkin_of_day', '=', true],
        ['date', '>=', startDate],
        ['date', '<', endDate],
      ];

      if (selectedEmployee) {
        domain.push(['employee_id', '=', selectedEmployee.id]);
      }

      const response = await axios.post(
        `${ODOO_URL}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'hr.attendance',
            method: 'search_read',
            args: [domain],
            kwargs: {
              fields: [
                'id', 'employee_id', 'department_id', 'check_in', 'check_out', 'date',
                'is_late', 'late_minutes', 'late_reason', 'late_day_sequence',
                'deduction_amount', 'daily_total_hours', 'expected_start_time',
              ],
              order: 'date desc, employee_id asc',
              limit: 200,
            },
          },
        },
        { headers }
      );

      const data = response.data?.result || [];
      setRecords(data);
      setFilteredRecords(data);

      // Build employee list for filter
      const empMap = {};
      data.forEach(r => {
        if (r.employee_id && !empMap[r.employee_id[0]]) {
          empMap[r.employee_id[0]] = { id: r.employee_id[0], name: r.employee_id[1] };
        }
      });
      setEmployees(Object.values(empMap));

      // Calculate summary
      const totalLateDays = data.length;
      const totalDeduction = data.reduce((sum, r) => sum + (r.deduction_amount || 0), 0);
      const totalLateMinutes = data.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
      setSummary({ totalLateDays, totalDeduction, totalLateMinutes });

    } catch (error) {
      console.error('[LateRecords] Fetch error:', error?.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchLateRecords();
    }, [selectedMonth, selectedYear, selectedEmployee])
  );

  const formatTime = (floatTime) => {
    const hours = Math.floor(floatTime);
    const minutes = Math.round((floatTime - hours) * 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const h = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${h}:${String(minutes).padStart(2, '0')} ${period}`;
  };

  const formatDateTime = (dt) => {
    if (!dt) return '-';
    const d = new Date(dt + 'Z');
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const renderFilterBar = () => (
    <View style={styles.filterBar}>
      <TouchableOpacity
        style={[styles.filterChip, showFilter === 'month' && styles.filterChipActive]}
        onPress={() => setShowFilter(showFilter === 'month' ? 'none' : 'month')}
      >
        <MaterialIcons name="calendar-month" size={scale(16)} color={showFilter === 'month' ? '#fff' : COLORS.primaryThemeColor} />
        <Text style={[styles.filterChipText, showFilter === 'month' && styles.filterChipTextActive]}>
          {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}
        </Text>
        <MaterialIcons name="arrow-drop-down" size={scale(18)} color={showFilter === 'month' ? '#fff' : COLORS.primaryThemeColor} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.filterChip, showFilter === 'employee' && styles.filterChipActive]}
        onPress={() => setShowFilter(showFilter === 'employee' ? 'none' : 'employee')}
      >
        <MaterialIcons name="person" size={scale(16)} color={showFilter === 'employee' ? '#fff' : COLORS.primaryThemeColor} />
        <Text style={[styles.filterChipText, showFilter === 'employee' && styles.filterChipTextActive]}>
          {selectedEmployee ? selectedEmployee.name : 'All Employees'}
        </Text>
        <MaterialIcons name="arrow-drop-down" size={scale(18)} color={showFilter === 'employee' ? '#fff' : COLORS.primaryThemeColor} />
      </TouchableOpacity>
    </View>
  );

  const renderMonthPicker = () => {
    if (showFilter !== 'month') return null;
    return (
      <View style={styles.dropdownContainer}>
        <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
          {MONTHS.map(m => (
            <TouchableOpacity
              key={m.value}
              style={[styles.dropdownItem, selectedMonth === m.value && styles.dropdownItemActive]}
              onPress={() => { setSelectedMonth(m.value); setShowFilter('none'); }}
            >
              <Text style={[styles.dropdownItemText, selectedMonth === m.value && styles.dropdownItemTextActive]}>
                {m.label} {selectedYear}
              </Text>
              {selectedMonth === m.value && <MaterialIcons name="check" size={18} color={COLORS.primaryThemeColor} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderEmployeePicker = () => {
    if (showFilter !== 'employee') return null;
    return (
      <View style={styles.dropdownContainer}>
        <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
          <TouchableOpacity
            style={[styles.dropdownItem, !selectedEmployee && styles.dropdownItemActive]}
            onPress={() => { setSelectedEmployee(null); setShowFilter('none'); }}
          >
            <Text style={[styles.dropdownItemText, !selectedEmployee && styles.dropdownItemTextActive]}>All Employees</Text>
            {!selectedEmployee && <MaterialIcons name="check" size={18} color={COLORS.primaryThemeColor} />}
          </TouchableOpacity>
          {employees.map(emp => (
            <TouchableOpacity
              key={emp.id}
              style={[styles.dropdownItem, selectedEmployee?.id === emp.id && styles.dropdownItemActive]}
              onPress={() => { setSelectedEmployee(emp); setShowFilter('none'); }}
            >
              <Text style={[styles.dropdownItemText, selectedEmployee?.id === emp.id && styles.dropdownItemTextActive]}>
                {emp.name}
              </Text>
              {selectedEmployee?.id === emp.id && <MaterialIcons name="check" size={18} color={COLORS.primaryThemeColor} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderSummaryCard = () => (
    <View style={styles.summaryCard}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{summary.totalLateDays}</Text>
        <Text style={styles.summaryLabel}>Late Days</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{summary.totalLateMinutes}</Text>
        <Text style={styles.summaryLabel}>Late Min</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={[styles.summaryValue, summary.totalDeduction > 0 && { color: '#E74C3C' }]}>
          {summary.totalDeduction.toFixed(2)}
        </Text>
        <Text style={styles.summaryLabel}>Deduction</Text>
      </View>
    </View>
  );

  const renderRecordItem = ({ item }) => {
    const employeeName = item.employee_id ? item.employee_id[1] : '-';
    const department = item.department_id ? item.department_id[1] : '-';

    return (
      <View style={styles.recordCard}>
        <View style={styles.recordHeader}>
          <View style={styles.recordEmployee}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarSmallText}>{employeeName.charAt(0)}</Text>
            </View>
            <View>
              <Text style={styles.recordName}>{employeeName}</Text>
              <Text style={styles.recordDept}>{department}</Text>
            </View>
          </View>
          <View style={styles.lateBadge}>
            <Text style={styles.lateBadgeText}>{item.late_minutes} min</Text>
          </View>
        </View>

        <View style={styles.recordDetails}>
          <View style={styles.detailRow}>
            <Feather name="calendar" size={scale(13)} color="#888" />
            <Text style={styles.detailText}>{item.date || '-'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Feather name="clock" size={scale(13)} color="#888" />
            <Text style={styles.detailText}>In: {formatDateTime(item.check_in)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Feather name="target" size={scale(13)} color="#888" />
            <Text style={styles.detailText}>Expected: {formatTime(item.expected_start_time || 8)}</Text>
          </View>
        </View>

        <View style={styles.recordFooter}>
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>Day #</Text>
            <Text style={styles.footerValue}>{item.late_day_sequence}</Text>
          </View>
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>Deduction</Text>
            <Text style={[styles.footerValue, item.deduction_amount > 0 && { color: '#E74C3C' }]}>
              {(item.deduction_amount || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>Reason</Text>
            <Text style={styles.footerValue} numberOfLines={1}>
              {item.late_reason || 'Not provided'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Late Records" onBackPress={() => navigation.goBack()} />

      {renderFilterBar()}
      {renderMonthPicker()}
      {renderEmployeePicker()}
      {renderSummaryCard()}

      <FlatList
        data={filteredRecords}
        renderItem={renderRecordItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ padding: scale(12), paddingBottom: scale(80) }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="check-circle" size={scale(48)} color="#4CAF50" />
              <Text style={styles.emptyText}>No late records found</Text>
              <Text style={styles.emptySubtext}>Everyone was on time!</Text>
            </View>
          )
        }
      />

      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: scale(12),
    paddingVertical: scale(8),
    gap: scale(8),
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    paddingHorizontal: scale(12),
    paddingVertical: scale(8),
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: COLORS.primaryThemeColor,
    gap: scale(4),
  },
  filterChipActive: {
    backgroundColor: COLORS.primaryThemeColor,
  },
  filterChipText: {
    fontSize: scale(12),
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.primaryThemeColor,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  dropdownContainer: {
    marginHorizontal: scale(12),
    backgroundColor: '#fff',
    borderRadius: scale(12),
    maxHeight: scale(200),
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8 },
    }),
  },
  dropdownScroll: {
    maxHeight: scale(200),
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemActive: {
    backgroundColor: '#F0F4FF',
  },
  dropdownItemText: {
    fontSize: scale(13),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
  },
  dropdownItemTextActive: {
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: scale(12),
    marginVertical: scale(6),
    borderRadius: scale(12),
    padding: scale(14),
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
  summaryValue: {
    fontSize: scale(18),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  summaryLabel: {
    fontSize: scale(11),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginTop: 2,
  },
  recordCard: {
    backgroundColor: '#fff',
    borderRadius: scale(12),
    padding: scale(14),
    marginBottom: scale(8),
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
    }),
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(10),
  },
  recordEmployee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  avatarSmall: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: COLORS.primaryThemeColor,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmallText: {
    fontSize: scale(16),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
  },
  recordName: {
    fontSize: scale(14),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  recordDept: {
    fontSize: scale(11),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
  },
  lateBadge: {
    backgroundColor: '#FDE8E8',
    paddingHorizontal: scale(10),
    paddingVertical: scale(4),
    borderRadius: scale(12),
  },
  lateBadgeText: {
    fontSize: scale(12),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#E74C3C',
  },
  recordDetails: {
    backgroundColor: '#FAFAFA',
    borderRadius: scale(8),
    padding: scale(10),
    marginBottom: scale(10),
    gap: scale(6),
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  detailText: {
    fontSize: scale(12),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#555',
  },
  recordFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerItem: {
    flex: 1,
  },
  footerLabel: {
    fontSize: scale(10),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
  },
  footerValue: {
    fontSize: scale(12),
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: scale(80),
  },
  emptyText: {
    fontSize: scale(16),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    marginTop: scale(12),
  },
  emptySubtext: {
    fontSize: scale(13),
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginTop: scale(4),
  },
});

export default LateRecordsScreen;
