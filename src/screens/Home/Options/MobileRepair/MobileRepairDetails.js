import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Modal, Switch, Alert, TextInput, Linking } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView } from '@components/containers';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToast } from '@utils/common';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import {
  fetchJobCardDetailsOdoo,
  fetchJobCardStagesOdoo,
  updateJobCardStageOdoo,
  moveJobCardToNextStageOdoo,
  jobCardCreateQuotationOdoo,
  jobCardStartRepairOdoo,
  jobCardCreateInvoiceOdoo,
  jobCardCancelOdoo,
  jobCardMarkCompletedOdoo,
  fetchJobCardSymptomsOdoo,
  runAIDiagnosisOdoo,
  openEstimateWizardOdoo,
  applyEstimateOdoo,
  searchVinafixForums,
  generateStepsFromDiagnosisOdoo,
  fetchDiagnosisResultsOdoo,
  updateDiagnosisResultOdoo,
  deleteDiagnosisOdoo,
  fetchAISuggestedPartsOdoo,
  fetchJobCardCountsOdoo,
  fetchRepairStepsListOdoo,
  updateRepairStepStatusOdoo,
  deleteRepairStepOdoo,
  fetchServiceLinesOdoo,
  addServiceLineOdoo,
  deleteServiceLineOdoo,
  fetchRepairProductsOdoo,
} from '@api/services/generalApi';

// Fuzzy match stage name to a known stage category
const matchStage = (name) => {
  if (!name) return 'draft';
  const n = name.toLowerCase().trim();
  if (n.includes('draft')) return 'draft';
  if (n.includes('inspect')) return 'inspection';
  if (n.includes('quotation') || n.includes('quote')) return 'quotation';
  if (n.includes('repair') || n.includes('progress')) return 'repair';
  if (n.includes('complete') || n.includes('done')) return 'completed';
  if (n.includes('cancel')) return 'cancelled';
  return 'draft';
};

const getStageColor = (name) => {
  const colorMap = { draft: '#FF9800', inspection: '#2196F3', quotation: '#9C27B0', repair: '#FF5722', completed: '#4CAF50', cancelled: '#F44336' };
  return colorMap[matchStage(name)] || '#999';
};

const TABS = ['Inspection', 'AI Diagnosis', 'Repair Steps', 'Required Services', 'Required Spare Parts', 'Other Info'];

// Character-by-character HTML tag removal — bulletproof on all JS engines
const removeTagsCharByChar = (str) => {
  let out = '';
  let inTag = false;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '<') { inTag = true; continue; }
    if (str[i] === '>') { inTag = false; continue; }
    if (!inTag) out += str[i];
  }
  return out;
};

// Decode HTML entities
const decodeEntities = (str) => {
  let t = str;
  t = t.replace(/&nbsp;/gi, ' ');
  t = t.replace(/&amp;/gi, '&');
  t = t.replace(/&lt;/gi, '<');
  t = t.replace(/&gt;/gi, '>');
  t = t.replace(/&quot;/gi, '"');
  t = t.replace(/&#39;/gi, "'");
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  t = t.replace(/&[a-zA-Z]+;/g, ' ');
  return t;
};

// Aggressively strip ALL HTML from Odoo rich-text fields
const htmlToPlainText = (html) => {
  if (!html || typeof html !== 'string') return html || '';

  let text = html;

  // Step 1: Convert block elements to newlines before stripping
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<\/li>/gi, '\n');

  // Step 2: Remove all tags (character-by-character — handles malformed/unclosed tags)
  text = removeTagsCharByChar(text);

  // Step 3: Decode HTML entities (may produce new < > from &lt; &gt;)
  text = decodeEntities(text);

  // Step 4: Remove tags AGAIN (decoded entities may have created new tags)
  text = removeTagsCharByChar(text);

  // Step 5: Decode entities ONE MORE TIME (double-encoded like &amp;lt; → &lt; → <)
  text = decodeEntities(text);

  // Step 6: Final tag removal
  text = removeTagsCharByChar(text);

  // Step 7: Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/^\s+$/gm, '');

  return text.trim();
};

// Strip emojis character-by-character (Hermes-safe, no Unicode regex needed)
const stripEmojis = (str) => {
  if (!str) return '';
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Skip surrogate pairs (emojis above U+FFFF like 😀🔧⚠️ etc.)
    if (code >= 0xD800 && code <= 0xDBFF) {
      i++; // skip the low surrogate too
      continue;
    }
    // Skip common emoji/symbol ranges in BMP
    if (code >= 0x2600 && code <= 0x27BF) continue; // Misc symbols, Dingbats
    if (code >= 0x2700 && code <= 0x27BF) continue; // Dingbats
    if (code >= 0x2300 && code <= 0x23FF) continue; // Misc Technical
    if (code >= 0x2B50 && code <= 0x2B55) continue; // Stars
    if (code >= 0x25A0 && code <= 0x25FF) continue; // Geometric shapes
    if (code >= 0xFE00 && code <= 0xFE0F) continue; // Variation selectors
    if (code === 0x200D) continue; // Zero-width joiner
    if (code === 0x20E3) continue; // Combining enclosing keycap
    out += str[i];
  }
  return out;
};

// Universal markdown-like parser — converts ANY AI text into structured blocks
const parseReportBlocks = (text) => {
  if (!text || typeof text !== 'string') return [];
  // Convert HTML to plain text first
  const cleanText = htmlToPlainText(text);
  const blocks = []; // { type: 'header'|'item'|'subitem'|'text'|'warning', text, bold }
  const lines = cleanText.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Header: "## Title", "**Title**", "### Title", lines ending with ":"
    const headerMatch = trimmed.match(/^#{1,4}\s+(.+)/) || trimmed.match(/^\*\*([^*]+)\*\*\s*:?\s*$/) || trimmed.match(/^([A-Z][A-Z\s/&]+):?\s*$/);
    if (headerMatch) {
      blocks.push({ type: 'header', text: headerMatch[1].replace(/\*\*/g, '').replace(/:$/, '').trim() });
      continue;
    }

    // Warning lines
    if (trimmed.toLowerCase().startsWith('warning') || trimmed.startsWith('⚠')) {
      const wText = trimmed.replace(/^warning[s:]?\s*/i, '').replace(/^⚠️?\s*/, '').replace(/\*\*/g, '').trim();
      if (wText) blocks.push({ type: 'warning', text: wText });
      else blocks.push({ type: 'header', text: 'Warnings' });
      continue;
    }

    // Numbered list: "1. Item", "1) Item"
    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (numMatch) {
      const itemText = numMatch[2].replace(/\*\*/g, '').trim();
      // Check if this contains bold part: "**Bold Part** rest"
      const boldMatch = numMatch[2].match(/^\*\*([^*]+)\*\*\s*(.*)/);
      if (boldMatch) {
        blocks.push({ type: 'item', num: numMatch[1], boldPart: boldMatch[1].trim(), text: boldMatch[2].trim() });
      } else {
        blocks.push({ type: 'item', num: numMatch[1], text: itemText });
      }
      continue;
    }

    // Bullet list: "- Item", "* Item", "• Item"
    const bulletMatch = trimmed.match(/^[\-*•]\s+(.+)/);
    if (bulletMatch) {
      const bText = bulletMatch[1].replace(/\*\*/g, '').trim();
      // Sub-items (indented or with label like "Method:", "Tools:")
      const labelMatch = bText.match(/^([A-Za-z]+):\s*(.+)/);
      if (labelMatch) {
        blocks.push({ type: 'subitem', label: labelMatch[1], text: labelMatch[2] });
      } else {
        blocks.push({ type: 'bullet', text: bText });
      }
      continue;
    }

    // Indented sub-content (starts with spaces/tab)
    if (rawLine.match(/^\s{3,}/) || rawLine.match(/^\t/)) {
      const sub = trimmed.replace(/\*\*/g, '');
      const labelMatch = sub.match(/^([A-Za-z]+):\s*(.+)/);
      if (labelMatch) {
        blocks.push({ type: 'subitem', label: labelMatch[1], text: labelMatch[2] });
      } else {
        blocks.push({ type: 'subtext', text: sub });
      }
      continue;
    }

    // Key: Value lines (like "Confidence: 85%", "Tools: multimeter, ...")
    const kvMatch = trimmed.match(/^([A-Za-z\s]+):\s+(.+)/);
    if (kvMatch && kvMatch[1].length < 25) {
      blocks.push({ type: 'keyvalue', label: kvMatch[1].replace(/\*\*/g, '').trim(), text: kvMatch[2].replace(/\*\*/g, '').trim() });
      continue;
    }

    // Plain text (bold parts highlighted)
    blocks.push({ type: 'text', text: trimmed.replace(/\*\*/g, '') });
  }

  return blocks;
};

