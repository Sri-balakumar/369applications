import { Keyboard, View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import { NavigationHeader } from '@components/Header'
import { RoundedScrollContainer, SafeAreaView } from '@components/containers'
import { TextInput as FormInput } from '@components/common/TextInput'
import { formatDate } from '@utils/common/date'
import { LoadingButton } from '@components/common/Button'
import { DropdownSheet } from '@components/common/BottomSheets'
import { ActionModal } from '@components/Modal'
import * as Location from 'expo-location'
import * as FileSystem from 'expo-file-system'
import { Audio } from 'expo-av'
import MapView, { Marker } from 'react-native-maps'
import { showToast } from '@utils/common'
import { OverlayLoader } from '@components/Loader'
import { validateFields } from '@utils/validation'
import { COLORS, FONT_FAMILY } from '@constants/theme'
import { MaterialIcons } from '@expo/vector-icons'
import {
  fetchCustomersOdoo,
  fetchEmployeesOdoo,
  fetchVisitPurposesOdoo,
  fetchVisitPlanDetailsOdoo,
  createCustomerVisitOdoo,
} from '@api/services/generalApi'
import { useAuthStore } from '@stores/auth'

const PROXIMITY_LIMIT = 100;

const DURATION_OPTIONS = [
  { id: '0_15', label: '0 to 15 minutes' },
  { id: '15_30', label: '15 minutes to 30' },
  { id: '30_60', label: '30 minutes to 60' },
  { id: '60_plus', label: 'More than 60 minutes' },
];

const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const VisitForm = ({ navigation, route }) => {

  const { visitPlanId = "", pipelineId = "" } = route?.params || {};
  const currentUser = useAuthStore((state) => state.user);
  const [selectedType, setSelectedType] = useState(null);
  const [errors, setErrors] = useState({});
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [customersList, setCustomersList] = useState([]);
  const [distance, setDistance] = useState(null);
  const [imageUris, setImageUris] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceUri, setVoiceUri] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef(null);
  const timerRef = useRef(null);

  const [formData, setFormData] = useState({
    customer: '',
    visitedBy: '',
    dateAndTime: new Date(),
    visitPurpose: '',
    visitDuration: '',
    remarks: '',
    longitude: null,
    latitude: null
  })

  const [dropdowns, setDropdowns] = useState({ customers: [], employees: [], visitPurpose: [] })

  const customerHasLocation = () => {
    if (!formData.customer?.id || !customersList.length) return false;
    const cust = customersList.find(c => c.id === formData.customer.id);
    return cust && cust.latitude && cust.longitude;
  };

  useEffect(() => {
    if (!formData.customer?.id || !formData.latitude || !formData.longitude || !customersList.length) {
      setDistance(null);
      return;
    }
    const cust = customersList.find(c => c.id === formData.customer.id);
    if (cust && cust.latitude && cust.longitude) {
      const dist = getDistanceInMeters(
        formData.latitude, formData.longitude,
        cust.latitude, cust.longitude
      );
      setDistance(Math.round(dist));
    } else {
      setDistance(null);
    }
  }, [formData.customer, formData.latitude, formData.longitude, customersList]);

  const isWithinProximity = distance !== null && distance <= PROXIMITY_LIMIT;
  const isProximityCheckRequired = customerHasLocation();

  const loadVisitPlan = async () => {
    if (!visitPlanId) return;
    setIsLoading(true);
    try {
      const detail = await fetchVisitPlanDetailsOdoo(visitPlanId);
      if (detail) {
        setFormData(prev => ({
          ...prev,
          customer: detail.customer ? { id: detail.customer.id, label: detail.customer.name } : '',
          visitedBy: detail.employee ? { id: detail.employee.id, label: detail.employee.name } : '',
          dateAndTime: detail.visit_date ? new Date(detail.visit_date) : new Date(),
          visitPurpose: detail.purpose ? { id: detail.purpose.id, label: detail.purpose.name } : '',
          remarks: detail.remarks || '',
        }));
      }
    } catch (error) {
      console.error('Error fetching visit plan details:', error);
      showToast({ type: 'error', title: 'Error', message: 'Failed to fetch visit plan details.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visitPlanId) loadVisitPlan();
  }, [visitPlanId])

  const fetchLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'error', title: 'Permission Denied', message: 'Location permission is required' });
        return;
      }
      let location = await Location.getCurrentPositionAsync({});
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;

      // Reverse geocode to get location name
      let locationName = '';
      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (reverseGeocode && reverseGeocode.length > 0) {
          const place = reverseGeocode[0];
          const parts = [place.name, place.street, place.city, place.region, place.country].filter(Boolean);
          locationName = parts.join(', ');
        }
      } catch (geoError) {
        console.error('Reverse geocode error:', geoError);
      }

      setFormData(prev => ({
        ...prev,
        longitude: lng,
        latitude: lat,
        locationName,
      }));
    } catch (error) {
      console.error('Error fetching location:', error);
    }
  };

  useEffect(() => { fetchLocation(); }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customers, employees, purposes] = await Promise.all([
          fetchCustomersOdoo(),
          fetchEmployeesOdoo(),
          fetchVisitPurposesOdoo(),
        ]);
        setCustomersList(customers);
        setDropdowns({
          customers: customers.map(c => ({ id: c.id, label: c.name })),
          employees: employees.map(e => ({ id: e.id, label: e.name })),
          visitPurpose: purposes.map(p => ({ id: p.id, label: p.name })),
        });
        if (!formData.visitedBy) {
          const userName = currentUser?.related_profile?.name || currentUser?.name || '';
          const match = employees.find(e => e.name?.toLowerCase() === userName?.toLowerCase());
          if (match) {
            setFormData(prev => ({ ...prev, visitedBy: { id: match.id, label: match.name } }));
          }
        }
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };
    fetchData();
  }, []);

  // Voice recording functions
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'error', title: 'Permission Denied', message: 'Microphone permission is required' });
        return;
      }
      // Clean up any existing recording
      if (recordingRef.current) {
        try { await recordingRef.current.stopAndUnloadAsync(); } catch (e) {}
        recordingRef.current = null;
      }
      // Force clear any stale native recorder (expo-av bug: cleanup not awaited)
      try {
        const tempRec = new Audio.Recording();
        tempRec._canRecord = true;
        tempRec._isDoneRecording = false;
        await tempRec.stopAndUnloadAsync();
      } catch (e) {}
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      showToast({ type: 'error', title: 'Error', message: error?.message || 'Failed to start recording' });
    }
  };

  const stopRecording = async () => {
    try {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setIsRecording(false);
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        setVoiceUri(uri);
        recordingRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const fileToBase64 = async (uri) => {
    try {
      return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    } catch (error) {
      console.error('Error converting file to base64:', error);
      return null;
    }
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prevErrors) => ({ ...prevErrors, [field]: null }));
  };

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';
    switch (selectedType) {
      case 'Customers': items = dropdowns.customers; fieldName = 'customer'; break;
      case 'Visited By': items = dropdowns.employees; fieldName = 'visitedBy'; break;
      case 'Visit Purpose': items = dropdowns.visitPurpose; fieldName = 'visitPurpose'; break;
      case 'Visit Duration': items = DURATION_OPTIONS; fieldName = 'visitDuration'; break;
      default: return null;
    }
    return (
      <DropdownSheet
        isVisible={isVisible}
        items={items}
        title={selectedType}
        onClose={() => setIsVisible(false)}
        onValueChange={(value) => handleFieldChange(fieldName, value)}
      />
    );
  };

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const submit = async () => {
    if (isProximityCheckRequired && !isWithinProximity) {
      showToast({
        type: 'error', title: 'Too Far',
        message: `You are ${distance}m away. You must be within ${PROXIMITY_LIMIT}m of the customer location.`,
      });
      return;
    }
    const fieldsToValidate = ['customer', 'dateAndTime', 'remarks', 'visitPurpose'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      try {
        const payload = {
          customerId: formData.customer?.id,
          employeeId: formData.visitedBy?.id || false,
          dateTime: formData.dateAndTime ? formatDate(formData.dateAndTime, 'yyyy-MM-dd HH:mm:ss') : null,
          purposeId: formData.visitPurpose?.id || false,
          visitDuration: formData.visitDuration?.id || false,
          remarks: formData.remarks || '',
          longitude: formData.longitude || 0,
          latitude: formData.latitude || 0,
          locationName: formData.locationName || '',
          visitPlanId: visitPlanId ? parseInt(visitPlanId) : false,
        };
        if (imageUris.length > 0) {
          const images = [];
          for (let i = 0; i < imageUris.length; i++) {
            const base64 = await fileToBase64(imageUris[i]);
            if (base64) images.push({ base64, filename: `visit_image_${i + 1}.jpg` });
          }
          if (images.length > 0) payload.images = images;
        }
        if (voiceUri) {
          const voiceBase64 = await fileToBase64(voiceUri);
          if (voiceBase64) { payload.voiceBase64 = voiceBase64; payload.voiceFilename = 'voice_note.m4a'; }
        }
        await createCustomerVisitOdoo(payload);
        showToast({ type: "success", title: "Success", message: "Customer Visit created successfully" });
        navigation.goBack();
      } catch (error) {
        console.error("Error creating Customer Visit:", error);
        showToast({ type: "error", title: "ERROR", message: error?.data?.message || error?.message || "Customer Visit creation failed" });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const getProximityStatus = () => {
    if (!formData.customer?.id) return { text: 'Select a customer to check proximity', color: '#666' };
    if (!isProximityCheckRequired) return { text: 'Customer location not set in Odoo', color: '#FF9800' };
    if (!formData.latitude || !formData.longitude) return { text: 'Fetching your location...', color: '#666' };
    if (isWithinProximity) return { text: `You are ${distance}m away - Within range`, color: '#1B8A2A' };
    return { text: `You are ${distance}m away - Too far (max ${PROXIMITY_LIMIT}m)`, color: '#D32F2F' };
  };

  const proximityStatus = getProximityStatus();

  const selectedCustomer = isProximityCheckRequired && formData.customer?.id
    ? customersList.find(c => c.id === formData.customer.id)
    : null;

  return (
    <SafeAreaView>
      <NavigationHeader title="New Customer Visit" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        {/* Map */}
        <View style={styles.mapContainer}>
          {formData.latitude && formData.longitude ? (
            <MapView
              style={styles.map}
              region={{ latitude: formData.latitude, longitude: formData.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }}
            >
              <Marker coordinate={{ latitude: formData.latitude, longitude: formData.longitude }} title="Your Location" pinColor="blue" />
              {selectedCustomer && selectedCustomer.latitude && selectedCustomer.longitude && (
                <Marker coordinate={{ latitude: selectedCustomer.latitude, longitude: selectedCustomer.longitude }} title={formData.customer.label} pinColor="red" />
              )}
            </MapView>
          ) : (
            <View style={styles.mapPlaceholder}><Text style={styles.mapPlaceholderText}>Loading map...</Text></View>
          )}
        </View>

        {/* Proximity */}
        <View style={styles.proximityRow}>
          <Text style={[styles.proximityText, { color: proximityStatus.color }]}>{proximityStatus.text}</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={fetchLocation}>
            <Text style={styles.refreshButtonText}>REFRESH</Text>
          </TouchableOpacity>
        </View>

        <FormInput label="Customer Name" placeholder="Select customer" dropIcon="menu-down" editable={false} multiline required value={formData.customer?.label} validate={errors.customer} onPress={() => toggleBottomSheet('Customers')} />
        <FormInput label="Visited By" placeholder="Select employee" dropIcon="menu-down" editable={false} value={formData.visitedBy?.label} onPress={() => toggleBottomSheet('Visited By')} />
        <FormInput required label="Date and time" dropIcon="calendar" editable={false} value={formatDate(formData.dateAndTime, 'dd-MM-yyyy HH:mm:ss')} />
        <FormInput label="Visit Purpose" placeholder="Select purpose of visit" dropIcon="menu-down" editable={false} required value={formData.visitPurpose?.label} validate={errors.visitPurpose} onPress={() => toggleBottomSheet('Visit Purpose')} />
        <FormInput label="Visit Duration (mins)" placeholder="Select duration" dropIcon="menu-down" editable={false} value={formData.visitDuration?.label} onPress={() => toggleBottomSheet('Visit Duration')} />
        <FormInput label="Remarks" placeholder="Enter Remarks" multiline textAlignVertical="top" numberOfLines={5} required value={formData.remarks} validate={errors.remarks} onChangeText={(value) => handleFieldChange('remarks', value)} />
        <Text style={styles.minCharsText}>Min 25 characters required</Text>

        {/* Images */}
        <ActionModal title="Attach Images" setImageUrl={(uri) => setImageUris(prev => [...prev, uri])} />
        {imageUris.length > 0 && (
          <View style={styles.imagesRow}>
            {imageUris.map((uri, index) => (
              <View key={index} style={styles.imagePreviewContainer}>
                <Image source={{ uri }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.removeButton} onPress={() => setImageUris(prev => prev.filter((_, i) => i !== index))}>
                  <MaterialIcons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Voice */}
        <Text style={styles.fieldLabel}>Voice Note</Text>
        <View style={styles.voiceContainer}>
          {!isRecording && !voiceUri && (
            <TouchableOpacity style={styles.voiceButton} onPress={startRecording}>
              <MaterialIcons name="mic" size={28} color="#fff" />
              <Text style={styles.voiceButtonText}>Tap to Record</Text>
            </TouchableOpacity>
          )}
          {isRecording && (
            <TouchableOpacity style={[styles.voiceButton, { backgroundColor: '#D32F2F' }]} onPress={stopRecording}>
              <MaterialIcons name="stop" size={28} color="#fff" />
              <Text style={styles.voiceButtonText}>Recording {formatDuration(recordingDuration)} - Tap to Stop</Text>
            </TouchableOpacity>
          )}
          {!isRecording && voiceUri && (
            <View style={styles.voiceRecordedRow}>
              <MaterialIcons name="check-circle" size={24} color="#1B8A2A" />
              <Text style={styles.voiceRecordedText}>Voice note recorded ({formatDuration(recordingDuration)})</Text>
              <TouchableOpacity onPress={() => { setVoiceUri(null); setRecordingDuration(0); }}>
                <MaterialIcons name="delete" size={24} color="#D32F2F" />
              </TouchableOpacity>
              <TouchableOpacity style={{ marginLeft: 10 }} onPress={startRecording}>
                <MaterialIcons name="replay" size={24} color={COLORS.orange} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {renderBottomSheet()}
        <LoadingButton title='SAVE' onPress={submit} loading={isSubmitting} />
      </RoundedScrollContainer>
      <OverlayLoader visible={isLoading} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  mapContainer: { height: 200, borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e0e0e0' },
  mapPlaceholderText: { color: '#666', fontSize: 14 },
  proximityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15, paddingHorizontal: 5 },
  proximityText: { flex: 1, fontSize: 14, fontWeight: 'bold', marginRight: 10 },
  refreshButton: { backgroundColor: '#1B8A2A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 6 },
  refreshButtonText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  minCharsText: { fontSize: 12, color: '#999', marginTop: -5, marginBottom: 10, textAlign: 'right' },
  fieldLabel: { marginVertical: 5, fontSize: 16, color: '#2e2a4f', fontFamily: FONT_FAMILY.urbanistSemiBold },
  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  imagePreviewContainer: { position: 'relative' },
  imagePreview: { width: 90, height: 90, borderRadius: 8 },
  removeButton: { position: 'absolute', top: -8, right: -8, backgroundColor: '#D32F2F', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  voiceContainer: { marginBottom: 20 },
  voiceButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.orange, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 8, alignSelf: 'flex-start' },
  voiceButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginLeft: 8 },
  voiceRecordedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  voiceRecordedText: { flex: 1, marginLeft: 8, fontSize: 14, color: '#333' },
});

export default VisitForm
