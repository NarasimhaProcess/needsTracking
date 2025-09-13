import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  Modal,
  Image,
  ScrollView,
  Button,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase, getCustomerDocuments } from '../services/supabase'; // Import getCustomerDocuments
import Icon from 'react-native-vector-icons/FontAwesome';
import * as Location from 'expo-location';
import ImageViewer from 'react-native-image-zoom-viewer'; // Import ImageViewer
import { useCart } from '../context/CartContext';
import OrderIconComponent from '../components/OrderIconComponent';
import CartIconComponent from '../components/CartIconComponent';
import ProfileIconComponent from '../components/ProfileIconComponent';
import ProductManageIconComponent from '../components/ProductManageIconComponent';


function AreaSearchBar({ onAreaSelected, onClear }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const debounceTimeout = useRef(null);

  const fetchSuggestions = async (text) => {
    if (!text) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
        const { data, error } = await supabase
            .from('area_master')
            .select('id, area_name, latitude, longitude')
            .ilike('area_name', `%${text}%`)
            .limit(5);

        if (error) throw error;
        setSuggestions(data);
    } catch (e) {
      setSuggestions([]);
    }
    setLoading(false);
  };

  const onChangeText = (text) => {
    setQuery(text);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => fetchSuggestions(text), 400);
  };

  const onSuggestionPress = (item) => {
    setQuery(item.area_name);
    setSuggestions([]);
    onAreaSelected(item);
  };

  return (
    <View style={styles.searchContainer}>
      <View style={{ flexDirection: 'row' }}>
        <TextInput
          value={query}
          onChangeText={onChangeText}
          placeholder="Search Area"
          style={styles.searchInput}
        />
        {loading && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
        <TouchableOpacity onPress={() => { setQuery(''); onClear(); }} style={{ padding: 8 }}><Text>Clear</Text></TouchableOpacity>
      </View>
      {suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.id.toString()}
          style={styles.suggestionList}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => onSuggestionPress(item)} style={styles.suggestionItem}>
              <Text>{item.area_name}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function CustomerSearchBar({ onCustomerSelected, areaId }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const debounceTimeout = useRef(null);

  const fetchSuggestions = async (text) => {
    if (!text) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
        let queryBuilder = supabase
            .from('customers')
            .select('id, name, mobile, book_no, email, latitude, longitude')
            .or(`name.ilike.%${text}%,mobile.ilike.%${text}%,book_no.ilike.%${text}%,email.ilike.%${text}%`)
            .limit(5);

        if (areaId) {
            queryBuilder = queryBuilder.eq('area_id', areaId);
        }

        const { data, error } = await queryBuilder;

        if (error) throw error;
        setSuggestions(data);
    } catch (e) {
      setSuggestions([]);
    }
    setLoading(false);
  };

  const onChangeText = (text) => {
    setQuery(text);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => fetchSuggestions(text), 400);
  };

  const onSuggestionPress = (item) => {
    setQuery(item.name);
    setSuggestions([]);
    onCustomerSelected(item);
  };

  return (
    <View style={[styles.searchContainer, { top: 70 }]}>
      <View style={{ flexDirection: 'row' }}>
        <TextInput
          value={query}
          onChangeText={onChangeText}
          placeholder="Search Customer (Name, Mobile, Card, Email)"
          style={styles.searchInput}
        />
        {loading && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
      </View>
      {suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.id.toString()}
          style={styles.suggestionList}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => onSuggestionPress(item)} style={styles.suggestionItem}>
              <Text>{item.name} - {item.mobile}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

import { useNavigation } from '@react-navigation/native'; // Add this import

export default function CustomerMapScreen({ route }) { // Remove navigation from props
  const navigation = useNavigation(); // Get navigation from hook
  const { user, role } = useCart();
  const { customerId } = route.params; // Get customerId from route params
  const [customerLocations, setCustomerLocations] = useState([]);
  const [allAreas, setAllAreas] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const webViewRef = useRef(null);
  const [isCustomerImageModalVisible, setIsCustomerImageModalVisible] = useState(false); // New state
  const [currentCustomerImages, setCurrentCustomerImages] = useState([]); // New state
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false); // New state for full screen image viewer
  const [viewerImages, setViewerImages] = useState([]); // New state for images in viewer
  const [isLoginMenuVisible, setIsLoginMenuVisible] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission denied', 'Location permission is required to show your position on the map.');
        } else {
          let location = await Location.getCurrentPositionAsync({});
          setUserLocation(location.coords);
        }
        // Fetch only the specific customer's location
        await fetchCustomerLocation(customerId);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [customerId]);

  async function fetchCustomerLocation(id) {
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles') // Assuming customer location is in profiles table
          .select('latitude, longitude')
          .eq('id', id)
          .single();

        if (fetchError) {
          console.error('Supabase Error fetching customer location:', fetchError);
          throw fetchError;
        }

        if (data && data.latitude && data.longitude) {
          setCustomerLocations([{ latitude: data.latitude, longitude: data.longitude, id: id }]);
        } else {
          Alert.alert('Location Not Found', 'Customer location not available.');
          setCustomerLocations([]);
        }
      } catch (err) {
        console.error('Error fetching customer location:', err);
        setError(err.message);
      }
  }

  const onMapMessage = async (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    // Handle map messages if needed
  };

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

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Customer Map</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
        <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css" />
        <script src="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" integrity="sha512-Fo3rlrZj/k7ujTnHg4CGR2D7kSs0V4LLanw2qksYuRlEzO+tcaEPQogQ0KaoGN26/zrn20ImR1DfuLWnOo7aBA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
        <style>
            body { margin: 0; padding: 0; }
            #mapid { width: 100vw; height: 100vh; background-color: #f0f0f0; }
            .leaflet-routing-container { display: none; }
            .customer-image-button { margin-top: 5px; padding: 5px 10px; background-color: #007AFF; color: white; border-radius: 5px; border: none; cursor: pointer; }
        </style>
    </head>
    <body>
        <div id="mapid"></div>
        <script>
            var map = L.map('mapid').setView([20.5937, 78.9629], 5);
            var customerMarkers = {};

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            var customerLocations = ${JSON.stringify(customerLocations.map(loc => ({
                latitude: loc.latitude,
                longitude: loc.longitude,
                id: loc.id
            })))};

            if (customerLocations.length > 0) {
                var customerLocation = customerLocations[0];
                L.marker([customerLocation.latitude, customerLocation.longitude])
                    .addTo(map)
                    .bindPopup('Your Location')
                    .openPopup();
                map.setView([customerLocation.latitude, customerLocation.longitude], 13);
            }

            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'webviewLoaded' }));
        </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
        <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: htmlContent }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={onMapMessage}
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
