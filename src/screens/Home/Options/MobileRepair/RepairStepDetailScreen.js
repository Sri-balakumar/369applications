import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView } from '@components/containers';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToast } from '@utils/common';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchRepairStepDetailOdoo, updateRepairStepStatusOdoo } from '@api/services/generalApi';
import ODOO_BASE_URL from '@api/config/odooConfig';

// Strip HTML tags from Odoo rich text fields
const stripHtml = (html) => {
  if (!html || typeof html !== 'string') return html || '';
  const removeTags = (s) => { let o = '', t = false; for (let i = 0; i < s.length; i++) { if (s[i] === '<') { t = true; } else if (s[i] === '>') { t = false; } else if (!t) o += s[i]; } return o; };
  const decEnt = (s) => s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&[a-zA-Z]+;/g, ' ');
  let t = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<li[^>]*>/gi, '- ').replace(/<\/li>/gi, '\n');
  t = removeTags(t); t = decEnt(t); t = removeTags(t); t = decEnt(t); t = removeTags(t);
  return t.replace(/\n{3,}/g, '\n\n').trim();
};

const STATUS_CONFIG = {
  pending: { color: '#FF9800', label: 'Pending' },
  done: { color: '#4CAF50', label: 'Done' },
  skip: { color: '#2196F3', label: 'Skipped' },
  skipped: { color: '#2196F3', label: 'Skipped' },
  failed: { color: '#F44336', label: 'Failed' },
};

const DIFFICULTY_CONFIG = {
  easy: { color: '#4CAF50', label: 'Easy' },
  medium: { color: '#FF9800', label: 'Medium' },
  hard: { color: '#F44336', label: 'Hard' },
};

