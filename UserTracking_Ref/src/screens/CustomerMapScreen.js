import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TextInput, FlatList, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../services/supabaseClient';
import { useNavigation } from '@react-navigation/native';

function AreaSearchBar({ onAreaSelected }) {
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

export default function CustomerMapScreen({ route }) {
  const navigation = useNavigation();
  const { groupId, areaId } = route.params;
  const [customerLocations, setCustomerLocations] = useState([]);
  const [allAreas, setAllAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const webViewRef = useRef(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        await Promise.all([fetchCustomerLocations(), fetchAllAreas()]);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [groupId, areaId]);

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

  async function fetchCustomerLocations() {
      console.log('fetchCustomerLocations started. groupId:', groupId, 'areaId:', areaId);
      try {
        let query = supabase
          .from('customers')
          .select('id, name, email, latitude, longitude, area_id, mobile, book_no'); // Include mobile and book_no

        if (groupId) {
          console.log('Fetching customer_groups for groupId:', groupId);
          // Fetch customer_ids within the selected group
          const { data: customerGroups, error: customerGroupError } = await supabase
            .from('customer_groups') // Assuming a customer_groups table
            .select('customer_id')
            .eq('group_id', groupId);

          if (customerGroupError) {
            console.error('Supabase Error fetching customer_groups:', customerGroupError);
            throw customerGroupError;
          }
          console.log('customerGroups fetched:', customerGroups);
          const customerIdsInGroup = customerGroups.map(cg => cg.customer_id);
          query = query.in('id', customerIdsInGroup);
        }

        if (areaId) {
          console.log('Filtering by areaId:', areaId);
          // If areaId is provided, filter directly by area_id on the customers table
          query = query.eq('area_id', areaId);
        }

        console.log('Executing final customers query...');
        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error('Supabase Error fetching customers:', fetchError);
          throw fetchError;
        }
        console.log('Customers data fetched:', data);

        let filteredLocations = data.filter(customer => customer.latitude && customer.longitude);
        console.log('Filtered locations (with lat/lon):', filteredLocations);

        setCustomerLocations(filteredLocations);
        console.log('customerLocations state updated.');
      } catch (err) {
        console.error('Error fetching customer locations:', err);
        setError(err.message);
      }
  }

  const onAreaSelected = (area) => {
      if(webViewRef.current && area.latitude && area.longitude) {
          webViewRef.current.injectJavaScript(`
            map.setView([${area.latitude}, ${area.longitude}], 14);
            L.marker([${area.latitude}, ${area.longitude}])
                .addTo(map)
                .bindPopup('<b>${area.area_name}</b>')
                .openPopup();
          `);
      }
  }

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
            .leaflet-routing-container { display: none; } /* Hide routing control UI */
        </style>
    </head>
    <body>
        <div id="mapid"></div>
        <script>
            var map = L.map('mapid').setView([20.5937, 78.9629], 5); // Default view over India

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            var customerLocations = ${JSON.stringify(customerLocations.map(loc => ({
                latitude: loc.latitude,
                longitude: loc.longitude,
                name: loc.name || loc.email,
                mobile: loc.mobile || 'N/A',
                book_no: loc.book_no || 'N/A',
                id: loc.id
            })))};

            var allAreas = ${JSON.stringify(allAreas)};

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
                        map.fitBounds(bounds.pad(0.1));

                        customerLocations.forEach(function(location) {
                            L.marker([location.latitude, location.longitude])
                                .addTo(map)
                                .bindPopup(
                                   '<b>' + (location.name || 'Customer') + '</b><br/>' +
                                   'Mobile: ' + (location.mobile || 'N/A') + '<br/>' +
                                   'Card No: ' + (location.book_no || 'N/A')
                                 );
                        });
                    }
                });
            } else if (allAreas.length > 0) {
                var areaBounds = L.latLngBounds(allAreas.map(a => [a.latitude, a.longitude]));
                map.fitBounds(areaBounds.pad(0.1));
            }
        </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
        <AreaSearchBar onAreaSelected={onAreaSelected} />
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
  searchContainer: {
      position: 'absolute',
      top: 10,
      left: 10,
      right: 10,
      zIndex: 1,
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
  }
});