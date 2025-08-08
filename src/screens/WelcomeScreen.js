import React, { useState, useEffect } from 'react';
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
import MapView, { Marker, Circle } from 'react-native-maps';
import Icon from 'react-native-vector-icons/FontAwesome';
import * as Location from 'expo-location';
import Slider from '@react-native-community/slider';
import { supabase, getAreas } from '../services/supabase'; // Import supabase client and getAreas

const { width, height } = Dimensions.get('window');

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
      if (status !== 'granted') {
        console.error('Permission to access location was denied');
        setLoading(false);
        return;
      }
      console.log("Location permission granted. Getting current position...");
      try {
        let currentLoc = await Location.getCurrentPositionAsync({});
        console.log("Current position retrieved:", currentLoc);
        setLocation(currentLoc);
        fetchAndDisplayAreas(currentLoc); // Initial fetch of areas

        // Set up background location tracking for continuous updates
        Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 100, // Check every 100 meters
          },
          (newLoc) => {
            setLocation(newLoc);
            // Automatically refetch areas if moved significantly (e.g., 0.5km)
            if (location && calculateDistance(location.coords.latitude, location.coords.longitude, newLoc.coords.latitude, newLoc.coords.longitude) >= 0.5) {
              fetchAndDisplayAreas(newLoc);
            }
          }
        );

      } catch (error) {
        console.error("Error getting current position or watching location:", error);
      }
      setLoading(false);
    })();
  }, [filterRadius]); // Re-run effect when filterRadius changes

  useEffect(() => {
    const fetchCustomers = async () => {
      console.log("Fetching customer data from Supabase...");
      const { data, error } = await supabase
        .from('customers') // Assuming your table name is 'customers'
        .select('id, name, latitude, longitude'); // Select relevant columns

      if (error) {
        console.error("Error fetching customers:", error);
      } else {
        console.log("Customers fetched:", data);
        setCustomers(data);
      }
    };

    fetchCustomers();
  }, []);

  const onCustomerMarkerPress = async (customer) => {
    console.log("Customer marker pressed:", customer);
    // Fetch images from customer_documents table using file_data column
    const { data: documentData, error: documentError } = await supabase
      .from('customer_documents')
      .select('file_data')
      .eq('customer_id', customer.id);

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
      {location && location.coords && typeof location.coords.latitude === 'number' && typeof location.coords.longitude === 'number' ? (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {areas.map((area) => (
            area.latitude && area.longitude && typeof parseFloat(area.latitude) === 'number' && typeof parseFloat(area.longitude) === 'number' && (
              <React.Fragment key={area.id}>
                <Marker
                  coordinate={{
                    latitude: parseFloat(area.latitude),
                    longitude: parseFloat(area.longitude),
                  }}
                  title={area.name}
                  pinColor="green"
                >
                  <View style={styles.areaMarker}>
                    <Text style={styles.areaMarkerText}>{area.name}</Text>
                    <Icon name="map-marker" size={30} color="green" />
                  </View>
                </Marker>
                <Circle
                  center={{
                    latitude: parseFloat(area.latitude),
                    longitude: parseFloat(area.longitude),
                  }}
                  radius={filterRadius * 1000} // Radius in meters
                  fillColor="rgba(0, 255, 0, 0.1)"
                  strokeColor="rgba(0, 255, 0, 0.5)"
                  strokeWidth={2}
                />
              </React.Fragment>
            )
          ))}
          {customers.map((customer) => (
            customer.latitude && customer.longitude && typeof parseFloat(customer.latitude) === 'number' && typeof parseFloat(customer.longitude) === 'number' && (
              <Marker
                key={customer.id}
                coordinate={{
                  latitude: parseFloat(customer.latitude),
                  longitude: parseFloat(customer.longitude),
                }}
                title={customer.name}
                pinColor="red"
                onPress={() => onCustomerMarkerPress(customer)}
              >
                <Icon name="user" size={30} color="red" />
              </Marker>
            )
          ))}
        </MapView>
      ) : (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text>Loading...</Text>
        </View>
      )}

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
              <Text style={styles.areaDropdownItem}>{item.area_name} ({calculateDistance(location.coords.latitude, location.coords.longitude, item.latitude, item.longitude).toFixed(2)} km)</Text>
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
  areaMarker: {
    backgroundColor: 'white',
    padding: 5,
    borderRadius: 5,
    borderColor: 'green',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaMarkerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'green',
  },
});

export default WelcomeScreen;