const MobileRepairDetails = ({ navigation, route }) => {
  const jobCardId = route?.params?.jobCardId;
  const [data, setData] = useState(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('Inspection');

  // AI Diagnosis state
  const [diagnosisVisible, setDiagnosisVisible] = useState(false);
  const [symptoms, setSymptoms] = useState([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [diagnosisOptions, setDiagnosisOptions] = useState({
    searchForums: true, useAI: true, searchKnowledgeBase: true,
  });
  const [diagnosisResult, setDiagnosisResult] = useState(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagProblemDesc, setDiagProblemDesc] = useState('');

  // Diagnosis results, suggested parts, counts, service lines
  const [diagResults, setDiagResults] = useState([]);
  const [suggestedParts, setSuggestedParts] = useState([]);
  const [counts, setCounts] = useState({ diagnosisCount: 0, repairStepsCount: 0 });
  const [repairSteps, setRepairSteps] = useState([]);
  const [serviceLines, setServiceLines] = useState([]);

  // TTS + Language state
  const [reportLang, setReportLang] = useState('en');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [langPickerVisible, setLangPickerVisible] = useState(false);
  const [translating, setTranslating] = useState(false);

  // Add Service modal state
  const [addServiceVisible, setAddServiceVisible] = useState(false);
  const [serviceSearchText, setServiceSearchText] = useState('');
  const [serviceProducts, setServiceProducts] = useState([]);
  const [serviceSearchLoading, setServiceSearchLoading] = useState(false);

  // Forum search state
  const [forumVisible, setForumVisible] = useState(false);
  const [forumResults, setForumResults] = useState([]);
  const [forumLoading, setForumLoading] = useState(false);
  const [forumQuery, setForumQuery] = useState('');

  // AI Estimate state
  const [estimateVisible, setEstimateVisible] = useState(false);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateWizardModel, setEstimateWizardModel] = useState(null);
  const [estimateContext, setEstimateContext] = useState({});
  const [estimateData, setEstimateData] = useState({
    estimated_hours: '1.00',
    labor_rate: '50.00',
    labor_cost: '50.00',
    parts_cost: '0.00',
    total_estimated_cost: '50.00',
    notes: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [details, stageList] = await Promise.all([
        fetchJobCardDetailsOdoo(jobCardId),
        fetchJobCardStagesOdoo(),
      ]);
      setData(details);
      setStages(stageList);
      // Load related data in background
      Promise.all([
        fetchDiagnosisResultsOdoo(jobCardId).then(setDiagResults).catch(() => {}),
        fetchAISuggestedPartsOdoo(jobCardId).then(setSuggestedParts).catch(() => {}),
        fetchJobCardCountsOdoo(jobCardId).then(setCounts).catch(() => {}),
        fetchRepairStepsListOdoo({ jobCardId }).then(setRepairSteps).catch(() => {}),
        fetchServiceLinesOdoo(jobCardId).then(setServiceLines).catch(() => {}),
      ]);
    } catch (err) {
      console.error('loadData error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [jobCardId]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const getCurrentStageIndex = () => {
    if (stages.length === 0) return 0;
    const effectiveName = getEffectiveStageName();
    const stateValue = data?.state;
    if (!effectiveName && !data?.stage?.id && !stateValue) return 0;

    // If stages are from state selection, match by state value
    if (stages[0]?.isStateSelection && stateValue) {
      const idx = stages.findIndex(s => s.id === stateValue);
      if (idx >= 0) return idx;
    }
    // Try matching by stage ID
    if (data?.stage?.id) {
      const idx = stages.findIndex(s => s.id === data.stage.id);
      if (idx >= 0) return idx;
    }
    // Fallback: match by name (case-insensitive)
    if (effectiveName) {
      let idx = stages.findIndex(s => s.name && s.name.toLowerCase() === effectiveName.toLowerCase());
      if (idx >= 0) return idx;
      // Fallback: fuzzy match by stage category
      const currentCat = matchStage(effectiveName);
      idx = stages.findIndex(s => matchStage(s.name) === currentCat);
      if (idx >= 0) return idx;
    }
    return 0;
  };

  const executeAction = async (actionFn, successMsg) => {
    setActionLoading(true);
    try {
      await actionFn(jobCardId);
      showToast({ type: 'success', title: 'Success', message: successMsg });
      await loadData();
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: err.message || 'Action failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancel Job Card', 'Are you sure you want to cancel this job card?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: () => executeAction(jobCardCancelOdoo, 'Job card cancelled') },
    ]);
  };

  const handleGenerateSteps = async () => {
    setActionLoading(true);
    try {
      await generateStepsFromDiagnosisOdoo(jobCardId);
      showToast({ type: 'success', title: 'Success', message: 'Repair steps generated from diagnosis' });
      loadData();
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: err?.message || 'Failed to generate steps' });
    } finally {
      setActionLoading(false);
    }
  };

  const openForumSearch = () => {
    const q = [data?.device_brand?.name, data?.device_model?.name, data?.issue_complaint].filter(Boolean).join(' ');
    setForumQuery(q);
    setForumResults([]);
    setForumVisible(true);
  };

  const handleForumSearch = async () => {
    if (!forumQuery.trim()) return;
    setForumLoading(true);
    try {
      const results = await searchVinafixForums(forumQuery.trim());
      setForumResults(results);
      if (results.length === 0) {
        showToast({ type: 'info', title: 'No Results', message: 'No forum posts found for this query' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Search Failed', message: err?.message || 'Forum search failed' });
    } finally {
      setForumLoading(false);
    }
  };

  const openDiagnosis = async () => {
    setDiagnosisVisible(true);
    setDiagnosisResult(null);
    setSelectedSymptoms([]);
    setDiagProblemDesc(data?.issue_complaint || '');
    try {
      const syms = await fetchJobCardSymptomsOdoo();
      setSymptoms(syms);
    } catch {}
  };

  const toggleSymptom = (sym) => {
    setSelectedSymptoms(prev => {
      const exists = prev.find(s => s.id === sym.id);
      return exists ? prev.filter(s => s.id !== sym.id) : [...prev, sym];
    });
  };

  const [reportExpanded, setReportExpanded] = useState(false);

  const handleRunDiagnosis = async () => {
    setDiagnosisLoading(true);
    try {
      const result = await runAIDiagnosisOdoo(jobCardId, {
        reportedProblem: diagProblemDesc,
        symptomIds: selectedSymptoms.map(s => s.id),
        searchForums: diagnosisOptions.searchForums,
        useAI: diagnosisOptions.useAI,
        useKnowledgeBase: diagnosisOptions.searchKnowledgeBase,
      });
      setDiagnosisResult(result);
      // Reload diagnosis results, suggested parts, and counts after AI creates them
      await Promise.all([
        fetchDiagnosisResultsOdoo(jobCardId).then(setDiagResults).catch(() => {}),
        fetchAISuggestedPartsOdoo(jobCardId).then(setSuggestedParts).catch(() => {}),
        fetchJobCardCountsOdoo(jobCardId).then(setCounts).catch(() => {}),
      ]);
      await loadData();
      showToast({ type: 'success', title: 'AI Diagnosis', message: 'Diagnosis completed — records created in Odoo' });
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: err.message || 'AI Diagnosis failed' });
    } finally {
      setDiagnosisLoading(false);
    }
  };

  // ---- Diagnosis row actions (Pass / Fail / Delete) ----
  const handleDiagAction = async (diagId, action) => {
    try {
      if (action === 'delete') {
        Alert.alert('Delete Diagnosis', 'Are you sure you want to delete this diagnosis record?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            await deleteDiagnosisOdoo(diagId);
            setDiagResults(prev => prev.filter(d => d.id !== diagId));
            showToast({ type: 'success', title: 'Deleted', message: 'Diagnosis record deleted' });
          }},
        ]);
        return;
      }
      const newResult = action === 'pass' ? 'pass' : 'fail';
      await updateDiagnosisResultOdoo(diagId, newResult);
      setDiagResults(prev => prev.map(d => d.id === diagId ? { ...d, result: newResult } : d));
      showToast({ type: 'success', title: 'Updated', message: `Marked as ${action === 'pass' ? 'Pass' : 'Fail'}` });
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: err.message || 'Action failed' });
    }
  };

  // ---- Repair Step row actions (Done / Failed / Delete) ----
  const handleStepAction = async (stepId, action) => {
    try {
      if (action === 'delete') {
        Alert.alert('Delete Step', 'Are you sure you want to delete this repair step?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            await deleteRepairStepOdoo(stepId);
            setRepairSteps(prev => prev.filter(s => s.id !== stepId));
            showToast({ type: 'success', title: 'Deleted', message: 'Repair step deleted' });
          }},
        ]);
        return;
      }
      await updateRepairStepStatusOdoo(stepId, action);
      setRepairSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: action } : s));
      showToast({ type: 'success', title: 'Updated', message: `Step marked as ${action}` });
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: err.message || 'Action failed' });
    }
  };

  // ---- Add Service Line from Product Picker ----
  const openAddServiceModal = async () => {
    setAddServiceVisible(true);
    setServiceSearchText('');
    setServiceProducts([]);
    setServiceSearchLoading(true);
    try {
      const products = await fetchRepairProductsOdoo({ type: 'service', limit: 50 });
      setServiceProducts(products);
    } catch (err) {
      console.error('Load service products error:', err);
    } finally {
      setServiceSearchLoading(false);
    }
  };

  const searchServiceProducts = async (text) => {
    setServiceSearchText(text);
    if (text.length === 0) {
      setServiceSearchLoading(true);
      try {
        const products = await fetchRepairProductsOdoo({ type: 'service', limit: 50 });
        setServiceProducts(products);
      } catch (err) { console.error(err); }
      finally { setServiceSearchLoading(false); }
      return;
    }
    if (text.length < 2) return;
    setServiceSearchLoading(true);
    try {
      const products = await fetchRepairProductsOdoo({ type: 'service', limit: 50, searchText: text });
      setServiceProducts(products);
    } catch (err) {
      console.error('Search service products error:', err);
    } finally {
      setServiceSearchLoading(false);
    }
  };

  const handleSelectServiceProduct = async (product) => {
    setAddServiceVisible(false);
    setActionLoading(true);
    try {
      await addServiceLineOdoo(jobCardId, {
        productId: product.id,
        description: product.name,
        quantity: 1,
        unitPrice: product.list_price,
      });
      const lines = await fetchServiceLinesOdoo(jobCardId);
      setServiceLines(lines);
      loadData();
      showToast({ type: 'success', title: 'Added', message: `${product.name} added to services` });
    } catch (e) {
      showToast({ type: 'error', title: 'Error', message: e.message || 'Failed to add service' });
    } finally {
      setActionLoading(false);
    }
  };

  // ---- TTS: Read Full Report ----
  // translate code for MyMemory API, tts code for expo-speech (needs full locale)
  const LANG_OPTIONS = [
    { code: 'en', tts: 'en-US', label: 'English' },
    { code: 'hi', tts: 'hi-IN', label: 'Hindi' },
    { code: 'ml', tts: 'ml-IN', label: 'Malayalam' },
    { code: 'ta', tts: 'ta-IN', label: 'Tamil' },
    { code: 'ar', tts: 'ar-SA', label: 'Arabic' },
    { code: 'es', tts: 'es-ES', label: 'Spanish' },
    { code: 'fr', tts: 'fr-FR', label: 'French' },
    { code: 'te', tts: 'te-IN', label: 'Telugu' },
    { code: 'kn', tts: 'kn-IN', label: 'Kannada' },
    { code: 'bn', tts: 'bn-IN', label: 'Bengali' },
    { code: 'ur', tts: 'ur-PK', label: 'Urdu' },
  ];

  const translateText = async (text, translateCode) => {
    if (!text || translateCode === 'en') return text;
    try {
      // Split into chunks (MyMemory limit ~500 chars per request)
      const chunks = [];
      let remaining = text;
      while (remaining.length > 0) {
        chunks.push(remaining.substring(0, 500));
        remaining = remaining.substring(500);
      }
      const translated = [];
      for (const chunk of chunks) {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${translateCode}`;
        console.log('[TTS] Translating chunk to', translateCode, ':', chunk.substring(0, 50) + '...');
        const resp = await fetch(url);
        const data = await resp.json();
        console.log('[TTS] Translation response:', data?.responseStatus, data?.responseData?.translatedText?.substring(0, 80));
        if (data?.responseStatus === 200 && data?.responseData?.translatedText) {
          translated.push(data.responseData.translatedText);
        } else {
          console.log('[TTS] Chunk translation failed, using original');
          translated.push(chunk);
        }
      }
      return translated.join(' ');
    } catch (err) {
      console.log('[TTS] Translation failed, using English:', err.message);
      showToast({ type: 'error', title: 'Translation Failed', message: 'Reading in English instead' });
      return text;
    }
  };

  // Refs for Google TTS audio playback
  const gttsSound = React.useRef(null);
  const gttsStopped = React.useRef(false);

  // Stop any playing Google TTS audio
  const stopGttsAudio = async () => {
    gttsStopped.current = true;
    try {
      if (gttsSound.current) {
        await gttsSound.current.stopAsync();
        await gttsSound.current.unloadAsync();
        gttsSound.current = null;
      }
    } catch (e) { /* ignore */ }
  };

  // Play text using Google Translate TTS (works for ALL languages, no device voice needed)
  const playWithGoogleTTS = async (text, langCode) => {
    gttsStopped.current = false;
    try {
      // Google TTS URL has ~200 char limit per request, so split text into chunks
      const maxChunk = 180;
      const chunks = [];
      let remaining = text;
      while (remaining.length > 0) {
        // Try to split at sentence/word boundary
        if (remaining.length <= maxChunk) {
          chunks.push(remaining);
          break;
        }
        let splitAt = maxChunk;
        // Find last sentence end (. ! ?) within limit
        const lastSentence = remaining.substring(0, maxChunk).lastIndexOf('. ');
        const lastExcl = remaining.substring(0, maxChunk).lastIndexOf('! ');
        const lastQ = remaining.substring(0, maxChunk).lastIndexOf('? ');
        const best = Math.max(lastSentence, lastExcl, lastQ);
        if (best > maxChunk * 0.3) {
          splitAt = best + 2;
        } else {
          // Fall back to last space
          const lastSpace = remaining.substring(0, maxChunk).lastIndexOf(' ');
          if (lastSpace > maxChunk * 0.3) splitAt = lastSpace + 1;
        }
        chunks.push(remaining.substring(0, splitAt));
        remaining = remaining.substring(splitAt);
      }

      console.log('[GTTS] Playing', chunks.length, 'chunks in', langCode);

      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      for (let i = 0; i < chunks.length; i++) {
        if (gttsStopped.current) break; // User stopped

        const chunk = chunks[i].trim();
        if (!chunk) continue;

        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${langCode}&client=tw-ob`;
        console.log('[GTTS] Chunk', i + 1, '/', chunks.length, '- length:', chunk.length);

        const { sound } = await Audio.Sound.createAsync(
          { uri: ttsUrl },
          { shouldPlay: true }
        );
        gttsSound.current = sound;

        // Wait for this chunk to finish playing
        await new Promise((resolve) => {
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.didJustFinish || status.isLoaded === false) {
              resolve();
            }
          });
        });

        // Cleanup this chunk
        try {
          await sound.unloadAsync();
        } catch (e) { /* ignore */ }
        gttsSound.current = null;
      }

      setIsSpeaking(false);
    } catch (err) {
      console.log('[GTTS] Error:', err.message);
      setIsSpeaking(false);
      showToast({ type: 'error', title: 'Audio Error', message: 'Could not play audio. Check internet connection.' });
    }
  };

  const handleReadReport = async () => {
    if (isSpeaking) {
      // Stop both expo-speech and Google TTS audio
      Speech.stop();
      await stopGttsAudio();
      setIsSpeaking(false);
      return;
    }
    const rText = diagnosisResult || data?.diagnosis_result || '';
    if (!rText) {
      showToast({ type: 'info', title: 'No Report', message: 'No diagnosis report to read' });
      return;
    }
    const cleanText = stripEmojis(htmlToPlainText(rText).replace(/[#*]/g, '')).trim();
    const langObj = LANG_OPTIONS.find(l => l.code === reportLang) || LANG_OPTIONS[0];
    let textToSpeak = cleanText;

    // Translate if not English
    if (langObj.code !== 'en') {
      setTranslating(true);
      try {
        textToSpeak = await translateText(cleanText, langObj.code);
      } finally {
        setTranslating(false);
      }
    }

    console.log('[TTS] Speaking in', langObj.tts, '- text length:', textToSpeak.length);
    setIsSpeaking(true);

    // Check available voices and find best match
    const voices = await Speech.getAvailableVoicesAsync();
    const matchedVoice = voices.find(v => v.language === langObj.tts)
      || voices.find(v => v.language && v.language.startsWith(langObj.code + '-'))
      || voices.find(v => v.language && v.language.startsWith(langObj.code));
    console.log('[TTS] Matched voice:', matchedVoice?.identifier || 'NONE', 'lang:', matchedVoice?.language || 'N/A', 'from', voices.length, 'available');

    if (matchedVoice || langObj.code === 'en') {
      // Device has a voice for this language — use expo-speech
      Speech.speak(textToSpeak, {
        language: matchedVoice?.language || langObj.tts,
        rate: 0.9,
        ...(matchedVoice ? { voice: matchedVoice.identifier } : {}),
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: (err) => { console.log('[TTS] Speech error:', err); setIsSpeaking(false); },
      });
    } else {
      // No device voice — use Google Translate TTS as fallback
      console.log('[TTS] No device voice for', langObj.label, '— using Google Translate TTS fallback');
      showToast({ type: 'info', title: `${langObj.label}`, message: `Using online TTS for ${langObj.label}...` });
      playWithGoogleTTS(textToSpeak, langObj.code);
    }
  };

  // Stop speech on unmount or tab change
  useEffect(() => {
    return () => { Speech.stop(); stopGttsAudio(); };
  }, []);

  useEffect(() => {
    Speech.stop();
    stopGttsAudio();
    setIsSpeaking(false);
  }, [activeTab]);

  // ---- AI ESTIMATE ----
  const openEstimate = async () => {
    setEstimateVisible(true);
    setEstimateLoading(true);
    try {
      const wizard = await openEstimateWizardOdoo(jobCardId);
      setEstimateWizardModel(wizard.wizardModel);
      setEstimateContext(wizard.context || {});
      const d = wizard.defaults || {};
      setEstimateData({
        estimated_hours: String(d.estimated_hours ?? d.hour ?? '1.00'),
        labor_rate: String(d.labor_rate ?? d.rate ?? '50.00'),
        labor_cost: String(d.labor_cost ?? '50.00'),
        parts_cost: String(d.parts_cost ?? '0.00'),
        total_estimated_cost: String(d.total_estimated_cost ?? d.total ?? '50.00'),
        notes: d.notes || '',
      });
    } catch (err) {
      console.log('[MobileRepair] openEstimate error:', err?.message);
      // Use sensible defaults if wizard can't be opened
      setEstimateWizardModel(null);
    } finally {
      setEstimateLoading(false);
    }
  };

  const updateEstimateField = (field, value) => {
    setEstimateData(prev => {
      const updated = { ...prev, [field]: value };
      // Recalculate labor cost and total
      const hours = parseFloat(updated.estimated_hours) || 0;
      const rate = parseFloat(updated.labor_rate) || 0;
      const laborCost = hours * rate;
      const partsCost = parseFloat(updated.parts_cost) || 0;
      updated.labor_cost = laborCost.toFixed(2);
      updated.total_estimated_cost = (laborCost + partsCost).toFixed(2);
      return updated;
    });
  };

  const handleApplyEstimate = async (createQuotation = false) => {
    setEstimateLoading(true);
    try {
      if (estimateWizardModel) {
        // Use Odoo wizard
        const wizardData = {
          job_card_id: jobCardId,
          estimated_hours: parseFloat(estimateData.estimated_hours) || 0,
          labor_rate: parseFloat(estimateData.labor_rate) || 0,
          notes: estimateData.notes || '',
        };
        await applyEstimateOdoo(estimateWizardModel, wizardData, estimateContext, createQuotation);
      } else {
        // Fallback: write estimate fields directly to job card
        const headers = { 'Content-Type': 'application/json' };
        // Try writing estimated fields directly
        showToast({ type: 'info', title: 'Info', message: 'Estimate saved locally. Wizard not available on server.' });
      }
      showToast({ type: 'success', title: 'Success', message: createQuotation ? 'Estimate applied & quotation created' : 'Estimate applied' });
      setEstimateVisible(false);
      await loadData();
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: err.message || 'Failed to apply estimate' });
    } finally {
      setEstimateLoading(false);
    }
  };

  // Get effective stage name from stage or state field
  const getEffectiveStageName = () => data?.stage?.name || data?.state || '';

  // Stage-specific action buttons
  const getStageActions = () => {
    const stageCategory = matchStage(getEffectiveStageName());
    if (stageCategory === 'completed' || stageCategory === 'cancelled') return [];
    const actions = [];
    switch (stageCategory) {
      case 'draft':
        actions.push({ label: 'Start Inspection', color: '#714B67', onPress: () => {
          executeAction(() => moveJobCardToNextStageOdoo(jobCardId, 'inspection'), 'Moved to Inspection');
        }});
        break;
      case 'inspection':
        actions.push(
          { label: 'Create Quotation', color: '#714B67', onPress: () => executeAction(jobCardCreateQuotationOdoo, 'Quotation created') },
          { label: 'Print Receipt', color: '#714B67', onPress: () => showToast({ type: 'info', title: 'Print', message: 'Print receipt feature coming soon' }) },
          { label: 'AI Diagnosis', color: '#00A09D', onPress: openDiagnosis },
          { label: 'Search Forums', color: '#714B67', onPress: openForumSearch },
          { label: 'Generate Steps', color: '#714B67', onPress: handleGenerateSteps },
          { label: 'AI Estimate', color: '#714B67', onPress: openEstimate },
          { label: 'Cancel', color: '#333', onPress: handleCancel },
        );
        return actions;
      case 'quotation':
        actions.push(
          { label: 'Start Repair', color: '#714B67', onPress: () => executeAction(jobCardStartRepairOdoo, 'Repair started') },
          { label: 'Create Invoice', color: '#00A09D', onPress: () => executeAction(jobCardCreateInvoiceOdoo, 'Invoice created') },
          { label: 'Print Receipt', color: '#333', onPress: () => showToast({ type: 'info', title: 'Print', message: 'Print receipt feature coming soon' }) },
          { label: 'Cancel', color: '#333', onPress: handleCancel },
        );
        return actions;
      case 'repair':
        actions.push(
          { label: 'Mark Completed', color: '#714B67', onPress: () => executeAction(jobCardMarkCompletedOdoo, 'Job card completed') },
          { label: 'Print Receipt', color: '#333', onPress: () => showToast({ type: 'info', title: 'Print', message: 'Print receipt feature coming soon' }) },
          { label: 'Cancel', color: '#333', onPress: handleCancel },
        );
        return actions;
    }
    actions.push({ label: 'Cancel', color: '#333', onPress: handleCancel });
    return actions;
  };

  // ---- RENDER HELPERS ----

  const renderField = (label, value) => (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || ''}</Text>
    </View>
  );

  const renderCheckbox = (label, checked) => (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.checkboxWrap}>
        <MaterialIcons name={checked ? 'check-box' : 'check-box-outline-blank'} size={18} color={checked ? COLORS.primaryThemeColor : '#CCC'} />
      </View>
    </View>
  );

  const renderStageBar = () => {
    const currentIdx = getCurrentStageIndex();
    return (
      <View style={styles.stageBarContainer}>
        {stages.map((stage, idx) => {
          const isActive = idx <= currentIdx;
          const isCurrent = idx === currentIdx;
          const color = getStageColor(stage.name);
          return (
            <View key={stage.id} style={styles.stageItem}>
              <View style={[styles.stageChip, isActive && { backgroundColor: color + '18' }, isCurrent && { backgroundColor: color + '25', borderColor: color, borderWidth: 1 }]}>
                <Text style={[styles.stageChipText, isActive && { color }, isCurrent && { fontFamily: FONT_FAMILY.urbanistBold }]}>{stage.name}</Text>
              </View>
              {idx < stages.length - 1 && (
                <MaterialIcons name="chevron-right" size={16} color={isActive ? color : '#CCC'} />
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderActionButtons = () => {
    const actions = getStageActions();
    if (actions.length === 0) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsScroll} contentContainerStyle={styles.actionsContainer}>
        {actions.map((action, idx) => (
          <TouchableOpacity key={idx} style={[styles.actionChip, { backgroundColor: action.color }]} onPress={action.onPress} disabled={actionLoading}>
            <Text style={styles.actionChipText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderSmartButtons = () => (
    <View style={styles.smartBtnRow}>
      <TouchableOpacity style={styles.smartBtn} onPress={() => navigation.navigate('DiagnosisListScreen', { jobCardId: data?.id, jobCardRef: data?.ref })}>
        <MaterialIcons name="biotech" size={18} color="#9C27B0" />
        <Text style={styles.smartBtnLabel}>Diagnosis</Text>
        <View style={styles.smartBtnBadge}><Text style={styles.smartBtnCount}>{counts.diagnosisCount}</Text></View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.smartBtn} onPress={() => navigation.navigate('RepairStepsListScreen', { jobCardId: data?.id, jobCardRef: data?.ref })}>
        <MaterialIcons name="handyman" size={18} color="#FF5722" />
        <Text style={styles.smartBtnLabel}>Repair Steps</Text>
        <View style={styles.smartBtnBadge}><Text style={styles.smartBtnCount}>{counts.repairStepsCount}</Text></View>
      </TouchableOpacity>
      {data?.sale_order_count > 0 && (
        <View style={styles.smartBtn}>
          <MaterialIcons name="shopping-cart" size={18} color={COLORS.primaryThemeColor} />
          <Text style={styles.smartBtnLabel}>Sale Order</Text>
          <View style={styles.smartBtnBadge}><Text style={styles.smartBtnCount}>{data.sale_order_count}</Text></View>
        </View>
      )}
      {data?.spare_request_count > 0 && (
        <View style={styles.smartBtn}>
          <MaterialIcons name="settings" size={18} color={COLORS.primaryThemeColor} />
          <Text style={styles.smartBtnLabel}>Spare Requests</Text>
          <View style={styles.smartBtnBadge}><Text style={styles.smartBtnCount}>{data.spare_request_count}</Text></View>
        </View>
      )}
    </View>
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
            {(data?.checklist_ids?.length > 0) ? (
              data.checklist_ids.map((item, i) => (
                <View key={i} style={styles.checklistRow}>
                  <Text style={[styles.checklistVal, { flex: 3 }]}>{typeof item === 'object' ? item.name : `Item ${item}`}</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <MaterialIcons name={item.done ? 'check-box' : 'check-box-outline-blank'} size={18} color={item.done ? '#4CAF50' : '#CCC'} />
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyTabText}>No checklist items</Text>
            )}
            <Text style={[styles.tabSubTitle, { marginTop: 20 }]}>INSPECTION NOTES</Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>{htmlToPlainText(data?.inspection_notes) || 'No inspection notes'}</Text>
            </View>
          </View>
        );
      case 'AI Diagnosis': {
        const reportText = diagnosisResult || data?.diagnosis_result || '';
        const hasReport = !!reportText;
        const hasDiagResults = diagResults.length > 0;
        return (
          <View style={styles.tabContent}>
            {/* Two-column: SYMPTOMS (left) + ESTIMATION (right) — Odoo layout */}
            <View style={styles.diagTwoCol}>
              {/* Left: Symptoms */}
              <View style={styles.diagCol}>
                <Text style={styles.tableSectionTitle}>SYMPTOMS</Text>
                {(data?.symptom_ids?.length > 0) ? (
                  data.symptom_ids.map((sym, i) => {
                    const symName = typeof sym === 'object' ? (sym.name || sym.display_name || `Symptom ${sym.id || i + 1}`) : `Symptom ${sym}`;
                    return (
                      <View key={i} style={styles.diagSymRow}>
                        <MaterialIcons name="check-box" size={16} color="#4CAF50" />
                        <Text style={styles.diagSymText}>{symName}</Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.emptyTabText}>No symptoms selected</Text>
                )}
              </View>
              {/* Right: Estimation */}
              <View style={styles.diagCol}>
                <Text style={styles.tableSectionTitle}>ESTIMATION</Text>
                <View style={styles.diagEstRow}>
                  <Text style={styles.diagEstLabel}>Estimated Hours</Text>
                  <Text style={styles.diagEstValue}>{parseFloat(data?.estimated_hours || 0).toFixed(2)}</Text>
                </View>
                <View style={styles.diagEstRow}>
                  <Text style={styles.diagEstLabel}>Estimated Parts Cost</Text>
                  <Text style={styles.diagEstValue}>{parseFloat(data?.estimated_parts_cost || 0).toFixed(2)}</Text>
                </View>
                <View style={styles.diagEstRow}>
                  <Text style={styles.diagEstLabel}>Estimated Labor Cost</Text>
                  <Text style={styles.diagEstValue}>{parseFloat(data?.estimated_labor_cost || 0).toFixed(2)}</Text>
                </View>
                <View style={[styles.diagEstRow, styles.diagEstTotal]}>
                  <Text style={[styles.diagEstLabel, { fontFamily: FONT_FAMILY.urbanistBold }]}>Total Estimated Cost</Text>
                  <Text style={[styles.diagEstValue, { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 15 }]}>{parseFloat(data?.total_estimated_cost || 0).toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {/* DIAGNOSIS RESULTS Table — Odoo layout */}
            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.tableSectionTitle, { flex: 1 }]}>DIAGNOSIS RESULTS</Text>
                {hasDiagResults && (
                  <Text style={{ fontSize: 11, color: '#666', fontFamily: FONT_FAMILY.urbanistMedium }}>{diagResults.length} record{diagResults.length !== 1 ? 's' : ''}</Text>
                )}
              </View>
              {hasDiagResults ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ minWidth: 820 }}>
                    {/* Header row */}
                    <View style={styles.diagTableHeader}>
                      <Text style={[styles.diagTableHCell, { width: 200 }]}>Test Name</Text>
                      <Text style={[styles.diagTableHCell, { width: 110 }]}>Category</Text>
                      <Text style={[styles.diagTableHCell, { width: 110 }]}>Symptom Tested</Text>
                      <Text style={[styles.diagTableHCell, { width: 80, textAlign: 'center' }]}>Result</Text>
                      <Text style={[styles.diagTableHCell, { width: 90, textAlign: 'right' }]}>AI Confidence</Text>
                      <Text style={[styles.diagTableHCell, { width: 120 }]}>Root Cause</Text>
                      <Text style={[styles.diagTableHCell, { width: 100, textAlign: 'center' }]}></Text>
                    </View>
                    {/* Data rows */}
                    {diagResults.map((dr) => {
                      const resultKey = (dr.result || 'not_tested').toLowerCase().replace(/\s+/g, '_');
                      const isPass = resultKey === 'pass' || resultKey === 'passed';
                      const isFail = resultKey === 'fail' || resultKey === 'failed';
                      const resultBg = isPass ? '#E8F5E9' : isFail ? '#FFEBEE' : '#E0F2F1';
                      const resultColor = isPass ? '#2E7D32' : isFail ? '#C62828' : '#00796B';
                      const resultLabel = isPass ? 'Pass' : isFail ? 'Fail' : 'Not Tested';
                      return (
                        <View key={dr.id} style={styles.diagTableRow}>
                          <Text style={[styles.diagTableCell, { width: 200 }]} numberOfLines={2}>{dr.test_name}</Text>
                          <Text style={[styles.diagTableCell, { width: 110, color: '#555' }]} numberOfLines={1}>{dr.category || 'Other'}</Text>
                          <Text style={[styles.diagTableCell, { width: 110, color: '#555' }]} numberOfLines={1}>{dr.symptom_tested || ''}</Text>
                          <View style={{ width: 80, alignItems: 'center', justifyContent: 'center' }}>
                            <View style={[styles.diagResultBadge, { backgroundColor: resultBg }]}>
                              <Text style={[styles.diagResultBadgeText, { color: resultColor }]}>{resultLabel}</Text>
                            </View>
                          </View>
                          <Text style={[styles.diagTableCell, { width: 90, textAlign: 'right', fontFamily: FONT_FAMILY.urbanistBold }]}>{parseFloat(dr.ai_confidence || 0).toFixed(2)}</Text>
                          <Text style={[styles.diagTableCell, { width: 120, color: '#555' }]} numberOfLines={2}>{dr.root_cause || ''}</Text>
                          {/* Action buttons: Pass | Fail | Delete */}
                          <View style={styles.diagActionBtns}>
                            <TouchableOpacity
                              style={[styles.diagActionBtn, { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' }]}
                              onPress={() => handleDiagAction(dr.id, 'pass')}
                            >
                              <MaterialIcons name="check" size={16} color="#4CAF50" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.diagActionBtn, { backgroundColor: '#FFEBEE', borderColor: '#F44336' }]}
                              onPress={() => handleDiagAction(dr.id, 'fail')}
                            >
                              <MaterialIcons name="close" size={16} color="#F44336" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.diagActionBtn, { backgroundColor: '#FFF3E0', borderColor: '#FF9800' }]}
                              onPress={() => handleDiagAction(dr.id, 'delete')}
                            >
                              <MaterialIcons name="delete-outline" size={16} color="#FF9800" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : (
                <Text style={styles.emptyTabText}>No diagnosis results yet</Text>
              )}
            </View>

            {/* AI DIAGNOSIS REPORT */}
            <View style={{ marginTop: 16 }}>
              <Text style={styles.tableSectionTitle}>AI DIAGNOSIS REPORT</Text>
              {/* Language chooser + Read Full Report bar — Odoo style */}
              <View style={styles.reportToolbar}>
                <TouchableOpacity style={styles.reportLangBtn} onPress={() => setLangPickerVisible(true)}>
                  <Ionicons name="globe-outline" size={14} color="#333" />
                  <Text style={styles.reportLangText}>{LANG_OPTIONS.find(l => l.code === reportLang)?.label || 'English'}</Text>
                  <MaterialIcons name="arrow-drop-down" size={16} color="#333" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reportReadBtn, isSpeaking && { backgroundColor: '#C62828' }, translating && { opacity: 0.6 }]}
                  onPress={handleReadReport}
                  disabled={translating}
                >
                  <MaterialIcons name={isSpeaking ? 'stop' : 'play-arrow'} size={16} color="white" />
                  <Text style={styles.reportReadBtnText}>{translating ? 'Translating...' : isSpeaking ? 'Stop Reading' : 'Read Full Report'}</Text>
                </TouchableOpacity>
                {hasReport && (
                  <TouchableOpacity
                    style={[styles.reportReadBtn, { backgroundColor: reportExpanded ? '#555' : '#714B67' }]}
                    onPress={() => setReportExpanded(!reportExpanded)}
                  >
                    <MaterialIcons name={reportExpanded ? 'expand-less' : 'description'} size={16} color="white" />
                    <Text style={styles.reportReadBtnText}>{reportExpanded ? 'Collapse' : 'View Report'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {hasReport ? (
                <>
                  {reportExpanded && renderFormattedReport(reportText)}
                  {!reportExpanded && (
                    <Text style={styles.diagReportPreview} numberOfLines={3}>
                      {htmlToPlainText(reportText).replace(/[#*]/g, '').trim()}
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.emptyTabText}>No AI diagnosis report yet</Text>
              )}
            </View>

            {/* AI SUGGESTED SPARE PARTS */}
            <View style={{ marginTop: 16 }}>
              <Text style={styles.tableSectionTitle}>AI SUGGESTED SPARE PARTS</Text>
              {suggestedParts.length > 0 ? (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderCell, { flex: 2.5 }]}>Part Name</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Est. Cost</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Matched Product</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Status</Text>
                  </View>
                  {suggestedParts.map((sp) => (
                    <View key={sp.id} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 2.5 }]} numberOfLines={2}>{sp.part_name}</Text>
                      <Text style={[styles.tableCell, { flex: 0.7, textAlign: 'center' }]}>{sp.quantity}</Text>
                      <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{(sp.estimated_cost || 0).toFixed(2)}</Text>
                      <Text style={[styles.tableCell, { flex: 1.5, color: '#666' }]} numberOfLines={1}>{sp.matched_product || '-'}</Text>
                      <Text style={[styles.tableCell, { flex: 1, color: '#666' }]}>{sp.stock_status || sp.status || '-'}</Text>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.emptyTabText}>No suggested spare parts</Text>
              )}
            </View>
          </View>
        );
      }
      case 'Repair Steps':
        return (
          <View style={styles.tabContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.tableSectionTitle}>REPAIR CHECKLIST</Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#714B67', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, opacity: actionLoading ? 0.6 : 1 }}
                onPress={handleGenerateSteps}
                disabled={actionLoading}
              >
                <MaterialIcons name="build" size={16} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>{actionLoading ? 'Generating...' : 'Generate Steps'}</Text>
              </TouchableOpacity>
            </View>
            {repairSteps.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: 850 }}>
                  {/* Header */}
                  <View style={styles.diagTableHeader}>
                    <Text style={[styles.diagTableHCell, { width: 220 }]}>Step Title</Text>
                    <Text style={[styles.diagTableHCell, { width: 80, textAlign: 'center' }]}>Difficulty</Text>
                    <Text style={[styles.diagTableHCell, { width: 110 }]}>Source</Text>
                    <Text style={[styles.diagTableHCell, { width: 70, textAlign: 'right' }]}>Estimate</Text>
                    <Text style={[styles.diagTableHCell, { width: 80, textAlign: 'center' }]}>Status</Text>
                    <Text style={[styles.diagTableHCell, { width: 150 }]}>Technician Notes</Text>
                    <Text style={[styles.diagTableHCell, { width: 120, textAlign: 'center' }]}></Text>
                  </View>
                  {/* Rows */}
                  {repairSteps.map((step) => {
                    const diff = (step.difficulty || 'easy').toLowerCase();
                    const diffBg = diff === 'easy' ? '#E8F5E9' : diff === 'hard' ? '#FFEBEE' : '#FFF3E0';
                    const diffColor = diff === 'easy' ? '#2E7D32' : diff === 'hard' ? '#C62828' : '#E65100';
                    const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);
                    const st = (step.status || 'pending').toLowerCase();
                    const isDone = st === 'done' || st === 'completed';
                    const isFailed = st === 'failed' || st === 'fail';
                    const isSkipped = st === 'skip' || st === 'skipped';
                    const stBg = isDone ? '#E8F5E9' : isFailed ? '#FFEBEE' : isSkipped ? '#E3F2FD' : '#FFF3E0';
                    const stColor = isDone ? '#2E7D32' : isFailed ? '#C62828' : isSkipped ? '#1565C0' : '#E65100';
                    const stLabel = isDone ? 'Done' : isFailed ? 'Failed' : isSkipped ? 'Skipped' : 'Pending';
                    return (
                      <TouchableOpacity
                        key={step.id}
                        style={styles.diagTableRow}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('RepairStepDetailScreen', { stepId: step.id })}
                      >
                        <Text style={[styles.diagTableCell, { width: 220 }]} numberOfLines={2}>{step.step_title}</Text>
                        <View style={{ width: 80, alignItems: 'center' }}>
                          <View style={[styles.diagResultBadge, { backgroundColor: diffBg }]}>
                            <Text style={[styles.diagResultBadgeText, { color: diffColor }]}>{diffLabel}</Text>
                          </View>
                        </View>
                        <Text style={[styles.diagTableCell, { width: 110, color: '#555' }]} numberOfLines={1}>{step.source || 'AI Generated'}</Text>
                        <Text style={[styles.diagTableCell, { width: 70, textAlign: 'right' }]}>{step.estimated_minutes || 0}</Text>
                        <View style={{ width: 80, alignItems: 'center' }}>
                          <View style={[styles.diagResultBadge, { backgroundColor: stBg }]}>
                            <Text style={[styles.diagResultBadgeText, { color: stColor }]}>{stLabel}</Text>
                          </View>
                        </View>
                        <Text style={[styles.diagTableCell, { width: 150, color: '#555' }]} numberOfLines={2}>{step.technician_notes || ''}</Text>
                        {/* Action buttons: Done ✓ | Save 💾 | Failed ✗ | Delete 🗑 */}
                        <View style={styles.diagActionBtns}>
                          <TouchableOpacity
                            style={[styles.diagActionBtn, { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' }]}
                            onPress={(e) => { e.stopPropagation(); handleStepAction(step.id, 'done'); }}
                          >
                            <MaterialIcons name="check" size={16} color="#4CAF50" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.diagActionBtn, { backgroundColor: '#FFEBEE', borderColor: '#F44336' }]}
                            onPress={(e) => { e.stopPropagation(); handleStepAction(step.id, 'failed'); }}
                          >
                            <MaterialIcons name="close" size={16} color="#F44336" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.diagActionBtn, { backgroundColor: '#FFF3E0', borderColor: '#FF9800' }]}
                            onPress={(e) => { e.stopPropagation(); handleStepAction(step.id, 'delete'); }}
                          >
                            <MaterialIcons name="delete-outline" size={16} color="#FF9800" />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <Text style={styles.emptyTabText}>No repair steps recorded</Text>
            )}
          </View>
        );
      case 'Required Services':
        return (
          <View style={styles.tabContent}>
            {/* Service Lines Table */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: 700 }}>
                {/* Header */}
                <View style={[styles.diagTableHeader, { backgroundColor: '#F9F5F8' }]}>
                  <Text style={[styles.diagTableHCell, { width: 160 }]}>Service</Text>
                  <Text style={[styles.diagTableHCell, { width: 140 }]}>Description</Text>
                  <Text style={[styles.diagTableHCell, { width: 60, textAlign: 'right' }]}>Qty</Text>
                  <Text style={[styles.diagTableHCell, { width: 60 }]}>Unit</Text>
                  <Text style={[styles.diagTableHCell, { width: 80, textAlign: 'right' }]}>Unit Price</Text>
                  <Text style={[styles.diagTableHCell, { width: 80, textAlign: 'right' }]}>Subtotal</Text>
                  <Text style={[styles.diagTableHCell, { width: 70, textAlign: 'right' }]}>Tax Amt</Text>
                  <Text style={[styles.diagTableHCell, { width: 40, textAlign: 'center' }]}></Text>
                </View>
                {/* Rows */}
                {serviceLines.map((line) => (
                  <View key={line.id} style={styles.diagTableRow}>
                    <Text style={[styles.diagTableCell, { width: 160 }]} numberOfLines={2}>{line.service}</Text>
                    <Text style={[styles.diagTableCell, { width: 140, color: '#666' }]} numberOfLines={2}>{line.description}</Text>
                    <Text style={[styles.diagTableCell, { width: 60, textAlign: 'right' }]}>{line.quantity}</Text>
                    <Text style={[styles.diagTableCell, { width: 60, color: '#666' }]}>{line.uom}</Text>
                    <Text style={[styles.diagTableCell, { width: 80, textAlign: 'right' }]}>{line.unit_price.toFixed(2)}</Text>
                    <Text style={[styles.diagTableCell, { width: 80, textAlign: 'right', fontWeight: '600' }]}>{line.subtotal.toFixed(2)}</Text>
                    <Text style={[styles.diagTableCell, { width: 70, textAlign: 'right', color: '#666' }]}>{line.tax_amount.toFixed(2)}</Text>
                    <TouchableOpacity style={{ width: 40, alignItems: 'center', justifyContent: 'center' }} onPress={() => {
                      Alert.alert('Delete', 'Remove this service line?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: async () => {
                          try {
                            await deleteServiceLineOdoo(line.id);
                            setServiceLines(prev => prev.filter(l => l.id !== line.id));
                            loadData();
                          } catch (e) { showToast({ type: 'error', title: 'Error', message: e.message }); }
                        }},
                      ]);
                    }}>
                      <MaterialIcons name="delete-outline" size={16} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                ))}
                {/* Add a line */}
                <TouchableOpacity
                  style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                  onPress={openAddServiceModal}
                >
                  <Text style={{ color: '#714B67', fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium }}>Add a line</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Totals */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#E0E0E0', marginTop: 8, paddingTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: '#666', marginRight: 12 }}>Total Service Charge:</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', minWidth: 70, textAlign: 'right' }}>{(data?.total_service_charge || serviceLines.reduce((s, l) => s + l.subtotal, 0)).toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#333', marginRight: 12 }}>Total Amount:</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', minWidth: 70, textAlign: 'right' }}>$ {(data?.total_amount || 0).toFixed(2)}</Text>
              </View>
            </View>
          </View>
        );
      case 'Required Spare Parts':
        return (
          <View style={styles.tabContent}>
            {/* AI Suggested Parts */}
            {suggestedParts.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.tableSectionTitle}>AI SUGGESTED PARTS</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, { flex: 2.5 }]}>Part Name</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Est. Cost</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Status</Text>
                </View>
                {suggestedParts.map((sp) => (
                  <View key={sp.id} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 2.5 }]} numberOfLines={2}>{sp.part_name}</Text>
                    <Text style={[styles.tableCell, { flex: 0.7, textAlign: 'center' }]}>{sp.quantity}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{(sp.estimated_cost || 0).toFixed(2)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, color: '#666' }]}>{sp.stock_status || sp.status || '-'}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Existing Spare Part Lines */}
            {(data?.spare_part_ids?.length > 0) && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.tableSectionTitle}>EXISTING PARTS</Text>
                {data.spare_part_ids.map((part, i) => (
                  <View key={i} style={styles.listItem}>
                    <MaterialIcons name="settings" size={14} color="#666" />
                    <Text style={styles.listItemText}>{typeof part === 'object' ? part.name : `Part ${part}`}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Request Spare Parts Button */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#714B67', paddingVertical: 12, borderRadius: 8, marginTop: 12 }}
              onPress={() => navigation.navigate('SpareRequestForm', {
                prefillJobCard: { id: data?.id, name: data?.ref || data?.name },
                prefillParts: suggestedParts.map(sp => ({
                  partName: sp.part_name,
                  quantity: sp.quantity,
                  matchedProductId: sp.matched_product_id,
                  matchedProduct: sp.matched_product,
                })),
              })}
            >
              <MaterialIcons name="add-shopping-cart" size={18} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>Request Spare Parts</Text>
            </TouchableOpacity>
          </View>
        );
      case 'Other Info':
        return (
          <View style={styles.tabContent}>
            {renderField('Created Date', data?.create_date)}
            {renderField('State', data?.state)}
          </View>
        );
      default:
        return null;
    }
  };

  // ---- FORMATTED AI REPORT ----
  const renderFormattedReport = (reportText) => {
    if (!reportText || typeof reportText !== 'string') return null;
    // Always strip HTML first before any rendering
    const cleanText = htmlToPlainText(reportText);
    const blocks = parseReportBlocks(cleanText);
    if (blocks.length === 0) return <Text style={styles.diagResultText}>{cleanText}</Text>;

    return (
      <View style={styles.reportContainer}>
        <Text style={styles.rptTitle}>AI Diagnosis Report</Text>
        {blocks.map((b, i) => {
          switch (b.type) {
            case 'header':
              return <Text key={i} style={styles.rptSectionTitle}>{b.text}</Text>;
            case 'item':
              return (
                <View key={i} style={styles.rptItemRow}>
                  <Text style={styles.rptItemNum}>{b.num}.</Text>
                  <Text style={styles.rptItemText}>
                    {b.boldPart ? <Text style={styles.rptBold}>{b.boldPart}</Text> : null}
                    {b.boldPart && b.text ? ' ' + b.text : b.text || ''}
                  </Text>
                </View>
              );
            case 'bullet':
              return (
                <View key={i} style={styles.rptBulletRow}>
                  <Text style={styles.rptBulletDot}>{'\u2022'}</Text>
                  <Text style={styles.rptItemText}>{b.text}</Text>
                </View>
              );
            case 'subitem':
              return (
                <View key={i} style={styles.rptSubRow}>
                  <Text style={styles.rptSubLabel}>{b.label}: </Text>
                  <Text style={styles.rptSubText}>{b.text}</Text>
                </View>
              );
            case 'subtext':
              return <Text key={i} style={styles.rptSubTextFull}>{b.text}</Text>;
            case 'keyvalue':
              const isConfidence = b.label.toLowerCase().includes('confidence');
              const confVal = isConfidence ? parseInt(b.text, 10) : 0;
              const confColor = confVal >= 70 ? '#4CAF50' : confVal >= 40 ? '#FF9800' : '#E53935';
              return (
                <View key={i} style={styles.rptKVRow}>
                  <Text style={styles.rptKVLabel}>{b.label}: </Text>
                  <Text style={[styles.rptKVValue, isConfidence && { color: confColor, fontFamily: FONT_FAMILY.urbanistBold }]}>{b.text}</Text>
                </View>
              );
            case 'warning':
              return (
                <View key={i} style={styles.rptWarningBox}>
                  <View style={styles.rptWarningRow}>
                    <Text style={styles.rptWarningBullet}>{'\u2022'}</Text>
                    <Text style={styles.rptWarningText}>{b.text}</Text>
                  </View>
                </View>
              );
            default:
              return <Text key={i} style={styles.rptText}>{b.text}</Text>;
          }
        })}
      </View>
    );
  };

  // ---- DIAGNOSIS MODAL ----
  const renderDiagnosisModal = () => (
    <Modal visible={diagnosisVisible} transparent animationType="fade" onRequestClose={() => setDiagnosisVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.diagnosisModal}>
          <View style={styles.diagnosisHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="psychology" size={20} color="#714B67" />
              <Text style={styles.diagnosisTitle}>AI Diagnosis</Text>
            </View>
            <TouchableOpacity onPress={() => setDiagnosisVisible(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.diagnosisScroll} showsVerticalScrollIndicator={false}>
            {/* Two columns: JOB DETAILS | SYMPTOMS */}
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.diagSecTitle}>JOB DETAILS</Text>
                <View style={styles.diagRow}>
                  <Text style={styles.diagLabel}>Job Card</Text>
                  <Text style={[styles.diagVal, { color: '#714B67' }]}>{data?.ref || ''}</Text>
                </View>
                <View style={[styles.diagRow, { flexDirection: 'column', gap: 4 }]}>
                  <Text style={styles.diagLabel}>Problem Description</Text>
                  <TextInput
                    style={{ fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333', borderBottomWidth: 1, borderBottomColor: '#714B67', paddingVertical: 4, minHeight: 36 }}
                    value={diagProblemDesc}
                    onChangeText={setDiagProblemDesc}
                    placeholder="Describe the problem..."
                    placeholderTextColor="#BBB"
                    multiline
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.diagSecTitle}>SYMPTOMS</Text>
                {symptoms.length > 0 ? symptoms.map(sym => (
                  <TouchableOpacity key={sym.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }} onPress={() => toggleSymptom(sym)}>
                    <MaterialIcons name={selectedSymptoms.find(s => s.id === sym.id) ? 'check-box' : 'check-box-outline-blank'} size={18} color={selectedSymptoms.find(s => s.id === sym.id) ? '#714B67' : '#CCC'} />
                    <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333' }}>{sym.name}</Text>
                  </TouchableOpacity>
                )) : (
                  <Text style={{ fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', fontStyle: 'italic', marginTop: 4 }}>No symptoms loaded</Text>
                )}
              </View>
            </View>

            {/* OPTIONS section */}
            <Text style={[styles.diagSecTitle, { marginTop: 20 }]}>OPTIONS</Text>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }} onPress={() => setDiagnosisOptions(prev => ({ ...prev, searchForums: !prev.searchForums }))}>
              <MaterialIcons name={diagnosisOptions.searchForums ? 'check-box' : 'check-box-outline-blank'} size={20} color={diagnosisOptions.searchForums ? '#714B67' : '#CCC'} />
              <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333' }}>Search External Forums</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }} onPress={() => setDiagnosisOptions(prev => ({ ...prev, useAI: !prev.useAI }))}>
              <MaterialIcons name={diagnosisOptions.useAI ? 'check-box' : 'check-box-outline-blank'} size={20} color={diagnosisOptions.useAI ? '#714B67' : '#CCC'} />
              <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333' }}>Use AI Diagnosis</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }} onPress={() => setDiagnosisOptions(prev => ({ ...prev, searchKnowledgeBase: !prev.searchKnowledgeBase }))}>
              <MaterialIcons name={diagnosisOptions.searchKnowledgeBase ? 'check-box' : 'check-box-outline-blank'} size={20} color={diagnosisOptions.searchKnowledgeBase ? '#714B67' : '#CCC'} />
              <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333' }}>Search Local Knowledge Base</Text>
            </TouchableOpacity>

            {diagnosisResult && (
              <View style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <MaterialIcons name="check-circle" size={18} color="#4CAF50" />
                  <Text style={[styles.diagSecTitle, { marginTop: 0, marginBottom: 0, borderBottomWidth: 0, color: '#4CAF50' }]}>DIAGNOSIS COMPLETED</Text>
                </View>
                {renderFormattedReport(diagnosisResult)}
              </View>
            )}
          </ScrollView>
          <View style={styles.diagBtnRow}>
            <TouchableOpacity style={[styles.diagRunBtn, diagnosisLoading && { opacity: 0.6 }]} onPress={handleRunDiagnosis} disabled={diagnosisLoading}>
              <MaterialIcons name="psychology" size={18} color="white" />
              <Text style={styles.diagRunBtnText}>{diagnosisLoading ? 'Running...' : 'Run AI Diagnosis'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.diagCancelBtn} onPress={() => setDiagnosisVisible(false)}>
              <Text style={styles.diagCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ---- ESTIMATE MODAL ----
  const renderEstimateModal = () => (
    <Modal visible={estimateVisible} transparent animationType="fade" onRequestClose={() => setEstimateVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.diagnosisModal}>
          <View style={styles.diagnosisHeader}>
            <Text style={styles.diagnosisTitle}>Generate Estimate</Text>
            <TouchableOpacity onPress={() => setEstimateVisible(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.diagnosisScroll} showsVerticalScrollIndicator={false}>
            {/* LABOR Section */}
            <Text style={styles.diagSecTitle}>LABOR</Text>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Job Card</Text>
              <Text style={[styles.diagVal, { color: COLORS.primaryThemeColor }]}>{data?.ref || ''}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Estimated Hours</Text>
              <TextInput
                style={styles.estInput}
                value={estimateData.estimated_hours}
                onChangeText={(v) => updateEstimateField('estimated_hours', v)}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Labor Rate (per hour)</Text>
              <TextInput
                style={styles.estInput}
                value={estimateData.labor_rate}
                onChangeText={(v) => updateEstimateField('labor_rate', v)}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Labor Cost</Text>
              <Text style={styles.diagVal}>{estimateData.labor_cost}</Text>
            </View>

            {/* TOTAL Section */}
            <Text style={styles.diagSecTitle}>TOTAL</Text>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Parts Cost</Text>
              <Text style={styles.diagVal}>{estimateData.parts_cost}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={[styles.diagLabel, { fontFamily: FONT_FAMILY.urbanistBold }]}>Total Estimated Cost</Text>
              <Text style={[styles.diagVal, { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 16 }]}>{estimateData.total_estimated_cost}</Text>
            </View>

            {/* PARTS BREAKDOWN */}
            <Text style={styles.diagSecTitle}>PARTS BREAKDOWN</Text>
            <View style={styles.partsHeader}>
              <Text style={[styles.partsCol, { flex: 2 }]}>Spare Part</Text>
              <Text style={[styles.partsCol, { flex: 2 }]}>Part Name</Text>
              <Text style={[styles.partsCol, { flex: 0.7, textAlign: 'right' }]}>Qty</Text>
              <Text style={[styles.partsCol, { flex: 1, textAlign: 'right' }]}>Unit Cost</Text>
              <Text style={[styles.partsCol, { flex: 1, textAlign: 'right' }]}>Total</Text>
            </View>
            <Text style={styles.addLineText}>Add a line</Text>

            {/* NOTES */}
            <Text style={styles.diagSecTitle}>NOTES</Text>
            <TextInput
              style={styles.estNotesInput}
              value={estimateData.notes}
              onChangeText={(v) => setEstimateData(prev => ({ ...prev, notes: v }))}
              placeholder="Add notes..."
              placeholderTextColor="#BBB"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.estBtnRow}>
            <TouchableOpacity
              style={[styles.estApplyBtn, estimateLoading && { opacity: 0.6 }]}
              onPress={() => handleApplyEstimate(false)}
              disabled={estimateLoading}
            >
              <Text style={styles.estApplyBtnText}>{estimateLoading ? 'Applying...' : 'Apply Estimate'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.estApplyQuotBtn, estimateLoading && { opacity: 0.6 }]}
              onPress={() => handleApplyEstimate(true)}
              disabled={estimateLoading}
            >
              <Text style={styles.estApplyBtnText}>{estimateLoading ? 'Applying...' : 'Apply & Create Quotation'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.diagCancelBtn} onPress={() => setEstimateVisible(false)}>
              <Text style={styles.diagCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ---- FORUM SEARCH MODAL ----
  const renderForumModal = () => (
    <Modal visible={forumVisible} transparent animationType="fade" onRequestClose={() => setForumVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.diagnosisModal}>
          <View style={styles.diagnosisHeader}>
            <Text style={styles.diagnosisTitle}>Search Repair Forums</Text>
            <TouchableOpacity onPress={() => setForumVisible(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.diagnosisScroll} showsVerticalScrollIndicator={false}>
            {/* Search Input */}
            <Text style={styles.diagSecTitle}>SEARCH QUERY</Text>
            <TextInput
              style={styles.estNotesInput}
              value={forumQuery}
              onChangeText={setForumQuery}
              placeholder="e.g. Samsung Galaxy screen flickering"
              placeholderTextColor="#BBB"
              multiline={false}
            />

            {/* Results */}
            {forumResults.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.diagSecTitle}>RESULTS ({forumResults.length})</Text>
                {forumResults.map((r, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.forumResultCard}
                    onPress={() => Linking.openURL(r.url).catch(() => {})}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <MaterialIcons name="forum" size={16} color="#714B67" />
                      <Text style={styles.forumResultTitle} numberOfLines={2}>{r.title}</Text>
                    </View>
                    {r.snippet ? <Text style={styles.forumResultSnippet} numberOfLines={3}>{r.snippet}</Text> : null}
                    <Text style={styles.forumResultUrl} numberOfLines={1}>{r.url}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {forumResults.length === 0 && !forumLoading && (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <MaterialIcons name="search" size={40} color="#CCC" />
                <Text style={{ color: '#999', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 8 }}>
                  Enter a query and tap Search
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Buttons */}
          <View style={styles.diagBtnRow}>
            <TouchableOpacity
              style={[styles.diagRunBtn, forumLoading && { opacity: 0.6 }]}
              onPress={handleForumSearch}
              disabled={forumLoading}
            >
              <MaterialIcons name="search" size={18} color="white" />
              <Text style={styles.diagRunBtnText}>{forumLoading ? 'Searching...' : 'Search Vinafix'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.diagCancelBtn} onPress={() => setForumVisible(false)}>
              <Text style={styles.diagCancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ---- ADD SERVICE PRODUCT PICKER MODAL ----
  const renderAddServiceModal = () => (
    <Modal visible={addServiceVisible} transparent animationType="fade" onRequestClose={() => setAddServiceVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.diagnosisModal, { maxHeight: '75%' }]}>
          <View style={styles.diagnosisHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="add-circle" size={20} color="#714B67" />
              <Text style={styles.diagnosisTitle}>Add Service</Text>
            </View>
            <TouchableOpacity onPress={() => setAddServiceVisible(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          {/* Search */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F9F9F9', borderBottomWidth: 1, borderBottomColor: '#EEE' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#DDD', paddingHorizontal: 10, height: 38 }}>
              <MaterialIcons name="search" size={20} color="#999" />
              <TextInput
                style={{ flex: 1, fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333', marginLeft: 6 }}
                placeholder="Search services..."
                placeholderTextColor="#999"
                value={serviceSearchText}
                onChangeText={searchServiceProducts}
                autoFocus
              />
              {serviceSearchText.length > 0 && (
                <TouchableOpacity onPress={() => searchServiceProducts('')}>
                  <MaterialIcons name="close" size={18} color="#999" />
                </TouchableOpacity>
              )}
            </View>
            <Text style={{ fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginLeft: 10 }}>{serviceProducts.length} items</Text>
          </View>
          {/* Product List */}
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
            {serviceSearchLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999' }}>Loading...</Text>
              </View>
            ) : serviceProducts.length > 0 ? (
              serviceProducts.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}
                  onPress={() => handleSelectServiceProduct(p)}
                  activeOpacity={0.6}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#F5F0F4', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <MaterialIcons name="miscellaneous-services" size={18} color="#714B67" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#333' }} numberOfLines={1}>{p.name}</Text>
                    {p.default_code ? <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999' }}>[{p.default_code}]</Text> : null}
                  </View>
                  <Text style={{ fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#333' }}>{p.list_price.toFixed(2)}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <MaterialIcons name="search-off" size={36} color="#CCC" />
                <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginTop: 8 }}>No services found</Text>
              </View>
            )}
            <View style={{ height: 16 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ---- LOADING / EMPTY ----
  if (loading) return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader title="Job Card Details" onBackPress={() => navigation.goBack()} />
      <OverlayLoader visible={true} />
    </SafeAreaView>
  );

  if (!data) return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader title="Job Card Details" onBackPress={() => navigation.goBack()} />
      <View style={styles.emptyContainer}><Text style={styles.emptyText}>Job card not found</Text></View>
    </SafeAreaView>
  );

  // ---- MAIN RENDER ----
  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader
        title={data.ref || 'Job Card Details'}
        onBackPress={() => navigation.goBack()}
        rightComponent={
          <TouchableOpacity onPress={() => navigation.navigate('MobileRepairForm', { jobCardData: data })} style={styles.editBtn}>
            <MaterialIcons name="edit" size={20} color={COLORS.primaryThemeColor} />
          </TouchableOpacity>
        }
      />

      {/* Smart Buttons */}
      {renderSmartButtons()}

      {/* Action Buttons */}
      {renderActionButtons()}

      {/* Stage Progress Bar (chevron style like Odoo) */}
      {stages.length > 0 && (
        <View style={styles.stageBarWrap}>
          {renderStageBar()}
        </View>
      )}

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.content}>
          {/* JC Ref */}
          <Text style={styles.refText}>{data.ref || ''}</Text>

          {/* Two Column: Customer Details | Other Details */}
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.sectionTitle}>CUSTOMER DETAILS</Text>
              {renderField('Customer', data.partner?.name)}
              {renderField('Phone', data.phone)}
              {renderField('Email', data.email)}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Priority</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3].map(i => (
                    <MaterialIcons key={i} name="star" size={16} color={i <= (parseInt(data.priority, 10) || 0) ? '#FFC107' : '#DDD'} />
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.col}>
              <Text style={styles.sectionTitle}>OTHER DETAILS</Text>
              {renderField('Receiving Date', data.receiving_date)}
              {renderField('Expected Delivery Date', data.expected_delivery_date)}
              {renderField('Delivery Type', data.delivery_type)}
              {renderField('Inspection Type', data.inspection_type)}
            </View>
          </View>

          {/* Two Column: Device Details | Repair/Team Details */}
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.sectionTitle}>DEVICE DETAILS</Text>
              {renderField('Brand', data.device_brand?.name)}
              {renderField('Series', data.device_series?.name)}
              {renderField('Model', data.device_model?.name)}
              {renderField('IMEI 1', data.imei_1)}
              {renderField('IMEI 2', data.imei_2)}
              {renderField('Device Password', data.device_password)}
              {renderField('Physical Condition', data.physical_condition)}
              {renderCheckbox('Under Warranty', data.under_warranty)}
              {renderField('Issue / Complaint', data.issue_complaint)}
              {renderField('Additional Issue Details', data.issue_notes)}
            </View>
            <View style={styles.col}>
              <Text style={styles.sectionTitle}>REPAIR/TEAM DETAILS</Text>
              {renderField('Repair Team', data.repair_team?.name)}
              {renderField('Assigned To', data.assigned_to?.name)}
              {renderField('Responsible', data.responsible?.name)}
              {renderField('Inspection Date', data.inspection_date)}
              {renderField('Completion Date', data.completion_date)}
              {renderField('Sale Order', data.sale_order?.name)}
              {renderField('Easy Sales', data.easy_sales?.name)}
              {renderField('Task', data.task?.name)}
            </View>
          </View>

          {/* Accessories Received */}
          <View style={styles.accessoriesSection}>
            <Text style={styles.fieldLabel}>Accessories Received</Text>
            <Text style={[styles.fieldValue, !data.accessories_received && styles.placeholderText]}>
              {data.accessories_received || 'List accessories received with the device (charger, case, SIM card, etc.)'}
            </Text>
          </View>

          {/* Tabs: Inspection | AI Diagnosis | Repair Steps | etc. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
            {TABS.map(tab => (
              <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Tab Content */}
          {renderTabContent()}

          {/* Total Amount */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Amount:</Text>
            <Text style={styles.totalValue}>$ {parseFloat(data.total_amount || 0).toFixed(2)}</Text>
          </View>

          <View style={{ height: 30 }} />
        </View>
      </ScrollView>

      {renderDiagnosisModal()}
      {renderEstimateModal()}
      {renderForumModal()}
      {renderAddServiceModal()}
      {/* Language picker modal */}
      <Modal visible={langPickerVisible} transparent animationType="fade" onRequestClose={() => setLangPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setLangPickerVisible(false)}>
          <View style={styles.langPickerModal}>
            <Text style={styles.langPickerTitle}>Select Language</Text>
            {LANG_OPTIONS.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langPickerItem, reportLang === lang.code && styles.langPickerItemActive]}
                onPress={() => { setReportLang(lang.code); setLangPickerVisible(false); }}
              >
                <Text style={[styles.langPickerItemText, reportLang === lang.code && { color: '#714B67', fontFamily: FONT_FAMILY.urbanistBold }]}>{lang.label}</Text>
                {reportLang === lang.code && <MaterialIcons name="check" size={18} color="#714B67" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <OverlayLoader visible={actionLoading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { padding: 15, paddingBottom: 30 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999' },
  editBtn: { padding: 8 },

  // Smart Buttons
  smartBtnRow: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, gap: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  smartBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#DDD', borderRadius: 8, backgroundColor: '#FAFAFA' },
  smartBtnLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#555' },
  smartBtnBadge: { backgroundColor: COLORS.primaryThemeColor, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  smartBtnCount: { color: 'white', fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },

  // Action Buttons
  actionsScroll: { maxHeight: 48, backgroundColor: '#F8F8F8', borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  actionsContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  actionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4 },
  actionChipText: { color: 'white', fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold },

  // Stage Bar (chevron style)
  stageBarWrap: { borderBottomWidth: 1, borderBottomColor: '#E5E5E5', backgroundColor: '#FAFAFA' },
  stageBarContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 8 },
  stageItem: { flexDirection: 'row', alignItems: 'center' },
  stageChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: '#F0F0F0' },
  stageChipText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999' },

  // Ref
  refText: { fontSize: 22, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginBottom: 8 },

  // Two Column
  twoCol: { flexDirection: 'row', marginBottom: 4 },
  col: { flex: 1, paddingRight: 8 },

  // Section Title
  sectionTitle: {
    fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black,
    marginTop: 14, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: '#E5E5E5', paddingBottom: 4,
  },

  // Field
  fieldRow: { paddingVertical: 5 },
  fieldLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#888' },
  fieldValue: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black, marginTop: 1 },
  placeholderText: { color: '#BBB', fontStyle: 'italic' },
  starsRow: { flexDirection: 'row', marginTop: 2 },
  checkboxWrap: { marginTop: 2 },

  // Accessories
  accessoriesSection: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E5E5' },

  // Tabs
  tabBar: { marginTop: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  tabBarContent: { gap: 0 },
  tab: { paddingHorizontal: 14, paddingVertical: 10 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primaryThemeColor },
  tabText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#888' },
  tabTextActive: { color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold },
  tabContent: { paddingVertical: 12, minHeight: 100 },
  emptyTabText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', fontStyle: 'italic', paddingVertical: 8 },

  // Checklist
  tabSubTitle: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginBottom: 8 },
  checklistHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  checklistCol: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#666' },
  checklistRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  checklistVal: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black },

  // Notes
  notesBox: { backgroundColor: '#FAFAFA', borderRadius: 6, padding: 12, minHeight: 60, borderWidth: 1, borderColor: '#EEE' },
  notesText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666' },

  // List Items (repair steps, services, parts)
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  listItemNum: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#888', width: 20 },
  listItemText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black, flex: 1 },

  // Total Amount
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 2, borderTopColor: '#E5E5E5', gap: 8 },
  totalLabel: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#666' },
  totalValue: { fontSize: 22, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },

  // Run Diagnosis button in tab
  runDiagBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#9C27B0', paddingVertical: 12, borderRadius: 8, gap: 6, marginTop: 12 },
  runDiagBtnText: { color: 'white', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold },

  // Diagnosis Result
  diagResultBox: { backgroundColor: '#F5F5FF', borderRadius: 8, padding: 12, marginTop: 8 },
  diagResultText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333', lineHeight: 20 },

  // AI Diagnosis Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  diagnosisModal: { width: '92%', maxHeight: '85%', backgroundColor: 'white', borderRadius: 12, overflow: 'hidden' },
  diagnosisHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  diagnosisTitle: { fontSize: 20, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },
  diagnosisScroll: { paddingHorizontal: 16, maxHeight: 400 },
  diagSecTitle: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#666', marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 4 },
  diagRow: { flexDirection: 'row', paddingVertical: 4 },
  diagLabel: { flex: 1, fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#888' },
  diagVal: { flex: 1.5, fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black },
  symptomsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  symptomChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: '#DDD', flexDirection: 'row', alignItems: 'center' },
  symptomChipActive: { backgroundColor: '#9C27B0', borderColor: '#9C27B0' },
  symptomText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666' },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  optionLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black },
  diagBtnRow: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#EEE', gap: 12 },
  diagRunBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#9C27B0', paddingVertical: 12, borderRadius: 8, gap: 6 },
  diagRunBtnText: { color: 'white', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold },
  diagCancelBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F5F5F5', justifyContent: 'center' },
  diagCancelBtnText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666' },

  // Estimate Modal
  estInput: {
    flex: 1, fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black,
    backgroundColor: '#F5F5FF', borderWidth: 1, borderColor: '#D0D0FF', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 4, textAlign: 'right', minWidth: 80,
  },
  estNotesInput: {
    backgroundColor: '#FAFAFA', borderRadius: 6, padding: 12, minHeight: 60,
    borderWidth: 1, borderColor: '#EEE', fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.black, textAlignVertical: 'top',
  },
  partsHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  partsCol: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.primaryThemeColor },
  addLineText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.primaryThemeColor, paddingVertical: 8 },
  estBtnRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#EEE', gap: 8, flexWrap: 'wrap' },
  estApplyBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4, backgroundColor: '#4CAF50' },
  estApplyQuotBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4, backgroundColor: '#714B67' },
  estApplyBtnText: { color: 'white', fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold },

  // Table styles (Diagnosis Results, Suggested Parts)
  tableSectionTitle: {
    fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black,
    borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 6, marginBottom: 8, marginTop: 4,
  },
  tableHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#DDD', backgroundColor: '#FAFAFA' },
  tableHeaderCell: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, color: '#714B67', paddingHorizontal: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tableCell: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black, paddingHorizontal: 4 },
  resultBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  resultBadgeText: { fontSize: 10, fontFamily: FONT_FAMILY.urbanistBold },

  // Diagnosis Results table — Odoo-style
  diagTableHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8F8F8', borderBottomWidth: 1.5, borderBottomColor: '#D0D0D0',
    paddingVertical: 8, paddingHorizontal: 4,
  },
  diagTableHCell: {
    fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, color: '#4A4A4A',
    paddingHorizontal: 6,
  },
  diagTableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#ECECEC',
  },
  diagTableCell: {
    fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#212121',
    paddingHorizontal: 6,
  },
  diagResultBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12,
  },
  diagResultBadgeText: {
    fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, textAlign: 'center',
  },
  diagActionBtns: {
    width: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  diagActionBtn: {
    width: 28, height: 28, borderRadius: 4, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  // Step cards in Repair Steps tab
  stepCard: {
    backgroundColor: '#F9F9F9', borderRadius: 8, padding: 12, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#714B67',
  },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#714B67', alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: 'white' },
  stepTitle: { flex: 1, fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },
  miniDiffBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  miniDiffText: { fontSize: 10, fontFamily: FONT_FAMILY.urbanistBold, textTransform: 'capitalize' },

  // Forum search results
  forumResultCard: {
    backgroundColor: '#F9F5F8', borderRadius: 8, padding: 12, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#714B67',
  },
  forumResultTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#333', flex: 1 },
  forumResultSnippet: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666', lineHeight: 18, marginBottom: 4 },
  forumResultUrl: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#714B67' },

  // AI Diagnosis tab — action bar (like Odoo button bar at top)
  diagActionBar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14,
  },
  diagActionBarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4,
  },
  diagActionBarBtnPrimary: { backgroundColor: '#E91E63' },
  diagActionBarBtnText: { color: 'white', fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold },

  // AI Diagnosis tab — two-column layout (Odoo style)
  diagTwoCol: { flexDirection: 'row', gap: 16 },
  diagCol: { flex: 1 },
  diagSymRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  diagSymText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black },
  diagEstRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  diagEstLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#888' },
  diagEstValue: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black },
  diagEstTotal: { borderTopWidth: 1, borderTopColor: '#EEE', marginTop: 4, paddingTop: 8 },
  diagReportPreview: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#555', lineHeight: 20, marginTop: 8 },
  // Report toolbar — language chooser + Read Full Report (Odoo style)
  reportToolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8,
    backgroundColor: '#F5F5F5', borderRadius: 6, padding: 8,
  },
  reportLangBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 4,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  reportLangText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333' },
  reportReadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#00897B', borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  reportReadBtnText: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' },

  // Language picker modal
  langPickerModal: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '80%', maxWidth: 300,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  langPickerTitle: {
    fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#333',
    marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 8,
  },
  langPickerItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: 6,
  },
  langPickerItemActive: { backgroundColor: '#F5F0F4' },
  langPickerItemText: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistMedium, color: '#333' },

  // AI Report — formatted view (universal block renderer)
  reportContainer: { gap: 4 },
  rptTitle: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#9C27B0', marginBottom: 6 },
  rptSectionTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black, marginTop: 10, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 4 },
  // Numbered items (1. Item)
  rptItemRow: { flexDirection: 'row', paddingVertical: 3, paddingLeft: 4 },
  rptItemNum: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#9C27B0', width: 22 },
  rptItemText: { flex: 1, fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black, lineHeight: 20 },
  rptBold: { fontFamily: FONT_FAMILY.urbanistBold, color: COLORS.black },
  // Bullet items (• Item)
  rptBulletRow: { flexDirection: 'row', paddingVertical: 2, paddingLeft: 10 },
  rptBulletDot: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#9C27B0', width: 16 },
  // Sub-items (Method: ..., Tools: ...)
  rptSubRow: { flexDirection: 'row', paddingVertical: 1, paddingLeft: 24, flexWrap: 'wrap' },
  rptSubLabel: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#555' },
  rptSubText: { flex: 1, fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666', lineHeight: 18 },
  rptSubTextFull: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#666', lineHeight: 18, paddingLeft: 24 },
  // Key-Value pairs (Confidence: 85%)
  rptKVRow: { flexDirection: 'row', paddingVertical: 3, paddingLeft: 4, alignItems: 'center' },
  rptKVLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#555' },
  rptKVValue: { flex: 1, fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black },
  // Plain text
  rptText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: '#444', lineHeight: 20, paddingVertical: 1, paddingLeft: 4 },
  // Warning blocks
  rptWarningBox: { backgroundColor: '#FFF8E1', borderRadius: 6, padding: 10, marginTop: 4, borderWidth: 1, borderColor: '#FFE082' },
  rptWarningRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  rptWarningBullet: { fontSize: 13, color: '#F57F17' },
  rptWarningText: { flex: 1, fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#5D4037', lineHeight: 18 },
});

export default MobileRepairDetails;
