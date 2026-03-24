import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView } from '@components/containers';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchJobCardDashboardOdoo } from '@api/services/generalApi';

const STAGE_CONFIG = [
  { key: 'draft', label: 'Draft', icon: 'description', color: '#2196F3', borderColor: '#2196F3' },
  { key: 'inspection', label: 'Inspection', icon: 'search', color: '#FF9800', borderColor: '#FF9800' },
  { key: 'quotation', label: 'Quotation', icon: 'receipt-long', color: '#9C27B0', borderColor: '#9C27B0' },
  { key: 'repair', label: 'Repair', icon: 'build', color: '#FF5722', borderColor: '#FF5722' },
  { key: 'completed', label: 'Completed', icon: 'check-circle', color: '#4CAF50', borderColor: '#4CAF50' },
  { key: 'cancelled', label: 'Cancelled', icon: 'cancel', color: '#F44336', borderColor: '#F44336' },
];

const DOT_COLORS = ['#2196F3', '#FF9800', '#9C27B0', '#4CAF50', '#FF5722', '#F44336', '#607D8B', '#795548'];

// Title-case a snake_case or lowercase string
const titleCase = (s) => {
  if (!s || s === 'Unknown') return s;
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const MobileRepairDashboard = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchJobCardDashboardOdoo();
      setDashboard(data);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const navigateToList = (stageFilter) => {
    navigation.navigate('MobileRepairScreen', stageFilter ? { stageFilter } : undefined);
  };

  const stageCounts = dashboard?.stageCounts || {};
  const stats = dashboard?.statistics || {};
  const inspectionTypes = dashboard?.inspectionTypes || {};
  const deliveryTypes = dashboard?.deliveryTypes || {};

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader
        title="Laptops & Mobiles Repair"
        onBackPress={() => navigation.goBack()}
        rightComponent={
          <TouchableOpacity onPress={() => navigateToList()} style={styles.headerBtn}>
            <MaterialIcons name="list" size={22} color={COLORS.primaryThemeColor} />
          </TouchableOpacity>
        }
      />

      {loading && !refreshing ? (
        <OverlayLoader visible={true} />
      ) : (
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.content}>
            {/* Title */}
            <View style={styles.titleRow}>
              <MaterialIcons name="build" size={22} color="#714B67" />
              <Text style={styles.pageTitle}>Laptops & Mobiles Repair Dashboard</Text>
            </View>

            {/* Job Cards Stage Cards */}
            <Text style={styles.sectionTitle}>Job Cards</Text>
            <View style={styles.stageGrid}>
              {STAGE_CONFIG.map((stage) => (
                <TouchableOpacity
                  key={stage.key}
                  style={[styles.stageCard, { borderTopColor: stage.borderColor }]}
                  onPress={() => navigateToList(stage.key)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name={stage.icon} size={28} color={stage.color} style={styles.stageIcon} />
                  <Text style={styles.stageCount}>{stageCounts[stage.key] || 0}</Text>
                  <Text style={styles.stageLabel}>{stage.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Bottom Row: Statistics | Inspection Types | Delivery Types */}
            <View style={styles.bottomRow}>
              {/* Statistics */}
              <View style={styles.bottomCard}>
                <Text style={styles.bottomCardTitle}>Statistics</Text>
                <View style={[styles.statBox, { backgroundColor: '#E8F5E9' }]}>
                  <Text style={styles.statNum}>{stats.completed || 0}</Text>
                  <Text style={[styles.statLabel, { color: '#4CAF50' }]}>Completed</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: '#FFF8E1' }]}>
                  <Text style={styles.statNum}>{stats.pending || 0}</Text>
                  <Text style={[styles.statLabel, { color: '#FF8F00' }]}>Pending</Text>
                </View>
              </View>

              {/* Inspection Types */}
              <View style={styles.bottomCard}>
                <Text style={styles.bottomCardTitle}>Inspection Types</Text>
                {Object.keys(inspectionTypes).length > 0 ? (
                  Object.entries(inspectionTypes).map(([key, count], i) => (
                    <View key={key} style={styles.dotRow}>
                      <View style={[styles.dot, { backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }]} />
                      <Text style={styles.dotLabel}>{titleCase(key)}:</Text>
                      <Text style={styles.dotCount}>{count}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No data</Text>
                )}
              </View>

              {/* Delivery Types */}
              <View style={styles.bottomCard}>
                <Text style={styles.bottomCardTitle}>Delivery Types</Text>
                {Object.keys(deliveryTypes).length > 0 ? (
                  Object.entries(deliveryTypes).map(([key, count], i) => (
                    <View key={key} style={styles.dotRow}>
                      <View style={[styles.dot, { backgroundColor: DOT_COLORS[(i + 2) % DOT_COLORS.length] }]} />
                      <Text style={styles.dotLabel}>{titleCase(key)}:</Text>
                      <Text style={styles.dotCount}>{count}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No data</Text>
                )}
              </View>
            </View>

            {/* View All Job Cards Button */}
            <TouchableOpacity style={styles.viewAllBtn} onPress={() => navigateToList()}>
              <MaterialIcons name="format-list-bulleted" size={18} color="white" />
              <Text style={styles.viewAllBtnText}>View All Job Cards</Text>
            </TouchableOpacity>

            {/* Diagnosis, Repair Steps & Products */}
            <View style={styles.navRow}>
              <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('DiagnosisListScreen')}>
                <MaterialIcons name="biotech" size={28} color="#9C27B0" />
                <Text style={styles.navCardTitle}>Diagnosis</Text>
                <Text style={styles.navCardSub}>View all diagnosis records</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('RepairStepsListScreen')}>
                <MaterialIcons name="handyman" size={28} color="#FF5722" />
                <Text style={styles.navCardTitle}>Repair Steps</Text>
                <Text style={styles.navCardSub}>View all repair steps</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.navRow}>
              <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('ProductListScreen')}>
                <MaterialIcons name="category" size={28} color="#00897B" />
                <Text style={styles.navCardTitle}>Products</Text>
                <Text style={styles.navCardSub}>Services & Spare Parts</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('SpareManagementScreen')}>
                <MaterialIcons name="inventory" size={28} color="#FF9800" />
                <Text style={styles.navCardTitle}>Spare Mgmt</Text>
                <Text style={styles.navCardSub}>Requests, Issues & Returns</Text>
              </TouchableOpacity>
            </View>

            {/* New Job Card Button */}
            <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('MobileRepairForm')}>
              <MaterialIcons name="add" size={18} color="white" />
              <Text style={styles.newBtnText}>New Job Card</Text>
            </TouchableOpacity>

            <View style={{ height: 30 }} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16 },
  headerBtn: { padding: 8 },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  pageTitle: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },

  sectionTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginBottom: 10 },

  // Stage Cards Grid (3 columns x 2 rows)
  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  stageCard: {
    width: '31%', backgroundColor: 'white', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', borderTopWidth: 3, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  stageIcon: { marginBottom: 6 },
  stageCount: { fontSize: 24, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },
  stageLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666', marginTop: 2 },

  // Bottom Row (3 cards)
  bottomRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  bottomCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 10, padding: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  bottomCardTitle: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginBottom: 10 },

  // Statistics
  statBox: { borderRadius: 6, padding: 10, marginBottom: 6 },
  statNum: { fontSize: 20, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },
  statLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium },

  // Dot rows (Inspection Types, Delivery Types)
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#555' },
  dotCount: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },
  emptyText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', fontStyle: 'italic' },

  // Buttons
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#714B67', paddingVertical: 14, borderRadius: 10, marginBottom: 10,
  },
  viewAllBtnText: { color: 'white', fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold },
  navRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  navCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 10, padding: 14, alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  navCardTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginTop: 6 },
  navCardSub: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666', marginTop: 2, textAlign: 'center' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#00A09D', paddingVertical: 14, borderRadius: 10,
  },
  newBtnText: { color: 'white', fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold },
});

export default MobileRepairDashboard;
