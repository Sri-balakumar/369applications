import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Platform, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import AnimatedLoader from '@components/Loader/AnimatedLoader';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { getLastKnownLocation, getCurrentLocationWithAddress } from '@services/LocationTrackingService';
import moment from 'moment';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.01;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const REFRESH_INTERVAL = 5000; // Refresh every 5 seconds

// Default location (India) - used as fallback
const DEFAULT_LOCATION = {
  latitude: 20.5937,
  longitude: 78.9629,
};

// Generate OpenStreetMap HTML with Leaflet (FREE - no API key needed)
// This HTML is loaded once and marker is updated via JavaScript injection
const generateMapHTML = (latitude, longitude, locationName) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; }
        #map { width: 100%; height: 100vh; }
        .custom-marker {
          background: #4285F4;
          border: 3px solid white;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        .pulse {
          background: rgba(66, 133, 244, 0.3);
          border-radius: 50%;
          height: 40px;
          width: 40px;
          position: absolute;
          left: -10px;
          top: -10px;
          animation: pulse 2s ease-out infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map').setView([${latitude}, ${longitude}], 16);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        var pulseIcon = L.divIcon({
          className: 'pulse-marker',
          html: '<div class="pulse"></div><div class="custom-marker"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          popupAnchor: [0, -10]
        });

        var marker = L.marker([${latitude}, ${longitude}], {icon: pulseIcon}).addTo(map);
        marker.bindPopup("<b>My Location</b><br>${locationName || 'Current Position'}");

        // Function to update marker position (called from React Native)
        function updateMarker(lat, lng, name) {
          marker.setLatLng([lat, lng]);
          marker.setPopupContent("<b>My Location</b><br>" + (name || 'Current Position'));
        }

        // Function to center map on location
        function centerMap(lat, lng) {
          map.setView([lat, lng], 16);
        }
      </script>
    </body>
    </html>
  `;
};

const MyLocation = ({ navigation }) => {
  const mapRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const mapLoaded = useRef(false);

  // Generate HTML only once using default location (useRef prevents re-renders)
  // Marker will be updated via JavaScript injection after map loads
  const mapHTML = useRef(generateMapHTML(
    DEFAULT_LOCATION.latitude,
    DEFAULT_LOCATION.longitude,
    ''
  )).current;

  // Update marker position without reloading the map
  const updateMarkerPosition = (newLocation) => {
    if (mapRef.current && mapLoaded.current && newLocation) {
      mapRef.current.injectJavaScript(`
        updateMarker(${newLocation.latitude}, ${newLocation.longitude}, "${newLocation.locationName || ''}");
        true;
      `);
    }
  };

  // Center map on new location
  const centerMapOnLocation = (newLocation) => {
    if (mapRef.current && mapLoaded.current && newLocation) {
      mapRef.current.injectJavaScript(`
        centerMap(${newLocation.latitude}, ${newLocation.longitude});
        true;
      `);
    }
  };

  const fetchMyLocation = async (isFirstLoad = false) => {
    try {
      // First try to get fresh location
      const freshLocation = await getCurrentLocationWithAddress();
      if (freshLocation) {
        setLocation(freshLocation);
        setLastUpdated(new Date());

        // Update marker position (without reloading map)
        updateMarkerPosition(freshLocation);

        // Center map only on first load
        if (isFirstLoad) {
          centerMapOnLocation(freshLocation);
        }
      } else {
        // Fall back to last known location
        const lastKnown = await getLastKnownLocation();
        if (lastKnown) {
          setLocation(lastKnown);
          setLastUpdated(lastKnown.timestamp ? new Date(lastKnown.timestamp) : new Date());
          updateMarkerPosition(lastKnown);
          if (isFirstLoad) {
            centerMapOnLocation(lastKnown);
          }
        }
      }
    } catch (error) {
      console.error('[MyLocation] Error fetching location:', error);
      // Try to get last known location on error
      const lastKnown = await getLastKnownLocation();
      if (lastKnown) {
        setLocation(lastKnown);
        setLastUpdated(lastKnown.timestamp ? new Date(lastKnown.timestamp) : new Date());
        updateMarkerPosition(lastKnown);
        if (isFirstLoad) {
          centerMapOnLocation(lastKnown);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // First load - center map on location
    fetchMyLocation(true);

    // Set up auto-refresh (marker only updates, no reload)
    const interval = setInterval(() => {
      fetchMyLocation(false);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Unknown';
    return moment(lastUpdated).fromNow();
  };

  // Center map on current location
  const centerOnLocation = () => {
    if (mapRef.current && mapLoaded.current && location) {
      // Inject JavaScript to center the map
      mapRef.current.injectJavaScript(`
        centerMap(${location.latitude}, ${location.longitude});
        true;
      `);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <NavigationHeader
          title="My Location"
          logo={false}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <AnimatedLoader
            visible={true}
            animationSource={require('@assets/animations/loading.json')}
          />
          <Text style={styles.loadingText}>Getting your location...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!location) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <NavigationHeader
          title="My Location"
          logo={false}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.errorContainer}>
          <MaterialIcons name="location-off" size={64} color="#999" />
          <Text style={styles.errorText}>Unable to get your location</Text>
          <Text style={styles.errorSubText}>Please ensure location services are enabled</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.fullScreen}>
      {/* Full Screen Map using OpenStreetMap (FREE) */}
      <WebView
        ref={mapRef}
        style={styles.fullScreenMap}
        source={{ html: mapHTML }}
        scrollEnabled={false}
        onLoad={() => {
          // Small delay to ensure Leaflet JS is fully initialized
          setTimeout(() => {
            mapLoaded.current = true;
            // Update marker AND center map to current location after map loads
            if (location) {
              updateMarkerPosition(location);
              centerMapOnLocation(location);
            }
          }, 500);
        }}
        onError={(e) => console.log('WebView error:', e)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        cacheEnabled={true}
      />

      {/* Back Button Overlay */}
      <View style={styles.headerOverlay}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Location</Text>
      </View>

      {/* My Location Button (like Google Maps) */}
      <TouchableOpacity
        style={styles.myLocationButton}
        onPress={centerOnLocation}
      >
        <MaterialIcons name="my-location" size={24} color={COLORS.primaryThemeColor} />
      </TouchableOpacity>

      {/* Location Info Card at Bottom */}
      <View style={styles.infoCard}>
        <View style={styles.cardHandle} />

        <View style={styles.infoHeader}>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Text style={styles.updatedText}>Updated {formatLastUpdated()}</Text>
        </View>

        {location.locationName ? (
          <View style={styles.addressContainer}>
            <MaterialIcons name="place" size={24} color={COLORS.primaryThemeColor} />
            <Text style={styles.addressText} numberOfLines={2}>{location.locationName}</Text>
          </View>
        ) : null}

        <View style={styles.coordsContainer}>
          <View style={styles.coordItem}>
            <Text style={styles.coordLabel}>Latitude</Text>
            <Text style={styles.coordValue}>{location.latitude?.toFixed(6)}</Text>
          </View>
          <View style={styles.coordDivider} />
          <View style={styles.coordItem}>
            <Text style={styles.coordLabel}>Longitude</Text>
            <Text style={styles.coordValue}>{location.longitude?.toFixed(6)}</Text>
          </View>
          {location.accuracy ? (
            <>
              <View style={styles.coordDivider} />
              <View style={styles.coordItem}>
                <Text style={styles.coordLabel}>Accuracy</Text>
                <Text style={styles.coordValue}>{location.accuracy?.toFixed(0)}m</Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
};

export default MyLocation;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  fullScreen: {
    flex: 1,
  },
  fullScreenMap: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 16,
    color: '#666',
    marginTop: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 18,
    color: '#333',
    marginTop: 16,
  },
  errorSubText: {
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  // Header overlay
  headerOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      android: {
        elevation: 4,
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
    }),
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 18,
    color: '#333',
    marginLeft: 16,
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    ...Platform.select({
      android: {
        elevation: 4,
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
    }),
  },
  // My location button (like Google Maps)
  myLocationButton: {
    position: 'absolute',
    right: 16,
    bottom: 220,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      android: {
        elevation: 6,
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
    }),
  },
  // Marker styles
  markerContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(66, 133, 244, 0.3)',
  },
  markerDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4285F4',
    borderWidth: 3,
    borderColor: 'white',
  },
  // Info card at bottom
  infoCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    ...Platform.select({
      android: {
        elevation: 16,
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
    }),
  },
  cardHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 16,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  liveText: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 12,
    color: '#4CAF50',
  },
  updatedText: {
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 12,
    color: '#888',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  addressText: {
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    flex: 1,
    lineHeight: 22,
  },
  coordsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  coordItem: {
    alignItems: 'center',
    flex: 1,
  },
  coordLabel: {
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  coordValue: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 14,
    color: '#333',
  },
  coordDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e0e0e0',
  },
});
