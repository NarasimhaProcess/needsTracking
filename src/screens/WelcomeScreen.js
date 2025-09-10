import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TextInput, FlatList, TouchableOpacity, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../services/supabase';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import * as Location from 'expo-location';

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

export default function WelcomeScreen({ route }) {
  const navigation = useNavigation();
  const [customerLocations, setCustomerLocations] = useState([]);
  const [allAreas, setAllAreas] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const webViewRef = useRef(null);

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
        await Promise.all([fetchCustomerLocations(selectedArea), fetchAllAreas()]);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedArea]);

  async function fetchAllAreas() {
      try {
        const { data, error } = await supabase
          .from('area_master')
          .select('id, area_name, latitude, longitude');
        if (error) throw error;
        setAllAreas(data.filter(a => a.latitude && a.longitude));
      } catch (err) {
        console.error('Error fetching all areas:', err);
      }
  }

  async function fetchCustomerLocations(areaId) {
      try {
        let query = supabase
          .from('customers')
          .select('id, name, email, latitude, longitude, area_id, mobile, book_no');

        if (areaId) {
          query = query.eq('area_id', areaId);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error('Supabase Error fetching customers:', fetchError);
          throw fetchError;
        }

        let filteredLocations = data.filter(customer => customer.latitude && customer.longitude);
        setCustomerLocations(filteredLocations);
      } catch (err) {
        console.error('Error fetching customer locations:', err);
        setError(err.message);
      }
  }

  const onAreaSelected = (area) => {
      setSelectedArea(area.id);
      if(webViewRef.current && area.latitude && area.longitude) {
          webViewRef.current.injectJavaScript(`
            map.setView([${area.latitude}, ${area.longitude}], 14);
          `);
      }
  }

  const onCustomerSelected = (customer) => {
    if(webViewRef.current && customer.latitude && customer.longitude) {
        webViewRef.current.injectJavaScript(`
          map.setView([${customer.latitude}, ${customer.longitude}], 16);
          customerMarkers[${customer.id}].openPopup();
        `);
    }
  }

  const onMapMessage = (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'viewProducts') {
      navigation.navigate('CatalogScreen', { customerId: data.customerId });
    } else if (data.type === 'viewTopProducts') {
      navigation.navigate('TopProductsScreen', { customerId: data.customerId });
    }
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
        <style>
            body { margin: 0; padding: 0; }
            #mapid { width: 100vw; height: 100vh; background-color: #f0f0f0; }
            .leaflet-routing-container { display: none; }
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

            function viewProducts(customerId) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'viewProducts', customerId: customerId }));
            }

            function viewTopProducts(customerId) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'viewTopProducts', customerId: customerId }));
            }

            var customerLocations = ${JSON.stringify(customerLocations.map(loc => ({
                latitude: loc.latitude,
                longitude: loc.longitude,
                name: loc.name || loc.email,
                mobile: loc.mobile || 'N/A',
                book_no: loc.book_no || 'N/A',
                id: loc.id
            })))};

            var allAreas = ${JSON.stringify(allAreas)};

            var userLocation = ${JSON.stringify(userLocation)};

            if (userLocation) {
                L.circleMarker([userLocation.latitude, userLocation.longitude], {
                    color: 'blue',
                    fillColor: '#30f',
                    fillOpacity: 0.8,
                    radius: 8
                })
                    .addTo(map)
                    .bindPopup('Your Location')
                    .openPopup();
                map.setView([userLocation.latitude, userLocation.longitude], 13);
            }

            allAreas.forEach(function(area) {
                L.circle([area.latitude, area.longitude], { 
                    color: 'red',
                    fillColor: '#f03',
                    fillOpacity: 0.5,
                    radius: 500
                }).addTo(map).bindPopup(area.area_name);
            });

            if (customerLocations.length > 0) {
                var waypoints = customerLocations.map(function(loc) {
                    return L.latLng(loc.latitude, loc.longitude);
                });

                var routingControl = L.Routing.control({
                    waypoints: waypoints,
                    routeWhileDragging: false,
                    showAlternatives: false,
                    addWaypoints: false,
                    draggableWaypoints: false,
                    fitSelectedRoutes: true,
                    show: false,
                    lineOptions: {
                        styles: [{ color: 'blue', weight: 5 }]
                    },
                    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' })
                }).addTo(map);

                routingControl.on('routesfound', function(e) {
                    var routes = e.routes;
                    if (routes.length > 0) {
                        var bounds = L.latLngBounds(waypoints);
                        if (!userLocation) { 
                            map.fitBounds(bounds.pad(0.1));
                        }

                        customerLocations.forEach(function(location) {
                            var popupContent = '<b>' + (location.name || 'Customer') + '</b><br/>Mobile: ' + (location.mobile || 'N/A') + '<br/>Card No: ' + (location.book_no || 'N/A') + '<br/><button onclick="viewProducts(' + location.id + ')">View Full Catalog</button><br/><button onclick="viewTopProducts(' + location.id + ')">View Top 10 Products</button>';
                            var marker = L.marker([location.latitude, location.longitude])
                                .addTo(map)
                                .bindPopup(popupContent);
                            customerMarkers[location.id] = marker;
                        });
                    }
                });

            } else if (allAreas.length > 0 && !userLocation) {
                var areaBounds = L.latLngBounds(allAreas.map(a => [a.latitude, a.longitude]));
                map.fitBounds(areaBounds.pad(0.1));
            }
        </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
        <AreaSearchBar onAreaSelected={onAreaSelected} onClear={() => setSelectedArea(null)} />
        {selectedArea && <CustomerSearchBar onCustomerSelected={onCustomerSelected} areaId={selectedArea} />}
        <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: htmlContent }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={onMapMessage}
        />
        <View style={styles.iconContainer}>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Icon name="sign-in" size={30} color="#007AFF" style={styles.icon} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Icon name="user-plus" size={30} color="#007AFF" style={styles.icon} />
            </TouchableOpacity>
        </View>
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
  searchContainer: {
      position: 'absolute',
      top: 10,
      left: 10,
      right: 10,
      zIndex: 2,
      backgroundColor: 'white',
      borderRadius: 8,
      padding: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
  },
  searchInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: '#ccc',
      borderRadius: 8,
      padding: 8,
  },
  suggestionList: {
      backgroundColor: '#fff',
      borderRadius: 8,
      elevation: 2,
      maxHeight: 150,
      marginTop: 2,
  },
  suggestionItem: {
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
  },
  iconContainer: { position: 'absolute', top: 130, right: 20, flexDirection: 'row', zIndex: 10 },
  icon: { marginLeft: 15 },
});