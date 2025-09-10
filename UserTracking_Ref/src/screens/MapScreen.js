import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  TextInput,
  Modal, // Ensure Modal is explicitly imported
  Linking, // Added Linking
} from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../services/supabaseClient';
import LeafletMap from '../components/LeafletMap';
import EnhancedDatePicker from '../components/EnhancedDatePicker'; // Reverted to default import

import { MaterialIcons } from '@expo/vector-icons'; // Add this import

const { width, height } = Dimensions.get('window');

export default function MapScreen({ user, userProfile }) {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [userLocations, setUserLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const mapRef = useRef(null);

  // New states for superadmin functionality
  const [selectedUserForMap, setSelectedUserForMap] = useState(null); // User whose location history is being viewed
  const [allUsersForMap, setAllUsersForMap] = useState([]); // All users for superadmin to select from
  const [userSearchInput, setUserSearchInput] = useState(''); // For searching users in the superadmin view
  const [showUserSelectionModal, setShowUserSelectionModal] = useState(false); // To show a modal for user selection

  // New states for date filtering
  const [showEnhancedDatePicker, setShowEnhancedDatePicker] = useState(false); // Control visibility of EnhancedDatePicker
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7))); // Default to 7 days ago
  const [endDate, setEndDate] = useState(new Date()); // Default to today
  const [showControlsMenu, setShowControlsMenu] = useState(false); // New state for controls menu visibility

  useEffect(() => {
    if (user) {
      getCurrentLocation();
      if (userProfile?.user_type === 'superadmin') {
        loadAllUsersForMap();
      }
      // Initial load for the current user or the default selected user for superadmin
      loadUserLocations(selectedUserForMap?.id || user.id);
    }
  }, [user, userProfile, selectedUserForMap]); // Added userProfile and selectedUserForMap to dependencies

  const loadAllUsersForMap = async () => {
    try {
      let usersToDisplay = [];
      if (userProfile?.user_type === 'superadmin') {
        // Superadmin: fetch all users
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email')
          .order('name', { ascending: true });
        if (error) throw error;
        usersToDisplay = data || [];
      } else {
        // Group Admin or regular user: fetch users from groups they administer
        // First, find groups where the current user is a group admin
        const { data: adminGroups, error: adminGroupsError } = await supabase
          .from('user_groups')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('is_group_admin', true);

        if (adminGroupsError) throw adminGroupsError;

        if (adminGroups && adminGroups.length > 0) {
          const groupIds = adminGroups.map(g => g.group_id);

          // Then, fetch all users belonging to these groups
          const { data: groupUsersData, error: groupUsersError } = await supabase
            .from('user_groups')
            .select('users(id, name, email)')
            .in('group_id', groupIds);

          if (groupUsersError) throw groupUsersError;

          // Extract unique users
          const uniqueUsers = new Map();
          groupUsersData.forEach(ug => {
            if (ug.users) {
              uniqueUsers.set(ug.users.id, ug.users);
            }
          });
          usersToDisplay = Array.from(uniqueUsers.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }
      }

      setAllUsersForMap(usersToDisplay);
      // Set the first user as default if no user is selected, or if the previously selected user is no longer in the list
      if (!selectedUserForMap || !usersToDisplay.some(u => u.id === selectedUserForMap.id)) {
        if (usersToDisplay.length > 0) {
          setSelectedUserForMap(usersToDisplay[0]);
        } else {
          setSelectedUserForMap(null); // No users to display
        }
      }
    } catch (error) {
      console.error('Error loading users for map:', error);
      Alert.alert('Error', 'Failed to load users for map.');
    }
  };

  const loadUserLocations = async (userIdToLoad) => {
    if (!userIdToLoad) return; // Ensure a user ID is provided

    try {
      let query = supabase
        .from('location_history')
        .select('*')
        .eq('user_id', userIdToLoad);

      if (startDate) {
        // Ensure startDate is a Date object before calling toISOString
        const startDateTime = new Date(startDate);
        query = query.gte('timestamp', startDateTime.toISOString());
      }
      if (endDate) {
        // Ensure endDate is a Date object before calling toISOString
        const endDateTime = new Date(endDate);
        // To include the whole end day, set time to end of day
        endDateTime.setHours(23, 59, 59, 999);
        query = query.lte('timestamp', endDateTime.toISOString());
      }

      const { data, error } = await query
        .order('timestamp', { ascending: true })
        .limit(100); // Keep limit for now, but date filter is primary

      if (error) {
        console.error('Error loading locations:', error);
        return;
      }

      if (data && data.length > 0) {
        setUserLocations(data);
      } else {
        setUserLocations([]); // Clear locations if no data found for the selected user
      }
    } catch (error) {
      console.error('Error loading user locations:', error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required');
        setIsLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      setCurrentLocation(newLocation);
    } catch (error) {
      console.error('Error getting current location:', error);
      Alert.alert('Error', 'Could not get current location');
    } finally {
      setIsLoading(false);
    }
  };

  const centerOnCurrentLocation = () => {
    if (currentLocation && mapRef.current) {
      mapRef.current.centerOnLocation(currentLocation);
    }
  };

  const clearMap = () => {
    setUserLocations([]);
    if (mapRef.current) {
      mapRef.current.clearMap();
    }
  };

  const fitMapToRoute = () => {
    if (mapRef.current && userLocations.length > 0) {
      mapRef.current.fitToRoute();
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Please enter a search query');
      return;
    }

    try {
      const results = await Location.geocodeAsync(searchQuery);
      if (results.length > 0) {
        const { latitude, longitude } = results[0];
        const searchLocation = {
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        
        setCurrentLocation(searchLocation);
        
        if (mapRef.current) {
          mapRef.current.centerOnLocation(searchLocation);
        }
        
        setSearchQuery('');
      } else {
        Alert.alert('Not Found', 'No results found for your search.');
      }
    } catch (error) {
      console.error('Error geocoding location:', error);
      Alert.alert('Error', 'Could not search for location.');
    }
  };

  const handleMapPress = ({ latitude, longitude }) => {
    console.log('Map pressed at:', { latitude, longitude });
    // You can add functionality here, like adding a new marker
  };

  const handleMarkerDragEnd = ({ latitude, longitude }) => {
    console.log('Marker dragged to:', { latitude, longitude });
    setCurrentLocation({
      ...currentLocation,
      latitude,
      longitude,
    });
  };

  // Web fallback component (for when maps don't work)
  const WebMapFallback = () => (
    <View style={styles.webFallback}>
      <Text style={styles.webFallbackTitle}>🗺️ Map View</Text>
      <Text style={styles.webFallbackText}>
        Maps are not available in web browser.
      </Text>
      <Text style={styles.webFallbackText}>
        Please use the mobile app for full map functionality.
      </Text>
      
      {/* Location History Display */}
      <View style={styles.locationHistory}>
        <Text style={styles.locationHistoryTitle}>Location History</Text>
        
        {userLocations.length > 0 && (
          <Text style={styles.locationHistoryText}>
            Last Update: {new Date(userLocations[userLocations.length - 1].timestamp).toLocaleString()}
          </Text>
        )}
        {currentLocation && (
          <Text style={styles.locationHistoryText}>
            Current Location: {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
          </Text>
        )}
      </View>

      {/* Recent Locations List */}
      {userLocations.length > 0 && (
        <View style={styles.recentLocations}>
          <Text style={styles.recentLocationsTitle}>Recent Locations</Text>
          <ScrollView style={styles.locationsList}>
            {userLocations.slice(-10).reverse().map((location, index) => (
              <View key={location.id || index} style={styles.locationItem}>
                <Text style={styles.locationCoordinates}>
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </Text>
                <Text style={styles.locationTime}>
                  {new Date(location.timestamp).toLocaleString()}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const handleGetDirections = (location) => {
    if (!location || !location.latitude || !location.longitude) {
      Alert.alert('Error', 'No location selected for directions.');
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
    Linking.openURL(url).catch(err => console.error('Failed to open Google Maps:', err));
  };

  const renderMap = () => {
    // Show fallback for web or if no location
    if (Platform.OS === 'web' || !currentLocation) {
      return <WebMapFallback />;
    }

    return (
      <LeafletMap
        ref={mapRef}
        initialRegion={currentLocation}
        markerCoordinate={currentLocation}
        userLocations={userLocations}
        onMapPress={handleMapPress}
        onMarkerDragEnd={handleMarkerDragEnd}
      />
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Container */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search for a location..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Superadmin User Selection */}
      {userProfile?.user_type === 'superadmin' && (
        <View style={styles.superadminUserSelectContainer}>
          <TouchableOpacity
            style={styles.superadminUserSelectButton}
            onPress={() => setShowUserSelectionModal(true)}
          >
            <Text style={styles.superadminUserSelectButtonText}>
              Viewing: {selectedUserForMap?.name || user.name || 'Select User'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Map Container */}
      <View style={styles.mapContainer}>
        {renderMap()}
      </View>

      {/* Control buttons and 3 dots menu */}
      <View style={styles.controlsContainer}>
        {showControlsMenu && (
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={centerOnCurrentLocation}
              disabled={!currentLocation}
            >
              <MaterialIcons name="my-location" size={24} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={fitMapToRoute}
              disabled={userLocations.length === 0}
            >
              <MaterialIcons name="alt-route" size={24} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={clearMap}
            >
              <MaterialIcons name="clear" size={24} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => setShowEnhancedDatePicker(true)}
            >
              <MaterialIcons name="date-range" size={24} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => loadUserLocations(selectedUserForMap?.id || user.id)}
            >
              <MaterialIcons name="refresh" size={24} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => handleGetDirections(selectedUserForMap ? userLocations[userLocations.length - 1] : currentLocation)}
              disabled={!selectedUserForMap && !currentLocation}
            >
              <MaterialIcons name="directions" size={24} color="white" />
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          style={styles.threeDotsButton}
          onPress={() => setShowControlsMenu(!showControlsMenu)}
        >
          <MaterialIcons name="more-vert" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Enhanced Date Picker Modal */}
      <EnhancedDatePicker
        visible={showEnhancedDatePicker}
        onClose={() => setShowEnhancedDatePicker(false)}
        onDateSelect={({ startDate: selectedStart, endDate: selectedEnd }) => {
          // EnhancedDatePicker returns YYYY-MM-DD strings for range mode
          setStartDate(new Date(selectedStart));
          setEndDate(new Date(selectedEnd));
          loadUserLocations(selectedUserForMap?.id || user.id);
        }}
        startDate={startDate}
        endDate={endDate}
        selectionMode="range"
        // repaymentFrequency and daysToComplete are not needed for MapScreen
        repaymentFrequency={null}
        daysToComplete={null}
      />

      {/* Info panel */}
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>Location History</Text>
        
        {userLocations.length > 0 && (
          <Text style={styles.infoText}>
            Last Update: {new Date(userLocations[userLocations.length - 1].timestamp).toLocaleString()}
          </Text>
        )}
        {currentLocation && (
          <Text style={styles.infoText}>
            Current: {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
          </Text>
        )}
      </View>

      {/* User Selection Modal for Superadmin */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showUserSelectionModal}
        onRequestClose={() => setShowUserSelectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select User</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search users..."
              value={userSearchInput}
              onChangeText={setUserSearchInput}
            />
            <ScrollView style={styles.userListScroll}>
              {allUsersForMap
                .filter(u =>
                  u.name?.toLowerCase().includes(userSearchInput.toLowerCase()) ||
                  u.email?.toLowerCase().includes(userSearchInput.toLowerCase())
                )
                .map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.userListItem}
                    onPress={() => {
                      setSelectedUserForMap(u);
                      setShowUserSelectionModal(false);
                      setUserSearchInput(''); // Clear search input
                      loadUserLocations(u.id); // Load locations for the newly selected user
                    }}
                  >
                    <Text style={styles.userListItemText}>{u.name || u.email}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setShowUserSelectionModal(false)}
            >
              <Text style={styles.closeModalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  mapContainer: {
    flex: 1,
  },
  searchContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginRight: 10,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  loadingText: {
    fontSize: 18,
    color: '#007AFF',
  },
  controls: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  controlButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  infoPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  // Web fallback styles
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 20,
  },
  webFallbackTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  webFallbackText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 10,
  },
  locationHistory: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  locationHistoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  locationHistoryText: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  recentLocations: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  recentLocationsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  locationsList: {
    maxHeight: 150,
  },
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  locationCoordinates: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  locationTime: {
    fontSize: 12,
    color: '#8E8E93',
  },
  superadminUserSelectContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80, // Adjust position below search bar
    left: 20,
    right: 20,
    zIndex: 999, // Ensure it's above the map but below search
  },
  superadminUserSelectButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  superadminUserSelectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  userListScroll: {
    maxHeight: 300, // Limit height of user list
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    marginTop: 10,
  },
  userListItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  userListItemText: {
    fontSize: 16,
  },
  closeModalButton: {
    marginTop: 20,
    backgroundColor: '#FF3B30',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeModalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    zIndex: 1000,
    alignItems: 'flex-end', // Align items to the right
  },
  threeDotsButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 28, // Make it circular
    marginTop: 8, // Space between controls and dots button
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});