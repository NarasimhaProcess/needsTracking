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
import MapView, { Marker } from 'react-native-maps';
import Icon from 'react-native-vector-icons/FontAwesome';
import * as Location from 'expo-location';
import { supabase } from '../services/supabase'; // Import supabase client

const { width, height } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }) => {
  const [location, setLocation] = useState(null);
  const [customers, setCustomers] = useState([]); // New state for customer locations
  const [loading, setLoading] = useState(true);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState([]); // Changed to array
  const [isFullScreen, setIsFullScreen] = useState(false); // New state for full screen
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState(null); // New state for full screen image

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
        let location = await Location.getCurrentPositionAsync({});
        console.log("Current position retrieved:", location);
        setLocation(location);
      } catch (error) {
        console.error("Error getting current position:", error);
      }
      setLoading(false);
    })();
  }, []);

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

  return (
    <View style={styles.container}>
      {location ? (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
        >
          <Marker
            coordinate={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }}
            title="Your Location"
            pinColor="blue"
          />
          {customers.map(customer => (
            <Marker
              key={customer.id}
              coordinate={{
                latitude: parseFloat(customer.latitude),
                longitude: parseFloat(customer.longitude),
              }}
              title={customer.name}
              pinColor="red"
              onPress={() => onCustomerMarkerPress(customer)}
            />
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
      </View>

      {/* Image List Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showImageModal}
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            {selectedImageUrls.length > 0 ? (
              <FlatList
                data={selectedImageUrls}
                renderItem={renderImageItem}
                keyExtractor={(item, index) => index.toString()}
                horizontal={true}
                pagingEnabled={true}
                showsHorizontalScrollIndicator={false}
              />
            ) : (
              <Text>No images available.</Text>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowImageModal(false)}
            >
              <Text style={styles.textStyle}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full Screen Image Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isFullScreen}
        onRequestClose={() => setIsFullScreen(false)}
      >
        <View style={styles.fullScreenView}>
          {fullScreenImageUrl && (
            <Image source={{ uri: fullScreenImageUrl }} style={styles.fullScreenImage} />
          )}
          <TouchableOpacity
            style={styles.fullScreenCloseButton}
            onPress={() => setIsFullScreen(false)}
          >
            <Icon name="times-circle" size={30} color="white" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.8)', zIndex: 1000 },
  iconContainer: { position: 'absolute', top: 40, right: 20, flexDirection: 'row', zIndex: 10 },
  icon: { marginLeft: 15 },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
  },
  modalView: {
    margin: 20,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    maxHeight: '80%',
  },
  modalImage: {
    width: 300,
    height: 300,
    resizeMode: 'contain',
    marginHorizontal: 5,
  },
  closeButton: {
    backgroundColor: "#2196F3",
    borderRadius: 20,
    padding: 10,
    elevation: 2,
    marginTop: 15,
  },
  textStyle: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
  },
  fullScreenView: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: width,
    height: height,
    resizeMode: 'contain',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 1,
  },
});

export default WelcomeScreen;
