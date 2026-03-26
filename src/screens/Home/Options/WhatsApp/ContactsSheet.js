import React, { useState, useEffect, useCallback } from 'react';
import {
  View, FlatList, TextInput, TouchableOpacity, Modal,
  StyleSheet, ActivityIndicator, ScrollView, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { fetchCustomersOdoo } from '@api/services/generalApi';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import getOdooBaseUrl from '@api/config/odooConfig';

// ─── Country Data ───────────────────────────────────────────────
const COUNTRIES = [
  { name: 'Oman', dial: '+968', flag: '🇴🇲', digits: 8 },
  { name: 'UAE', dial: '+971', flag: '🇦🇪', digits: 9 },
  { name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦', digits: 9 },
  { name: 'Qatar', dial: '+974', flag: '🇶🇦', digits: 8 },
  { name: 'Bahrain', dial: '+973', flag: '🇧🇭', digits: 8 },
  { name: 'Kuwait', dial: '+965', flag: '🇰🇼', digits: 8 },
  { name: 'India', dial: '+91', flag: '🇮🇳', digits: 10 },
  { name: 'Pakistan', dial: '+92', flag: '🇵🇰', digits: 10 },
  { name: 'Bangladesh', dial: '+880', flag: '🇧🇩', digits: 10 },
  { name: 'Sri Lanka', dial: '+94', flag: '🇱🇰', digits: 9 },
  { name: 'Nepal', dial: '+977', flag: '🇳🇵', digits: 10 },
  { name: 'Philippines', dial: '+63', flag: '🇵🇭', digits: 10 },
  { name: 'Indonesia', dial: '+62', flag: '🇮🇩', digits: 12 },
  { name: 'Malaysia', dial: '+60', flag: '🇲🇾', digits: 10 },
  { name: 'Singapore', dial: '+65', flag: '🇸🇬', digits: 8 },
  { name: 'Thailand', dial: '+66', flag: '🇹🇭', digits: 9 },
  { name: 'Vietnam', dial: '+84', flag: '🇻🇳', digits: 10 },
  { name: 'China', dial: '+86', flag: '🇨🇳', digits: 11 },
  { name: 'Japan', dial: '+81', flag: '🇯🇵', digits: 10 },
  { name: 'South Korea', dial: '+82', flag: '🇰🇷', digits: 10 },
  { name: 'Egypt', dial: '+20', flag: '🇪🇬', digits: 10 },
  { name: 'Jordan', dial: '+962', flag: '🇯🇴', digits: 9 },
  { name: 'Lebanon', dial: '+961', flag: '🇱🇧', digits: 8 },
  { name: 'Iraq', dial: '+964', flag: '🇮🇶', digits: 10 },
  { name: 'Iran', dial: '+98', flag: '🇮🇷', digits: 10 },
  { name: 'Turkey', dial: '+90', flag: '🇹🇷', digits: 10 },
  { name: 'United Kingdom', dial: '+44', flag: '🇬🇧', digits: 10 },
  { name: 'United States', dial: '+1', flag: '🇺🇸', digits: 10 },
  { name: 'Canada', dial: '+1', flag: '🇨🇦', digits: 10 },
  { name: 'Germany', dial: '+49', flag: '🇩🇪', digits: 11 },
  { name: 'France', dial: '+33', flag: '🇫🇷', digits: 9 },
  { name: 'Italy', dial: '+39', flag: '🇮🇹', digits: 10 },
  { name: 'Spain', dial: '+34', flag: '🇪🇸', digits: 9 },
  { name: 'Australia', dial: '+61', flag: '🇦🇺', digits: 9 },
  { name: 'South Africa', dial: '+27', flag: '🇿🇦', digits: 9 },
  { name: 'Nigeria', dial: '+234', flag: '🇳🇬', digits: 10 },
  { name: 'Kenya', dial: '+254', flag: '🇰🇪', digits: 9 },
  { name: 'Brazil', dial: '+55', flag: '🇧🇷', digits: 11 },
  { name: 'Mexico', dial: '+52', flag: '🇲🇽', digits: 10 },
  { name: 'Russia', dial: '+7', flag: '🇷🇺', digits: 10 },
  { name: 'Ethiopia', dial: '+251', flag: '🇪🇹', digits: 9 },
  { name: 'Tanzania', dial: '+255', flag: '🇹🇿', digits: 9 },
  { name: 'Afghanistan', dial: '+93', flag: '🇦🇫', digits: 9 },
  { name: 'Yemen', dial: '+967', flag: '🇾🇪', digits: 9 },
  { name: 'Syria', dial: '+963', flag: '🇸🇾', digits: 9 },
  { name: 'Palestine', dial: '+970', flag: '🇵🇸', digits: 9 },
];

const getMaxDigits = (dial) => COUNTRIES.find(c => c.dial === dial)?.digits || 15;

// Parse phone into country code + local number by matching against known dial codes
const parsePhoneCountryCode = (phone) => {
  if (!phone || !phone.startsWith('+')) return { code: '+968', number: phone || '' };
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (phone.startsWith(c.dial)) {
      return { code: c.dial, number: phone.slice(c.dial.length) };
    }
  }
  return { code: '+968', number: phone.replace(/^\+/, '') };
};

// ─── Country Code Picker ────────────────────────────────────────
const CountryCodePicker = ({ visible, onClose, onSelect, selectedDial }) => {
  const [search, setSearch] = useState('');

  // Clear search when picker closes
  useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dial.includes(search)
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={cs.container}>
        {/* Header */}
        <View style={cs.header}>
          <TouchableOpacity style={cs.closeBtn} onPress={onClose}>
            <Text style={cs.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={cs.headerTitle}>Select Country</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Search */}
        <View style={cs.searchWrap}>
          <View style={cs.searchBar}>
            <Text style={cs.searchIcon}>🔍</Text>
            <TextInput
              style={cs.searchInput}
              placeholder="Search country or code..."
              placeholderTextColor="#999"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Text style={cs.clearBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Country List */}
        <FlatList
          data={filtered}
          keyExtractor={(item, i) => item.name + i}
          renderItem={({ item }) => {
            const isSelected = item.dial === selectedDial;
            return (
              <TouchableOpacity
                style={[cs.row, isSelected && cs.rowSelected]}
                onPress={() => { onSelect(item.dial); onClose(); }}
                activeOpacity={0.6}
              >
                <View style={cs.flagCircle}>
                  <Text style={cs.flag}>{item.flag}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[cs.name, isSelected && cs.nameSelected]}>{item.name}</Text>
                  <Text style={cs.digits}>{item.digits} digits</Text>
                </View>
                <Text style={[cs.dial, isSelected && cs.dialSelected]}>{item.dial}</Text>
                {isSelected && <Text style={cs.check}> ✓</Text>}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>No countries found</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
};

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#25D366', paddingHorizontal: 16, paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
  },
  headerTitle: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' },
  closeBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  closeBtnText: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' },
  searchWrap: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1f2937', paddingVertical: 10 },
  clearBtn: { fontSize: 16, color: '#9ca3af', paddingLeft: 8, paddingVertical: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  rowSelected: { backgroundColor: '#f0fdf4' },
  flagCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  flag: { fontSize: 22 },
  name: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#1f2937' },
  nameSelected: { color: '#25D366' },
  digits: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  dial: { fontSize: 15, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistBold },
  dialSelected: { color: '#25D366' },
  check: { fontSize: 16, color: '#25D366', fontFamily: FONT_FAMILY.urbanistBold },
});

// ─── Odoo RPC helpers ───────────────────────────────────────────
const getAuthHeaders = async () => {
  try {
    const cookie = await AsyncStorage.getItem('odoo_cookie');
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    return headers;
  } catch (e) {
    return { 'Content-Type': 'application/json' };
  }
};

const odooRpc = async (model, method, args = [], kwargs = {}) => {
  const baseUrl = getOdooBaseUrl().replace(/\/$/, '');
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${baseUrl}/web/dataset/call_kw`,
    { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } },
    { headers, withCredentials: true, timeout: 15000 }
  );
  if (response.data.error) throw new Error(response.data.error.data?.message || 'Odoo RPC error');
  return response.data.result;
};

const createContact = (data) => odooRpc('res.partner', 'create', [data]);
const updateContact = (id, data) => odooRpc('res.partner', 'write', [[id], data]);

const fetchContactDetail = async (id) => {
  const records = await odooRpc('res.partner', 'read', [[id], [
    'name', 'email', 'phone', 'is_company',
    'street', 'street2', 'city', 'state_id', 'zip', 'country_id',
    'company_name', 'function', 'website', 'vat', 'lang',
  ]]);
  return Array.isArray(records) ? records[0] : records;
};

// ─── Main Component ─────────────────────────────────────────────
const ContactsSheet = ({ visible, onClose, initialView = 'list', initialContactId = null, onSaved: onSavedProp }) => {
  const [view, setView] = useState(initialView);
  const [editId, setEditId] = useState(initialContactId);
  const [refreshKey, setRefreshKey] = useState(0);

  // Reset view and editId when modal opens
  useEffect(() => {
    if (visible) {
      setView(initialView);
      setEditId(initialContactId);
    }
  }, [visible, initialView, initialContactId]);

  const handleOpenForm = (id) => {
    setEditId(id);
    setView('form');
  };

  const handleBack = () => {
    if (initialView === 'form') {
      onClose();
    } else {
      setEditId(null);
      setView('list');
    }
  };

  const handleSaved = () => {
    setRefreshKey(k => k + 1);
    if (onSavedProp) onSavedProp();
    if (initialView === 'form') {
      onClose();
    } else {
      setEditId(null);
      setView('list');
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => {
      if (view === 'form') { handleBack(); } else { onClose(); }
    }}>
      <View style={s.container}>
        {view === 'list' ? (
          <ContactList
            onClose={onClose}
            onEdit={handleOpenForm}
            onNew={() => handleOpenForm(null)}
            refreshKey={refreshKey}
          />
        ) : (
          <ContactForm
            contactId={editId}
            onBack={handleBack}
            onSaved={handleSaved}
          />
        )}
      </View>
    </Modal>
  );
};

// ─── Contact List ───────────────────────────────────────────────
const ContactList = ({ onClose, onEdit, onNew, refreshKey }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadContacts = useCallback(async (searchText) => {
    try {
      const data = await fetchCustomersOdoo({ offset: 0, limit: 200, searchText });
      setContacts(data || []);
    } catch (e) {
      showToastMessage('Failed to load contacts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadContacts(''); }, [refreshKey]);

  useEffect(() => {
    const timer = setTimeout(() => loadContacts(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
  const getAvatarColor = (name) => AVATAR_COLORS[((name || '').charCodeAt(0) || 0) % AVATAR_COLORS.length];

  const renderItem = ({ item, index }) => (
    <TouchableOpacity style={s.contactRow} onPress={() => onEdit(item.id)} activeOpacity={0.6}>
      <View style={[s.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
        <Text style={s.avatarText}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.contactName}>{item.name}</Text>
        {item.phone ? <Text style={s.contactSub}>{item.phone}</Text> : null}
        {item.email ? <Text style={s.contactSub}>{item.email}</Text> : null}
      </View>
      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={s.headerBtn}>Close</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Contacts</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Search */}
      <View style={s.searchContainer}>
        <TextInput
          style={s.searchInput}
          placeholder="Search name or phone..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={COLORS.primaryThemeColor} /></View>
      ) : (
        <FlatList
          data={contacts}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={s.center}><Text style={s.emptyText}>No contacts found</Text></View>
          }
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadContacts(search); }}
        />
      )}

      {/* Floating New Button */}
      <TouchableOpacity style={s.fab} onPress={onNew} activeOpacity={0.8}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Contact Form (Create / Edit) ──────────────────────────────
const EMPTY_FORM = {
  name: '', email: '', phone: '', country_code: '+968', is_company: false,
  street: '', street2: '', city: '', zip: '',
  company_name: '', function: '', website: '', vat: '',
};

const ContactForm = ({ contactId, onBack, onSaved }) => {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(!!contactId);
  const [saving, setSaving] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const isNew = !contactId;

  useEffect(() => {
    if (contactId) {
      (async () => {
        try {
          const rec = await fetchContactDetail(contactId);
          setForm({
            name: rec.name || '',
            email: rec.email || '',
            phone: rec.phone ? parsePhoneCountryCode(rec.phone).number : '',
            country_code: rec.phone ? parsePhoneCountryCode(rec.phone).code : '+968',
            is_company: rec.is_company || false,
            street: rec.street || '',
            street2: rec.street2 || '',
            city: rec.city || '',
            zip: rec.zip || '',
            company_name: rec.company_name || '',
            function: rec.function || '',
            website: rec.website || '',
            vat: rec.vat || '',
          });
        } catch (e) {
          showToastMessage('Failed to load contact');
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [contactId]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) { showToastMessage('Name is required'); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        email: form.email.trim() || false,
        phone: form.phone.trim() ? `${form.country_code}${form.phone.trim()}` : false,
        is_company: form.is_company,
        street: form.street.trim() || false,
        street2: form.street2.trim() || false,
        city: form.city.trim() || false,
        zip: form.zip.trim() || false,
        company_name: form.company_name.trim() || false,
        function: form.function.trim() || false,
        website: form.website.trim() || false,
        vat: form.vat.trim() || false,
      };
      if (isNew) {
        await createContact(data);
        showToastMessage('Contact created');
      } else {
        await updateContact(contactId, data);
        showToastMessage('Contact updated');
      }
      onSaved();
    } catch (e) {
      showToastMessage('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primaryThemeColor} /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.headerBtn}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isNew ? 'New Contact' : 'Edit Contact'}</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[s.headerBtn, { color: '#25D366' }]}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
          {/* Person / Company toggle */}
          <View style={s.toggleRow}>
            <Text style={[s.toggleLabel, !form.is_company && s.toggleLabelActive]}>Person</Text>
            <Switch
              value={form.is_company}
              onValueChange={(v) => set('is_company', v)}
              trackColor={{ false: '#d1d5db', true: '#25D366' }}
              thumbColor="#fff"
            />
            <Text style={[s.toggleLabel, form.is_company && s.toggleLabelActive]}>Company</Text>
          </View>

          {/* Basic Info Card */}
          <View style={s.formCard}>
            <FormField label="Name *" value={form.name} onChangeText={(v) => set('name', v)} placeholder={form.is_company ? 'e.g. Lumber Inc' : 'Full Name'} />
            <FormField label="Email" value={form.email} onChangeText={(v) => set('email', v)} placeholder="Email" keyboardType="email-address" />
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Phone</Text>
              <View style={s.phoneRow}>
                <TouchableOpacity style={s.countryCodeBtn} onPress={() => setShowCountryPicker(true)}>
                  <Text style={s.countryCodeText}>{form.country_code} ▼</Text>
                </TouchableOpacity>
                <TextInput
                  style={[s.fieldInput, { flex: 1 }]}
                  value={form.phone}
                  onChangeText={(v) => set('phone', v.replace(/[^0-9]/g, ''))}
                  placeholder="Phone number"
                  placeholderTextColor="#aaa"
                  keyboardType="phone-pad"
                  maxLength={getMaxDigits(form.country_code)}
                />
              </View>
              <Text style={s.fieldHint}>
                {`${getMaxDigits(form.country_code)} digits without country code • Required for WhatsApp invoices`}
              </Text>
              <CountryCodePicker
                visible={showCountryPicker}
                onClose={() => setShowCountryPicker(false)}
                onSelect={(dial) => set('country_code', dial)}
                selectedDial={form.country_code}
              />
            </View>
            {!form.is_company && (
              <>
                <FormField label="Company" value={form.company_name} onChangeText={(v) => set('company_name', v)} placeholder="Company Name..." />
                <FormField label="Job Position" value={form.function} onChangeText={(v) => set('function', v)} placeholder="e.g. Sales Director" />
              </>
            )}
          </View>

          {/* Address Card */}
          <Text style={s.sectionTitle}>Address</Text>
          <View style={s.formCard}>
            <FormField label="Street" value={form.street} onChangeText={(v) => set('street', v)} placeholder="Street..." />
            <FormField label="Street 2" value={form.street2} onChangeText={(v) => set('street2', v)} placeholder="Street 2..." />
            <View style={s.rowFields}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <FormField label="City" value={form.city} onChangeText={(v) => set('city', v)} placeholder="City" />
              </View>
              <View style={{ flex: 1, marginLeft: 6 }}>
                <FormField label="ZIP" value={form.zip} onChangeText={(v) => set('zip', v)} placeholder="ZIP" />
              </View>
            </View>
          </View>

          {/* Other Card */}
          <Text style={s.sectionTitle}>Other</Text>
          <View style={s.formCard}>
            <FormField label="Tax ID" value={form.vat} onChangeText={(v) => set('vat', v)} placeholder="not applicable" />
            <FormField label="Website" value={form.website} onChangeText={(v) => set('website', v)} placeholder="e.g. https://www.example.com" keyboardType="url" />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={s.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

// ─── Reusable field ─────────────────────────────────────────────
const FormField = ({ label, value, onChangeText, placeholder, keyboardType, hint }) => (
  <View style={s.fieldGroup}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TextInput
      style={s.fieldInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#aaa"
      keyboardType={keyboardType || 'default'}
    />
    {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
  </View>
);

// ─── Styles ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#1f2937',
  },
  headerBtn: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#6b7280',
  },
  searchContainer: {
    padding: 12,
    backgroundColor: '#fff',
  },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  // List
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
  },
  contactName: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#1f2937',
  },
  contactSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 1,
  },
  chevron: {
    fontSize: 22,
    color: '#d1d5db',
    marginLeft: 8,
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 10,
  },
  fabText: {
    fontSize: 30,
    color: '#fff',
    fontWeight: 'bold',
    marginTop: -2,
  },
  // Form
  formContent: {
    padding: 16,
    paddingBottom: 60,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
  },
  toggleLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#9ca3af',
  },
  toggleLabelActive: {
    color: '#25D366',
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  saveBtn: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#6b7280',
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#6b7280',
    marginBottom: 4,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCodeBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  countryCodeText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#1f2937',
  },
  fieldHint: {
    fontSize: 11,
    color: '#25D366',
    fontStyle: 'italic',
    marginTop: 4,
    paddingLeft: 2,
  },
  fieldInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
  },
  rowFields: {
    flexDirection: 'row',
  },
});

export default ContactsSheet;
export { COUNTRIES, getMaxDigits, parsePhoneCountryCode, CountryCodePicker };