const RepairStepDetailScreen = ({ navigation, route }) => {
  const stepId = route?.params?.stepId;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const detail = await fetchRepairStepDetailOdoo(stepId);
      setData(detail);
    } catch (err) {
      console.error('RepairStepDetail load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [stepId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleStatusAction = async (status) => {
    setActionLoading(true);
    try {
      await updateRepairStepStatusOdoo(stepId, status);
      showToast({ type: 'success', title: 'Updated', message: `Step marked as ${status}` });
      loadData();
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: err?.message || 'Failed to update status' });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusConfig = (s) => STATUS_CONFIG[(s || 'pending').toLowerCase()] || STATUS_CONFIG.pending;
  const getDiffConfig = (d) => DIFFICULTY_CONFIG[(d || 'easy').toLowerCase()] || DIFFICULTY_CONFIG.easy;

  const getImageUrl = (field) => {
    if (!field) return null;
    if (typeof field === 'string' && field.startsWith('http')) return field;
    if (typeof field === 'string' && field.length > 100) {
      return `data:image/png;base64,${field}`;
    }
    return null;
  };

  const renderField = (label, value) => {
    if (!value && value !== 0) return null;
    return (
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
    );
  };

  if (loading) return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader title="Repair Step" onBackPress={() => navigation.goBack()} />
      <OverlayLoader visible={true} />
    </SafeAreaView>
  );

  if (!data) return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader title="Repair Step" onBackPress={() => navigation.goBack()} />
      <View style={styles.emptyWrap}><Text style={styles.emptyText}>Step not found</Text></View>
    </SafeAreaView>
  );

  const statusCfg = getStatusConfig(data.status);
  const diffCfg = getDiffConfig(data.difficulty);
  const beforeImg = getImageUrl(data.before_photo);
  const afterImg = getImageUrl(data.after_photo);
  const statusSteps = ['Pending', 'Done'];
  const activeStepIdx = (data.status || '').toLowerCase() === 'done' ? 1 : 0;

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader
        title={data.step_title || 'Repair Step'}
        onBackPress={() => navigation.goBack()}
      />

      {/* Action Buttons */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.doneBtn, actionLoading && { opacity: 0.6 }]}
          onPress={() => handleStatusAction('done')}
          disabled={actionLoading}
        >
          <MaterialIcons name="check" size={16} color="white" />
          <Text style={styles.actionBtnText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.skipBtn, actionLoading && { opacity: 0.6 }]}
          onPress={() => handleStatusAction('skip')}
          disabled={actionLoading}
        >
          <MaterialIcons name="skip-next" size={16} color="white" />
          <Text style={styles.actionBtnText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.failBtn, actionLoading && { opacity: 0.6 }]}
          onPress={() => handleStatusAction('failed')}
          disabled={actionLoading}
        >
          <MaterialIcons name="close" size={16} color="white" />
          <Text style={styles.actionBtnText}>Failed</Text>
        </TouchableOpacity>

        {/* Status Progress */}
        <View style={styles.statusProgress}>
          {statusSteps.map((step, i) => (
            <View key={step} style={styles.statusStepWrap}>
              <View style={[styles.statusDot, i <= activeStepIdx && { backgroundColor: statusCfg.color }]} />
              <Text style={[styles.statusStepText, i <= activeStepIdx && { color: statusCfg.color, fontFamily: FONT_FAMILY.urbanistBold }]}>{step}</Text>
              {i < statusSteps.length - 1 && <View style={[styles.statusLine, i < activeStepIdx && { backgroundColor: statusCfg.color }]} />}
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Fields Section */}
        <View style={styles.fieldsCard}>
          <View style={styles.fieldsRow}>
            <View style={styles.fieldsCol}>
              {renderField('Job Card', data.job_card_ref)}
              {renderField('Step Title', data.step_title)}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Difficulty</Text>
                <View style={[styles.inlineBadge, { backgroundColor: diffCfg.color + '20' }]}>
                  <Text style={[styles.inlineBadgeText, { color: diffCfg.color }]}>{diffCfg.label}</Text>
                </View>
              </View>
              {renderField('Source', data.source)}
              {data.source_url ? renderField('Source URL', data.source_url) : null}
            </View>
            <View style={styles.fieldsCol}>
              {renderField('Estimated Minutes', data.estimated_minutes)}
              {renderField('Parts Used', Array.isArray(data.parts_used) && data.parts_used.length > 0 ? data.parts_used.join(', ') : '')}
              {renderField('Part Cost', data.part_cost ? data.part_cost.toFixed(2) : '0.00')}
            </View>
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INSTRUCTIONS</Text>
          <View style={styles.sectionContent}>
            <Text style={styles.instructionsText}>
              {stripHtml(data.instructions) || 'No instructions provided'}
            </Text>
          </View>
        </View>

        {/* Media */}
        <View style={styles.section}>
          <View style={styles.mediaSplit}>
            <View style={styles.mediaCol}>
              <Text style={styles.sectionTitle}>MEDIA</Text>
              <Text style={styles.mediaLabel}>Before Photo</Text>
              {beforeImg ? (
                <Image source={{ uri: beforeImg }} style={styles.mediaImage} resizeMode="cover" />
              ) : (
                <View style={styles.mediaPlaceholder}>
                  <MaterialIcons name="add-a-photo" size={40} color="#CCC" />
                </View>
              )}
              <Text style={styles.mediaLabel}>After Photo</Text>
              {afterImg ? (
                <Image source={{ uri: afterImg }} style={styles.mediaImage} resizeMode="cover" />
              ) : (
                <View style={styles.mediaPlaceholder}>
                  <MaterialIcons name="add-a-photo" size={40} color="#CCC" />
                </View>
              )}
            </View>
            <View style={styles.mediaCol}>
              <Text style={styles.sectionTitle}>NOTES</Text>
              <Text style={styles.mediaLabel}>Technician Notes</Text>
              <View style={styles.notesBox}>
                <Text style={styles.notesText}>
                  {stripHtml(data.technician_notes) || 'No technician notes'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {actionLoading && <OverlayLoader visible={true} />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  // Action bar
  actionBar: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    padding: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#EEE', gap: 8,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4 },
  doneBtn: { backgroundColor: '#4CAF50' },
  skipBtn: { backgroundColor: '#2196F3' },
  failBtn: { backgroundColor: '#F44336' },
  actionBtnText: { color: 'white', fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold },

  // Status progress
  statusProgress: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 4 },
  statusStepWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#DDD' },
  statusStepText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999' },
  statusLine: { width: 20, height: 2, backgroundColor: '#DDD' },

  // Fields card
  fieldsCard: { backgroundColor: 'white', margin: 12, borderRadius: 10, padding: 16, elevation: 1 },
  fieldsRow: { flexDirection: 'row', gap: 16 },
  fieldsCol: { flex: 1 },
  fieldRow: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#666', marginBottom: 2 },
  fieldValue: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black },
  inlineBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 2 },
  inlineBadgeText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold },

  // Sections
  section: { backgroundColor: 'white', marginHorizontal: 12, marginBottom: 12, borderRadius: 10, padding: 16, elevation: 1 },
  sectionTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 8, marginBottom: 12 },
  sectionContent: {},
  instructionsText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333', lineHeight: 22 },

  // Media & Notes
  mediaSplit: { flexDirection: 'row', gap: 16 },
  mediaCol: { flex: 1 },
  mediaLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginBottom: 8, marginTop: 4 },
  mediaImage: { width: '100%', height: 160, borderRadius: 8, marginBottom: 12, backgroundColor: '#F5F5F5' },
  mediaPlaceholder: {
    width: '100%', height: 160, borderRadius: 8, marginBottom: 12,
    backgroundColor: '#F9F9F9', borderWidth: 2, borderColor: '#EEE', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  notesBox: { backgroundColor: '#F9F9F9', borderRadius: 8, padding: 12, minHeight: 100 },
  notesText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#555', lineHeight: 20 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999' },
});

export default RepairStepDetailScreen;
