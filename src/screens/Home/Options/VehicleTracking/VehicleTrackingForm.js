import React, { useState, useEffect, useCallback } from 'react';
import { fetchSourcesOdoo, fetchVehicleTrackingTripsOdoo } from '@api/services/generalApi';
import { fetchVehicleDetailsOdoo } from '@api/services/vehicleDetailsApi';
import { fetchPurposeOfVisitDropdown } from '@api/services/purposeOfVisitApi';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { View, ScrollView, StyleSheet, Pressable, Alert, Modal, FlatList, TouchableOpacity, Image } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { CheckBox } from '@components/common/CheckBox';
import { LoadingButton } from '@components/common/Button';
// Replaced external DropdownSheet with an in-file Modal dropdown
import Text from '@components/Text';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { formatDate, formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchVehiclesOdoo, fetchVehiclesVehicleTracking } from '@api/services/generalApi';
import { fetchVehicleDetails, fetchLocations } from '@api/details/detailApi';
import { post } from '@api/services/utils';
import { createVehicleTrackingTripOdoo } from '@api/services/generalApi';
import axios from 'axios';
import { VEHICLE_TRACKING_URL } from '@api/endpoints/endpoints';
import { OverlayLoader } from '@components/Loader';
import { cancelVehicleTrackingTripOdoo, fetchInvoiceByIdOdoo } from '@api/services/generalApi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
// validation will be handled inline in this file to avoid stale state issues
// These Odoo `vehicle.tracking` fields are mapped in this form: amount, battery_checking, company_id, completion_status, coolant_water, create_date, create_uid, daily_checks, date, destination, display_name, driver_id, duration, end_fuel_checking, end_fuel_document, end_fuel_document_filename, end_fuel_status, end_km, end_latitude, end_longitude, end_time, end_trip, estimated_time, fuel_checking, fuel_status, id, image_url, invoice_line_ids, invoice_match, invoice_message, invoice_number, km_travelled, number_plate, oil_checking, purpose_of_visit, ref, remarks, source, start_km, start_latitude


