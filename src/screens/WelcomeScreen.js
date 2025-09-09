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
import { supabase } from '../services/supabase';

const { width, height } = Dimensions.get('window');

const mapHtml = require('../../assets/leaflet_map.html');

const WelcomeScreen = ({ navigation }) => {
  const [location, setLocation] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState(null);
  const [filterRadius, setFilterRadius] = useState(3);
  const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
  const [initialLocationSent, setInitialLocationSent] = useState(false);
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

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  };

  const fetchCustomersByLocation = async (currentLocation) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-customers-by-location', {
        body: {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          radius: filterRadius,
        },
      });

      if (error) {
        throw error;
      }

      setCustomers(data);
    } catch (error) {
      console.error("Error fetching customers by location:", error);
      Alert.alert("Error", "Failed to fetch nearby customers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Permission Denied', 'Please grant location permissions to use this feature.');
        setLoading(false);
        return;
      }

      try {
        let currentLoc = await Location.getCurrentPositionAsync({});
        setLocation(currentLoc);
        fetchCustomersByLocation(currentLoc);

        if (isWebViewLoaded && !initialLocationSent && webViewRef.current) {
          const message = {
            type: 'initialLoad',
            initialRegion: {
              latitude: currentLoc.coords.latitude,
              longitude: currentLoc.coords.longitude,
              zoom: 15
            },
          };
          webViewRef.current.postMessage(JSON.stringify(message));
          setInitialLocationSent(true);
        }

        Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 100,
          },
          (newLoc) => {
            setLocation(newLoc);
            if (location && calculateDistance(location.coords.latitude, location.coords.longitude, newLoc.coords.latitude, newLoc.coords.longitude) >= 0.5) {
              fetchCustomersByLocation(newLoc);
            }
            if (webViewRef.current) {
              const message = {
                type: 'markerUpdate',
                markerCoordinate: {
                  latitude: newLoc.coords.latitude,
                  longitude: newLoc.coords.longitude,
                  name: 'Your Location',
                  icon: 'blue'
                },
              };
              webViewRef.current.postMessage(JSON.stringify(message));
            }
          }
        );

      } catch (error) {
        console.error("Error getting current position or watching location:", error);
        Alert.alert('Location Error', 'Failed to get your current location. Please ensure GPS is enabled.');
      }
      setLoading(false);
    })();
  }, [filterRadius, isWebViewLoaded]);

  const onCustomerMarkerPress = (customer) => {
    navigation.navigate('CatalogScreen', { customerId: customer.id });
  };

  const renderImageItem = ({ item }) => (
    <TouchableOpacity onPress={() => { setFullScreenImageUrl(item); setIsFullScreen(true); }}>
      <Image source={{ uri: item }} style={styles.modalImage} />
    </TouchableOpacity>
  );

  const onMapMessage = (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'webviewLoaded') {
      setIsWebViewLoaded(true);
    } else if (data.type === 'markerClick') {
      const customer = customers.find(c => c.id === data.id);
      if (customer) {
        onCustomerMarkerPress(customer);
      }
    }
  };

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'clearMarkers' }));
      webViewRef.current.postMessage(JSON.stringify({ type: 'clearRoutes' }));

      const processCustomers = async () => {
        for (const customer of customers) {
          if (customer.latitude && customer.longitude) {
            const message = {
              type: 'markerUpdate',
              markerCoordinate: {
                id: customer.id,
                latitude: parseFloat(customer.latitude),
                longitude: parseFloat(customer.longitude),
                name: customer.name,
              },
            };
            setTimeout(() => {
              webViewRef.current.postMessage(JSON.stringify(message));
            }, 500);

            if (location) {
              const route = await getRoute(location.coords, { latitude: parseFloat(customer.latitude), longitude: parseFloat(customer.longitude) });
              if (route.length > 0) {
                setTimeout(() => {
                  webViewRef.current.postMessage(JSON.stringify({ type: 'drawRoute', route }));
                }, 500);
              }
            }
          }
        }
      };
      processCustomers();
    }
  }, [customers]);


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
    backgroundColor: 'lightgray',
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
    width: (width * 0.9 - 60) / 2,
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
