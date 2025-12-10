import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Button,
  Modal,
  Image
} from 'react-native';
import { supabase, uploadQrImage, addQrCode, getActiveQrCode } from '../services/supabase';
import { schedulePushNotification, registerForPushNotificationsAsync } from '../services/notificationService';
import * as Location from 'expo-location';
import LeafletMap from '../components/LeafletMap'; // Assuming you have this component
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';

const ProfileScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [markerLocation, setMarkerLocation] = useState(null);
  const [mapInitialRegion, setMapInitialRegion] = useState(null);
  const [upiQrCodeUrl, setUpiQrCodeUrl] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, []);
  
  useEffect(() => {
    const handleNotifications = async () => {
        if (profile) {
            const token = await registerForPushNotificationsAsync();
            if (token && token !== profile.push_token) {
                const { error } = await supabase
                    .from('profiles')
                    .update({ push_token: token })
                    .eq('id', profile.id);
                if (error) {
                    console.error('Error updating push token:', error.message);
                }
            }
        }
    };
    handleNotifications();
  }, [profile]);

  const fetchProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error.message);
        Alert.alert('Error', 'Failed to fetch profile.');
      } else if (data) {
        setProfile(data);
        setName(user.user_metadata?.name || '');
        setEmail(user.email || '');
        setMobile(data.mobile || '');
        setAddressLine1(data.address_line_1 || '');
        setAddressLine2(data.address_line_2 || '');
        setCity(data.city || '');
        setState(data.state || '');
        setZipCode(data.zip_code || '');
        setLatitude(data.latitude);
        setLongitude(data.longitude);
        if (data.latitude && data.longitude) {
          setMapInitialRegion({ latitude: data.latitude, longitude: data.longitude });
          setMarkerLocation({ latitude: data.latitude, longitude: data.longitude });
        }
      }
      const activeQr = await getActiveQrCode(user.id);
      if (activeQr) {
        setUpiQrCodeUrl(activeQr.qr_image_url);
      }
    }
    setLoading(false);
  };

  const handleUpdateProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const updates = {
        id: user.id,
        mobile,
        address_line_1: addressLine1,
        address_line_2: addressLine2,
        city,
        state,
        zip_code: zipCode,
        latitude,
        longitude,
        updated_at: new Date(),
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(updates, { onConflict: 'id' });

      if (error) {
        console.error('Error updating profile:', error.message);
        Alert.alert('Error', 'Failed to update profile.');
      } else {
        // Also update user_metadata for name and email if they are editable
        const { error: userUpdateError } = await supabase.auth.updateUser({
          email,
          data: { name },
        });

        if (userUpdateError) {
          console.error('Error updating user metadata:', userUpdateError.message);
          Alert.alert('Error', 'Profile updated, but failed to update user name/email.');
        } else {
          Alert.alert('Success', 'Profile updated successfully!');
          fetchProfile(); // Re-fetch to ensure UI is up-to-date
        }
      }
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      Alert.alert('Error', 'Failed to log out.');
    } else {
      // Navigation will be handled by auth state change listener in App.js
    }
  };

  const openLocationPicker = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access location was denied.');
      return;
    }

    let currentLocation = await Location.getCurrentPositionAsync({});
    setMapInitialRegion({
      latitude: latitude || currentLocation.coords.latitude,
      longitude: longitude || currentLocation.coords.longitude,
    });
    setMarkerLocation({
      latitude: latitude || currentLocation.coords.latitude,
      longitude: longitude || currentLocation.coords.longitude,
    });
    setShowLocationPicker(true);
  };

  const confirmLocationSelection = () => {
    if (markerLocation) {
      setLatitude(markerLocation.latitude);
      setLongitude(markerLocation.longitude);
      setShowLocationPicker(false);
    } else {
      Alert.alert('No Location Selected', 'Please select a location on the map.');
    }
  };

  const handleUpiQrUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setLoading(true);
      const imageUrl = result.assets[0].uri;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const uploadedUrl = await uploadQrImage(user.id, imageUrl);
        if (uploadedUrl) {
          await addQrCode(user.id, uploadedUrl, 'My UPI QR', true);
          setUpiQrCodeUrl(uploadedUrl);
          Alert.alert('Success', 'UPI QR Code uploaded successfully.');
        } else {
          Alert.alert('Error', 'Failed to upload QR code.');
        }
      }
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.qrCodeContainer}>
        {profile && profile.id && (
          <QRCode
            value={profile.id}
            size={150}
            backgroundColor="white"
            color="black"
          />
        )}
      </View>
      <Text style={styles.title}>Profile</Text>

      {upiQrCodeUrl && (
        <View style={styles.qrCodeContainer}>
          <Text>Your UPI QR Code:</Text>
          <Image source={{ uri: upiQrCodeUrl }} style={styles.upiQrImage} />
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={handleUpiQrUpload}>
        <Text style={styles.buttonText}>Upload UPI QR Code</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Mobile"
        value={mobile}
        onChangeText={setMobile}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="Address Line 1"
        value={addressLine1}
        onChangeText={setAddressLine1}
      />
      <TextInput
        style={styles.input}
        placeholder="Address Line 2"
        value={addressLine2}
        onChangeText={setAddressLine2}
      />
      <TextInput
        style={styles.input}
        placeholder="City"
        value={city}
        onChangeText={setCity}
      />
      <TextInput
        style={styles.input}
        placeholder="State"
        value={state}
        onChangeText={setState}
      />
      <TextInput
        style={styles.input}
        placeholder="Zip Code"
        value={zipCode}
        onChangeText={setZipCode}
        keyboardType="numeric"
      />

      <TouchableOpacity style={styles.locationButton} onPress={openLocationPicker}>
        <Text style={styles.locationButtonText}>Select Location on Map</Text>
      </TouchableOpacity>
      {latitude && longitude && (
        <Text style={styles.locationText}>
          Latitude: {latitude.toFixed(6)}, Longitude: {longitude.toFixed(6)}
        </Text>
      )}

      <TouchableOpacity style={styles.button} onPress={handleUpdateProfile}>
        <Text style={styles.buttonText}>Update Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => schedulePushNotification("Test Title", "This is a test notification")}>
        <Text style={styles.buttonText}>Send Test Notification</Text>
      </TouchableOpacity>

      {profile && profile.role === 'admin' && (
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('AdminMap')}>
          <Text style={styles.buttonText}>View Delivery Managers Map</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>

      {/* Location Picker Modal */}
      <Modal
        visible={showLocationPicker}
        animationType="slide"
        onRequestClose={() => setShowLocationPicker(false)}
      >
        <View style={styles.mapModalContainer}>
          {mapInitialRegion && (
            <LeafletMap
              initialRegion={mapInitialRegion}
              markerCoordinate={markerLocation}
              onMarkerDragEnd={setMarkerLocation}
            />
          )}
          <View style={styles.mapModalButtonContainer}>
            <Button title="Confirm Location" onPress={confirmLocationSelection} />
            <Button title="Cancel" onPress={() => setShowLocationPicker(false)} color="red" />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  upiQrImage: {
    width: 150,
    height: 150,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  locationButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 15,
  },
  locationButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  locationText: {
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: '#dc3545',
  },
  mapModalContainer: {
    flex: 1,
  },
  mapModalButtonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});

export default ProfileScreen;