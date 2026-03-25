import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, Platform } from 'react-native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { generateGrossProfitReportOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { format } from 'date-fns';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

const REPORT_TYPES = [
  { key: 'product', label: 'By Product', icon: 'inventory' },
  { key: 'salesperson', label: 'By Salesperson', icon: 'person' },
  { key: 'customer', label: 'By Customer', icon: 'people' },
  { key: 'category', label: 'By Category', icon: 'category' },
  { key: 'detailed', label: 'Detailed', icon: 'receipt-long' },
];

const GrossProfitReportScreen = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('this_month');
  const [reportType, setReportType] = useState('product');
  const [dateFrom, setDateFrom] = useState(new Date());
  const [dateTo, setDateTo] = useState(new Date());
  const [showDateFrom, setShowDateFrom] = useState(false);
  const [showDateTo, setShowDateTo] = useState(false);
  const [summary, setSummary] = useState(null);
  const [lines, setLines] = useState([]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const params = { period, reportType };
      if (period === 'custom') {
        params.dateFrom = format(dateFrom, 'yyyy-MM-dd');
        params.dateTo = format(dateTo, 'yyyy-MM-dd');
      }
      const result = await generateGrossProfitReportOdoo(params);
      setSummary(result.summary);
      setLines(result.lines);
      if (result.lines.length === 0) {
        showToastMessage('No data found for the selected period');
      }
    } catch (err) {
      showToastMessage(err?.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const SummaryCard = ({ icon, label, value, color }) => (
    <View style={s.summaryCard}>
      <MaterialIcons name={icon} size={22} color={color || COLORS.primaryThemeColor} />
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, color ? { color } : null]}>{value}</Text>
    </View>
  );

  const renderLine = ({ item }) => {
    const isPositive = item.grossProfit >= 0;
    return (
      <View style={s.lineCard}>
        <View style={s.lineHeader}>
          <Text style={s.lineName} numberOfLines={2}>{item.name}</Text>
          <View style={[s.gpBadge, { backgroundColor: isPositive ? '#E8F5E9' : '#FFEBEE' }]}>
            <Text style={[s.gpBadgeText, { color: isPositive ? '#4CAF50' : '#F44336' }]}>
              {item.gpMargin.toFixed(1)}%
            </Text>
          </View>
        </View>
        <View style={s.lineDetails}>
          <View style={s.lineCol}>
            <Text style={s.lineLabel}>Sales</Text>
            <Text style={s.lineValue}>{currencySymbol} {item.saleAmount.toFixed(3)}</Text>
          </View>
          <View style={s.lineCol}>
            <Text style={s.lineLabel}>COGS</Text>
            <Text style={s.lineValue}>{currencySymbol} {item.costAmount.toFixed(3)}</Text>
          </View>
          <View style={s.lineCol}>
            <Text style={s.lineLabel}>GP</Text>
            <Text style={[s.lineValue, { color: isPositive ? '#4CAF50' : '#F44336', fontFamily: FONT_FAMILY.urbanistExtraBold }]}>
              {currencySymbol} {item.grossProfit.toFixed(3)}
            </Text>
          </View>
        </View>
        {item.quantity > 0 && (
          <Text style={s.lineQty}>Qty: {item.quantity}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Gross Profit Report" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        {/* Period Selection */}
        <Text style={s.sectionTitle}>Period</Text>
        <View style={s.chipRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[s.chip, period === p.key && s.chipActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[s.chipText, period === p.key && s.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom Date Range */}
        {period === 'custom' && (
          <View style={s.dateRow}>
            <TouchableOpacity style={s.dateBtn} onPress={() => setShowDateFrom(true)}>
              <MaterialIcons name="calendar-today" size={18} color="#666" />
              <Text style={s.dateBtnText}>From: {format(dateFrom, 'yyyy-MM-dd')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.dateBtn} onPress={() => setShowDateTo(true)}>
              <MaterialIcons name="calendar-today" size={18} color="#666" />
              <Text style={s.dateBtnText}>To: {format(dateTo, 'yyyy-MM-dd')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Report Type */}
        <Text style={s.sectionTitle}>Report Type</Text>
        <View style={s.chipRow}>
          {REPORT_TYPES.map(rt => (
            <TouchableOpacity
              key={rt.key}
              style={[s.typeChip, reportType === rt.key && s.chipActive]}
              onPress={() => setReportType(rt.key)}
            >
              <MaterialIcons name={rt.icon} size={16} color={reportType === rt.key ? '#fff' : '#666'} />
              <Text style={[s.chipText, reportType === rt.key && s.chipTextActive]}>{rt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Generate Button */}
        <LoadingButton title="Generate Report" onPress={handleGenerate} loading={loading} marginTop={14} />

        {/* Summary Cards */}
        {summary && (
          <>
            <View style={s.summarySection}>
              <Text style={s.summaryPeriod}>
                {summary.dateFrom} to {summary.dateTo}
              </Text>
              <View style={s.summaryGrid}>
                <SummaryCard icon="trending-up" label="Sales" value={`${currencySymbol} ${summary.totalSales.toFixed(3)}`} color="#2196F3" />
                <SummaryCard icon="trending-down" label="COGS" value={`${currencySymbol} ${summary.totalCogs.toFixed(3)}`} color="#FF9800" />
                <SummaryCard icon="account-balance" label="Gross Profit" value={`${currencySymbol} ${summary.totalGP.toFixed(3)}`} color={summary.totalGP >= 0 ? '#4CAF50' : '#F44336'} />
                <SummaryCard icon="percent" label="GP Margin" value={`${summary.totalGPMargin.toFixed(1)}%`} color={summary.totalGPMargin >= 0 ? '#4CAF50' : '#F44336'} />
              </View>
            </View>

            {/* Report Lines */}
            {lines.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={s.sectionTitle}>{lines.length} Result{lines.length !== 1 ? 's' : ''}</Text>
                <FlatList
                  data={lines}
                  keyExtractor={(item, i) => String(item.id || i)}
                  renderItem={renderLine}
                  scrollEnabled={false}
                />
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />

        {/* Date Pickers */}
        <DateTimePickerModal isVisible={showDateFrom} mode="date" date={dateFrom}
          onConfirm={(d) => { setShowDateFrom(false); setDateFrom(d); }}
          onCancel={() => setShowDateFrom(false)} />
        <DateTimePickerModal isVisible={showDateTo} mode="date" date={dateTo}
          onConfirm={(d) => { setShowDateTo(false); setDateTo(d); }}
          onCancel={() => setShowDateTo(false)} />
      </RoundedScrollContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    marginTop: 16,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: {
    backgroundColor: COLORS.primaryThemeColor,
    borderColor: COLORS.primaryThemeColor,
  },
  chipText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#555',
  },
  chipTextActive: {
    color: '#fff',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateBtnText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
  },
  // Summary
  summarySection: {
    marginTop: 20,
  },
  summaryPeriod: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    textAlign: 'center',
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
    }),
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginTop: 6,
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    color: COLORS.primaryThemeColor,
    marginTop: 4,
  },
  // Lines
  lineCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    }),
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  lineName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    flex: 1,
    marginRight: 8,
  },
  gpBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gpBadgeText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  lineDetails: {
    flexDirection: 'row',
    gap: 8,
  },
  lineCol: {
    flex: 1,
  },
  lineLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginBottom: 2,
  },
  lineValue: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  lineQty: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
    marginTop: 6,
  },
});

export default GrossProfitReportScreen;
