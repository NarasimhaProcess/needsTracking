import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StackActions } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
  Image,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../services/supabaseClient';
import { locationTracker } from '../services/locationTracker';
import { Buffer } from 'buffer';
import LeafletMap from '../components/LeafletMap';
import { OfflineStorageService } from '../services/OfflineStorageService';
import { registerForPushNotificationsAsync } from '../services/notificationService'; // New import
import * as Notifications from 'expo-notifications'; // New import

// Utility function to convert BYTEA hex to base64
function hexToBase64(hexString) {
  if (!hexString) return '';
  // Remove all leading backslashes and 'x'
  const hex = hexString.replace(/^\\*x/, '');
  return Buffer.from(hex, 'hex').toString('base64');
}

function LocationSearchBar({ onLocationFound }) {
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
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&addressdetails=1&limit=5`;
      const response = await fetch(url);
      const results = await response.json();
      setSuggestions(results);
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
    setQuery(item.display_name);
    setSuggestions([]);
    onLocationFound({ latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) });
  };

  const highlightMatch = (text, query) => {
    if (!query) return <Text>{text}</Text>;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <Text key={i} style={{ fontWeight: 'bold', color: '#007AFF' }}>{part}</Text>
      ) : (
        <Text key={i}>{part}</Text>
      )
    );
  };

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row' }}>
        <TextInput
          value={query}
          onChangeText={onChangeText}
          placeholder="Search address"
          style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8 }}
        />
        {loading && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
      </View>
      {suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.place_id.toString()}
          style={{ backgroundColor: '#fff', borderRadius: 8, elevation: 2, maxHeight: 150, marginTop: 2 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => onSuggestionPress(item)} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              {highlightMatch(item.display_name, query)}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

export default function ProfileScreen({ navigation, user, userProfile, reloadUserProfile }) {
  // Debug log to check if component is mounting properly
  console.log('ProfileScreen mounted with props:', { 
    hasNavigation: !!navigation, 
    hasUser: !!user, 
    hasUserProfile: !!userProfile 
  });

  const [profileImage, setProfileImage] = useState(null);
  const [settings, setSettings] = useState({
    notifications: true,
    backgroundTracking: true,
    highAccuracy: true,
  });
  const [showImageModal, setShowImageModal] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const mapRef = useRef(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: userProfile?.latitude || 37.78825,
    longitude: userProfile?.longitude || -122.4324,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [notificationStatus, setNotificationStatus] = useState('undetermined'); // New state

  const checkNotificationStatus = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationStatus(status);
  }, []);

  useEffect(() => {
    if (userProfile?.profile_photo_data) {
      setProfileImage(userProfile.profile_photo_data);
    } else {
      setProfileImage(null);
    }
    checkNotificationStatus(); // Check status on mount
  }, [userProfile, checkNotificationStatus]);

  // Using useCallback to ensure function reference stability
  const handleLogout = async () => {
    const offlineExpenses = await OfflineStorageService.getOfflineExpenses();

    if (offlineExpenses.length > 0) {
      Alert.alert(
        'Offline Expenses',
        'You have offline expenses that have not been synced. What would you like to do?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Logout and Discard',
            style: 'destructive',
            onPress: async () => {
              console.log('ProfileScreen: Attempting to sign out (discarding offline expenses).'); // NEW LOG
              await OfflineStorageService.clearOfflineExpenses();
              await supabase.auth.signOut();
              console.log('ProfileScreen: Sign out call completed (discarding offline expenses).'); // NEW LOG
            },
          },
          {
            text: 'Connect to Sync',
            onPress: () => {},
            style: 'default',
          },
        ]
      );
    } else {
      try {
        console.log('ProfileScreen: Attempting to sign out (no offline expenses).'); // NEW LOG
        await supabase.auth.signOut();
        console.log('ProfileScreen: Sign out call completed (no offline expenses).'); // NEW LOG
        // Alert.alert('Success', 'Logged out successfully!'); // Temporarily removed
      } catch (error) {
        Alert.alert('Error', 'Failed to log out: ' + error.message);
        console.error('Logout error:', error);
      }
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await locationTracker.stopTracking();
              
              // Delete user data from Supabase
              const { error } = await supabase.auth.admin.deleteUser(user.id);
              
              if (error) {
                Alert.alert('Error', 'Failed to delete account');
                return;
              }

              Alert.alert('Success', 'Account deleted successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete account');
              console.error('Delete account error:', error);
            }
          },
        },
      ]
    );
  };

  const handleSettingToggle = (setting) => {
    setSettings(prev => ({
      ...prev,
      [setting]: !prev[setting]
    }));
  };

  

  const handleClearData = useCallback(async () => {
    Alert.alert(
      'Clear Data',
      'Are you sure you want to clear all location data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('location_history')
                .delete()
                .eq('user_id', user.id);

              if (error) {
                Alert.alert('Error', 'Failed to clear data');
                return;
              }

              Alert.alert('Success', 'Data cleared successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data');
            }
          },
        },
      ]
    );
  }, [user]);

  const uploadProfileImage = async (uri, userId, mimeType) => {
    try {
      const fileExt = mimeType.split('/')[1];
      const fileName = `${Date.now()}_${Math.floor(Math.random() * 100000)}.${fileExt}`;
      const filePath = `profiles/${userId}/${fileName}`;
      const fileData = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const fileBuffer = Buffer.from(fileData, 'base64');
      
      const { data, error } = await supabase.storage
        .from('locationtracker')
        .upload(filePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });
      
      if (error) {
        Alert.alert('Error', 'Failed to upload profile image: ' + error.message);
        return null;
      }
      
      const { data: urlData } = supabase.storage.from('locationtracker').getPublicUrl(filePath);
      const publicUrl = urlData?.publicUrl || '';
      
      const { error: updateError } = await supabase.from('users').update({ profile_photo_data: publicUrl }).eq('id', userId);
      if (updateError) {
        console.error('Failed to update profile_photo_data in users table:', updateError);
      } else {
        console.log('profile_photo_data updated in users table:', publicUrl);
      }
      return publicUrl;
    } catch (error) {
      Alert.alert('Error', 'Failed to upload profile image: ' + error.message);
      return null;
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const publicUrl = await uploadProfileImage(asset.uri, user.id, asset.mimeType || 'image/jpeg');
        if (publicUrl) {
          setProfileImage(publicUrl);
          Alert.alert('Success', 'Profile image updated successfully');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
      console.error('Image picker error:', error);
    }
  };

  const openLocationPicker = () => {
    setSelectedLocation({
      latitude: userProfile?.latitude || 37.78825,
      longitude: userProfile?.longitude || -122.4324,
    });
    setMapRegion({
      latitude: userProfile?.latitude || 37.78825,
      longitude: userProfile?.longitude || -122.4324,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    setShowLocationPicker(true);
  };

  const handleMapPress = ({ latitude, longitude }) => {
    setSelectedLocation({ latitude, longitude });
  };

  const confirmLocationSelection = async () => {
    if (!selectedLocation || !user) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .update({
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        })
        .eq('id', user.id)
        .select();
      if (error) {
        Alert.alert('Error', 'Failed to update location: ' + error.message);
      } else {
        Alert.alert('Success', 'Location updated successfully!');
        setShowLocationPicker(false);
        if (reloadUserProfile) reloadUserProfile(user.id);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update location');
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Location Icon Button at Top */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
        <TouchableOpacity onPress={openLocationPicker} style={{ padding: 8 }}>
          <Text style={{ fontSize: 24 }}>📍</Text>
        </TouchableOpacity>
      </View>
      
      {/* Profile Image Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Picture</Text>
        <View style={styles.profileImageContainer}>
          {profileImage && (
            <TouchableOpacity onPress={() => setShowImageModal(true)}>
              <Image
                source={{ uri: profileImage }}
                style={styles.profileImage}
                onError={e => console.error('Image load error:', e.nativeEvent)}
              />
            </TouchableOpacity>
          )}
          {!profileImage && (
            <View style={styles.profileImagePlaceholder}>
              <Text style={styles.profileImageText}>👤</Text>
            </View>
          )}
          <TouchableOpacity style={styles.changeImageButton} onPress={pickImage}>
            <Text style={styles.changeImageText}>Change Photo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* User Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>User Information</Text>
        <View style={styles.userInfoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name:</Text>
            <Text style={styles.infoValue}>{userProfile?.name || 'Not set'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{userProfile?.email || user?.email || 'Loading...'}</Text>
          </View>
          {userProfile?.mobile && ( // Conditionally render if mobile exists
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Mobile:</Text>
              <Text style={styles.infoValue}>{userProfile.mobile}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>User Type:</Text>
            <Text style={styles.infoValue}>{userProfile?.user_type || 'user'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Location Status:</Text>
            <Text style={[styles.infoValue, { color: userProfile?.location_status === 1 ? '#34C759' : '#FF3B30' }]}>
              {userProfile?.location_status === 1 ? 'Active' : 'Inactive'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>User ID:</Text>
            <Text style={styles.infoValue}>{userProfile?.id || user?.id || 'Loading...'}</Text>
          </View>
        </View>
      </View>

      {/* Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Push Notifications</Text>
            <Switch
              value={settings.notifications}
              onValueChange={() => handleSettingToggle('notifications')}
              trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
              thumbColor={settings.notifications ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>
          
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Background Tracking</Text>
            <Switch
              value={settings.backgroundTracking}
              onValueChange={() => handleSettingToggle('backgroundTracking')}
              trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
              thumbColor={settings.backgroundTracking ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>High Accuracy</Text>
            <Switch
              value={settings.highAccuracy}
              onValueChange={() => handleSettingToggle('highAccuracy')}
              trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
              thumbColor={settings.highAccuracy ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>
          {notificationStatus !== 'granted' && (
            <TouchableOpacity
              style={styles.enableNotificationsButton}
              onPress={async () => {
                const token = await registerForPushNotificationsAsync(user); // Pass the user prop
                if (token) {
                  Alert.alert('Success', 'Notifications enabled!');
                  checkNotificationStatus(); // Re-check status after enabling
                } else {
                  Alert.alert('Error', 'Failed to enable notifications. Please check app settings.');
                }
              }}
            >
              <Text style={styles.enableNotificationsButtonText}>Enable Notifications</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Actions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <View style={styles.actionsCard}>
          
          
          <TouchableOpacity style={[styles.actionButton, styles.logoutButton]} onPress={handleLogout}>
            <Text style={styles.actionButtonText}>Logout</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleClearData}>
            <Text style={styles.actionButtonText}>Clear Location Data</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteButtonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Image Modal */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPressOut={() => setShowImageModal(false)}
        >
          <Image
            source={{ uri: profileImage }}
            style={{ width: 300, height: 300, borderRadius: 12, resizeMode: 'contain' }}
            onError={e => console.error('Modal image load error:', e.nativeEvent)}
          />
          <TouchableOpacity
            style={{ marginTop: 20, backgroundColor: '#fff', padding: 10, borderRadius: 8 }}
            onPress={() => setShowImageModal(false)}
          >
            <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Location Picker Modal */}
      <Modal
        visible={showLocationPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLocationPicker(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ width: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>Select Location</Text>
            <LocationSearchBar onLocationFound={(coords) => {
              setSelectedLocation(coords);
              setMapRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 });
              if (mapRef.current) {
                mapRef.current.centerOnLocation(coords);
              }
            }} />
            <View style={{ width: '100%', height: 200, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <LeafletMap
                ref={mapRef}
                onMapPress={handleMapPress}
                initialRegion={mapRegion}
                markerCoordinate={selectedLocation}
              />
            </View>
            {selectedLocation && (
              <View style={{ backgroundColor: '#f0f0f0', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Selected Location:</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  Latitude: {selectedLocation.latitude.toFixed(6)}
                </Text>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  Longitude: {selectedLocation.longitude.toFixed(6)}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#ccc', borderRadius: 8, paddingVertical: 12, marginRight: 8, alignItems: 'center' }}
                onPress={() => setShowLocationPicker(false)}
              >
                <Text style={{ color: '#333', fontWeight: 'bold', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 12, marginLeft: 8, alignItems: 'center' }}
                onPress={confirmLocationSelection}
                disabled={!selectedLocation}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  section: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  profileImageContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  profileImageText: {
    fontSize: 40,
  },
  changeImageButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  changeImageText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  userInfoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
    color: '#8E8E93',
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    color: '#1C1C1E',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#1C1C1E',
    flex: 1,
  },
  actionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  logoutButton: {
    backgroundColor: '#FF9500',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});