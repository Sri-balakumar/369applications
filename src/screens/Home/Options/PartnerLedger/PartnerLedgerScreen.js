import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, Platform, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { generatePartnerLedgerOdoo, fetchPartnerLedgerLinesOdoo, fetchCustomersOdoo } from '@api/services/generalApi';
import { useCurrencyStore } from '@stores/currency';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { format } from 'date-fns';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

const PARTNER_TYPES = [
  { key: 'customer', label: 'Receivable', icon: 'arrow-downward' },
  { key: 'supplier', label: 'Payable', icon: 'arrow-upward' },
  { key: 'customer_supplier', label: 'Both', icon: 'swap-vert' },
];

const TARGET_MOVES = [
  { key: 'posted', label: 'Posted Entries' },
  { key: 'all', label: 'All Entries' },
];

const PartnerLedgerScreen = ({ navigation }) => {
  const currencySymbol = useCurrencyStore((state) => state.currencySymbol) || '$';
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('this_month');
  const [partnerType, setPartnerType] = useState('customer_supplier');
  const [targetMove, setTargetMove] = useState('posted');
  const [dateFrom, setDateFrom] = useState(new Date());
  const [dateTo, setDateTo] = useState(new Date());
  const [showDateFrom, setShowDateFrom] = useState(false);
  const [showDateTo, setShowDateTo] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [partners, setPartners] = useState([]);
  const [expandedPartner, setExpandedPartner] = useState(null);
  const [partnerLines, setPartnerLines] = useState({});
  const [loadingLines, setLoadingLines] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Partners filter state
  const [selectedPartners, setSelectedPartners] = useState([]);
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [partnerSearchText, setPartnerSearchText] = useState('');
  const [availablePartners, setAvailablePartners] = useState([]);
  const [fetchingPartners, setFetchingPartners] = useState(false);

  useEffect(() => {
    if (!showPartnerDropdown) return;
    const timeout = setTimeout(() => loadPartners(partnerSearchText), 300);
    return () => clearTimeout(timeout);
  }, [showPartnerDropdown, partnerSearchText]);

  const loadPartners = async (search = '') => {
    setFetchingPartners(true);
    try {
      const result = await fetchCustomersOdoo({ searchText: search, limit: 30 });
      setAvailablePartners(result || []);
    } catch (err) {
      console.error('[PartnerLedger] fetchCustomersOdoo error:', err?.message);
      setAvailablePartners([]);
    } finally {
      setFetchingPartners(false);
    }
  };

  const togglePartner = (partner) => {
    setSelectedPartners(prev => {
      const exists = prev.find(p => p.id === partner.id);
      if (exists) return prev.filter(p => p.id !== partner.id);
      return [...prev, { id: partner.id, name: partner.name || partner.customer_name || '' }];
    });
  };

  const handleGenerate = async () => {
    setLoading(true);
    setReportData(null);
    setPartners([]);
    setExpandedPartner(null);
    setPartnerLines({});
    try {
      const params = { partnerType, period, targetMove };
      if (period === 'custom') {
        params.dateFrom = format(dateFrom, 'yyyy-MM-dd');
        params.dateTo = format(dateTo, 'yyyy-MM-dd');
      }
      if (selectedPartners.length > 0) {
        params.partnerIds = selectedPartners.map(p => p.id);
      }
      const result = await generatePartnerLedgerOdoo(params);
      setReportData(result);
      setPartners(result.partners || []);
      if (!result.partners || result.partners.length === 0) {
        showToastMessage('No data found for the selected filters');
      }
    } catch (err) {
      showToastMessage(err?.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handlePartnerTap = async (partner) => {
    if (expandedPartner === partner.id) {
      setExpandedPartner(null);
      return;
    }
    setExpandedPartner(partner.id);
    if (partnerLines[partner.id]) return;

    setLoadingLines(partner.id);
    try {
      const lines = await fetchPartnerLedgerLinesOdoo(reportData.reportId, partner.name);
      setPartnerLines(prev => ({ ...prev, [partner.id]: lines }));
    } catch (err) {
      showToastMessage('Failed to load details');
    } finally {
      setLoadingLines(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportData) return;
    setDownloadingPdf(true);
    try {
      const partnerRowsHtml = partners.map(p => `
        <tr style="background:#f9f9f9;">
          <td style="padding:8px;font-weight:bold;">${p.name}</td>
          <td style="text-align:right;padding:8px;">${p.openingBalance.toFixed(3)}</td>
          <td style="text-align:right;padding:8px;">${p.totalDebit.toFixed(3)}</td>
          <td style="text-align:right;padding:8px;">${p.totalCredit.toFixed(3)}</td>
          <td style="text-align:right;padding:8px;font-weight:bold;">${p.closingBalance.toFixed(3)}</td>
        </tr>
      `).join('');

      const html = `
        <html><head><meta charset="utf-8"/><style>
          body { font-family: Arial, sans-serif; color: #333; padding: 20px; }
          h2 { color: #2e2a4f; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #2e2a4f; color: #fff; padding: 10px 8px; font-size: 12px; text-align: right; }
          th:first-child { text-align: left; }
          td { font-size: 12px; border-bottom: 1px solid #eee; }
          .info { font-size: 13px; color: #666; text-align: center; margin: 4px 0; }
          .totals td { font-weight: bold; background: #f0f0f0; padding: 10px 8px; border-top: 2px solid #333; }
        </style></head><body>
          <h2>Partner Ledger Report</h2>
          <p class="info">${reportData.summary.companyName || ''}</p>
          <p class="info">Period: ${reportData.summary.dateFrom || '-'} to ${reportData.summary.dateTo || '-'}</p>
          <p class="info">Type: ${reportData.summary.partnerType || '-'} | Currency: ${reportData.summary.currency || currencySymbol}</p>
          <table>
            <thead><tr>
              <th style="text-align:left;">Partner</th>
              <th>Opening</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
            </tr></thead>
            <tbody>
              ${partnerRowsHtml}
              <tr class="totals">
                <td style="padding:8px;">Grand Total</td>
                <td style="text-align:right;padding:8px;">-</td>
                <td style="text-align:right;padding:8px;">${reportData.summary.grandDebit.toFixed(3)}</td>
                <td style="text-align:right;padding:8px;">${reportData.summary.grandCredit.toFixed(3)}</td>
                <td style="text-align:right;padding:8px;">${reportData.summary.grandBalance.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
          <p style="text-align:center;color:#999;font-size:10px;margin-top:30px;">Generated from 369ai Biz Mobile App</p>
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      const fileName = `Partner_Ledger_${Date.now()}.pdf`;

      if (Platform.OS === 'android') {
        const SAF = FileSystem.StorageAccessFramework;
        const permissions = await SAF.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          const safUri = await SAF.createFileAsync(permissions.directoryUri, fileName, 'application/pdf');
          await FileSystem.writeAsStringAsync(safUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
          showToastMessage('PDF saved: ' + fileName);
        } else {
          showToastMessage('Storage permission denied');
        }
      } else {
        const destUri = FileSystem.documentDirectory + fileName;
        await FileSystem.copyAsync({ from: uri, to: destUri });
        await Sharing.shareAsync(destUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
        showToastMessage('PDF saved: ' + fileName);
      }
    } catch (err) {
      console.error('[PartnerLedger PDF] error:', err);
      showToastMessage('Failed to generate PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const SummaryCard = ({ icon, label, value, color }) => (
    <View style={s.summaryCard}>
      <MaterialIcons name={icon} size={22} color={color || COLORS.primaryThemeColor} />
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, color ? { color } : null]}>{value}</Text>
    </View>
  );

  const renderPartner = ({ item }) => {
    const isExpanded = expandedPartner === item.id;
    const lines = partnerLines[item.id] || [];
    const isLoadingDetail = loadingLines === item.id;

    return (
      <View style={s.partnerCard}>
        <TouchableOpacity style={s.partnerHeader} onPress={() => handlePartnerTap(item)} activeOpacity={0.7}>
          <View style={{ flex: 1 }}>
            <Text style={s.partnerName}>{item.name}</Text>
            <View style={s.partnerRow}>
              <View style={s.partnerCol}>
                <Text style={s.partnerLabel}>Opening</Text>
                <Text style={s.partnerValue}>{item.openingBalance.toFixed(3)}</Text>
              </View>
              <View style={s.partnerCol}>
                <Text style={s.partnerLabel}>Debit</Text>
                <Text style={[s.partnerValue, { color: '#2196F3' }]}>{item.totalDebit.toFixed(3)}</Text>
              </View>
              <View style={s.partnerCol}>
                <Text style={s.partnerLabel}>Credit</Text>
                <Text style={[s.partnerValue, { color: '#F44336' }]}>{item.totalCredit.toFixed(3)}</Text>
              </View>
              <View style={s.partnerCol}>
                <Text style={s.partnerLabel}>Balance</Text>
                <Text style={[s.partnerValue, { fontFamily: FONT_FAMILY.urbanistExtraBold }]}>{item.closingBalance.toFixed(3)}</Text>
              </View>
            </View>
          </View>
          <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={24} color="#888" />
        </TouchableOpacity>

        {isExpanded && (
          <View style={s.linesContainer}>
            {isLoadingDetail ? (
              <ActivityIndicator size="small" color={COLORS.primaryThemeColor} style={{ padding: 12 }} />
            ) : lines.length === 0 ? (
              <Text style={s.noLines}>No detail lines</Text>
            ) : (
              <>
                <View style={s.lineHeaderRow}>
                  <Text style={[s.lineHeaderCell, { flex: 1.2 }]}>Date</Text>
                  <Text style={[s.lineHeaderCell, { flex: 2 }]}>Label</Text>
                  <Text style={[s.lineHeaderCell, { flex: 1, textAlign: 'right' }]}>Debit</Text>
                  <Text style={[s.lineHeaderCell, { flex: 1, textAlign: 'right' }]}>Credit</Text>
                  <Text style={[s.lineHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Balance</Text>
                </View>
                {lines.map((line, idx) => (
                  <View key={line.id || idx} style={s.lineRow}>
                    <Text style={[s.lineCell, { flex: 1.2 }]}>{line.date}</Text>
                    <Text style={[s.lineCell, { flex: 2 }]} numberOfLines={1}>{line.label || line.reference || '-'}</Text>
                    <Text style={[s.lineCell, { flex: 1, textAlign: 'right', color: line.debit > 0 ? '#2196F3' : '#999' }]}>{line.debit.toFixed(3)}</Text>
                    <Text style={[s.lineCell, { flex: 1, textAlign: 'right', color: line.credit > 0 ? '#F44336' : '#999' }]}>{line.credit.toFixed(3)}</Text>
                    <Text style={[s.lineCell, { flex: 1.2, textAlign: 'right', fontFamily: FONT_FAMILY.urbanistBold }]}>{line.runningBalance.toFixed(3)}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Partner Ledger" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        {/* Partner Type */}
        <Text style={s.sectionTitle}>Partner Type</Text>
        <View style={s.chipRow}>
          {PARTNER_TYPES.map(pt => (
            <TouchableOpacity
              key={pt.key}
              style={[s.typeChip, partnerType === pt.key && s.chipActive]}
              onPress={() => setPartnerType(pt.key)}
            >
              <MaterialIcons name={pt.icon} size={16} color={partnerType === pt.key ? '#fff' : '#666'} />
              <Text style={[s.chipText, partnerType === pt.key && s.chipTextActive]}>{pt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

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

        {/* Target Move */}
        <Text style={s.sectionTitle}>Entries</Text>
        <View style={s.chipRow}>
          {TARGET_MOVES.map(tm => (
            <TouchableOpacity
              key={tm.key}
              style={[s.chip, targetMove === tm.key && s.chipActive]}
              onPress={() => setTargetMove(tm.key)}
            >
              <Text style={[s.chipText, targetMove === tm.key && s.chipTextActive]}>{tm.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Partners Filter */}
        <Text style={s.sectionTitle}>Partners</Text>
        <TouchableOpacity
          style={s.partnerDropdownTrigger}
          onPress={() => setShowPartnerDropdown(!showPartnerDropdown)}
        >
          <MaterialIcons name="people" size={18} color="#666" />
          <Text style={selectedPartners.length > 0 ? s.partnerDropdownText : s.partnerDropdownPlaceholder} numberOfLines={1}>
            {selectedPartners.length > 0
              ? selectedPartners.map(p => p.name).join(', ')
              : 'All Partners'}
          </Text>
          <MaterialIcons name={showPartnerDropdown ? 'arrow-drop-up' : 'arrow-drop-down'} size={24} color="#666" />
        </TouchableOpacity>
        {selectedPartners.length > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={() => setSelectedPartners([])}>
            <MaterialIcons name="clear" size={14} color="#999" />
            <Text style={s.clearBtnText}>Clear selection</Text>
          </TouchableOpacity>
        )}
        {showPartnerDropdown && (
          <View style={s.partnerDropdownContainer}>
            <View style={s.partnerSearchRow}>
              <MaterialIcons name="search" size={18} color="#999" />
              <TextInput
                style={s.partnerSearchInput}
                placeholder="Search partners..."
                placeholderTextColor="#999"
                value={partnerSearchText}
                onChangeText={setPartnerSearchText}
                autoCapitalize="none"
              />
            </View>
            {fetchingPartners ? (
              <ActivityIndicator size="small" color={COLORS.primaryThemeColor} style={{ padding: 12 }} />
            ) : availablePartners.length === 0 ? (
              <Text style={s.noPartnerResults}>No partners found</Text>
            ) : (
              <FlatList
                data={availablePartners}
                keyExtractor={(item) => String(item.id)}
                style={{ maxHeight: 200 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="always"
                renderItem={({ item }) => {
                  const isSelected = selectedPartners.some(p => p.id === item.id);
                  return (
                    <TouchableOpacity style={s.partnerDropdownItem} onPress={() => togglePartner(item)}>
                      <MaterialIcons
                        name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                        size={20}
                        color={isSelected ? COLORS.primaryThemeColor : '#ccc'}
                      />
                      <Text style={[s.partnerDropdownItemText, isSelected && { color: COLORS.primaryThemeColor }]}>
                        {item.name || item.customer_name || '-'}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        )}

        {/* Generate Button */}
        <LoadingButton title="Generate Report" onPress={handleGenerate} loading={loading} marginTop={14} />

        {/* Summary Cards */}
        {reportData && (
          <>
            <View style={s.summarySection}>
              <Text style={s.summaryPeriod}>
                {reportData.summary.dateFrom || '-'} to {reportData.summary.dateTo || '-'}
              </Text>
              <View style={s.summaryGrid}>
                <SummaryCard icon="arrow-downward" label="Total Debit" value={`${currencySymbol} ${reportData.summary.grandDebit.toFixed(3)}`} color="#2196F3" />
                <SummaryCard icon="arrow-upward" label="Total Credit" value={`${currencySymbol} ${reportData.summary.grandCredit.toFixed(3)}`} color="#F44336" />
                <SummaryCard icon="account-balance" label="Balance" value={`${currencySymbol} ${reportData.summary.grandBalance.toFixed(3)}`} color={reportData.summary.grandBalance >= 0 ? '#4CAF50' : '#F44336'} />
              </View>
            </View>

            {/* Download PDF */}
            <View style={{ marginTop: 12 }}>
              <LoadingButton title={downloadingPdf ? 'Generating PDF...' : 'Download PDF'} onPress={handleDownloadPdf} loading={downloadingPdf} backgroundColor="#E85D04" />
            </View>

            {/* Partner List */}
            {partners.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={s.sectionTitle}>{partners.length} Partner{partners.length !== 1 ? 's' : ''}</Text>
                <FlatList
                  data={partners}
                  keyExtractor={(item, i) => String(item.id || i)}
                  renderItem={renderPartner}
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
    minWidth: '30%',
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
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    color: COLORS.primaryThemeColor,
    marginTop: 4,
  },
  // Partner cards
  partnerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    }),
  },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  partnerName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    marginBottom: 8,
  },
  partnerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  partnerCol: {
    flex: 1,
  },
  partnerLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    marginBottom: 2,
  },
  partnerValue: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  // Expanded lines
  linesContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  noLines: {
    textAlign: 'center',
    color: '#999',
    padding: 12,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  lineHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  lineHeaderCell: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#666',
  },
  lineRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  lineCell: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
  },
  // Partners dropdown
  partnerDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  partnerDropdownText: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
  },
  partnerDropdownPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  clearBtnText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
  },
  partnerDropdownContainer: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#fff',
    marginTop: 6,
    overflow: 'hidden',
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  partnerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  partnerSearchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
    paddingVertical: 2,
    marginLeft: 6,
  },
  partnerDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
  },
  partnerDropdownItemText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
    flex: 1,
  },
  noPartnerResults: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    textAlign: 'center',
    padding: 12,
  },
});

export default PartnerLedgerScreen;
