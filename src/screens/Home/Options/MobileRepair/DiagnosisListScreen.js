import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView } from '@components/containers';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchDiagnosisListOdoo } from '@api/services/generalApi';

const stripHtml = (html) => {
  if (!html || typeof html !== 'string') return html || '';
  const removeTags = (s) => { let o = '', t = false; for (let i = 0; i < s.length; i++) { if (s[i] === '<') { t = true; } else if (s[i] === '>') { t = false; } else if (!t) o += s[i]; } return o; };
  const decEnt = (s) => s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&[a-zA-Z]+;/g, ' ');
  let t = html.replace(/<br\s*\/?>/gi, ' ');
  t = removeTags(t); t = decEnt(t); t = removeTags(t); t = decEnt(t); t = removeTags(t);
  return t.trim();
};

const RESULT_COLORS = {
  not_tested: { bg: '#F5F5F5', text: '#666', label: 'Not Tested' },
  pass: { bg: '#E8F5E9', text: '#4CAF50', label: 'Pass' },
  passed: { bg: '#E8F5E9', text: '#4CAF50', label: 'Pass' },
  fail: { bg: '#FFEBEE', text: '#F44336', label: 'Fail' },
  failed: { bg: '#FFEBEE', text: '#F44336', label: 'Fail' },
};

const CATEGORY_ICONS = {
  'Power / Battery': 'battery-full',
  'Display / Screen': 'smartphone',
  'Charging / Port': 'power',
  'Other': 'more-horiz',
};

const DiagnosisListScreen = ({ navigation, route }) => {
  const jobCardId = route?.params?.jobCardId;
  const jobCardRef = route?.params?.jobCardRef;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchDiagnosisListOdoo({ jobCardId });
      setRecords(data);
    } catch (err) {
      console.error('Diagnosis load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [jobCardId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const getResultStyle = (result) => {
    const key = (result || 'not_tested').toLowerCase().replace(/\s+/g, '_');
    return RESULT_COLORS[key] || RESULT_COLORS.not_tested;
  };

  const renderItem = ({ item }) => {
    const resultStyle = getResultStyle(item.result);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.refBadge}>
            <Text style={styles.refText}>{item.job_card_ref}</Text>
          </View>
          <View style={[styles.resultBadge, { backgroundColor: resultStyle.bg }]}>
            <Text style={[styles.resultText, { color: resultStyle.text }]}>{resultStyle.label}</Text>
          </View>
        </View>

        <Text style={styles.testName}>{item.test_name}</Text>

        <View style={styles.cardRow}>
          <View style={styles.categoryWrap}>
            <MaterialIcons
              name={CATEGORY_ICONS[item.category] || 'category'}
              size={14}
              color="#666"
            />
            <Text style={styles.categoryText}>{item.category || 'N/A'}</Text>
          </View>
          <View style={styles.confidenceWrap}>
            <MaterialIcons name="analytics" size={14} color="#9C27B0" />
            <Text style={styles.confidenceText}>{(item.ai_confidence || 0).toFixed(2)}</Text>
          </View>
        </View>

        {item.root_cause ? (
          <View style={styles.rootCauseRow}>
            <MaterialIcons name="error-outline" size={14} color="#FF9800" />
            <Text style={styles.rootCauseText} numberOfLines={2}>{stripHtml(item.root_cause)}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const title = jobCardRef ? `Diagnosis — ${jobCardRef}` : 'Diagnosis';

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
              <MaterialIcons name="search-off" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No diagnosis records found</Text>
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
  resultBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  resultText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },
  testName: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginBottom: 8 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  categoryWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  categoryText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666' },
  confidenceWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  confidenceText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#9C27B0' },
  rootCauseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 6, backgroundColor: '#FFF8E1', padding: 8, borderRadius: 6 },
  rootCauseText: { flex: 1, fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#795548' },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginTop: 12 },
});

export default DiagnosisListScreen;
