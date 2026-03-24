// src/services/LocationTrackingService.js
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { AppState } from 'react-native';
import ODOO_BASE_URL from '@api/config/odooConfig';

const LOCATION_UPDATE_INTERVAL = 30000; // 30 seconds
const BACKGROUND_LOCATION_TASK = 'background-location-task';

let locationInterval = null;
let currentTrackingUserId = null;
let appStateSubscription = null;
let lastAppState = 'active';

// Get Odoo auth headers
const getOdooAuthHeaders = async () => {
  const cookie = await AsyncStorage.getItem('odoo_cookie');
  return {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
  };
};

// Format date for Odoo (YYYY-MM-DD HH:MM:SS)
const formatDateForOdoo = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Save location to Odoo
export const saveUserLocationToOdoo = async (userId, locationData) => {
  console.log('[LocationTracking] === SAVING LOCATION TO ODOO ===');
  console.log('[LocationTracking] User ID:', userId);
  console.log('[LocationTracking] Location Data:', JSON.stringify(locationData, null, 2));

  try {
    const headers = await getOdooAuthHeaders();
    console.log('[LocationTracking] Auth headers:', JSON.stringify(headers, null, 2));

    // First, check if user already has a location record
    console.log('[LocationTracking] Searching for existing record...');
    const searchResponse = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'user.location',
          method: 'search_read',
          args: [[['user_id', '=', userId]]],
          kwargs: {
            fields: ['id'],
            limit: 1,
          },
        },
      },
      { headers }
    );

    console.log('[LocationTracking] Search response:', JSON.stringify(searchResponse.data, null, 2));

    const existingRecords = searchResponse.data?.result || [];

    const locationPayload = {
      user_id: userId,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      location_name: locationData.locationName || '',
      last_updated: formatDateForOdoo(new Date()),
      accuracy: locationData.accuracy || 0,
    };

    console.log('[LocationTracking] Location payload:', JSON.stringify(locationPayload, null, 2));

    if (existingRecords.length > 0) {
      // Update existing record
      console.log('[LocationTracking] Updating existing record ID:', existingRecords[0].id);
      const updateResponse = await axios.post(
        `${ODOO_BASE_URL}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'user.location',
            method: 'write',
            args: [[existingRecords[0].id], locationPayload],
            kwargs: {},
          },
        },
        { headers }
      );
      console.log('[LocationTracking] ✅ UPDATE SUCCESS:', JSON.stringify(updateResponse.data, null, 2));
    } else {
      // Create new record
      console.log('[LocationTracking] Creating NEW record...');
      const createResponse = await axios.post(
        `${ODOO_BASE_URL}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'user.location',
            method: 'create',
            args: [locationPayload],
            kwargs: {},
          },
        },
        { headers }
      );
      console.log('[LocationTracking] ✅ CREATE SUCCESS:', JSON.stringify(createResponse.data, null, 2));
    }

    console.log('[LocationTracking] =============================');
    return true;
  } catch (error) {
    console.error('[LocationTracking] ❌ ERROR saving location to Odoo:', error?.message || error);
    if (error.response) {
      console.error('[LocationTracking] Error response data:', JSON.stringify(error.response.data, null, 2));
      console.error('[LocationTracking] Error response status:', error.response.status);
    }
    console.log('[LocationTracking] =============================');
    return false;
  }
};

