import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Image, Alert, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase'; // Assuming you have this setup
import { v4 as uuidv4 } from 'uuid'; // For unique filenames

const FieldManagerScreen = ({ navigation, route }) => { // Added route to props
  const { customerId, areaId } = route.params; // Extract customerId and areaId from route params

  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  // Removed areaName state

  useEffect(() => {
    (async () => {
      // Request Location Permissions
      let { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      if (locationStatus !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        Alert.alert('Location Permission Denied', 'Please enable location services for this app in your device settings.');
        return;
      }

      // Request Camera Permissions
      let { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus !== 'granted') {
        Alert.alert('Camera Permission Denied', 'Please enable camera access for this app in your device settings.');
        return;
      }

      // Get current location
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
    })();
  }, []);

  // Removed useEffect to fetch area name

  const pickImage = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri) => {
    const fileExt = uri.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `damage_reports/${fileName}`;

    const { data, error } = await supabase.storage
      .from('damage_photos') // Assuming you have a bucket named 'damage_photos'
      .upload(filePath, {
        uri: uri,
        type: `image/${fileExt}`,
      });

    if (error) {
      throw error;
    }
    return data.path; // Return the path to the uploaded file
  };

  const handleSubmit = async () => {
    console.log('Submitting report...');
    console.log('Description:', description);
    console.log('Image:', image);
    console.log('Location:', location);
    console.log('Customer ID:', customerId);
    console.log('Area ID:', areaId);

    // Removed !image from validation
    if (!description || !location || !customerId || !areaId) {
      Alert.alert('Missing Information', 'Please fill all fields, and ensure location, customer, and area info is available.');
      return;
    }

    setLoading(true);
    try {
      let photoPath = ''; // Default to empty string if no image
      if (image) {
        photoPath = await uploadImage(image);
      }

      const { data: { user } } = await supabase.auth.getUser();
      console.log('User ID from Supabase auth:', user ? user.id : 'User is null'); // Log user.id

      if (!user) {
        Alert.alert('Authentication Error', 'User not logged in.');
        setLoading(false);
        return;
      }

      const { error } = await supabase.from('damage_reports').insert({
        manager_id: user.id,
        area_id: areaId, // Use areaId from route.params
        customer_id: customerId, // Use customerId from route.params
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        photo_url: photoPath, // Use the potentially empty photoPath
        description: description,
      });

      if (error) {
        throw error;
      }

      Alert.alert('Success', 'Damage report submitted successfully!');
      setDescription('');
      setImage(null);
      // Optionally navigate back or to a list of reports
    } catch (error) {
      console.error('Error submitting report:', error.message);
      Alert.alert('Submission Error', `Failed to submit report: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (errorMsg) {
    return <View style={styles.container}><Text>{errorMsg}</Text></View>;
  }

  if (loading) { // Simplified loading check
    return <View style={styles.container}><Text>Loading data...</Text></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>New Damage Report</Text>

      <Text style={styles.label}>Damage Description:</Text>
      <TextInput
        style={styles.input}
        placeholder="Describe the damage..."
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Button title="Take Photo" onPress={pickImage} />
      {image && <Image source={{ uri: image }} style={styles.imagePreview} />}

      <Text style={styles.label}>Location:</Text>
      {location ? (
        <Text>Location captured.</Text> // Indicate location is captured without showing coordinates
      ) : (
        <Text>Getting location...</Text>
      )}

      <Button
        title={loading ? "Submitting..." : "Submit Report"}
        onPress={handleSubmit}
        disabled={loading}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    resizeMode: 'contain',
    marginVertical: 15,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
});

export default FieldManagerScreen;