const VehicleTrackingForm = ({ navigation, route }) => {
  console.log('VehicleTrackingForm loaded');

  // Date formatting for Odoo
  const pad = (n) => n < 10 ? '0' + n : n;
  const formatDateOdoo = (dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Toggle Add Fuel card and capture GPS when opening
  const handleToggleAddFuel = async () => {
    const opening = !showAddFuel;
    if (opening) {
      try {
        showToastMessage('Capturing fuel GPS...', 'info');
        const loc = await getCurrentLocation('Add Fuel');
        console.log('[VehicleTrackingForm] Add Fuel GPS captured:', loc);
        setFormData(prev => ({
          ...prev,
          start_latitude: String(loc.latitude),
          start_longitude: String(loc.longitude),
          startLatitude: loc.latitude,
          startLongitude: loc.longitude,
        }));
        showToastMessage('Fuel location captured', 'success');
      } catch (e) {
        console.error('Failed to capture Add Fuel GPS:', e);
        showToastMessage('Failed to capture GPS', 'error');
      }
    }
    setShowAddFuel(opening);
  };
  const formatDateTimeOdoo = (dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    // Convert to UTC and format as YYYY-MM-DD HH:mm:ss
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };
  const [currentCoords, setCurrentCoords] = useState(null);
  const [currentLocationName, setCurrentLocationName] = useState('');
  const [showAddFuel, setShowAddFuel] = useState(false);
  useEffect(() => {
    const fetchCurrentLocation = async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Permission to access location was denied');
          return;
        }
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setCurrentCoords({ latitude: location.coords.latitude, longitude: location.coords.longitude });
        console.log('Current GPS location:', location.coords.latitude, location.coords.longitude);

        // Reverse geocode to get location name
        try {
          const reverseGeocode = await Location.reverseGeocodeAsync({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          if (reverseGeocode && reverseGeocode.length > 0) {
            const addr = reverseGeocode[0];
            const locationParts = [
              addr.name,
              addr.street,
              addr.city,
              addr.region,
            ].filter(Boolean);
            const locationName = locationParts.join(', ');
            setCurrentLocationName(locationName);
            console.log('Current location name:', locationName);
          }
        } catch (geocodeError) {
          console.error('Reverse geocode error:', geocodeError);
        }
      } catch (error) {
        console.error('Expo Location error (on load):', error);
      }
    };
    fetchCurrentLocation();
  }, []);
  
  // Get existing trip data from route params (when editing/continuing a trip)
  const existingTripData = route?.params?.tripData;
  const isEditMode = !!existingTripData;
  
  // Determine initial trip state based on existing data
  const getInitialTripState = () => {
    if (!existingTripData) return 'not_started';
    
    if (existingTripData.start_trip && !existingTripData.end_trip && !existingTripData.trip_cancelled) {
      return 'in_progress';
    } else if (existingTripData.end_trip) {
      return 'completed';
    } else if (existingTripData.trip_cancelled) {
      return 'cancelled';
    }
    return 'not_started';
  };

  const initialTripState = getInitialTripState();
  
  const [formData, setFormData] = useState({
    date: existingTripData?.date ? new Date(existingTripData.date) : new Date(),
    vehicle: (initialTripState === 'in_progress' && existingTripData?.vehicle_name) ? existingTripData.vehicle_name : (existingTripData?.vehicle || ''),
    driver: (initialTripState === 'in_progress' && existingTripData?.driver_name) ? existingTripData.driver_name : (existingTripData?.driver || ''),
    plateNumber: (initialTripState === 'in_progress' && existingTripData?.number_plate) ? existingTripData.number_plate : (existingTripData?.plateNumber || ''),
    // Autofill Pretrip Ltr (from pre_trip_litres) for in-progress trip
    tankCapacity:
      (initialTripState === 'in_progress' && typeof existingTripData?.pre_trip_litres !== 'undefined')
        ? String(existingTripData.pre_trip_litres ?? '')
        : '',
    // Autofill start_latitude and start_longitude for in-progress trip
    start_latitude:
      (initialTripState === 'in_progress' && typeof existingTripData?.start_latitude !== 'undefined')
        ? String(existingTripData.start_latitude ?? '')
        : '',
    start_longitude:
      (initialTripState === 'in_progress' && typeof existingTripData?.start_longitude !== 'undefined')
        ? String(existingTripData.start_longitude ?? '')
        : '',
    source: (initialTripState === 'in_progress' && existingTripData?.source_name) ? existingTripData.source_name : (existingTripData?.source || ''),
    destination: (initialTripState === 'in_progress' && existingTripData?.destination_name) ? existingTripData.destination_name : (existingTripData?.destination || ''),
    source_id: existingTripData?.source_id || '',
    destination_id: existingTripData?.destination_id || '',
    estimatedTime: (initialTripState === 'in_progress' && typeof existingTripData?.estimated_time !== 'undefined') ? String(existingTripData.estimated_time) : (existingTripData?.estimatedTime || ''),
    startTrip: existingTripData?.start_trip || false,
    // Autofill Start KM for in-progress trip
    startKM:
      (initialTripState === 'in_progress' && (typeof existingTripData?.start_km !== 'undefined' || typeof existingTripData?.startKM !== 'undefined'))
        ? String(existingTripData.start_km ?? existingTripData.startKM ?? '')
        : (existingTripData?.startKM || ''),
    endTrip: existingTripData?.end_trip || false,
    endKM: existingTripData?.endKM || '0',
    startTime: (existingTripData?.start_time || existingTripData?.startTime) ? new Date(existingTripData.start_time || existingTripData.startTime) : new Date(),
    endTime: (existingTripData?.end_time || existingTripData?.endTime) ? new Date(existingTripData.end_time || existingTripData.endTime) : null,
    travelledKM: existingTripData?.travelledKM || '0',
    invoiceNumbers: existingTripData?.invoiceNumbers || '',
    amount: existingTripData?.amount || '0',
    vehicleChecklist: {
      coolentWater: existingTripData?.vehicleChecklist?.coolentWater || false,
      oilChecking: existingTripData?.vehicleChecklist?.oilChecking || false,
      tyreChecking: existingTripData?.vehicleChecklist?.tyreChecking || false,
      batteryChecking: existingTripData?.vehicleChecklist?.batteryChecking || false,
      fuelChecking: existingTripData?.vehicleChecklist?.fuelChecking || false,
      dailyChecks: existingTripData?.vehicleChecklist?.dailyChecks || false,
    },
    cancelTrip: existingTripData?.trip_cancelled || false,
    remarks: existingTripData?.remarks || '',
    imageUri: existingTripData?.imageUri || '',
    // Fuel invoice image URI (to upload/send to Odoo)
    fuelInvoiceUri: existingTripData?.fuelInvoiceUri || '',
    // Add Fuel fields
    fuelAmount: existingTripData?.fuelAmount || '',
    fuelLitre: existingTripData?.fuelLitre || '',
    currentOdometer: existingTripData?.currentOdometer || '',
    odometerImageUri: existingTripData?.odometerImageUri || '',
    // GPS coordinates
    startLatitude: existingTripData?.startLatitude || null,
    startLongitude: existingTripData?.startLongitude || null,
    endLatitude: existingTripData?.endLatitude || null,
    endLongitude: existingTripData?.endLongitude || null,
    // Trip status
    isTripStarted: initialTripState === 'in_progress' || initialTripState === 'completed',
    endTrip: existingTripData?.end_trip || false,
    tripStatus: initialTripState,
  });

  // Log autofilled fields when opening an in-progress trip
  if (initialTripState === 'in_progress' && existingTripData) {
    // Log all fields, but explicitly show pre_trip_litres, start_latitude, and start_longitude for clarity
    console.log('[VehicleTrackingForm] All fields from in-progress trip:', {
      ...existingTripData,
      pre_trip_litres: existingTripData.pre_trip_litres,
      start_latitude: existingTripData.start_latitude,
      start_longitude: existingTripData.start_longitude,
    });
  }

  const [dropdowns, setDropdowns] = useState({
    vehicles: [],
    drivers: [],
    sourceLocations: [],
    destinations: [],
    purposesOfVisit: [],
  });

  // Purpose of Visit state
  const [purposeOfVisit, setPurposeOfVisit] = useState(existingTripData?.purpose_of_visit || '');

  const [selectedType, setSelectedType] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isStartTimePickerVisible, setIsStartTimePickerVisible] = useState(false);
  const [isEndTimePickerVisible, setIsEndTimePickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [sourceCoords, setSourceCoords] = useState(null);
  const [sourceMatched, setSourceMatched] = useState(null); // null = unknown, true/false
  const [sourceDistance, setSourceDistance] = useState(null);
  const SOURCE_MATCH_THRESHOLD = 100; // meters

  // Load dropdown data with demo vehicles
  useEffect(() => {
    const loadDropdowns = async () => {
      try {
        // Fetch vehicles from Odoo JSON-RPC
        let vehicles = [];
        try {
          const odooVehicles = await fetchVehiclesVehicleTracking({ offset: 0, limit: 200, searchText: '' });
          // Map Odoo shape to the dropdown shape expected by this form
          vehicles = (odooVehicles || []).map(v => ({
            _id: String(v.id),
            name: v.name || '',
            driver: v.driver ? { id: v.driver.id, name: v.driver.name } : null,
            plate_number: v.license_plate || '',
            tankCapacity: v.tank_capacity || '',
            image_url: v.image_url || null,
          }));
          console.log('Loaded vehicles from Odoo:', vehicles.length);
          try {
            // Remove image_url from each vehicle before logging sample
            const sampleVehicles = vehicles.slice(0, 5).map(({ image_url, ...rest }) => rest);
            console.log('Vehicle dropdown sample (first 5):', sampleVehicles);
            if (vehicles.length <= 20) {
              // Remove image_url from each vehicle before logging
              const vehiclesWithoutImg = vehicles.map(({ image_url, ...rest }) => rest);
              console.log('All fetched vehicles:', vehiclesWithoutImg);
            }
          } catch (e) {
            // ignore logging errors
          }
        } catch (err) {
          console.warn('Failed to load vehicles from Odoo, will fall back to demo list', err);
          vehicles = [
            { _id: 'car', name: 'Car', driver: { id: 1, name: 'John Doe' }, plate_number: 'CAR-123' },
            { _id: 'bus', name: 'Bus', driver: { id: 2, name: 'Jane Smith' }, plate_number: 'BUS-456' },
            { _id: 'lorry', name: 'Lorry', driver: { id: 3, name: 'Mike Lee' }, plate_number: 'LORRY-789' },
          ];
        }

        // Fetch sources from Odoo (vehicle.location)
        let sourceLocations = [];
        try {
          const odooSources = await fetchSourcesOdoo({ offset: 0, limit: 100 });
          sourceLocations = odooSources;
          console.log('Loaded sources from Odoo:', sourceLocations.length);
          if (sourceLocations.length > 0) {
            console.log('Odoo sources sample:', sourceLocations.slice(0, 5));
          }
        } catch (err) {
          console.warn('Failed to load sources from Odoo, using defaults', err);
          sourceLocations = [
            { _id: 'src1', name: 'Warehouse', latitude: 8.8861225, longitude: 76.5900631 },
            { _id: 'src2', name: 'Depot', latitude: 8.8850000, longitude: 76.5910000 },
            { _id: 'src3', name: 'Office', latitude: 8.8870000, longitude: 76.5890000 },
          ];
        }

        // Fetch destinations from Odoo (vehicle.location)
        let destinations = [];
        try {
          const odooDestinations = await fetchSourcesOdoo({ offset: 0, limit: 100 });
          destinations = odooDestinations;
          console.log('Loaded destinations from Odoo:', destinations.length);
          if (destinations.length > 0) {
            console.log('Odoo destinations sample:', destinations.slice(0, 5));
          }
        } catch (err) {
          console.warn('Failed to load destinations from Odoo, using defaults', err);
          destinations = [
            { _id: 'dest1', name: 'Client Site' },
            { _id: 'dest2', name: 'Service Center' },
            { _id: 'dest3', name: 'Main Office' },
          ];
        }

        // Fetch Purpose of Visit dropdown
        let purposesOfVisit = [];
        try {
          purposesOfVisit = await fetchPurposeOfVisitDropdown();
        } catch (err) {
          console.warn('Failed to load Purpose of Visit dropdown', err);
        }
        setDropdowns({
          vehicles,
          sourceLocations,
          destinations,
          purposesOfVisit,
        });

        // If editing an existing trip, try to auto-match the vehicle in the loaded dropdowns
        if (isEditMode && existingTripData?.vehicle_id) {
          try {
            const match = (vehicles || []).find(v => String(v._id) === String(existingTripData.vehicle_id) || String(v._id) === String(existingTripData.vehicle_id?.toString()));
            if (match) {
              setFormData(prev => ({
                ...prev,
                vehicle: match.name || prev.vehicle,
                driver: match.driver?.name || prev.driver,
                plateNumber: match.plate_number || prev.plateNumber,
              }));
              console.log('[VehicleTrackingForm] Auto-matched vehicle from dropdowns for edit:', match.name, match._id);
            } else {
              console.log('[VehicleTrackingForm] No vehicle match found in dropdowns for vehicle_id:', existingTripData.vehicle_id);
              // Fallback: fetch vehicle details by id and populate form fields
              try {
                const details = await fetchVehicleDetailsOdoo({ vehicle_id: existingTripData.vehicle_id });
                if (details) {
                  setFormData(prev => ({
                    ...prev,
                    vehicle: details.name || prev.vehicle || existingTripData.vehicle_name || '',
                    driver: details.driver?.name || prev.driver || existingTripData.driver_name || '',
                    plateNumber: details.license_plate || prev.plateNumber || existingTripData.number_plate || '',
                    tankCapacity: prev.tankCapacity || details.tank_capacity || prev.tankCapacity || '',
                  }));
                  console.log('[VehicleTrackingForm] Populated vehicle from fetchVehicleDetailsOdoo fallback:', details.name, existingTripData.vehicle_id);
                }
              } catch (fetchErr) {
                console.warn('Failed to fetch vehicle details fallback for vehicle_id:', existingTripData.vehicle_id, fetchErr);
              }
            }
          } catch (e) {
            console.warn('Error auto-matching vehicle for edit:', e);
          }
        }
      } catch (error) {
        console.error('Error loading dropdowns:', error);
      }
    };

    loadDropdowns();
  }, []);

  // Helper functions to determine field states
  const isFieldDisabled = (fieldName) => {
    const { tripStatus, isTripStarted } = formData;
    
    // Trip basic info fields - disabled after trip starts
    const tripBasicFields = ['source', 'destination', 'vehicle', 'driver', 'plateNumber', 'purposeOfVisit'];
    
    // Trip control fields - disabled based on trip status
    const tripControlFields = ['startTrip'];
    
    // Completed trip fields - disabled after trip ends
    const completedTripFields = ['endTrip', 'startKM'];
    
    if (tripStatus === 'completed' || tripStatus === 'cancelled') {
      // All fields disabled except remarks and viewing
      return !['remarks'].includes(fieldName);
    }
    
    if (isTripStarted && tripBasicFields.includes(fieldName)) {
      return true; // Disable trip basic info after start
    }
    
    if (isTripStarted && tripControlFields.includes(fieldName)) {
      return true; // Disable start trip controls
    }
    
    return false;
  };

  const isFieldEditable = (fieldName) => {
    const { tripStatus, isTripStarted } = formData;
    
    // Always editable fields during trip
    const alwaysEditableFields = ['endKM', 'remarks', 'invoiceNumbers', 'imageUri'];
    // Only allow editing endTime if trip is started
    if (fieldName === 'endTime') {
      return formData.isTripStarted;
    }
    
    // Editable only when trip is in progress
    const tripProgressFields = ['endTrip'];
    
    if (tripStatus === 'completed' || tripStatus === 'cancelled') {
      return ['remarks'].includes(fieldName); // Only remarks editable after completion
    }
    
    if (isTripStarted) {
      return alwaysEditableFields.includes(fieldName) || tripProgressFields.includes(fieldName);
    }
    
    return true; // All fields editable before trip starts
  };

  const getFieldStyle = (fieldName) => {
    return isFieldDisabled(fieldName) ? styles.disabledInput : {};
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const handleChecklistChange = (field, value) => {
    setFormData(prev => {
      const prevChecklist = (prev && typeof prev.vehicleChecklist === 'object' && prev.vehicleChecklist !== null)
        ? prev.vehicleChecklist
        : {
            coolentWater: false,
            oilChecking: false,
            tyreChecking: false,
            batteryChecking: false,
            fuelChecking: false,
            dailyChecks: false,
          };
      return {
        ...prev,
        vehicleChecklist: {
          ...prevChecklist,
          [field]: value,
        },
      };
    });
  };

  // Small delay to let Alert dismiss before launching picker (prevents Android crash)
  const delayedAction = (fn) => () => setTimeout(fn, 300);

  const handleImagePicker = () => {
    Alert.alert(
      "Select Image",
      "Choose an option",
      [
        { text: "Camera", onPress: delayedAction(openCamera) },
        { text: "Gallery", onPress: delayedAction(openGallery) },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  // Reuse image picker for fuel invoice specifically
  const handleFuelInvoicePicker = () => {
    Alert.alert(
      "Upload Fuel Invoice",
      "Choose image source",
      [
        { text: "Camera", onPress: delayedAction(openFuelCamera) },
        { text: "Gallery", onPress: delayedAction(openFuelGallery) },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  // Odometer image picker (reuses camera/gallery logic)
  const handleOdometerPicker = () => {
    Alert.alert(
      "Upload Odometer Image",
      "Choose image source",
      [
        { text: "Camera", onPress: delayedAction(openOdometerCamera) },
        { text: "Gallery", onPress: delayedAction(openOdometerGallery) },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const openOdometerCamera = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1000,
      maxHeight: 1000,
    };
    (async () => {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showToastMessage('Camera permission is required', 'warning');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: false,
        });
        console.log('[VehicleTrackingForm] openOdometerCamera result:', result);
        if (result?.cancelled || result?.canceled) {
          showToastMessage('Camera cancelled', 'info');
          return;
        }
        const asset = result.assets ? result.assets[0] : (result.uri ? { uri: result.uri } : null);
        if (asset && asset.uri) {
          handleInputChange('odometerImageUri', asset.uri);
          showToastMessage('Odometer image captured', 'success');
        }
      } catch (e) {
        console.error('openOdometerCamera exception:', e);
        showToastMessage('Camera error occurred', 'error');
      }
    })();
  };

  const openOdometerGallery = () => {
    (async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showToastMessage('Media library permission is required', 'warning');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
        console.log('[VehicleTrackingForm] openOdometerGallery result:', result);
        if (result.cancelled || result.canceled) {
          showToastMessage('Gallery selection cancelled', 'info');
          return;
        }
        const asset = result.assets && result.assets[0];
        if (asset && asset.uri) {
          handleInputChange('odometerImageUri', asset.uri);
          showToastMessage('Odometer image selected', 'success');
        }
      } catch (e) {
        console.error('openOdometerGallery exception:', e);
        showToastMessage('Gallery error occurred', 'error');
      }
    })();
  };

  const openFuelCamera = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1000,
      maxHeight: 1000,
    };
    (async () => {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showToastMessage('Camera permission is required', 'warning');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: false,
        });
        console.log('[VehicleTrackingForm] openFuelCamera result:', result);
        if (result?.cancelled || result?.canceled) {
          showToastMessage('Camera cancelled', 'info');
          return;
        }
        const asset = result.assets ? result.assets[0] : (result.uri ? { uri: result.uri } : null);
        if (asset && asset.uri) {
          handleInputChange('fuelInvoiceUri', asset.uri);
          showToastMessage('Fuel invoice captured', 'success');
        }
      } catch (e) {
        console.error('launchCamera exception:', e);
        showToastMessage('Camera error occurred', 'error');
      }
    })();
  };

  const openFuelGallery = () => {
    (async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showToastMessage('Media library permission is required', 'warning');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
        console.log('[VehicleTrackingForm] expo-image-picker result:', result);
        if (result.cancelled || result.canceled) {
          showToastMessage('Gallery selection cancelled', 'info');
          return;
        }
        const asset = result.assets && result.assets[0];
        if (asset && asset.uri) {
          console.log('[VehicleTrackingForm] Fuel invoice image selected:', asset.uri);
          handleInputChange('fuelInvoiceUri', asset.uri);
          showToastMessage('Fuel invoice selected', 'success');
        }
      } catch (e) {
        console.error('expo-image-picker exception:', e);
        showToastMessage('Gallery error occurred', 'error');
      }
    })();
  };

  const openCamera = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1000,
      maxHeight: 1000,
    };
    (async () => {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showToastMessage('Camera permission is required', 'warning');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: false,
        });
        console.log('[VehicleTrackingForm] openCamera result:', result);
        if (result?.cancelled || result?.canceled) {
          showToastMessage('Camera cancelled', 'info');
          return;
        }
        const asset = result.assets ? result.assets[0] : (result.uri ? { uri: result.uri } : null);
        if (asset && asset.uri) {
          handleInputChange('imageUri', asset.uri);
          showToastMessage('Image captured successfully!', 'success');
        }
      } catch (e) {
        console.error('launchCamera exception:', e);
        showToastMessage('Camera error occurred', 'error');
      }
    })();
  };

  const openGallery = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1000,
      maxHeight: 1000,
    };
    (async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showToastMessage('Media library permission is required', 'warning');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
        console.log('[VehicleTrackingForm] openGallery result:', result);
        if (result?.cancelled || result?.canceled) {
          showToastMessage('Gallery selection cancelled', 'info');
          return;
        }
        const asset = result.assets ? result.assets[0] : (result.uri ? { uri: result.uri } : null);
        if (asset && asset.uri) {
          handleInputChange('imageUri', asset.uri);
          showToastMessage('Image selected successfully!', 'success');
        }
      } catch (e) {
        console.error('launchImageLibrary exception:', e);
        showToastMessage('Gallery error occurred', 'error');
      }
    })();
  };

  const handleDropdownSelect = async (field, item) => {
    if (field === 'purposeOfVisit') {
      setPurposeOfVisit(item.name);
      setIsVisible(false);
      return;
    }
    handleInputChange(field, item.name);
    if (field === 'vehicle') {
      handleInputChange('driver', item.driver?.name || '');
      handleInputChange('plateNumber', item.plate_number || '');
      // Autofill tank capacity from the dropdown item if present (fast, no network)
      const immediateTank = item.tankCapacity ?? item.tank_capacity ?? '';
      handleInputChange('tankCapacity', immediateTank !== null && immediateTank !== undefined ? String(immediateTank) : '');

      // If not available on the item, try fetching full vehicle details (best-effort)
      if ((!immediateTank || String(immediateTank).trim() === '') && item._id) {
        try {
          const vehicleDetails = await fetchVehicleDetailsOdoo({ vehicle_id: item._id });
          const fetchedTank = vehicleDetails?.tank_capacity ?? '';
          if (fetchedTank !== '' && fetchedTank !== null && typeof fetchedTank !== 'undefined') {
            handleInputChange('tankCapacity', String(fetchedTank));
            console.log('[VehicleTrackingForm] Tank capacity fetched for vehicle:', item._id, fetchedTank);
          } else {
            console.log('[VehicleTrackingForm] No tank capacity found for vehicle (details):', item._id);
          }
        } catch (err) {
          console.warn('Failed to fetch tank capacity for vehicle', err);
        }
      }
      // Autofill startKM with last completed trip's end_km for selected vehicle
      try {
        // Debug: Log vehicle_id being sent and payload
        const tripsPayload = { vehicle_id: item._id, limit: 5, order: 'desc' };
        console.log('[VehicleTrackingForm] Fetching trips payload:', tripsPayload, 'vehicle name:', item.name);
        // Fetch trips for this vehicle (could be more than one, so we filter)
        const trips = await fetchVehicleTrackingTripsOdoo(tripsPayload);
        // Debug: Log all trips returned
        console.log('[VehicleTrackingForm] Trips returned from backend:', trips);
        // Filter for completed trips (end_trip: true)
        const completedTrips = (trips || []).filter(t => t.end_trip && typeof t.end_km !== 'undefined');
        // Filter for in-progress trips (end_trip: false)
        const inProgressTrips = (trips || []).filter(t => !t.end_trip);
        // If a trip is completed, exclude it from in-progress selection
        if (completedTrips.length > 0) {
          // Sort by date or id descending (assuming id is incrementing)
          completedTrips.sort((a, b) => (b.id || 0) - (a.id || 0));
          const lastCompleted = completedTrips[0];
          console.log('[VehicleTrackingForm] Last completed trip object for selected vehicle:', {
            ...lastCompleted,
            debug_trip_id: lastCompleted.id,
            debug_vehicle_id: lastCompleted.vehicle_id
          });
          // Warn if vehicle_name does not match selected vehicle
          if (lastCompleted.vehicle_name !== item.name) {
            console.warn('[VehicleTrackingForm] WARNING: Returned trip vehicle_name does not match selected vehicle!', {
              selectedVehicleName: item.name,
              returnedVehicleName: lastCompleted.vehicle_name,
              returnedTripId: lastCompleted.id,
              returnedVehicleId: lastCompleted.vehicle_id
            });
          }
          handleInputChange('startKM', String(lastCompleted.end_km));
          console.log('[VehicleTrackingForm] startKM autofilled from last completed trip:', lastCompleted.end_km);
        } else {
          handleInputChange('startKM', '');
          console.log('[VehicleTrackingForm] No previous completed trip found, startKM left blank.');
        }
        // Optionally, you can disable selection of in-progress trips that are now completed
        // Example: if (inProgressTrips.length === 0) { /* disable in-progress selection UI */ }
      } catch (err) {
        console.warn('Failed to fetch last completed end_km for vehicle', err);
        handleInputChange('startKM', '');
        console.log('[VehicleTrackingForm] Error fetching last completed trip, startKM left blank.');
      }
    }
    if (field === 'source') {
      const lat = item.latitude ?? item.lat ?? item.geo_lat ?? item.lat_lng?.lat ?? null;
      const lon = item.longitude ?? item.lon ?? item.lng ?? item.geo_lng ?? item.lat_lng?.lng ?? null;
      if (lat != null && lon != null) {
        setSourceCoords({ latitude: parseFloat(lat), longitude: parseFloat(lon) });
        // Immediately compare with currentCoords
        if (currentCoords) {
          const dist = getDistanceMeters(currentCoords.latitude, currentCoords.longitude, parseFloat(lat), parseFloat(lon));
          setSourceDistance(dist);
          const matched = dist <= SOURCE_MATCH_THRESHOLD;
          setSourceMatched(matched);
        } else {
          setSourceMatched(null);
          setSourceDistance(null);
        }
      } else {
        setSourceCoords(null);
        setSourceMatched(null);
        setSourceDistance(null);
      }
    }
    setIsVisible(false);
  };

  // Haversine formula to calculate distance in meters
  const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371000; // earth radius meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const verifySource = async () => {
    if (!sourceCoords) {
      showToastMessage('Source has no coordinates to verify', 'warning');
      setSourceMatched(false);
      setSourceDistance(null);
      return { matched: false, distance: null };
    }

    try {
      const current = await getCurrentLocation('Verify Source');
      const dist = getDistanceMeters(current.latitude, current.longitude, sourceCoords.latitude, sourceCoords.longitude);
      setSourceDistance(dist);
      const matched = dist <= SOURCE_MATCH_THRESHOLD;
      setSourceMatched(matched);
      if (matched) {
        showToastMessage(`Source verified (${Math.round(dist)} m)`, 'success');
      } else {
        showToastMessage(`Source mismatch (${Math.round(dist)} m)`, 'warning');
      }
      return { matched, distance: dist };
    } catch (error) {
      console.error('Error verifying source:', error);
      showToastMessage('Failed to verify source location', 'error');
      setSourceMatched(false);
      return { matched: false, distance: null };
    }
  };

  // Destination verification logic (similar to source)
  const verifyDestination = async () => {
    // Find destination coordinates from dropdowns
    const selectedDestination = (dropdowns.destinations || []).find(d => d.name === formData.destination);
    const lat = selectedDestination?.latitude ?? selectedDestination?.lat ?? selectedDestination?.geo_lat ?? selectedDestination?.lat_lng?.lat ?? null;
    const lon = selectedDestination?.longitude ?? selectedDestination?.lon ?? selectedDestination?.lng ?? selectedDestination?.geo_lng ?? selectedDestination?.lat_lng?.lng ?? null;
    if (lat == null || lon == null) {
      showToastMessage('Destination has no coordinates to verify', 'warning');
      return { matched: false, distance: null };
    }
    try {
      const current = await getCurrentLocation('Verify Destination');
      const dist = getDistanceMeters(current.latitude, current.longitude, parseFloat(lat), parseFloat(lon));
      const matched = dist <= SOURCE_MATCH_THRESHOLD;
      if (matched) {
        showToastMessage(`Destination verified (${Math.round(dist)} m)`, 'success');
      } else {
        showToastMessage(`Destination mismatch (${Math.round(dist)} m)`, 'warning');
      }
      return { matched, distance: dist };
    } catch (error) {
      console.error('Error verifying destination:', error);
      showToastMessage('Failed to verify destination location', 'error');
      return { matched: false, distance: null };
    }
  };

  const handleStartTripToggle = async (value) => {
    // If trying to start the trip, verify source first
    if (value) {
      // Log all filled form data before verifying source
      console.log('Start Trip clicked. Current filled form data:', formData);
      const { matched, distance } = await verifySource();
      if (matched) {
        // Capture current GPS location and set startLatitude/startLongitude immediately
        try {
          const location = await getCurrentLocation('Start Trip Immediate');
          setFormData(prev => {
            const updated = {
              ...prev,
              startTrip: true,
              startLatitude: location.latitude,
              startLongitude: location.longitude,
            };
            // Also store as string for Odoo compatibility
            updated.start_latitude = String(location.latitude);
            updated.start_longitude = String(location.longitude);
            console.log('Start Trip updated formData:', updated);
            return updated;
          });
          showToastMessage(`Start location captured: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`, 'success');
        } catch (error) {
          console.error('Failed to capture GPS:', error);
          showToastMessage('GPS capture failed, using default location', 'warning');
          setFormData(prev => {
            const updated = {
              ...prev,
              startTrip: true,
              startLatitude: 25.2048,
              startLongitude: 55.2708,
            };
            console.log('Start Trip updated formData (fallback):', updated);
            return updated;
          });
        }
      } else {
        // Source not matched - do not allow starting the trip
        showToastMessage(`Cannot start trip: You must be at the source location. Current distance: ${distance ? Math.round(distance) + ' m' : 'unknown'}`, 'error');
      }
    } else {
      handleInputChange('startTrip', false);
    }
  };

  const openDropdown = (type, data) => {
    if (type === 'vehicle') {
      // Remove image_url and add tankCapacity to log output
      const sanitizedData = (data || []).map(({ image_url, ...rest }) => ({
        ...rest,
        tankCapacity: rest.tankCapacity || rest.tank_capacity || ''
      }));
      console.log('Vehicle dropdown data:', sanitizedData);
    }
    setSelectedType({ type, data });
    setIsVisible(true);
  };

  const calculateTravelledKM = () => {
    const start = parseFloat(formData.startKM) || 0;
    const end = parseFloat(formData.endKM) || 0;
    const travelled = Math.max(0, end - start);
    handleInputChange('travelledKM', travelled.toString());
  };

  useEffect(() => {
    calculateTravelledKM();
  }, [formData.startKM, formData.endKM]);

  const validateForm = () => {
    const { tripStatus, isTripStarted, endTrip } = formData;

    const requiredFields = ['date', 'vehicle', 'driver', 'plateNumber'];

    const fieldLabels = {
      date: 'Date',
      vehicle: 'Vehicle',
      driver: 'Driver',
      plateNumber: 'Plate Number',
      source: 'Source',
      destination: 'Destination',
      endKM: 'End KM',
      startKM: 'Start KM',
    };

    // Manual validation to avoid dependency on external helper and stale state
    let newErrors = {};

    requiredFields.forEach((field) => {
      const value = formData[field];
      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        newErrors[field] = `${fieldLabels[field] || field} is required`;
      }
    });

    // Additional validation when Start Trip is checked (for new trips)
    if (formData.startTrip && !isTripStarted) {
      if (!formData.source) {
        newErrors.source = 'Source location is required when starting a trip';
      }
      if (!formData.destination) {
        newErrors.destination = 'Destination is required when starting a trip';
      }
    }

    // Additional validation when End Trip is checked
    if (endTrip && isTripStarted) {
      if (!formData.endKM || formData.endKM === '0') {
        newErrors.endKM = 'End KM reading is required to end the trip';
      }

      const startKM = parseFloat(formData.startKM) || 0;
      const endKM = parseFloat(formData.endKM) || 0;

      if (endKM <= startKM) {
        newErrors.endKM = 'End KM must be greater than Start KM';
      }
    }

    // Validation for trip in edit mode
    if (isEditMode && isTripStarted && !endTrip) {
      // For ongoing trips, only validate editable fields
      if (!formData.endKM || formData.endKM === '0') {
        // End KM not required until ending trip, but show warning
        console.log('End KM should be updated during the trip');
      }
    }

    setErrors(newErrors);
    console.log('validateForm newErrors:', newErrors);
    return newErrors;
  };

  // Function to get current GPS location using expo-location
  const getCurrentLocation = async (logAddressLabel = '') => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access location was denied');
        // Fallback coordinates
        return {
          latitude: 25.2048,
          longitude: 55.2708,
        };
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      // Reverse geocode and log address if requested
      if (logAddressLabel) {
        try {
          const addressArr = await Location.reverseGeocodeAsync({ latitude: location.coords.latitude, longitude: location.coords.longitude });
          if (addressArr && addressArr.length > 0) {
            const address = addressArr[0];
            const addressString = `${address.name || ''} ${address.street || ''}, ${address.city || ''}, ${address.region || ''}, ${address.country || ''}`;
            console.log(`${logAddressLabel} address:`, addressString);
          }
        } catch (geoError) {
          console.log('Reverse geocoding failed:', geoError);
        }
      }
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('Expo Location error:', error);
      // Fallback coordinates
      return {
        latitude: 25.2048,
        longitude: 55.2708,
      };
    }
  };

  const handleSubmit = async () => {
    const newErrors = validateForm();
    if (newErrors && Object.keys(newErrors).length > 0) {
      console.log('Validation errors:', newErrors);
      console.log('Form data at submit:', formData);
      showToastMessage('Please fill all required fields', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // Ensure vehicleChecklist is always an object
      const checklist = (formData && typeof formData.vehicleChecklist === 'object' && formData.vehicleChecklist !== null)
        ? formData.vehicleChecklist
        : {
            coolentWater: false,
            oilChecking: false,
            tyreChecking: false,
            batteryChecking: false,
            fuelChecking: false,
            dailyChecks: false,
          };
      const checklistSnake = {
        coolant_water: checklist.coolentWater,
        oil_checking: checklist.oilChecking,
        tyre_checking: checklist.tyreChecking,
        battery_checking: checklist.batteryChecking,
        fuel_checking: checklist.fuelChecking,
        daily_checks: checklist.dailyChecks,
      };

      // Find selected vehicle object from dropdowns. When editing, preserve existing vehicle_id
      const selectedVehicle = (dropdowns.vehicles || []).find(v => v.name === formData.vehicle);
      // Extract vehicle_id: if it's an array (from API response), take first element
      let vehicle_id = selectedVehicle ? selectedVehicle._id : null;
      if (!vehicle_id && isEditMode && existingTripData?.vehicle_id) {
        vehicle_id = Array.isArray(existingTripData.vehicle_id) ? existingTripData.vehicle_id[0] : existingTripData.vehicle_id;
        console.log('[VehicleTrackingForm] Using vehicle_id from existingTripData:', vehicle_id, 'original:', existingTripData.vehicle_id);
      }
      // Try to get driver_id from selected vehicle or fallback to existing trip driver id
      const driver_id = selectedVehicle?.driver?.id || (Array.isArray(existingTripData?.driver_id) ? existingTripData.driver_id[0] : existingTripData?.driver_id) || null;

      // Map form fields to Odoo model fields
      let submitData = {
        amount: parseFloat(formData.amount) || 0,
        // post_trip_amount removed: not a valid Odoo field
        // post_trip_litres removed: not a valid Odoo field
        battery_checking: checklistSnake.battery_checking,
        coolant_water: checklistSnake.coolant_water,
        tyre_checking: checklistSnake.tyre_checking,
        daily_checks: checklistSnake.daily_checks,
        date: formatDateOdoo(formData.date),
        destination_id: (() => {
          // Find selected destination object from dropdowns
          const selectedDestination = (dropdowns.destinations || []).find(d => d.name === formData.destination);
          return selectedDestination ? selectedDestination._id : null;
        })(),
        source_id: (() => {
          // Find selected source object from dropdowns
          const selectedSource = (dropdowns.sourceLocations || []).find(s => s.name === formData.source);
          return selectedSource ? selectedSource._id : null;
        })(),
        driver_id: driver_id,
        end_km: parseInt(formData.endKM) || 0,
        end_latitude: formData.endLatitude ? String(formData.endLatitude) : '',
        end_longitude: formData.endLongitude ? String(formData.endLongitude) : '',
        end_time: formatDateTimeOdoo(formData.endTime),
        end_trip: formData.endTrip,
        estimated_time: parseFloat(formData.estimatedTime) || 0,
        fuel_checking: checklistSnake.fuel_checking,
        image_url: formData.imageUri || '',
        // Fuel invoice: send URI and filename (backend should accept URI or handle upload)
        // end_fuel_document fields removed: not a valid Odoo field
        invoice_number: formData.invoiceNumbers,
        km_travelled: parseInt(formData.travelledKM) || 0,
        number_plate: formData.plateNumber,
        oil_checking: checklistSnake.oil_checking,
        remarks: formData.remarks,
        start_km: parseInt(formData.startKM) || 0,
        // Always send start_latitude and start_longitude if available
        start_latitude: formData.start_latitude || formData.startLatitude ? String(formData.start_latitude || formData.startLatitude) : '',
        start_longitude: formData.start_longitude || formData.startLongitude ? String(formData.start_longitude || formData.startLongitude) : '',
        start_time: formatDateTimeOdoo(formData.startTime),
        start_trip: formData.startTrip,
        vehicle_id: vehicle_id,
        // Add purpose_of_visit_id as id (many2one)
        purpose_of_visit_id: (() => {
          const selectedPurpose = (dropdowns.purposesOfVisit || []).find(p => p.name === purposeOfVisit);
          return selectedPurpose ? selectedPurpose._id : null;
        })(),
        // pre_trip_litres removed: not a valid Odoo field
        // Add Fuel fields (if provided)
        fuel_amount: formData.fuelAmount ? String(formData.fuelAmount) : '',
        fuel_liters: formData.fuelLitre ? String(formData.fuelLitre) : '',
        current_odometer: formData.currentOdometer ? String(formData.currentOdometer) : '',
        odometer_image: formData.odometerImageUri ? String(formData.odometerImageUri) : '',
      };


      // Add trip ID if editing existing trip (only id, no is_update/isUpdate/tripId)
      if (isEditMode && existingTripData?.id) {
        submitData.id = existingTripData.id;
        // Ensure vehicle_id is present when updating - it's critical for the trip record
        if (!submitData.vehicle_id) {
          console.error('[VehicleTrackingForm] CRITICAL: vehicle_id is missing in update payload!', {
            submitData_vehicle_id: submitData.vehicle_id,
            existingTripData_vehicle_id: existingTripData.vehicle_id,
            variable_vehicle_id: vehicle_id,
          });
          showToastMessage('Vehicle ID missing - please select a vehicle before updating', 'error');
          setIsSubmitting(false);
          return;
        } else {
          console.log('[VehicleTrackingForm] Update payload includes vehicle_id:', submitData.vehicle_id);
        }
      }

      // If Start Trip is checked (for new trips only)
      if (formData.startTrip && !formData.isTripStarted) {
        try {
          showToastMessage('Capturing GPS location...', 'info');
          const location = await getCurrentLocation('Start Trip');
          submitData = {
            ...submitData,
            start_trip: true,
            start_latitude: location.latitude,
            start_longitude: location.longitude,
          };
          showToastMessage(`GPS captured: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`, 'success');
        } catch (error) {
          console.error('Failed to capture GPS:', error);
          showToastMessage('GPS capture failed, using default location', 'warning');
        }
      }

      // If End Trip is checked, verify destination and capture end GPS coordinates
      if (formData.endTrip && formData.isTripStarted) {
        const { matched, distance } = await verifyDestination();
        if (matched) {
          try {
            showToastMessage('Capturing end location...', 'info');
            const location = await getCurrentLocation('End Trip');
            submitData = {
              ...submitData,
              end_trip: true,
              end_latitude: location.latitude,
              end_longitude: location.longitude,
            };
            showToastMessage(`End location captured: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`, 'success');
          } catch (error) {
            console.error('Failed to capture end GPS:', error);
            showToastMessage('End GPS capture failed, using default location', 'warning');
          }
        } else {
          showToastMessage('Cannot end trip: current location does not match destination.', 'error');
          setIsSubmitting(false);
          return;
        }
      }

      // Pass fuel invoice URI as-is; generalApi will convert to base64 (same as odometer_image)
      if (formData.fuelInvoiceUri) {
        submitData.upload_path = formData.fuelInvoiceUri;
      }

      // Pass main image URI as-is; generalApi will convert to base64 (same as odometer_image)
      if (formData.imageUri) {
        submitData.image_url = formData.imageUri;
      }

      // Log the payload we'll send to the API for debugging (without image_128)
      try {
        const { image_128, ...rest } = submitData;
        console.log('[VehicleTrackingForm] Payload sent to Odoo on end trip:', rest);
        console.log('[VehicleTrackingForm] vehicle_id in update payload:', submitData.vehicle_id);
      } catch (logErr) {
        console.log('Failed to stringify submit payload', logErr);
      }

      // Send to Odoo using JSON-RPC
      let response;
      try {
        response = await createVehicleTrackingTripOdoo({ payload: submitData });
        console.log('Odoo createVehicleTrackingTripOdoo response:', response);
      } catch (odooErr) {
        console.error('Odoo trip creation failed:', odooErr);
        // Inspect error and if it mentions vehicle.tracking or unknown comodels, fallback to REST backend
        const errPayload = odooErr && (odooErr.data || odooErr.response || odooErr);
        const errString = JSON.stringify(errPayload || odooErr || '');
        const shouldFallback = errString.includes('vehicle.tracking') || errString.includes('unknown comodel_name') || errString.includes('Invalid field');
        if (shouldFallback) {
          showToastMessage('Odoo model unavailable — falling back to REST API', 'warning');
          try {
            const restResp = await post(VEHICLE_TRACKING_URL, submitData);
            console.log('Fallback REST response:', restResp);
            response = restResp;
          } catch (restErr) {
            console.error('Fallback REST failed:', restErr);
            showToastMessage('Failed to create trip via REST fallback', 'error');
            setIsSubmitting(false);
            return;
          }
        } else {
          showToastMessage('Failed to create trip in Odoo', 'error');
          setIsSubmitting(false);
          return;
        }
      }

      // Update form state if trip was started
      if (formData.startTrip && !formData.isTripStarted) {
        setFormData(prev => ({
          ...prev,
          isTripStarted: true,
          startLatitude: submitData.start_latitude,
          startLongitude: submitData.start_longitude,
          tripStatus: 'in_progress',
        }));
        showToastMessage('Trip started successfully!', 'success');
        setTimeout(() => navigation.goBack(), 1500);
      } else if (formData.endTrip && formData.isTripStarted) {
        setFormData(prev => ({
              // end_fuel_document fields removed: not a valid Odoo field
          endLongitude: submitData.end_longitude,
          tripStatus: 'completed',
        }));
        showToastMessage('Trip completed successfully!', 'success');
        setTimeout(() => navigation.goBack(), 2000);
      } else {
        showToastMessage('Vehicle tracking entry added successfully', 'success');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      showToastMessage('Failed to add vehicle tracking entry', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelTrip = async () => {
    Alert.alert(
      'Cancel Trip',
      'Are you sure you want to cancel this trip? This action cannot be undone.',
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSubmitting(true);
              

              // Prepare UTC date/time fields for Odoo
              const pad = (n) => n < 10 ? '0' + n : n;
              const formatDateOdoo = (dateObj) => {
                if (!dateObj) return '';
                const d = new Date(dateObj);
                return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
              };
              const formatDateTimeOdoo = (dateObj) => {
                if (!dateObj) return '';
                const d = new Date(dateObj);
                return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
              };

              let cancelData = {
                trip_cancel: true,
                tripStatus: 'cancelled',
                date: formatDateOdoo(formData.date),
                start_trip: formData.startTrip || false,
                end_trip: false,
                start_latitude: formData.start_latitude || null,
                start_longitude: formData.start_longitude || null,
                start_km: formData.startKM || '',
                end_km: formData.endKM || '',
                start_time: formatDateTimeOdoo(formData.startTime),
                end_time: formData.endTime ? formatDateTimeOdoo(formData.endTime) : '',
                vehicle_id: existingTripData?.vehicle_id || '',
                driver_id: existingTripData?.driver_id || '',
                number_plate: formData.plateNumber || '',
                remarks: formData.remarks || '',
                pre_trip_litres: formData.tankCapacity || '',
                // Add other required fields as needed
              };

              try {
                const location = await getCurrentLocation();
                cancelData.cancel_latitude = location.latitude;
                cancelData.cancel_longitude = location.longitude;
              } catch (error) {
                console.error('Failed to capture cancel location:', error);
              }

              // Call Odoo cancel API
              try {
                await cancelVehicleTrackingTripOdoo({ tripId: existingTripData.id });
                setFormData(prev => ({
                  ...prev,
                  tripStatus: 'cancelled',
                }));
                showToastMessage('Trip cancelled successfully', 'success');
                setTimeout(() => navigation.goBack(), 2000);
              } catch (error) {
                console.error('Error cancelling trip:', error);
                showToastMessage('Failed to cancel trip', 'error');
              }
              
            } catch (error) {
              console.error('Error cancelling trip:', error);
              showToastMessage('Failed to cancel trip', 'error');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader
        title={
          isEditMode 
            ? formData.tripStatus === 'in_progress' 
              ? "Continue Trip" 
              : formData.tripStatus === 'completed'
              ? "View Completed Trip"
              : formData.tripStatus === 'cancelled'
              ? "View Cancelled Trip"
              : "Edit Vehicle Tracking"
            : "New Vehicle Tracking"
        }
        navigation={navigation}
      />
      
      <RoundedScrollContainer>
        {/* Trip Status Indicator */}
        {isEditMode && (
          <View style={styles.tripStatusIndicator}>
            <Text style={styles.tripStatusTitle}>
              Trip Status: 
              <Text style={[
                styles.tripStatusValue,
                formData.tripStatus === 'in_progress' && styles.tripStatusInProgress,
                formData.tripStatus === 'completed' && styles.tripStatusCompleted,
                formData.tripStatus === 'cancelled' && styles.tripStatusCancelled,
              ]}>
                {formData.tripStatus === 'in_progress' ? ' IN PROGRESS' :
                 formData.tripStatus === 'completed' ? ' COMPLETED' :
                 formData.tripStatus === 'cancelled' ? ' CANCELLED' : ' UNKNOWN'}
              </Text>
            </Text>
            {formData.isTripStarted && formData.startLatitude && (
              <Text style={styles.tripStatusDetails}>
                Started at: {formData.startLatitude.toFixed(6)}, {formData.startLongitude.toFixed(6)}
              </Text>
            )}
          </View>
        )}

        {/* Vehicle Information */}
        <Text style={styles.sectionTitle}>Vehicle Information</Text>
        <View style={styles.sectionGroup}>
          {/* Date */}
          <FormInput
            label="Date :"
            value={formatDate(formData.date)}
            onPress={() => setIsDatePickerVisible(true)}
            error={errors.date}
            required
            editable={false}
            dropIcon="calendar"
          />

        {/* Vehicle */}
        <View style={[styles.sectionCard, styles.vehicleSection]}>
          <Text style={styles.fieldLabel}>Vehicle <Text style={{ color: 'red' }}>*</Text></Text>
          <Pressable
            style={[styles.selectBox, errors.vehicle ? styles.selectBoxError : null]}
            onPress={() => openDropdown('vehicle', dropdowns.vehicles)}
          >
            <Text style={[styles.selectBoxText, { color: formData.vehicle ? COLORS.black : COLORS.gray }]}>
              {formData.vehicle || 'Select vehicle'}
            </Text>
            <Text style={styles.selectBoxChevron}>▼</Text>
          </Pressable>
          {errors.vehicle && (
            <Text style={styles.errorText}>{errors.vehicle}</Text>
          )}
        </View>

          {/* Driver - Auto-filled when vehicle is selected */}
          <FormInput
            label="Driver :"
            value={formData.driver}
            onChangeText={(value) => handleInputChange('driver', value)}
            error={errors.driver}
            placeholder="Select vehicle to auto-fill"
            editable={false}
            style={{ backgroundColor: '#f5f5f5' }}
            required
          />

          {/* Plate Number - Auto-filled when vehicle is selected */}
          <FormInput
            label="Plate Number:"
            value={formData.plateNumber}
            onChangeText={(value) => handleInputChange('plateNumber', value)}
            error={errors.plateNumber}
            placeholder="Select vehicle to auto-fill"
            editable={false}
            style={{ backgroundColor: '#f5f5f5' }}
            required
          />
        </View>
        {/* Add Fuel toggle */}
        <View style={{ marginVertical: 8 }}>
          <Pressable
            onPress={handleToggleAddFuel}
            style={[styles.fuelToggle, showAddFuel ? styles.fuelToggleActive : styles.fuelToggleInactive]}
          >
            <Text style={[styles.fuelToggleText, showAddFuel ? styles.fuelToggleTextActive : styles.fuelToggleTextInactive]}>{showAddFuel ? 'Hide Add Fuel' : 'Add Fuel'}</Text>
          </Pressable>
        </View>

        {showAddFuel && (
          <View style={styles.fuelCard}>
            <View style={styles.fuelHeader}>
              <Text style={styles.fuelHeaderTitle}>Add Fuel Details</Text>
              <Text style={styles.fuelHeaderSubtitle}>Enter fuel details and upload images</Text>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.halfInput}>
                <FormInput
                  label="Fuel Amount"
                  value={formData.fuelAmount}
                  onChangeText={(value) => handleInputChange('fuelAmount', value)}
                  placeholder="Amount"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.halfInput}>
                <FormInput
                  label="Fuel Litre"
                  value={formData.fuelLitre}
                  onChangeText={(value) => handleInputChange('fuelLitre', value)}
                  placeholder="Litres"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <FormInput
              label="Current Odometer"
              value={formData.currentOdometer}
              onChangeText={(value) => handleInputChange('currentOdometer', value)}
              placeholder="Odometer reading"
              keyboardType="numeric"
            />

            <View style={styles.rowSpace}>
              <View style={styles.imageColumn}>
                <Pressable style={styles.smallButton} onPress={handleOdometerPicker}>
                  <Text style={styles.smallButtonText}>Odometer Image</Text>
                </Pressable>
                {formData.odometerImageUri ? (
                  <Text style={styles.fileNameText}>{String(formData.odometerImageUri).split('/').pop()}</Text>
                ) : (
                  <Text style={styles.fileNameText}>No image</Text>
                )}
                {formData.odometerImageUri ? <Image source={{ uri: formData.odometerImageUri }} style={styles.thumbImage} /> : null}
              </View>

              <View style={styles.imageColumn}>
                <Pressable style={styles.smallButton} onPress={handleFuelInvoicePicker}>
                  <Text style={styles.smallButtonText}>Fuel Invoice</Text>
                </Pressable>
                {formData.fuelInvoiceUri ? (
                  <Text style={styles.fileNameText}>{String(formData.fuelInvoiceUri).split('/').pop()}</Text>
                ) : (
                  <Text style={styles.fileNameText}>No invoice</Text>
                )}
                {formData.fuelInvoiceUri ? <Image source={{ uri: formData.fuelInvoiceUri }} style={styles.thumbImage} /> : null}
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.halfInput}>
                <FormInput
                  label="Fuel Latitude"
                  value={formData.start_latitude || formData.startLatitude || (currentCoords ? String(currentCoords.latitude) : '')}
                  onChangeText={(value) => handleInputChange('start_latitude', value)}
                  placeholder="Latitude"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.halfInput}>
                <FormInput
                  label="Fuel Longitude"
                  value={formData.start_longitude || formData.startLongitude || (currentCoords ? String(currentCoords.longitude) : '')}
                  onChangeText={(value) => handleInputChange('start_longitude', value)}
                  placeholder="Longitude"
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        )}
        


        {/* Route Details */}
        <Text style={styles.sectionTitle}>Route Details</Text>
        <View style={styles.sectionGroup}>
          {/* Started Location */}
          <FormInput
            label="Started Location:"
            value={currentLocationName || 'Fetching location...'}
            editable={false}
            style={{ backgroundColor: '#f5f5f5' }}
          />

          {/* Source */}
          <FormInput
            label="Source:"
            value={formData.source}
            onPress={isFieldDisabled('source') ? null : () => openDropdown('source', dropdowns.sourceLocations)}
            error={errors.source}
            dropIcon="chevron-down"
            required
            style={getFieldStyle('source')}
          />
          {/* Source Match Indicator */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, marginRight: 8 }}>Source Match:</Text>
            {sourceMatched === null ? (
              <Text style={{ color: COLORS.gray }}>Not verified</Text>
            ) : sourceMatched === true ? (
              <Text style={{ color: COLORS.green }}>✓ Verified ({sourceDistance ? Math.round(sourceDistance) + ' m' : ''})</Text>
            ) : (
              <Text style={{ color: '#B00020' }}>✗ Not verified ({sourceDistance ? Math.round(sourceDistance) + ' m' : ''})</Text>
            )}
            <Pressable onPress={verifySource} style={{ marginLeft: 12 }}>
              <Text style={{ color: COLORS.primaryThemeColor }}>Verify</Text>
            </Pressable>
          </View>

          {/* Destination */}
          <FormInput
            label="Destination:"
            value={formData.destination}
            onPress={isFieldDisabled('destination') ? null : () => openDropdown('destination', dropdowns.destinations)}
            error={errors.destination}
            dropIcon="chevron-down"
            required
            style={getFieldStyle('destination')}
          />

          {/* Estimated Time */}
          <FormInput
            label="Estimated Time:"
            value={formData.estimatedTime}
            onChangeText={(value) => handleInputChange('estimatedTime', value)}
            placeholder="Estimated time"
          />
        </View>

        {/* Trip Controls */}
        <Text style={styles.sectionTitle}>Trip Controls</Text>
        <View style={styles.sectionGroup}>
        {/* Start Trip */}
        <View style={styles.checkboxContainer}>
          <CheckBox
            label={formData.isTripStarted ? "Trip Started ✓" : "Start Trip"}
            checked={formData.startTrip}
            onPress={formData.isTripStarted ? null : (value) => handleStartTripToggle(value)}
          />
          {formData.isTripStarted && (
            <Text style={styles.tripStatusText}>
              Trip started - Location captured
            </Text>
          )}
        </View>

        {/* End Trip - Only show when trip is started */}
        {formData.isTripStarted && formData.tripStatus !== 'completed' && (
          <View style={styles.checkboxContainer}>
            <CheckBox
              label="End Trip"
              checked={formData.endTrip}
              onPress={(value) => handleInputChange('endTrip', value)}
            />
            {formData.endTrip && (
              <Text style={styles.tripStatusText}>
                End trip and capture final location
              </Text>
            )}
          </View>
        )}

        {/* Cancel Trip - Only show when trip is started */}
        {formData.isTripStarted && formData.tripStatus !== 'completed' && (
          <View style={styles.checkboxContainer}>
            <CheckBox
              label="Cancel Trip"
              checked={formData.cancelTrip}
              onPress={(value) => {
                handleInputChange('cancelTrip', value);
                if (value) {
                  handleCancelTrip();
                }
              }}
            />
            {formData.cancelTrip && (
              <Text style={styles.tripStatusText}>
                Trip will be cancelled
              </Text>
            )}
          </View>
        )}
        </View>

        {/* Odometer & Timing */}
        <Text style={styles.sectionTitle}>Odometer & Timing</Text>
        <View style={styles.sectionGroup}>
          {/* Start KM */}
          <FormInput
            label="Start KM :"
            value={formData.startKM}
            onChangeText={(value) => handleInputChange('startKM', value)}
            placeholder="Start KM"
            keyboardType="numeric"
            editable={formData.tripStatus !== 'in_progress'}
          />

          {/* Start Time */}
          <FormInput
            label="Start Time :"
            value={formatDateTime(formData.startTime)}
            onPress={() => setIsStartTimePickerVisible(true)}
            editable={false}
          />

          {/* End KM */}
          <FormInput
            label="End KM :"
            value={formData.endKM}
            onChangeText={(value) => handleInputChange('endKM', value)}
            keyboardType="numeric"
          />

          {/* End Time */}
          <FormInput
            label="End Time :"
            value={formatDateTime(formData.endTime)}
            onPress={() => setIsEndTimePickerVisible(true)}
            editable={false}
          />

          {/* Travelled KM */}
          <FormInput
            label="Travelled KM :"
            value={formData.travelledKM}
            editable={false}
            style={styles.readOnlyInput}
          />
        </View>

        {/* Trip Details */}
        <Text style={styles.sectionTitle}>Trip Details</Text>
        <View style={styles.sectionGroup}>
          {/* Purpose of Visit */}
          <FormInput
            label="Purpose of Visit:"
            value={purposeOfVisit}
            onPress={() => openDropdown('purposeOfVisit', dropdowns.purposesOfVisit)}
            dropIcon="chevron-down"
            placeholder="Select purpose of visit"
            required
          />

          {/* Invoice Numbers */}
          <View style={styles.inputWithIconContainer}>
            <View style={styles.inputWrapper}>
              <FormInput
                label="Invoice Numbers :"
                value={formData.invoiceNumbers}
                onChangeText={(value) => handleInputChange('invoiceNumbers', value)}
                placeholder="Invoice numbers"
              />
            </View>
            <Pressable
              style={styles.qrIconButton}
              onPress={() => {
                navigation.navigate('InvoiceScannerScreen', {
                  onScan: async (scannedData) => {
                    try {
                      let invoiceId;
                      const urlMatch = scannedData.match(/\/customer-invoices\/(\d+)/);
                      if (urlMatch) {
                        invoiceId = parseInt(urlMatch[1], 10);
                      } else {
                        invoiceId = parseInt(scannedData, 10);
                      }
                      if (isNaN(invoiceId) || invoiceId <= 0) {
                        showToastMessage('Invalid QR code. Expected an invoice ID or URL.');
                        return;
                      }
                      const invoice = await fetchInvoiceByIdOdoo(invoiceId);
                      if (invoice) {
                        handleInputChange('invoiceNumbers', invoice.name || String(invoiceId));
                        if (invoice.amount_total) {
                          handleInputChange('amount', String(invoice.amount_total));
                        }
                        showToastMessage('Invoice details filled successfully');
                      } else {
                        showToastMessage('No invoice found for this QR code');
                      }
                    } catch (error) {
                      showToastMessage(`Error fetching invoice: ${error.message}`);
                    }
                  },
                });
              }}
            >
              <MaterialCommunityIcons name="barcode-scan" size={22} color="#fff" />
            </Pressable>
          </View>

          {/* Amount */}
          <FormInput
            label="Amount :"
            value={formData.amount}
            onChangeText={(value) => handleInputChange('amount', value)}
            keyboardType="numeric"
          />
        </View>

        {/* Pre-Trip Checklist */}
        <Text style={styles.sectionTitle}>Pre-Trip Checklist</Text>
        <View style={styles.checklistContainer}>
          <CheckBox
            label="Coolent Water"
            checked={formData.vehicleChecklist?.coolentWater ?? false}
            onPress={(value) => handleChecklistChange('coolentWater', value)}
            editable={formData.tripStatus === 'not_started'}
          />
          <CheckBox
            label="Oil checking"
            checked={formData.vehicleChecklist?.oilChecking ?? false}
            onPress={(value) => handleChecklistChange('oilChecking', value)}
            editable={formData.tripStatus === 'not_started'}
          />
          <CheckBox
            label="Tyre checking"
            checked={formData.vehicleChecklist?.tyreChecking ?? false}
            onPress={(value) => handleChecklistChange('tyreChecking', value)}
            editable={formData.tripStatus === 'not_started'}
          />
          <CheckBox
            label="Battery checking"
            checked={formData.vehicleChecklist?.batteryChecking ?? false}
            onPress={(value) => handleChecklistChange('batteryChecking', value)}
            editable={formData.tripStatus === 'not_started'}
          />
          <CheckBox
            label="Fuel checking"
            checked={formData.vehicleChecklist?.fuelChecking ?? false}
            onPress={(value) => handleChecklistChange('fuelChecking', value)}
            editable={formData.tripStatus === 'not_started'}
          />
          <CheckBox
            label="Daily Checks"
            checked={formData.vehicleChecklist?.dailyChecks ?? false}
            onPress={(value) => handleChecklistChange('dailyChecks', value)}
            editable={formData.tripStatus === 'not_started'}
          />
        </View>

        {/* Notes & Attachments */}
        <Text style={styles.sectionTitle}>Notes & Attachments</Text>
        <View style={styles.sectionGroup}>
          {/* Remarks */}
          <FormInput
            label="Remarks :"
            value={formData.remarks}
            onChangeText={(value) => handleInputChange('remarks', value)}
            placeholder="Enter remarks"
            multiline
            numberOfLines={4}
            style={styles.remarksInput}
          />

          {/* Image Upload Button */}
          <View style={styles.imageUploadContainer}>
            <Pressable style={[
              styles.imagePickerButton,
              formData.imageUri && styles.imagePickerButtonSelected
            ]} onPress={handleImagePicker}>
              <Text style={styles.imagePickerIcon}>
                {formData.imageUri ? '✓' : '📷'}
              </Text>
              <Text style={styles.imagePickerText}>
                {formData.imageUri ? '✓' : '+'}
              </Text>
            </Pressable>
            {formData.imageUri && (
              <Text style={styles.imageSelectedText}>Image selected</Text>
            )}
          </View>
        </View>

        {/* Submit Button */}
        <LoadingButton
          title={
            formData.endTrip && formData.isTripStarted 
              ? "End Trip" 
              : formData.startTrip && !formData.isTripStarted
              ? "Start Trip"
              : isEditMode && formData.isTripStarted
              ? "Update Trip"
              : "Submit"
          }
          onPress={handleSubmit}
          loading={isSubmitting}
          style={styles.submitButton}
        />
      </RoundedScrollContainer>

      {/* Date Picker */}
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={(date) => {
          handleInputChange('date', date);
          setIsDatePickerVisible(false);
        }}
        onCancel={() => setIsDatePickerVisible(false)}
      />

      {/* Start Time Picker */}
      <DateTimePickerModal
        isVisible={isStartTimePickerVisible}
        mode="datetime"
        onConfirm={(time) => {
          handleInputChange('startTime', time);
          setIsStartTimePickerVisible(false);
        }}
        onCancel={() => setIsStartTimePickerVisible(false)}
      />

      {/* End Time Picker */}
      <DateTimePickerModal
        isVisible={isEndTimePickerVisible}
        mode="datetime"
        onConfirm={(time) => {
          handleInputChange('endTime', time);
          setIsEndTimePickerVisible(false);
        }}
        onCancel={() => setIsEndTimePickerVisible(false)}
      />

      {/* Dropdown Modal (in-file) */}
      <Modal
        visible={isVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <FlatList
              data={selectedType?.data || []}
              keyExtractor={(item) => item._id?.toString() || item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => handleDropdownSelect(selectedType?.type, item)}
                >
                  <Text style={styles.modalItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.modalEmpty}>No items</Text>}
            />
            <Pressable style={styles.modalCancel} onPress={() => setIsVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <OverlayLoader visible={isLoading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.primaryThemeColor,
    marginTop: 20,
    marginBottom: 10,
  },

  sectionGroup: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border || '#E6E6E6',
  },
  vehicleSection: {
    marginTop: 10,
  },
  checkboxContainer: {
    marginVertical: 5,
  },
  checklistContainer: {
    backgroundColor: COLORS.lightGray,
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border || '#E0E0E0',
  },
  readOnlyInput: {
    backgroundColor: COLORS.lightGray,
  },
  remarksInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 30,
  },
  imageUploadContainer: {
    marginVertical: 15,
    alignItems: 'flex-start',
  },
  imagePickerButton: {
    width: 80,
    height: 80,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imagePickerButtonSelected: {
    backgroundColor: '#2E7D32',
  },
  imageSelectedText: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  imagePickerIcon: {
    fontSize: 24,
    color: 'white',
    position: 'absolute',
    top: 8,
    right: 8,
  },
  imagePickerText: {
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold',
  },
  inputWithIconContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 15,
  },
  inputWrapper: {
    flex: 1,
    marginRight: 10,
  },
  qrIconButton: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  tripStatusText: {
    fontSize: 12,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 5,
    fontStyle: 'italic',
  },
  disabledInput: {
    backgroundColor: COLORS.lightGray,
    opacity: 0.6,
  },
  tripActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 15,
    paddingHorizontal: 20,
  },
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.red || '#FF6B6B',
    borderWidth: 1,
    borderColor: COLORS.red || '#FF6B6B',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  tripStatusIndicator: {
    backgroundColor: COLORS.lightGray || '#F5F5F5',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primaryThemeColor,
  },
  tripStatusTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.black,
    marginBottom: 5,
  },
  tripStatusValue: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  tripStatusInProgress: {
    color: COLORS.primaryThemeColor || '#007AFF',
  },
  tripStatusCompleted: {
    color: COLORS.green || '#28A745',
  },
  tripStatusCancelled: {
    color: COLORS.red || '#DC3545',
  },
  tripStatusDetails: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.gray || '#666666',
    marginTop: 2,
  },
  fuelToggle: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  fuelToggleActive: {
    backgroundColor: COLORS.primaryThemeColor,
  },
  fuelToggleInactive: {
    backgroundColor: COLORS.lightGray,
  },
  fuelToggleTextActive: {
    color: '#fff',
  },
  fuelToggleTextInactive: {
    color: COLORS.black,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border || '#E6E6E6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginBottom: 6,
    color: COLORS.black,
  },
  selectBox: {
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectBoxError: {
    borderWidth: 1,
    borderColor: 'red',
  },
  selectBoxText: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  selectBoxChevron: {
    fontSize: 18,
    color: COLORS.gray,
    marginLeft: 8,
  },
  errorText: {
    color: 'red',
    fontSize: 12,
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: COLORS.primaryThemeColor,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  fuelToggleText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  fuelCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border || '#E6E6E6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  fuelHeader: {
    marginBottom: 8,
  },
  fuelHeaderTitle: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.black,
  },
  fuelHeaderSubtitle: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.gray,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  rowSpace: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  imageColumn: {
    flex: 1,
    alignItems: 'flex-start',
    marginRight: 8,
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 6,
  },
  smallButtonText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 13,
  },
  thumbImage: {
    width: 80,
    height: 80,
    marginTop: 8,
    borderRadius: 6,
    resizeMode: 'cover',
  },
  fileNameText: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.gray,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    maxHeight: '50%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  modalItem: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border || '#E0E0E0',
  },
  modalItemText: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.black,
  },
  modalEmpty: {
    padding: 20,
    textAlign: 'center',
    color: COLORS.gray,
  },
  modalCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
});

export default VehicleTrackingForm;