// Fetch user's current location from Odoo
export const fetchUserLocationFromOdoo = async (userId) => {
  console.log('[LocationTracking] Fetching location for user ID:', userId);
  console.log('[LocationTracking] Odoo URL:', ODOO_BASE_URL);

  try {
    const headers = await getOdooAuthHeaders();
    console.log('[LocationTracking] Request headers:', JSON.stringify(headers, null, 2));

    const requestBody = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'user.location',
        method: 'search_read',
        args: [[['user_id', '=', userId]]],
        kwargs: {
          fields: ['id', 'user_id', 'latitude', 'longitude', 'location_name', 'last_updated', 'accuracy'],
          limit: 1,
        },
      },
    };
    console.log('[LocationTracking] Request body:', JSON.stringify(requestBody, null, 2));

    const response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      requestBody,
      { headers }
    );

    console.log('[LocationTracking] Response:', JSON.stringify(response.data, null, 2));

    const locations = response.data?.result || [];
    if (locations.length > 0) {
      const loc = locations[0];
      const result = {
        userId: loc.user_id?.[0] || userId,
        userName: loc.user_id?.[1] || '',
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationName: loc.location_name || '',
        lastUpdated: loc.last_updated,
        accuracy: loc.accuracy || 0,
      };
      console.log('[LocationTracking] Parsed location:', JSON.stringify(result, null, 2));
      return result;
    }
    console.log('[LocationTracking] No location records found for user:', userId);
    return null;
  } catch (error) {
    console.error('[LocationTracking] Error fetching location from Odoo:', error?.message || error);
    if (error.response) {
      console.error('[LocationTracking] Error response:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
};

// Fetch all users' locations from Odoo
export const fetchAllUsersLocationsFromOdoo = async () => {
  try {
    const headers = await getOdooAuthHeaders();

    const response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'user.location',
          method: 'search_read',
          args: [[]],
          kwargs: {
            fields: ['id', 'user_id', 'latitude', 'longitude', 'location_name', 'last_updated', 'accuracy'],
            order: 'last_updated desc',
          },
        },
      },
      { headers }
    );

    const locations = response.data?.result || [];
    return locations.map(loc => ({
      userId: loc.user_id?.[0],
      userName: loc.user_id?.[1] || '',
      latitude: loc.latitude,
      longitude: loc.longitude,
      locationName: loc.location_name || '',
      lastUpdated: loc.last_updated,
      accuracy: loc.accuracy || 0,
    }));
  } catch (error) {
    console.error('[LocationTracking] Error fetching all locations from Odoo:', error?.message || error);
    return [];
  }
};

// Get current location with reverse geocoding
export const getCurrentLocationWithAddress = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[LocationTracking] Permission denied');
      return null;
    }

    // Use highest accuracy for best GPS precision
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      mayShowUserSettingsDialog: true,
    });

    let locationName = '';
    try {
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (reverseGeocode && reverseGeocode.length > 0) {
        const address = reverseGeocode[0];
        const addressParts = [
          address.name,
          address.street,
          address.city,
          address.region,
        ].filter(Boolean);
        locationName = addressParts.join(', ');
      }
    } catch (e) {
      console.log('[LocationTracking] Reverse geocode failed:', e?.message);
    }

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      locationName,
      timestamp: location.timestamp,
    };
  } catch (error) {
    console.error('[LocationTracking] Error getting location:', error?.message || error);
    return null;
  }
};

// Define the background location task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[LocationTracking] Background task error:', error);
    return;
  }

  if (data) {
    const { locations } = data;
    const location = locations[0];

    if (location) {
      console.log('[LocationTracking] 📍 BACKGROUND location received:', location.coords.latitude, location.coords.longitude);

      // Get stored user ID
      const storedUserId = await AsyncStorage.getItem('tracking_user_id');

      if (storedUserId) {
        const locationData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          locationName: '', // Skip reverse geocoding in background for efficiency
          timestamp: location.timestamp,
        };

        await saveUserLocationToOdoo(parseInt(storedUserId), locationData);
        console.log('[LocationTracking] ✅ Background location saved to Odoo');
      }
    }
  }
});

// Handle app state changes - send location when app comes to foreground
const handleAppStateChange = async (nextAppState) => {
  console.log('[LocationTracking] App state changed:', lastAppState, '->', nextAppState);

  // When app comes back to foreground from background
  if (lastAppState.match(/inactive|background/) && nextAppState === 'active') {
    console.log('[LocationTracking] App returned to foreground - sending location');
    try {
      const location = await getCurrentLocationWithAddress();
      if (location && currentTrackingUserId) {
        await saveUserLocationToOdoo(currentTrackingUserId, location);
        console.log('[LocationTracking] Location sent on foreground return');
      }
    } catch (error) {
      console.error('[LocationTracking] Error sending location on foreground:', error?.message);
    }
  }

  lastAppState = nextAppState;
};

// Check if background location is available (not in Expo Go)
const isBackgroundLocationAvailable = async () => {
  try {
    const isTaskDefined = TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);
    return isTaskDefined;
  } catch (error) {
    console.log('[LocationTracking] Background location not available (Expo Go?):', error?.message);
    return false;
  }
};

