import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase, getDeliveryManagerLocations } from '../services/supabase';
import * as Location from 'expo-location';

export default function AdminMapScreen({ navigation }) {
  const [locations, setLocations] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const webViewRef = useRef(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Permission to access location was denied');
        } else {
          let location = await Location.getCurrentPositionAsync({});
          setUserLocation(location.coords);
        }

        const managerLocations = await getDeliveryManagerLocations();
        if (managerLocations) {
          setLocations(managerLocations);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Delivery Manager Map</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
        <style>
            body { margin: 0; padding: 0; }
            #mapid { width: 100vw; height: 100vh; }
        </style>
    </head>
    <body>
        <div id="mapid"></div>
        <script>
            var map = L.map('mapid').setView([20.5937, 78.9629], 5);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            var userLocation = ${JSON.stringify(userLocation)};
            if (userLocation) {
                L.marker([userLocation.latitude, userLocation.longitude]).addTo(map)
                    .bindPopup('Your Location')
                    .openPopup();
                map.setView([userLocation.latitude, userLocation.longitude], 13);
            }

            var managerLocations = ${JSON.stringify(locations.map(loc => {
              const point = loc.location.match(/POINT\(([-\d\.]+) ([-\d\.]+)\)/);
              return {
                lat: parseFloat(point[2]),
                lon: parseFloat(point[1]),
                name: loc.profiles.full_name,
                mobile: loc.profiles.mobile
              }
            }))};

            managerLocations.forEach(function(location) {
                var popupContent = 
                    '<b>' + location.name + '</b><br/>' +
                    'Mobile: ' + location.mobile;
                L.marker([location.lat, location.lon])
                    .addTo(map)
                    .bindPopup(popupContent);
            });
        </script>
    </body>
    </html>
  `;

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading map data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
});
