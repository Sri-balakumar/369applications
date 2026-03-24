import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView } from '@components/containers';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchRepairStepsListOdoo } from '@api/services/generalApi';

const DIFFICULTY_COLORS = {
  easy: { bg: '#E8F5E9', text: '#4CAF50', label: 'Easy' },
  medium: { bg: '#FFF3E0', text: '#FF9800', label: 'Medium' },
  hard: { bg: '#FFEBEE', text: '#F44336', label: 'Hard' },
};

const STATUS_COLORS = {
  pending: { bg: '#FFF3E0', text: '#FF9800', label: 'Pending' },
  done: { bg: '#E8F5E9', text: '#4CAF50', label: 'Done' },
  skip: { bg: '#E3F2FD', text: '#2196F3', label: 'Skipped' },
  skipped: { bg: '#E3F2FD', text: '#2196F3', label: 'Skipped' },
  failed: { bg: '#FFEBEE', text: '#F44336', label: 'Failed' },
};

const RepairStepsListScreen = ({ navigation, route }) => {
  const jobCardId = route?.params?.jobCardId;
  const jobCardRef = route?.params?.jobCardRef;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchRepairStepsListOdoo({ jobCardId });
      setRecords(data);
    } catch (err) {
      console.error('RepairSteps load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [jobCardId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const getDiffStyle = (diff) => {
    const key = (diff || 'easy').toLowerCase();
    return DIFFICULTY_COLORS[key] || DIFFICULTY_COLORS.easy;
  };

  const getStatusStyle = (status) => {
    const key = (status || 'pending').toLowerCase();
    return STATUS_COLORS[key] || STATUS_COLORS.pending;
  };

  const renderItem = ({ item, index }) => {
    const diffStyle = getDiffStyle(item.difficulty);
    const statusStyle = getStatusStyle(item.status);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('RepairStepDetailScreen', { stepId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.refBadge}>
            <Text style={styles.refText}>{item.job_card_ref}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
          </View>
        </View>

        <Text style={styles.stepTitle}>{item.step_title}</Text>

        <View style={styles.cardRow}>
          <View style={[styles.diffBadge, { backgroundColor: diffStyle.bg }]}>
            <Text style={[styles.diffText, { color: diffStyle.text }]}>{diffStyle.label}</Text>
          </View>

          <View style={styles.minutesWrap}>
            <MaterialIcons name="schedule" size={14} color="#666" />
            <Text style={styles.minutesText}>{item.estimated_minutes} min</Text>
          </View>

          {item.source ? (
            <View style={styles.sourceWrap}>
              <MaterialIcons name="auto-awesome" size={14} color="#2196F3" />
              <Text style={styles.sourceText}>{item.source}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const title = jobCardRef ? `Repair Steps — ${jobCardRef}` : 'Repair Steps';

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader title={title} onBackPress={() => navigation.goBack()} />
      {loading && !refreshing ? (
        <OverlayLoader visible={true} />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialIcons name="handyman" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No repair steps found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 40 },
  card: {
    backgroundColor: 'white', borderRadius: 10, padding: 14, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  refBadge: { backgroundColor: '#F3E5F5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  refText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#714B67' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },
  stepTitle: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  diffBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  diffText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },
  minutesWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  minutesText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666' },
  sourceWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourceText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#2196F3' },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginTop: 12 },
});

export default RepairStepsListScreen;
