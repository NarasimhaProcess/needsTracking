import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../services/supabase';
import * as Location from 'expo-location';

export default function AddressLocationScreen({ navigation }) {
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchUserAndProfile = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('address_line_1, address_line_2, city, state, zip_code, latitude, longitude')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
          Alert.alert('Error', 'Failed to fetch profile data.');
          console.error('Error fetching profile:', error);
        } else if (data) {
          setAddressLine1(data.address_line_1 || '');
          setAddressLine2(data.address_line_2 || '');
          setCity(data.city || '');
          setState(data.state || '');
          setZipCode(data.zip_code || '');
          setLatitude(data.latitude);
          setLongitude(data.longitude);
        }
      }
      setLoading(false);
    };

    fetchUserAndProfile();
  }, []);

  const handleGetLocation = async () => {
    setLoading(true);
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Permission to access location was denied');
      setLoading(false);
      return;
    }

    let location = await Location.getCurrentPositionAsync({});
    setLatitude(location.coords.latitude);
    setLongitude(location.coords.longitude);
    Alert.alert('Location Captured', `Latitude: ${location.coords.latitude}, Longitude: ${location.coords.longitude}`);
    setLoading(false);
  };

  const handleSaveAddress = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to save an address.');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        address_line_1: addressLine1,
        address_line_2: addressLine2,
        city: city,
        state: state,
        zip_code: zipCode,
        latitude: latitude,
        longitude: longitude,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      Alert.alert('Error', 'Failed to save address.');
      console.error('Error saving address:', error);
    } else {
      Alert.alert('Success', 'Address saved successfully!');
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading address data...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Manage Your Address</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Address Line 1</Text>
        <TextInput
          style={styles.input}
          value={addressLine1}
          onChangeText={setAddressLine1}
          placeholder="Street address, P.O. box"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Address Line 2 (Optional)</Text>
        <TextInput
          style={styles.input}
          value={addressLine2}
          onChangeText={setAddressLine2}
          placeholder="Apartment, suite, unit, building"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="City"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>State</Text>
        <TextInput
          style={styles.input}
          value={state}
          onChangeText={setState}
          placeholder="State"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Zip Code</Text>
        <TextInput
          style={styles.input}
          value={zipCode}
          onChangeText={setZipCode}
          placeholder="Zip Code"
          keyboardType="numeric"
        />
      </View>

      <TouchableOpacity style={styles.button} onPress={handleGetLocation}>
        <Text style={styles.buttonText}>Get Current Location</Text>
      </TouchableOpacity>

      {latitude && longitude && (
        <Text style={styles.locationText}>Location: Lat {latitude.toFixed(4)}, Lon {longitude.toFixed(4)}</Text>
      )}

      <TouchableOpacity style={styles.button} onPress={handleSaveAddress}>
        <Text style={styles.buttonText}>Save Address</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#333',
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
    color: '#555',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  locationText: {
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },
});