// Start location tracking (background + foreground)
export const startLocationTracking = async (userId) => {
  try {
    // Request foreground permission
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('[LocationTracking] Foreground permission denied');
      return false;
    }

    // Store user ID for tracking
    currentTrackingUserId = userId;
    await AsyncStorage.setItem('tracking_user_id', userId.toString());

    // Get initial location and save to Odoo
    const initialLocation = await getCurrentLocationWithAddress();
    if (initialLocation) {
      await saveUserLocationToOdoo(userId, initialLocation);
    }

    // Stop any existing tracking
    await stopLocationTracking();

    // Try to start background location tracking
    let backgroundStarted = false;
    try {
      // Request background permission
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

      if (backgroundStatus === 'granted') {
        // Check if background location task is available (not in Expo Go)
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);

        if (!hasStarted) {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: LOCATION_UPDATE_INTERVAL,
            distanceInterval: 50, // Update every 50 meters
            deferredUpdatesInterval: LOCATION_UPDATE_INTERVAL,
            foregroundService: {
              notificationTitle: 'Location Tracking Active',
              notificationBody: 'Your location is being tracked for staff monitoring',
              notificationColor: '#007AFF',
            },
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
          });
          backgroundStarted = true;
          console.log('[LocationTracking] ✅ BACKGROUND tracking started');
        }
      } else {
        console.log('[LocationTracking] Background permission denied');
      }
    } catch (bgError) {
      console.log('[LocationTracking] Background tracking not available:', bgError?.message);
      console.log('[LocationTracking] Falling back to foreground-only tracking');
    }

    // Setup AppState listener for foreground detection
    if (appStateSubscription) {
      appStateSubscription.remove();
    }
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    lastAppState = AppState.currentState;

    // Start foreground interval as fallback/supplement
    if (locationInterval) {
      clearInterval(locationInterval);
    }

    locationInterval = setInterval(async () => {
      try {
        // Only update if app is active
        if (AppState.currentState === 'active') {
          const location = await getCurrentLocationWithAddress();
          if (location && currentTrackingUserId) {
            console.log('[LocationTracking] Foreground location update:', location.latitude, location.longitude);
            await saveUserLocationToOdoo(currentTrackingUserId, location);
          }
        }
      } catch (error) {
        console.error('[LocationTracking] Error updating location:', error?.message || error);
      }
    }, LOCATION_UPDATE_INTERVAL);

    if (backgroundStarted) {
      console.log('[LocationTracking] ✅ Started BACKGROUND + FOREGROUND tracking for user:', userId);
      console.log('[LocationTracking] Location updates every 30 seconds, even when app is minimized');
    } else {
      console.log('[LocationTracking] ⚠️ Started FOREGROUND-ONLY tracking for user:', userId);
      console.log('[LocationTracking] Updates every 30 seconds (only while app is open)');
      console.log('[LocationTracking] For background tracking, use a development build');
    }

    return true;
  } catch (error) {
    console.error('[LocationTracking] Error starting tracking:', error?.message || error);
    return false;
  }
};

// Stop location tracking
export const stopLocationTracking = async () => {
  try {
    // Stop foreground interval
    if (locationInterval) {
      clearInterval(locationInterval);
      locationInterval = null;
      console.log('[LocationTracking] Stopped foreground interval');
    }

    // Remove AppState listener
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
      console.log('[LocationTracking] Removed AppState listener');
    }

    // Stop background location updates
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log('[LocationTracking] Stopped background location updates');
      }
    } catch (bgError) {
      console.log('[LocationTracking] No background task to stop:', bgError?.message);
    }

    // Clear stored user ID
    await AsyncStorage.removeItem('tracking_user_id');
    currentTrackingUserId = null;

    console.log('[LocationTracking] ✅ Stopped all tracking');
    return true;
  } catch (error) {
    console.error('[LocationTracking] Error stopping tracking:', error?.message || error);
    return false;
  }
};

// Check if tracking is active
export const isTrackingActive = async () => {
  try {
    const hasBackgroundStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    return hasBackgroundStarted || locationInterval !== null;
  } catch (error) {
    return locationInterval !== null;
  }
};

// Get last known location (fetches from Odoo)
export const getLastKnownLocation = async () => {
  if (currentTrackingUserId) {
    return await fetchUserLocationFromOdoo(currentTrackingUserId);
  }
  return null;
};

export default {
  startLocationTracking,
  stopLocationTracking,
  isTrackingActive,
  getCurrentLocationWithAddress,
  getLastKnownLocation,
  saveUserLocationToOdoo,
  fetchUserLocationFromOdoo,
  fetchAllUsersLocationsFromOdoo,
};
