import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Linking,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { supabase } from '../services/supabaseClient';

export default function LocationHistoryScreen({ user, userProfile }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalDistance: 0,
    avgAccuracy: 0,
    totalPoints: 0,
  });

  // States for user selection
  const [selectedUserForHistory, setSelectedUserForHistory] = useState(null);
  const [allUsersForHistory, setAllUsersForHistory] = useState([]);
  const [userSearchInput, setUserSearchInput] = useState('');
  const [showUserSelectionModal, setShowUserSelectionModal] = useState(false);

  // Load all users
  const loadAllUsersForHistory = async () => {
    try {
      let usersToDisplay = [];
      if (userProfile?.user_type === 'superadmin') {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email')
          .order('name', { ascending: true });
        if (error) throw error;
        usersToDisplay = data || [];
      } else {
        const { data: adminGroups, error: adminGroupsError } = await supabase
          .from('user_groups')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('is_group_admin', true);

        if (adminGroupsError) throw adminGroupsError;

        if (adminGroups && adminGroups.length > 0) {
          const groupIds = adminGroups.map(g => g.group_id);
          const { data: groupUsersData, error: groupUsersError } = await supabase
            .from('user_groups')
            .select('users(id, name, email)')
            .in('group_id', groupIds);

          if (groupUsersError) throw groupUsersError;

          const uniqueUsers = new Map();
          groupUsersData.forEach(ug => {
            if (ug.users) {
              uniqueUsers.set(ug.users.id, ug.users);
            }
          });
          usersToDisplay = Array.from(uniqueUsers.values()).sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
          );
        }
      }

      setAllUsersForHistory(usersToDisplay);
      if (
        !selectedUserForHistory ||
        !usersToDisplay.some(u => u.id === selectedUserForHistory.id)
      ) {
        if (usersToDisplay.length > 0) {
          setSelectedUserForHistory(usersToDisplay[0]);
        } else {
          setSelectedUserForHistory(null);
        }
      }
    } catch (error) {
      console.error('Error loading users for history:', error);
      Alert.alert('Error', 'Failed to load users for history.');
    }
  };

  useEffect(() => {
    if (user) {
      loadAllUsersForHistory();
      loadLocationHistory(selectedUserForHistory?.id || user.id);
    }
  }, [user, selectedUserForHistory]);

  const loadLocationHistory = async (userIdToLoad) => {
    if (!userIdToLoad) {
      console.log('❌ No user ID provided to loadLocationHistory');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('location_history')
        .select('*')
        .eq('user_id', userIdToLoad)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) {
        console.error('❌ Error loading locations:', error);
        Alert.alert('Error', 'Failed to load location history');
        return;
      }

      setLocations(data || []);
      calculateStats(data || []);
    } catch (error) {
      console.error('❌ Error loading location history:', error);
      Alert.alert('Error', 'Failed to load location history');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (locationData) => {
    if (locationData.length < 2) {
      setStats({
        totalDistance: 0,
        avgAccuracy: 0,
        totalPoints: locationData.length,
      });
      return;
    }

    let totalDistance = 0;
    let totalAccuracy = 0;
    let accuracyCount = 0;

    for (let i = 1; i < locationData.length; i++) {
      const prev = locationData[i - 1];
      const curr = locationData[i];
      const distance = calculateDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude
      );
      totalDistance += distance;
      if (curr.accuracy) {
        totalAccuracy += curr.accuracy;
        accuracyCount++;
      }
    }

    setStats({
      totalDistance: totalDistance,
      avgAccuracy: accuracyCount > 0 ? totalAccuracy / accuracyCount : 0,
      totalPoints: locationData.length,
    });
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLocationHistory(selectedUserForHistory?.id || user.id);
    setRefreshing(false);
  };

  const checkAllLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('location_history')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);

      if (error) {
        console.error('❌ Error checking all locations:', error);
        Alert.alert('Error', 'Failed to check locations');
        return;
      }

      Alert.alert(
        'Database Check',
        `Found ${data?.length || 0} location records in database.`
      );
    } catch (error) {
      console.error('❌ Error checking all locations:', error);
      Alert.alert('Error', 'Failed to check locations');
    }
  };

  const handleGetDirections = (location) => {
    if (!location?.latitude || !location?.longitude) {
      Alert.alert('Error', 'Location data missing for directions.');
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
    Linking.openURL(url).catch(err =>
      console.error('Failed to open Google Maps:', err)
    );
  };

  const renderLocationItem = ({ item, index }) => (
    <View style={styles.locationItem}>
      <View style={styles.locationHeader}>
        <Text style={styles.locationNumber}>#{index + 1}</Text>
        <Text style={styles.locationTime}>
          {new Date(item.timestamp).toLocaleString()}
        </Text>
      </View>
      <View style={styles.locationDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Coordinates:</Text>
          <Text style={styles.detailValue}>
            {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
          </Text>
          <TouchableOpacity
            onPress={() => handleGetDirections(item)}
            style={styles.directionsButton}
          >
            <Text style={styles.directionsButtonText}>➡️</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Accuracy:</Text>
          <Text style={styles.detailValue}>
            {item.accuracy ? `${Math.round(item.accuracy)}m` : 'N/A'}
          </Text>
        </View>
        {item.device_name && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Device:</Text>
            <Text style={styles.detailValue}>{item.device_name}</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderStats = () => (
    <View style={styles.statsContainer}>
      <Text style={styles.statsTitle}>Statistics</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalPoints}</Text>
          <Text style={styles.statLabel}>Total Points</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {stats.totalDistance.toFixed(2)} km
          </Text>
          <Text style={styles.statLabel}>Total Distance</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {Math.round(stats.avgAccuracy)}m
          </Text>
          <Text style={styles.statLabel}>Avg Accuracy</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading location history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderStats()}
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Location History</Text>
          <View style={styles.headerButtons}>
            {userProfile?.user_type === 'superadmin' && (
              <TouchableOpacity
                onPress={() => setShowUserSelectionModal(true)}
                style={styles.selectUserButton}
              >
                <Text style={styles.selectUserButtonText}>Select User</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() =>
                loadLocationHistory(selectedUserForHistory?.id || user.id)
              }
            >
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={checkAllLocations}
              style={styles.debugButton}
            >
              <Text style={styles.debugButtonText}>Debug DB</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={locations}
          renderItem={renderLocationItem}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No location history found</Text>
              <Text style={styles.emptySubtext}>
                Start tracking your location to see history here
              </Text>
            </View>
          }
        />

        {/* User Selection Modal */}
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
                {allUsersForHistory
                  .filter(
                    u =>
                      u.name
                        ?.toLowerCase()
                        .includes(userSearchInput.toLowerCase()) ||
                      u.email
                        ?.toLowerCase()
                        .includes(userSearchInput.toLowerCase())
                  )
                  .map(u => (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.userListItem}
                      onPress={() => {
                        setSelectedUserForHistory(u);
                        setShowUserSelectionModal(false);
                        setUserSearchInput('');
                      }}
                    >
                      <Text style={styles.userListItemText}>
                        {u.name || u.email}
                      </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  loadingText: { fontSize: 18, color: '#007AFF' },
  statsContainer: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: { fontSize: 18, fontWeight: '600', color: '#1C1C1E', marginBottom: 16 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#007AFF' },
  statLabel: { fontSize: 12, color: '#8E8E93', marginTop: 4, textAlign: 'center' },
  listContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  listTitle: { fontSize: 18, fontWeight: '600', color: '#1C1C1E' },
  refreshText: { color: '#007AFF', fontSize: 16, fontWeight: '500' },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  debugButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 10,
  },
  debugButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  locationItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationNumber: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
  locationTime: { fontSize: 14, color: '#8E8E93' },
  locationDetails: { marginTop: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  detailLabel: { fontSize: 14, color: '#8E8E93', flex: 1 },
  detailValue: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 18, color: '#8E8E93', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#C7C7CC', textAlign: 'center' },
  directionsButton: { marginLeft: 10, padding: 5, backgroundColor: '#007AFF', borderRadius: 5 },
  directionsButtonText: { color: 'white', fontSize: 14 },
  selectUserButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 10,
  },
  selectUserButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20, width: '90%', maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  searchInput: {
    height: 40,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  userListScroll: {
    maxHeight: 300,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    marginTop: 10,
  },
  userListItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  userListItemText: { fontSize: 16 },
  closeModalButton: {
    marginTop: 20,
    backgroundColor: '#FF3B30',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeModalButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
