import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Modal, FlatList, TouchableOpacity, Switch, TextInput } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import Text from '@components/Text';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { showToast } from '@utils/common';
import { OverlayLoader } from '@components/Loader';
import { MaterialIcons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ODOO_BASE_URL, { DEFAULT_ODOO_DB, DEFAULT_USERNAME, DEFAULT_PASSWORD } from '@api/config/odooConfig';
import {
  fetchCustomersForRepairOdoo,
  fetchDeviceBrandsOdoo,
  fetchDeviceSeriesOdoo,
  fetchDeviceModelsOdoo,
  fetchRepairTeamsOdoo,
  fetchUsersOdoo,
  createJobCardOdoo,
  discoverJobCardRelatedModelsOdoo,
} from '@api/services/generalApi';

const PHYSICAL_CONDITIONS = [
  { id: 'good', name: 'Good - Minor Issue' },
  { id: 'fair', name: 'Fair - Moderate Issue' },
  { id: 'poor', name: 'Poor - Major Issue' },
  { id: 'critical', name: 'Critical - Severe Damage' },
];

const DELIVERY_TYPES = [
  { id: 'in_store', name: 'In Store' },
  { id: 'home_delivery', name: 'Home Delivery' },
  { id: 'courier', name: 'Courier' },
];

const INSPECTION_TYPES = [
  { id: 'free', name: 'Free Inspection' },
  { id: 'paid', name: 'Paid Inspection' },
];

const STAGES = ['Draft', 'In Inspection', 'Quotation', 'Repair', 'Completed'];
const TABS = ['Inspection', 'AI Diagnosis', 'Repair Steps', 'Required Services', 'Required Spare Parts', 'Other Info'];

const MobileRepairForm = ({ navigation, route }) => {
  const editData = route?.params?.jobCardData || null;
  const isEdit = !!editData?.id;

  const [formData, setFormData] = useState({
    partner_id: editData?.partner?.id || null,
    partnerName: editData?.partner?.name || '',
    phone: editData?.phone || '',
    email: editData?.email || '',
    priority: editData?.priority || '0',
    device_brand_id: editData?.device_brand?.id || null,
    brandName: editData?.device_brand?.name || '',
    device_series_id: editData?.device_series?.id || null,
    seriesName: editData?.device_series?.name || '',
    device_model_id: editData?.device_model?.id || null,
    modelName: editData?.device_model?.name || '',
    imei_1: editData?.imei_1 || '',
    imei_2: editData?.imei_2 || '',
    device_password: editData?.device_password || '',
    physical_condition: editData?.physical_condition || '',
    under_warranty: editData?.under_warranty || false,
    issue_complaint: editData?.issue_complaint || '',
    issue_notes: editData?.issue_notes || '',
    issue_type_ids: editData?.issue_type_ids || [],
    issue_type_id: editData?.issue_type?.id || null,
    issueTypeName: editData?.issue_type?.name || '',
    accessories_received: editData?.accessories_received || '',
    receiving_date: editData?.receiving_date ? new Date(editData.receiving_date) : new Date(),
    expected_delivery_date: editData?.expected_delivery_date ? new Date(editData.expected_delivery_date) : null,
    delivery_type: editData?.delivery_type || '',
    inspection_type: editData?.inspection_type || '',
    repair_team_id: editData?.repair_team?.id || null,
    teamName: editData?.repair_team?.name || '',
    assigned_to: editData?.assigned_to?.id || null,
    assignedName: editData?.assigned_to?.name || '',
    responsible: editData?.responsible?.name || '',
    inspection_notes: editData?.inspection_notes || '',
    diagnosis_result: editData?.diagnosis_result || '',
  });

  const [dropdowns, setDropdowns] = useState({
    customers: [], brands: [], series: [], models: [], teams: [], users: [], issueTypes: [],
    deliveryTypes: [], inspectionTypes: [], physicalConditions: [], priorities: [],
  });
  const [activeModal, setActiveModal] = useState(null);
  const [datePicker, setDatePicker] = useState({ visible: false, field: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('Inspection');

  // Reusable Odoo RPC — ensures valid session, re-auths if needed
  const odooRpc = async (model, method, kwargs = {}) => {
    const baseUrl = (ODOO_BASE_URL || '').replace(/\/+$/, '');
    let cookie = await AsyncStorage.getItem('odoo_cookie');
    if (!cookie) {
      const authResp = await axios.post(`${baseUrl}/web/session/authenticate`, {
        jsonrpc: '2.0', method: 'call',
        params: { db: DEFAULT_ODOO_DB, login: DEFAULT_USERNAME, password: DEFAULT_PASSWORD },
      }, { headers: { 'Content-Type': 'application/json' } });
      const setCookieH = authResp.headers?.['set-cookie'] || authResp.headers?.['Set-Cookie'];
      if (setCookieH) cookie = Array.isArray(setCookieH) ? setCookieH.join('; ') : String(setCookieH);
      const sid = authResp.data?.result?.session_id;
      if (!cookie && sid) cookie = `session_id=${sid}`;
      if (cookie) await AsyncStorage.setItem('odoo_cookie', cookie);
    }
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0', method: 'call',
      params: { model, method, args: [], kwargs },
    }, { headers, timeout: 15000 });
    if (resp.data?.error) {
      // Session expired — re-auth and retry once
      const authResp2 = await axios.post(`${baseUrl}/web/session/authenticate`, {
        jsonrpc: '2.0', method: 'call',
        params: { db: DEFAULT_ODOO_DB, login: DEFAULT_USERNAME, password: DEFAULT_PASSWORD },
      }, { headers: { 'Content-Type': 'application/json' } });
      const setCk = authResp2.headers?.['set-cookie'] || authResp2.headers?.['Set-Cookie'];
      let nCookie = setCk ? (Array.isArray(setCk) ? setCk.join('; ') : String(setCk)) : '';
      const sid2 = authResp2.data?.result?.session_id;
      if (!nCookie && sid2) nCookie = `session_id=${sid2}`;
      if (nCookie) { await AsyncStorage.setItem('odoo_cookie', nCookie); headers.Cookie = nCookie; }
      const resp2 = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0', method: 'call',
        params: { model, method, args: [], kwargs },
      }, { headers, timeout: 15000 });
      if (resp2.data?.error) throw new Error(resp2.data.error?.data?.message || 'Odoo error');
      return resp2.data?.result;
    }
    return resp.data?.result;
  };

  // Discovered model names from fields_get (cached)
  const [discoveredModels, setDiscoveredModels] = useState({});

  useEffect(() => { loadDropdowns(); }, []);

  // Try search_read on a single model, returns array or throws
  const safeSearchRead = async (model, kwargs) => {
    const result = await odooRpc(model, 'search_read', kwargs);
    return result || [];
  };

  const loadDropdowns = async () => {
    setLoading(true);
    try {
      // Step 1: fields_get on job.card — get ALL Many2one fields with their label + relation model
      // Match by display LABEL (e.g., "Brand", "Series", "Model") not by field name
      let allFields = {}; // { fieldName: { relation, string } }
      let selectionFields = {}; // { fieldName: [{ id, name }] } — for selection type fields
      const JC_MODELS = ['job.card', 'mobile.repair.job.card', 'repair.order'];
      for (const jcModel of JC_MODELS) {
        try {
          const fieldsResult = await odooRpc(jcModel, 'fields_get', { attributes: ['type', 'relation', 'string', 'selection'] });
          if (fieldsResult && typeof fieldsResult === 'object') {
            for (const [field, info] of Object.entries(fieldsResult)) {
              if (info?.type === 'many2one' && info?.relation) {
                allFields[field] = { relation: info.relation, string: (info.string || '').toLowerCase() };
              }
              if (info?.type === 'selection' && Array.isArray(info?.selection)) {
                selectionFields[field] = info.selection.map(([value, label]) => ({ id: value, name: label }));
              }
            }
            console.log('[MobileRepairForm] fields_get from ' + jcModel + ' — Many2one:',
              Object.entries(allFields).map(([f, v]) => `${f} → ${v.relation}`).join(', '));
            console.log('[MobileRepairForm] Selection fields:', Object.keys(selectionFields).join(', '));
            break;
          }
        } catch (e) {
          console.log('[MobileRepairForm] fields_get failed for ' + jcModel + ':', e?.message);
          continue;
        }
      }

      // Step 2: Match by label OR field name to find the right model + field name
      const findByLabel = (labels, fieldNames = []) => {
        // First try exact label match
        for (const [field, info] of Object.entries(allFields)) {
          for (const label of labels) {
            if (info.string === label.toLowerCase()) {
              return { model: info.relation, field };
            }
          }
        }
        // Then try partial label match (contains)
        for (const [field, info] of Object.entries(allFields)) {
          for (const label of labels) {
            if (info.string.includes(label.toLowerCase())) {
              return { model: info.relation, field };
            }
          }
        }
        // Then try field name match
        for (const fn of fieldNames) {
          if (allFields[fn]) return { model: allFields[fn].relation, field: fn };
        }
        return { model: null, field: null };
      };

      const brand = findByLabel(['Brand', 'Device Brand'], ['brand_id', 'device_brand_id']);
      const series = findByLabel(['Series', 'Device Series'], ['series_id', 'device_series_id']);
      const deviceModel = findByLabel(['Model', 'Device Model'], ['model_id', 'device_model_id']);
      const team = findByLabel(['Repair Team', 'Team'], ['team_id', 'repair_team_id']);
      const stage = findByLabel(['Stage'], ['stage_id']);
      let issueType = findByLabel(['Issue Type'], ['issue_type_id', 'issue_type']);

      // Fallback: try common issue type model names directly
      if (!issueType.model) {
        const ISSUE_TYPE_MODELS = ['repair.issue.type', 'mobile.repair.issue.type', 'issue.type', 'job.card.issue.type'];
        for (const itModel of ISSUE_TYPE_MODELS) {
          try {
            const testResult = await safeSearchRead(itModel, { domain: [], fields: ['id', 'name'], limit: 1 });
            if (testResult && testResult.length >= 0) {
              issueType = { model: itModel, field: 'issue_type_id' };
              console.log('[MobileRepairForm] Issue Type fallback found:', itModel);
              break;
            }
          } catch { continue; }
        }
      }

      const modelMap = {
        brand: brand.model, brandField: brand.field,
        series: series.model, seriesField: series.field,
        model: deviceModel.model, modelField: deviceModel.field,
        team: team.model, teamField: team.field,
        stage: stage.model,
        issueType: issueType.model, issueTypeField: issueType.field,
      };
      console.log('[MobileRepairForm] Resolved by label:', JSON.stringify(modelMap));
      setDiscoveredModels(modelMap);

      // Step 3: Fetch all dropdown data in parallel
      const fetchOrEmpty = async (model, kwargs) => {
        if (!model) return [];
        try { return await safeSearchRead(model, kwargs); } catch { return []; }
      };

      const [customersRaw, usersRaw, brandsRaw, teamsRaw, issueTypesRaw] = await Promise.all([
        safeSearchRead('res.partner', { domain: [], fields: ['id', 'name', 'phone', 'email'], limit: 200, order: 'name asc' }).catch(() => []),
        safeSearchRead('res.users', { domain: [['active', '=', true]], fields: ['id', 'name'], limit: 100, order: 'name asc' }).catch(() => []),
        fetchOrEmpty(brand.model, { domain: [], fields: ['id', 'name'], limit: 200, order: 'name asc' }),
        fetchOrEmpty(team.model, { domain: [], fields: ['id', 'name'], limit: 100, order: 'name asc' }),
        fetchOrEmpty(issueType.model, { domain: [], fields: ['id', 'name'], limit: 100, order: 'name asc' }),
      ]);

      const customers = (customersRaw || []).map(p => ({ id: p.id, name: p.name || '', phone: p.phone || '', email: p.email || '' }));
      const users = (usersRaw || []).map(u => ({ id: u.id, name: u.name || '' }));
      const brands = (brandsRaw || []).map(b => ({ id: b.id, name: b.name || '' }));
      const teams = (teamsRaw || []).map(t => ({ id: t.id, name: t.name || '' }));
      const issueTypes = (issueTypesRaw || []).map(t => ({ id: t.id, name: t.name || '' }));

      // Use Odoo's actual selection values for dropdowns (fallback to hardcoded)
      const deliveryTypes = selectionFields.delivery_type || DELIVERY_TYPES;
      const inspectionTypes = selectionFields.inspection_type || INSPECTION_TYPES;
      const physicalConditions = selectionFields.device_condition || selectionFields.physical_condition || PHYSICAL_CONDITIONS;

      console.log(`[MobileRepairForm] Loaded: ${customers.length} customers, ${users.length} users, ${brands.length} brands, ${teams.length} teams, ${issueTypes.length} issueTypes`);
      console.log(`[MobileRepairForm] Selection options: delivery_type=${deliveryTypes.length}, inspection_type=${inspectionTypes.length}, condition=${physicalConditions.length}`);
      setDropdowns(prev => ({ ...prev, customers, brands, teams, users, issueTypes, deliveryTypes, inspectionTypes, physicalConditions }));

      // Auto-fill responsible with current logged-in user (for new job cards)
      if (!isEdit && !formData.responsible) {
        try {
          const baseUrl = (ODOO_BASE_URL || '').replace(/\/+$/, '');
          const cookie = await AsyncStorage.getItem('odoo_cookie');
          const headers = { 'Content-Type': 'application/json' };
          if (cookie) headers.Cookie = cookie;
          const sessionResp = await axios.post(`${baseUrl}/web/session/get_session_info`,
            { jsonrpc: '2.0', method: 'call', params: {} },
            { headers, timeout: 8000 }
          );
          const uid = sessionResp.data?.result?.uid;
          const userName = sessionResp.data?.result?.name || sessionResp.data?.result?.username || '';
          if (uid && userName) {
            setFormData(prev => ({ ...prev, responsible: userName, responsible_id: uid }));
          }
        } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('[MobileRepairForm] loadDropdowns error:', err?.message);
      showToastMessage('Failed to load some dropdowns');
    } finally {
      setLoading(false);
    }
  };

  // Load series for a brand — use the discovered field name for the brand→series relation
  const loadSeries = async (brandId) => {
    try {
      const model = discoveredModels.series;
      if (!model) { setDropdowns(prev => ({ ...prev, series: [], models: [] })); return; }

      // Discover which field on the series model links back to brand
      let result = [];
      try {
        const seriesFields = await odooRpc(model, 'fields_get', { attributes: ['type', 'relation'] });
        // Find the Many2one field that points to the brand model
        const brandLinkField = Object.entries(seriesFields || {}).find(
          ([, info]) => info?.type === 'many2one' && info?.relation === discoveredModels.brand
        );
        if (brandLinkField && brandId) {
          result = await safeSearchRead(model, { domain: [[brandLinkField[0], '=', brandId]], fields: ['id', 'name'], limit: 200, order: 'name asc' });
        }
      } catch { /* ignore */ }

      // Fallback: unfiltered
      if (result.length === 0) {
        try { result = await safeSearchRead(model, { domain: [], fields: ['id', 'name'], limit: 200, order: 'name asc' }); } catch { /* ignore */ }
      }
      setDropdowns(prev => ({ ...prev, series: (result || []).map(s => ({ id: s.id, name: s.name || '' })), models: [] }));
    } catch {
      setDropdowns(prev => ({ ...prev, series: [], models: [] }));
    }
  };

  // Load models for a series — use the discovered field name for the series→model relation
  const loadModels = async (seriesId) => {
    try {
      const model = discoveredModels.model;
      if (!model) { setDropdowns(prev => ({ ...prev, models: [] })); return; }

      let result = [];
      try {
        const modelFields = await odooRpc(model, 'fields_get', { attributes: ['type', 'relation'] });
        const seriesLinkField = Object.entries(modelFields || {}).find(
          ([, info]) => info?.type === 'many2one' && info?.relation === discoveredModels.series
        );
        if (seriesLinkField && seriesId) {
          result = await safeSearchRead(model, { domain: [[seriesLinkField[0], '=', seriesId]], fields: ['id', 'name'], limit: 200, order: 'name asc' });
        }
      } catch { /* ignore */ }

      if (result.length === 0) {
        try { result = await safeSearchRead(model, { domain: [], fields: ['id', 'name'], limit: 200, order: 'name asc' }); } catch { /* ignore */ }
      }
      setDropdowns(prev => ({ ...prev, models: (result || []).map(m => ({ id: m.id, name: m.name || '' })) }));
    } catch {
      setDropdowns(prev => ({ ...prev, models: [] }));
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomerSelect = (customer) => {
    setFormData(prev => ({
      ...prev, partner_id: customer.id, partnerName: customer.name,
      phone: customer.phone || prev.phone, email: customer.email || prev.email,
    }));
    setActiveModal(null);
  };

  const handleBrandSelect = (brand) => {
    setFormData(prev => ({
      ...prev, device_brand_id: brand.id, brandName: brand.name,
      device_series_id: null, seriesName: '', device_model_id: null, modelName: '',
    }));
    setActiveModal(null);
    loadSeries(brand.id);
  };

  const handleSeriesSelect = (series) => {
    setFormData(prev => ({
      ...prev, device_series_id: series.id, seriesName: series.name,
      device_model_id: null, modelName: '',
    }));
    setActiveModal(null);
    loadModels(series.id);
  };

  const handleSubmit = async () => {
    if (!formData.partner_id) { showToastMessage('Please select a customer'); return; }

    setIsSubmitting(true);
    try {
      // Use correct Odoo field names from job.card model definition
      const payload = {
        partner_id: formData.partner_id,
        phone: formData.phone,
        email: formData.email,
        priority: formData.priority,
        brand_id: formData.device_brand_id,
        series_id: formData.device_series_id,
        model_id: formData.device_model_id,
        imei_1: formData.imei_1,
        imei_2: formData.imei_2,
        device_password: formData.device_password,
        device_condition: formData.physical_condition,
        is_warranty: formData.under_warranty,           // Odoo: is_warranty (not under_warranty)
        issue: formData.issue_complaint || formData.issueTypeName || formData.issue_notes || '-',  // "Issue / Complaint"
        issue_notes: formData.issue_notes || '',                   // "Additional Issue Details"
        issue_type_ids: formData.issue_type_id ? [[6, 0, [formData.issue_type_id]]] : false,  // many2many
        issue_type_id: formData.issue_type_id,                     // "Issue Type (Old)" many2one fallback
        accessories: formData.accessories_received,
        receiving_date: formData.receiving_date?.toISOString().split('T')[0],
        delivery_date: formData.expected_delivery_date?.toISOString().split('T')[0],
        delivery_type: formData.delivery_type,
        inspection_type: formData.inspection_type,
        team_id: formData.repair_team_id,               // Odoo: team_id (not repair_team_id)
        assigned_to: formData.assigned_to,
        responsible_id: formData.responsible_id,
        inspection_notes: formData.inspection_notes,
        ai_diagnosis: formData.diagnosis_result,
      };
      if (isEdit) payload.id = editData.id;
      await createJobCardOdoo(payload);
      showToast({ type: 'success', title: 'Success', message: isEdit ? 'Job card updated' : 'Job card created' });
      navigation.goBack();
    } catch (error) {
      showToast({ type: 'error', title: 'Error', message: error.message || 'Failed to save' });
    } finally { setIsSubmitting(false); }
  };

  // Dropdown field (looks like Odoo select)
  const renderDropdownField = (label, value, modalKey, required) => (
    <TouchableOpacity style={styles.fieldRow} onPress={() => setActiveModal(modalKey)}>
      <Text style={[styles.fieldLabel, required && styles.requiredLabel]}>{label}</Text>
      <View style={styles.dropdownFieldValue}>
        <Text style={[styles.fieldValueText, !value && styles.placeholderText]}>{value || ''}</Text>
        <MaterialIcons name="arrow-drop-down" size={20} color="#999" />
      </View>
    </TouchableOpacity>
  );

  // Text input field (inline like Odoo)
  const renderTextField = (label, field, placeholder, props = {}) => (
    <View style={styles.fieldRow}>
      <Text style={[styles.fieldLabel, props.required && styles.requiredLabel]}>{label}</Text>
      <TextInput
        style={[styles.inlineInput, props.multiline && styles.multilineInput, props.required && !formData[field] && styles.requiredInput]}
        value={formData[field] || ''}
        onChangeText={(v) => handleInputChange(field, v)}
        placeholder={placeholder}
        placeholderTextColor="#BBB"
        {...props}
      />
    </View>
  );

  // Date field
  const renderDateField = (label, field) => (
    <TouchableOpacity style={styles.fieldRow} onPress={() => setDatePicker({ visible: true, field })}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValueText, !formData[field] && styles.placeholderText]}>
        {formData[field] ? formatDate(formData[field], 'MMM dd') : ''}
      </Text>
    </TouchableOpacity>
  );

  // Read-only field
  const renderReadonlyField = (label, value) => (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValueText}>{value || ''}</Text>
    </View>
  );

  const renderStageBar = () => (
    <View style={styles.stageBarContainer}>
      {STAGES.map((stage, idx) => (
        <View key={stage} style={styles.stageItem}>
          <View style={[styles.stageChip, idx === 0 && { backgroundColor: '#71496720', borderColor: '#714967', borderWidth: 1 }]}>
            <Text style={[styles.stageChipText, idx === 0 && { color: '#714967', fontFamily: FONT_FAMILY.urbanistBold }]}>{stage}</Text>
          </View>
          {idx < STAGES.length - 1 && <MaterialIcons name="chevron-right" size={16} color="#CCC" />}
        </View>
      ))}
    </View>
  );

  const renderModal = (key, title, items, onSelect) => (
    <Modal visible={activeModal === key} transparent animationType="fade" onRequestClose={() => setActiveModal(null)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={() => setActiveModal(null)}>
              <Text style={styles.modalClose}>X</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.dropdownItem} onPress={() => { onSelect(item); setActiveModal(null); }}>
                <Text style={styles.dropdownText}>{item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyListText}>No options available</Text>}
          />
        </View>
      </View>
    </Modal>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Inspection':
        return (
          <View style={styles.tabContent}>
            <Text style={styles.tabSubTitle}>Checklist Template</Text>
            <View style={styles.checklistHeader}>
              <Text style={[styles.checklistCol, { flex: 3 }]}>Checklist Item</Text>
              <Text style={[styles.checklistCol, { flex: 1, textAlign: 'right' }]}>Done</Text>
            </View>
            <Text style={styles.addLineText}>Add a line</Text>

            <Text style={[styles.sectionTitleBold, { marginTop: 20 }]}>INSPECTION NOTES</Text>
            <TextInput
              style={styles.notesInput}
              value={formData.inspection_notes}
              onChangeText={(v) => handleInputChange('inspection_notes', v)}
              placeholder="Add inspection notes..."
              placeholderTextColor="#BBB"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        );
      case 'AI Diagnosis':
        return (
          <View style={styles.tabContent}>
            <Text style={[styles.sectionTitleBold, { marginTop: 0 }]}>PROBLEM DESCRIPTION</Text>
            <TextInput
              style={styles.notesInput}
              value={formData.diagnosis_result}
              onChangeText={(v) => handleInputChange('diagnosis_result', v)}
              placeholder="Describe the problem for AI diagnosis..."
              placeholderTextColor="#BBB"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>
        );
      case 'Repair Steps':
        return <View style={styles.tabContent}><Text style={styles.emptyTabText}>No repair steps yet.</Text></View>;
      case 'Required Services':
        return <View style={styles.tabContent}><Text style={styles.emptyTabText}>No required services yet.</Text></View>;
      case 'Required Spare Parts':
        return <View style={styles.tabContent}><Text style={styles.emptyTabText}>No required spare parts yet.</Text></View>;
      case 'Other Info':
        return <View style={styles.tabContent}><Text style={styles.emptyTabText}>Other info will be available after saving.</Text></View>;
      default: return null;
    }
  };

  // Lookup display name for static selection fields
  const getSelectionName = (value, list) => {
    const item = list.find(i => i.id === value);
    return item ? item.name : value || '';
  };

  const priorityCount = parseInt(formData.priority, 10) || 0;

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader title={isEdit ? 'Edit Job Card' : 'New Job Card'} onBackPress={() => navigation.goBack()} />

      {/* Stage Bar */}
      <View style={styles.stageBarWrap}>{renderStageBar()}</View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Title */}
          <Text style={styles.titleText}>{isEdit ? editData.ref : 'New'}</Text>

          {/* Two Column: Customer Details | Other Details */}
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.sectionTitleBold}>CUSTOMER DETAILS</Text>
              {renderDropdownField('Customer', formData.partnerName, 'customer', true)}
              {renderTextField('Phone', 'phone', '')}
              {renderTextField('Email', 'email', '', { keyboardType: 'email-address' })}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Priority</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3].map(i => (
                    <TouchableOpacity key={i} onPress={() => handleInputChange('priority', String(i === priorityCount ? 0 : i))}>
                      <MaterialIcons name="star" size={18} color={i <= priorityCount ? '#FFC107' : '#DDD'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.col}>
              <Text style={styles.sectionTitleBold}>OTHER DETAILS</Text>
              {renderDateField('Receiving Date', 'receiving_date')}
              {renderDateField('Expected Delivery Date', 'expected_delivery_date')}
              {renderDropdownField('Delivery Type', getSelectionName(formData.delivery_type, dropdowns.deliveryTypes.length ? dropdowns.deliveryTypes : DELIVERY_TYPES), 'delivery')}
              {renderDropdownField('Inspection Type', getSelectionName(formData.inspection_type, dropdowns.inspectionTypes.length ? dropdowns.inspectionTypes : INSPECTION_TYPES), 'inspection')}
            </View>
          </View>

          {/* Two Column: Device Details | Repair/Team Details */}
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.sectionTitleBold}>DEVICE DETAILS</Text>
              {renderDropdownField('Brand', formData.brandName, 'brand')}
              {renderDropdownField('Series', formData.seriesName, 'series')}
              {renderDropdownField('Model', formData.modelName, 'model')}
              {renderTextField('IMEI 1', 'imei_1', '')}
              {renderTextField('IMEI 2', 'imei_2', '')}
              {renderTextField('Device Password', 'device_password', '')}
              {renderDropdownField('Physical Condition', getSelectionName(formData.physical_condition, dropdowns.physicalConditions.length ? dropdowns.physicalConditions : PHYSICAL_CONDITIONS), 'condition')}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Under Warranty</Text>
                <Switch value={formData.under_warranty} onValueChange={(v) => handleInputChange('under_warranty', v)} trackColor={{ true: COLORS.primaryThemeColor }} />
              </View>
              {renderDropdownField('Issue Type', formData.issueTypeName, 'issueType')}
              {renderTextField('Additional Issue Details', 'issue_notes', 'Additional details about the issue...', { multiline: true, numberOfLines: 2 })}
            </View>
            <View style={styles.col}>
              <Text style={styles.sectionTitleBold}>REPAIR/TEAM DETAILS</Text>
              {renderDropdownField('Repair Team', formData.teamName, 'team')}
              {renderDropdownField('Assigned To', formData.assignedName, 'user')}
              {renderReadonlyField('Responsible', formData.responsible)}
              {renderReadonlyField('Inspection Date', '')}
              {renderReadonlyField('Completion Date', '')}
              {renderReadonlyField('Sale Order', '')}
              {renderReadonlyField('Easy Sales', '')}
              {renderReadonlyField('Task', '')}
            </View>
          </View>

          {/* Accessories Received */}
          <View style={styles.accessoriesSection}>
            <Text style={styles.fieldLabel}>Accessories Received</Text>
            <TextInput
              style={styles.accessoriesInput}
              value={formData.accessories_received}
              onChangeText={(v) => handleInputChange('accessories_received', v)}
              placeholder="List accessories received with the device (charger, case, SIM card, etc.)"
              placeholderTextColor="#BBB"
              multiline
            />
          </View>

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
            {TABS.map(tab => (
              <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {renderTabContent()}

          {/* Total Amount */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Amount:</Text>
            <Text style={styles.totalValue}>$ 0.00</Text>
          </View>

          {/* Submit Button */}
          <View style={{ marginTop: 20 }}>
            <LoadingButton title={isEdit ? 'UPDATE JOB CARD' : 'SAVE JOB CARD'} onPress={handleSubmit} loading={isSubmitting} />
          </View>
        </View>
      </ScrollView>

      {/* Modals */}
      {renderModal('customer', 'Select Customer', dropdowns.customers, handleCustomerSelect)}
      {renderModal('brand', 'Select Brand', dropdowns.brands, handleBrandSelect)}
      {renderModal('series', 'Select Series', dropdowns.series, handleSeriesSelect)}
      {renderModal('model', 'Select Model', dropdowns.models, (m) => { handleInputChange('device_model_id', m.id); handleInputChange('modelName', m.name); })}
      {renderModal('condition', 'Physical Condition', dropdowns.physicalConditions.length ? dropdowns.physicalConditions : PHYSICAL_CONDITIONS, (c) => handleInputChange('physical_condition', c.id))}
      {renderModal('delivery', 'Delivery Type', dropdowns.deliveryTypes.length ? dropdowns.deliveryTypes : DELIVERY_TYPES, (d) => handleInputChange('delivery_type', d.id))}
      {renderModal('inspection', 'Inspection Type', dropdowns.inspectionTypes.length ? dropdowns.inspectionTypes : INSPECTION_TYPES, (i) => handleInputChange('inspection_type', i.id))}
      {renderModal('team', 'Select Repair Team', dropdowns.teams, (t) => { handleInputChange('repair_team_id', t.id); handleInputChange('teamName', t.name); })}
      {renderModal('user', 'Assign To', dropdowns.users, (u) => { handleInputChange('assigned_to', u.id); handleInputChange('assignedName', u.name); })}
      {renderModal('issueType', 'Select Issue Type', dropdowns.issueTypes, (t) => { handleInputChange('issue_type_id', t.id); handleInputChange('issueTypeName', t.name); })}

      <DateTimePickerModal
        isVisible={datePicker.visible} mode="date"
        onConfirm={(date) => { handleInputChange(datePicker.field, date); setDatePicker({ visible: false, field: null }); }}
        onCancel={() => setDatePicker({ visible: false, field: null })}
      />
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { padding: 15, paddingBottom: 40 },

  // Stage Bar
  stageBarWrap: { borderBottomWidth: 1, borderBottomColor: '#E5E5E5', backgroundColor: '#FAFAFA' },
  stageBarContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 8 },
  stageItem: { flexDirection: 'row', alignItems: 'center' },
  stageChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: '#F0F0F0' },
  stageChipText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999' },

  // Title
  titleText: { fontSize: 22, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginBottom: 8 },

  // Two Column
  twoCol: { flexDirection: 'row', marginBottom: 4 },
  col: { flex: 1, paddingRight: 8 },

  // Section Title
  sectionTitleBold: {
    fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black,
    marginTop: 14, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: '#E5E5E5', paddingBottom: 4,
  },

  // Field Row
  fieldRow: { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  fieldLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#888' },
  requiredLabel: { color: '#E53935' },
  fieldValueText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black, marginTop: 2 },
  placeholderText: { color: '#BBB' },

  // Dropdown field
  dropdownFieldValue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },

  // Inline Input
  inlineInput: {
    fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black,
    paddingVertical: 2, paddingHorizontal: 0, marginTop: 1, borderBottomWidth: 0,
  },
  multilineInput: { minHeight: 40, textAlignVertical: 'top' },
  requiredInput: { backgroundColor: '#FFF0F0' },

  // Stars
  starsRow: { flexDirection: 'row', marginTop: 2 },

  // Accessories
  accessoriesSection: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E5E5' },
  accessoriesInput: {
    fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black,
    paddingVertical: 4, minHeight: 30,
  },

  // Tabs
  tabBar: { marginTop: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  tabBarContent: { gap: 0 },
  tab: { paddingHorizontal: 14, paddingVertical: 10 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primaryThemeColor },
  tabText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#888' },
  tabTextActive: { color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold },
  tabContent: { paddingVertical: 12, minHeight: 80 },
  emptyTabText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', fontStyle: 'italic' },
  tabSubTitle: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginBottom: 8 },
  checklistHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  checklistCol: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#666' },
  addLineText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.primaryThemeColor, paddingVertical: 8 },

  // Notes
  notesInput: {
    backgroundColor: '#FAFAFA', borderRadius: 6, padding: 12, minHeight: 60,
    borderWidth: 1, borderColor: '#EEE', fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black,
    textAlignVertical: 'top',
  },

  // Total
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 2, borderTopColor: '#E5E5E5', gap: 8 },
  totalLabel: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#666' },
  totalValue: { fontSize: 22, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 15, borderTopRightRadius: 15, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalTitle: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },
  modalClose: { fontSize: 18, color: '#999', fontFamily: FONT_FAMILY.urbanistBold },
  dropdownItem: { paddingVertical: 14, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  dropdownText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black },
  emptyListText: { textAlign: 'center', padding: 20, color: '#999', fontFamily: FONT_FAMILY.urbanistMedium },
});

export default MobileRepairForm;
