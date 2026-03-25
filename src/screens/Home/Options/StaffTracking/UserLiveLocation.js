import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchUserLocationFromOdoo } from '@services/LocationTrackingService';
import moment from 'moment';

const REFRESH_INTERVAL = 10000; // Refresh every 10 seconds

// Default location (India) - used as fallback
const DEFAULT_LOCATION = {
  latitude: 20.5937,
  longitude: 78.9629,
};

// Generate OpenStreetMap HTML with Leaflet (FREE - no API key needed)
const generateMapHTML = (latitude, longitude, userName) => {
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
        .marker-container {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .marker-pin {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .custom-marker {
          background: ${COLORS.primaryThemeColor};
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
        .marker-label {
          background: white;
          padding: 4px 8px;
          border-radius: 6px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 12px;
          font-weight: 600;
          color: #333;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          white-space: nowrap;
          margin-top: 8px;
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

        var markerIcon = L.divIcon({
          className: 'marker-container',
          html: '<div class="marker-pin"><div class="pulse"></div><div class="custom-marker"></div></div><div class="marker-label" id="marker-name">${userName}</div>',
          iconSize: [100, 60],
          iconAnchor: [50, 30],
          popupAnchor: [0, -30]
        });

        var marker = L.marker([${latitude}, ${longitude}], {icon: markerIcon}).addTo(map);
        marker.bindPopup("<b>${userName}</b><br>Current Location");

        // Function to update marker position and name (called from React Native)
        function updateMarker(lat, lng, name) {
          marker.setLatLng([lat, lng]);
          // Update the name label
          var nameLabel = document.getElementById('marker-name');
          if (nameLabel) {
            nameLabel.textContent = name;
          }
          marker.setPopupContent("<b>" + name + "</b><br>Current Location");
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

const UserLiveLocation = ({ navigation, route }) => {
  const { user } = route.params;
  const mapRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const mapLoaded = useRef(false);

  // Generate HTML only once using default location (useRef prevents re-renders)
  const mapHTML = useRef(generateMapHTML(
    DEFAULT_LOCATION.latitude,
    DEFAULT_LOCATION.longitude,
    user.name || 'User'
  )).current;

  // Log user data on mount
  useEffect(() => {
    console.log('=== UserLiveLocation Screen ===');
    console.log('User received:', JSON.stringify(user, null, 2));
    console.log('===============================');
  }, []);

  // Update marker position without reloading the map
  const updateMarkerPosition = (newLocation) => {
    if (mapRef.current && mapLoaded.current && newLocation) {
      mapRef.current.injectJavaScript(`
        updateMarker(${newLocation.latitude}, ${newLocation.longitude}, "${user.name}");
        true;
      `);
    }
  };

  // Center map on location
  const centerMapOnLocation = (newLocation) => {
    if (mapRef.current && mapLoaded.current && newLocation) {
      mapRef.current.injectJavaScript(`
        centerMap(${newLocation.latitude}, ${newLocation.longitude});
        true;
      `);
    }
  };

  const fetchLocation = async (isFirstLoad = false) => {
    console.log('--- Fetching Location from Odoo ---');
    console.log('User ID:', user.id);
    try {
      const locationData = await fetchUserLocationFromOdoo(user.id);
      console.log('Location Response:', JSON.stringify(locationData, null, 2));

      if (locationData && locationData.latitude && locationData.longitude) {
        console.log('Location Found:');
        console.log('  Latitude:', locationData.latitude);
        console.log('  Longitude:', locationData.longitude);
        console.log('  Location Name:', locationData.locationName);
        console.log('  Last Updated:', locationData.lastUpdated);
        console.log('  Accuracy:', locationData.accuracy);

        setLocation(locationData);
        setLastUpdated(locationData.lastUpdated);
        setError(null);

        // Update marker position (without reloading map)
        updateMarkerPosition(locationData);

        // Center map only on first load
        if (isFirstLoad) {
          centerMapOnLocation(locationData);
        }
      } else {
        console.log('No location data available for user:', user.id);
        setError('No location data available for this user');
      }
    } catch (err) {
      console.error('Error fetching location:', err);
      setError('Failed to fetch location');
    } finally {
      setLoading(false);
      console.log('-----------------------------------');
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchLocation(true); // Center map on first load
  }, [user.id]);

  // Auto-refresh location (marker only updates, no reload)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLocation(false); // Don't center on refresh
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [user.id]);

  const formatLastUpdated = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const time = moment(timestamp);
    const now = moment();
    const diffMinutes = now.diff(time, 'minutes');

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    return time.format('DD MMM YYYY HH:mm');
  };

  // Center map on current location
  const centerOnLocation = () => {
    if (location) {
      centerMapOnLocation(location);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title={`${user.name}'s Location`}
        onBackPress={() => navigation.goBack()}
        refreshIcon
        refreshPress={() => fetchLocation(false)}
      />

      {loading && !location ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />
          <Text style={styles.loadingText}>Fetching location...</Text>
        </View>
      ) : error && !location ? (
        <View style={styles.errorContainer}>
          <MaterialIcons name="location-off" size={64} color="#ccc" />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorSubText}>
            The user may not have location tracking enabled or hasn't logged in yet.
          </Text>
        </View>
      ) : (
        <View style={styles.container}>
          {/* Full Screen Map using OpenStreetMap (FREE) */}
          {location && (
            <WebView
              ref={mapRef}
              style={styles.map}
              source={{ html: mapHTML }}
              scrollEnabled={false}
              onLoad={() => {
                // Small delay to ensure Leaflet JS is fully initialized
                setTimeout(() => {
                  mapLoaded.current = true;
                  // Update marker AND center map to user location after map loads
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
          )}

          {/* Center Location Button (like Google Maps) */}
          <TouchableOpacity
            style={styles.myLocationButton}
            onPress={centerOnLocation}
          >
            <MaterialIcons name="my-location" size={24} color={COLORS.primaryThemeColor} />
          </TouchableOpacity>

          {/* Info Card at Bottom */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <MaterialIcons name="person" size={20} color={COLORS.primaryThemeColor} />
              <Text style={styles.userName}>{user.name}</Text>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            {location?.locationName && (
              <View style={styles.infoRow}>
                <MaterialIcons name="location-on" size={18} color="#666" />
                <Text style={styles.locationText} numberOfLines={2}>{location.locationName}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <MaterialIcons name="access-time" size={18} color="#666" />
              <Text style={styles.timeText}>Last updated: {formatLastUpdated(lastUpdated)}</Text>
            </View>
            {location && (
              <View style={styles.coordsRow}>
                <Text style={styles.coordsText}>
                  Lat: {location.latitude?.toFixed(6)} | Lng: {location.longitude?.toFixed(6)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default UserLiveLocation;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
  },
  errorSubText: {
    marginTop: 8,
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: 'white',
    margin: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userName: {
    flex: 1,
    marginLeft: 8,
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 18,
    color: COLORS.black,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
    marginRight: 4,
  },
  liveText: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 10,
    color: 'white',
  },
  locationText: {
    flex: 1,
    marginLeft: 8,
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 14,
    color: '#333',
  },
  timeText: {
    marginLeft: 8,
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 13,
    color: '#666',
  },
  coordsRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  coordsText: {
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
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
});
