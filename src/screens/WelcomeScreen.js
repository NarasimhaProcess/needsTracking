import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  FlatList,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Icon from 'react-native-vector-icons/FontAwesome';
import * as Location from 'expo-location';
import Slider from '@react-native-community/slider';
import { supabase, getAreas } from '../services/supabase'; // Import supabase client and getAreas

const { width, height } = Dimensions.get('window');

// The HTML file is loaded via require, but since it's a static asset,
// we can use a static path for the webview.
const mapHtml = require('../../assets/leaflet_map.html');

const WelcomeScreen = ({ navigation }) => {
  const [location, setLocation] = useState(null);
  const [customers, setCustomers] = useState([]); // New state for customer locations
  const [areas, setAreas] = useState([]); // New state for areas
  const [loading, setLoading] = useState(true);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState([]); // Changed to array
  const [isFullScreen, setIsFullScreen] = useState(false); // New state for full screen
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState(null); // New state for full screen image
  const [showAreaDropdown, setShowAreaDropdown] = useState(false); // New state for area dropdown visibility
  const [filterRadius, setFilterRadius] = useState(3); // New state for user-controlled filter radius (default 3km)
  const [selectedArea, setSelectedArea] = useState(null); // New state for selected area
  const [isWebViewLoaded, setIsWebViewLoaded] = useState(false); // New state to track WebView load status
  const [initialLocationSent, setInitialLocationSent] = useState(false); // New state to ensure initial location is sent only once
  const webViewRef = useRef(null);

  const getRoute = async (start, end) => {
    try {
      const response = await fetch(`http://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`);
      const json = await response.json();
      if (json.routes && json.routes.length > 0) {
        return json.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      }
    } catch (error) {
      console.error(error);
    }
    return [];
  };

  // Haversine formula to calculate distance between two lat/lon points in kilometers
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance; // Distance in km
  };

  const fetchAndDisplayAreas = async (currentLocation) => {
    setLoading(true);
    try {
      const fetchedAreas = await getAreas();
      if (fetchedAreas) {
        const filteredAreas = fetchedAreas.filter(area => {
          if (!currentLocation || !currentLocation.coords) return false;
          const dist = calculateDistance(
            currentLocation.coords.latitude,
            currentLocation.coords.longitude,
            area.latitude,
            area.longitude
          );
          return dist <= filterRadius; // Filter areas within user-defined radius
        });
        setAreas(filteredAreas);
      }
    } catch (error) {
      console.error("Error fetching and displaying areas:", error);
      Alert.alert("Error", "Failed to fetch nearby areas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      console.log("Requesting location permissions...");
      let { status } = await Location.requestForegroundPermissionsAsync();
      console.log("Location permission status:", status);
      if (status !== 'granted') {
        console.error('Permission to access location was denied');
        Alert.alert('Location Permission Denied', 'Please grant location permissions to use this feature.');
        setLoading(false);
        return;
      }
      console.log("Location permission granted. Getting current position...");
      try {
        let currentLoc = await Location.getCurrentPositionAsync({});
        console.log("Current position retrieved:", currentLoc);
        setLocation(currentLoc);
        console.log("Location state set to:", currentLoc);
        fetchAndDisplayAreas(currentLoc); // Initial fetch of areas

        // Send initial location to WebView if it's loaded and not sent yet
        if (isWebViewLoaded && !initialLocationSent && webViewRef.current) {
          console.log("Sending initialLoad message to WebView with location:", currentLoc.coords.latitude, currentLoc.coords.longitude);
          const message = {
            type: 'initialLoad',
            initialRegion: {
              latitude: currentLoc.coords.latitude,
              longitude: currentLoc.coords.longitude,
              zoom: 15
            },
          };
          webViewRef.current.postMessage(JSON.stringify(message));
          setInitialLocationSent(true); // Mark as sent
        }

        // Set up background location tracking for continuous updates
        Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 100, // Check every 100 meters
          },
          (newLoc) => {
            console.log("New location update received:", newLoc);
            setLocation(newLoc);
            // Automatically refetch areas if moved significantly (e.g., 0.5km)
            if (location && calculateDistance(location.coords.latitude, location.coords.longitude, newLoc.coords.latitude, newLoc.coords.longitude) >= 0.5) {
              fetchAndDisplayAreas(newLoc);
            }
            // Update user marker and map view in WebView with new location
            if (webViewRef.current) {
              console.log("Sending markerUpdate for continuous location update:", newLoc.coords.latitude, newLoc.coords.longitude);
              const message = {
                type: 'markerUpdate',
                markerCoordinate: {
                  latitude: newLoc.coords.latitude,
                  longitude: newLoc.coords.longitude,
                  name: 'Your Location', // Or a more appropriate name
                  icon: 'blue' // Ensure it's the blue user marker
                },
              };
              webViewRef.current.postMessage(JSON.stringify(message));
              // Optionally, re-center map on user's new location
              // webViewRef.current.postMessage(JSON.stringify({ type: 'initialLoad', initialRegion: { latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude, zoom: map.getZoom() } }));
            }
          }
        );

      } catch (error) {
        console.error("Error getting current position or watching location:", error);
        Alert.alert('Location Error', 'Failed to get your current location. Please ensure GPS is enabled.');
      }
      setLoading(false);
    })();
  }, [filterRadius, isWebViewLoaded]); // Re-run effect when filterRadius or isWebViewLoaded changes

  

  const onCustomerMarkerPress = async (customer) => {
    console.log("Customer marker pressed:", customer);
    // Fetch images from customer_documents table using file_data column
    const { data: documentData, error: documentError } = await supabase
      .from('customer_documents')
      .select('file_data')
      .eq('customer_id', customer.id);

    console.log("Supabase response - data:", documentData);
    console.log("Supabase response - error:", documentError);

    if (documentError) {
      Alert.alert("Error fetching images", documentError.message);
      console.error("Error fetching customer documents:", documentError);
    } else if (documentData && documentData.length > 0) {
      const imageUrls = documentData.map(doc => doc.file_data).filter(url => url); // Extract URLs and filter out nulls
      if (imageUrls.length > 0) {
        setSelectedImageUrls(imageUrls);
        setShowImageModal(true);
      } else {
        Alert.alert("No Images", "This customer does not have any uploaded images.");
      }
    } else {
      Alert.alert("No Images", "This customer does not have any uploaded images.");
    }
  };

  const renderImageItem = ({ item }) => (
    <TouchableOpacity onPress={() => { setFullScreenImageUrl(item); setIsFullScreen(true); }}>
      <Image source={{ uri: item }} style={styles.modalImage} />
    </TouchableOpacity>
  );

  const renderAreaItem = ({ item }) => (
    <Text style={styles.areaDropdownItem}>
      {item.name} ({calculateDistance(location.coords.latitude, location.coords.longitude, item.latitude, item.longitude).toFixed(2)} km)
    </Text>
  );

  const onMapMessage = (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    console.log("Message from WebView:", data);
    if (data.type === 'webviewLoaded') {
      console.log("WebView has loaded and sent a message!");
      setIsWebViewLoaded(true); // Set WebView loaded status
    }
    // Handle other messages from WebView (e.g., map clicks)
  };

  useEffect(() => {
    // The initialLoad message will be sent from onMapMessage after webviewLoaded
    // No need to send initialLoad here anymore
  }, [location]);

  useEffect(() => {
    const fetchCustomersForArea = async () => {
      if (!selectedArea) {
        // If no area is selected, clear customers and markers
        setCustomers([]);
        if (webViewRef.current) {
          webViewRef.current.postMessage(JSON.stringify({ type: 'clearMarkers' }));
          webViewRef.current.postMessage(JSON.stringify({ type: 'clearRoutes' }));
        }
        return;
      }

      console.log("Fetching customers for selected area:", selectedArea.id);
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, latitude, longitude, area_id')
        .eq('area_id', selectedArea.id); // Fetch only customers for the selected area

      console.log("Supabase customers query result - data:", data);
      console.log("Supabase customers query result - error:", error);

      if (error) {
        console.error("Error fetching customers for area:", error);
        Alert.alert("Error", "Failed to fetch customers for the selected area.");
        setCustomers([]);
        return;
      }

      console.log("Customers fetched for area:", data);
      setCustomers(data); // Update customers state with filtered data
    };

    fetchCustomersForArea();
  }, [selectedArea]); // This useEffect now depends only on selectedArea

  useEffect(() => {
    // This useEffect will now handle displaying customers on the map
    // It will run when 'customers' state changes (after fetchCustomersForArea)
    if (webViewRef.current) {
      console.log("useEffect re-running for customer display. Selected Area:", selectedArea);
      console.log("Customers to display:", customers);

      webViewRef.current.postMessage(JSON.stringify({ type: 'clearMarkers' }));
      webViewRef.current.postMessage(JSON.stringify({ type: 'clearRoutes' }));

      const processCustomers = async () => {
        console.log("Processing customers for map display...");
        if (customers.length === 0) {
          console.log("No customers to display.");
        }
        for (const customer of customers) { // Iterate over 'customers' state directly
          console.log("Processing customer:", customer.name, "(", customer.id, ")");
          if (customer.latitude && customer.longitude) {
            const message = {
              type: 'markerUpdate',
              markerCoordinate: {
                latitude: parseFloat(customer.latitude),
                longitude: parseFloat(customer.longitude),
                name: customer.name,
              },
            };
            console.log("Sending markerUpdate message:", message);
            setTimeout(() => {
              webViewRef.current.postMessage(JSON.stringify(message));
            }, 500); // 500ms delay

            if (location) { // 'location' is still accessible from the outer scope
              console.log("Getting route for customer:", customer.name);
              const route = await getRoute(location.coords, { latitude: parseFloat(customer.latitude), longitude: parseFloat(customer.longitude) });
              if (route.length > 0) {
                console.log("Sending drawRoute message for customer:", customer.name);
                setTimeout(() => {
                  webViewRef.current.postMessage(JSON.stringify({ type: 'drawRoute', route }));
                }, 500); // 500ms delay
              } else {
                console.log("No route found for customer:", customer.name);
              }
            } else {
              console.log("User location not available, skipping route for customer:", customer.name);
            }
          } else {
            console.log("Customer has no latitude/longitude, skipping marker/route:", customer.name);
          }
        }
      };
      processCustomers(); // Call the async function
    }
  }, [customers]); // Removed 'location' from dependency array


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        style={styles.map}
        source={mapHtml}
        javaScriptEnabled={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        onMessage={onMapMessage}
        originWhitelist={['*']}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error in WelcomeScreen: ', nativeEvent);
          Alert.alert('Map Error', 'Failed to load map. Please check your internet connection or map configuration.');
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView HTTP error in WelcomeScreen: ', nativeEvent);
        }}
      />

      <View style={styles.iconContainer}>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Icon name="sign-in" size={30} color="#007AFF" style={styles.icon} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
          <Icon name="user-plus" size={30} color="#007AFF" style={styles.icon} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowAreaDropdown(!showAreaDropdown)} style={styles.icon}>
          <Icon name="list" size={30} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.sliderContainer}>
        <Text>Filter Radius: {filterRadius.toFixed(0)} km</Text>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={100}
          step={1}
          value={filterRadius}
          onValueChange={setFilterRadius}
          minimumTrackTintColor="#007AFF"
          maximumTrackTintColor="#000000"
        />
      </View>

      {showAreaDropdown && (
        <View style={styles.areaDropdown}>
          <FlatList
            data={areas}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => {
                console.log("Area clicked:", item);
                setSelectedArea(item);
              }}>
                <Text style={styles.areaDropdownItem}>{item.area_name} ({calculateDistance(location.coords.latitude, location.coords.longitude, item.latitude, item.longitude).toFixed(2)} km)</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.areaDropdownItem}>No areas found within {filterRadius.toFixed(0)}km.</Text>}
          />
        </View>
      )}

      {/* Image Modal */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowImageModal(false)}
            >
              <Icon name="times" size={24} color="white" />
            </TouchableOpacity>
            
            <FlatList
              data={selectedImageUrls}
              renderItem={renderImageItem}
              keyExtractor={(item, index) => index.toString()}
              numColumns={2}
              contentContainerStyle={styles.imageGrid}
            />
          </View>
        </View>
      </Modal>

      {/* Full Screen Image Modal */}
      <Modal
        visible={isFullScreen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsFullScreen(false)}
      >
        <View style={styles.fullScreenContainer}>
          <TouchableOpacity
            style={styles.fullScreenCloseButton}
            onPress={() => setIsFullScreen(false)}
          >
            <Icon name="times" size={30} color="white" />
          </TouchableOpacity>
          
          {fullScreenImageUrl && (
            <Image
              source={{ uri: fullScreenImageUrl }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    flex: 1,
    backgroundColor: 'lightgray', // Add this
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    maxHeight: height * 0.8,
    maxWidth: width * 0.9,
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 15,
    padding: 5,
  },
  imageGrid: {
    padding: 10,
  },
  modalImage: {
    width: (width * 0.9 - 60) / 2, // Adjusted for padding and margin
    height: 150,
    margin: 5,
    borderRadius: 8,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 10,
  },
  fullScreenImage: {
    width: width,
    height: height,
  },
  iconContainer: { position: 'absolute', top: 40, right: 20, flexDirection: 'row', zIndex: 10 },
  icon: { marginLeft: 15 },
  areaDropdown: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 10,
    maxHeight: 200,
    width: 200,
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  areaDropdownItem: {
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sliderContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 10,
    zIndex: 10,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  slider: {
    width: '100%',
    height: 40,
  },
});

export default WelcomeScreen;