import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../services/supabase';
import LeafletMap from '../components/LeafletMap';

const AddressLocationScreen = ({ navigation }) => {
  const [location, setLocation] = useState(null);
  const [markerLocation, setMarkerLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        setLoading(false);
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setLocation(location.coords);
      setMarkerLocation(location.coords);
      setLoading(false);
    })();
  }, []);

  const handleSaveLocation = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ latitude: markerLocation.latitude, longitude: markerLocation.longitude })
        .eq('id', user.id);

      if (error) {
        Alert.alert('Error', 'Failed to save location.');
      } else {
        Alert.alert('Success', 'Location saved successfully.');
        navigation.goBack();
      }
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" />;
  }

  if (errorMsg) {
    return <Text>{errorMsg}</Text>;
  }

  return (
    <View style={styles.container}>
      <LeafletMap
        initialRegion={location}
        markerCoordinate={markerLocation}
        onMarkerDragEnd={(e) => setMarkerLocation(e)}
      />
      <View style={styles.buttonContainer}>
        <Button title="Confirm Location" onPress={handleSaveLocation} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
});

export default AddressLocationScreen;