import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Image, Alert, RefreshControl, Pressable, Button } from 'react-native'; // Changed TouchableOpacity to Pressable
import { supabase } from '../services/supabase'; // Assuming you have this setup
import { useNavigation, useRoute } from '@react-navigation/native'; // Added useRoute

const DamageReportListScreen = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();
  const route = useRoute(); // Get route object
  const { customerId, areaId } = route.params; // Extract customerId and areaId

  useEffect(() => {
    fetchDamageReports();
    // Add listener for when the modal is closed to refresh the list
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDamageReports();
    });
    return unsubscribe;
  }, [navigation]); // Depend on navigation to re-run focus listener

  const fetchDamageReports = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Authentication Error', 'User not logged in.');
      setLoading(false);
      return;
    }

    // Fetch reports for the current manager, ordered by reported_at
    const { data, error } = await supabase
      .from('damage_reports')
      .select('*')
      .eq('manager_id', user.id) // Only show reports by the current manager
      .order('reported_at', { ascending: false });

    if (error) {
      console.error('Error fetching damage reports:', error.message);
      Alert.alert('Error', 'Failed to load damage reports.');
    } else {
      setReports(data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDamageReports();
  };

  const renderItem = ({ item }) => (
    <Pressable // Changed from TouchableOpacity
      style={styles.reportItem}
      onPress={() => navigation.navigate('DamageReportEdit', { reportId: item.id })} // Navigate to edit screen
      android_ripple={{ color: '#ddd' }} // Added ripple effect for Android
    >
      {item.photo_url ? (
        <Image source={{ uri: supabase.storage.from('damage_photos').getPublicUrl(item.photo_url).data.publicUrl }} style={styles.reportImage} />
      ) : (
        <View style={styles.noImageIcon}>
          <Text style={styles.noImageText}>No Image</Text>
        </View>
      )}
      <View style={styles.reportDetails}>
        <Text style={styles.reportDescription}>{item.description}</Text>
        <Text style={styles.reportDate}>
          {new Date(item.reported_at).toLocaleDateString()} - {new Date(item.reported_at).toLocaleTimeString()}
        </Text>
        <Text style={styles.reportMeta}>Customer ID: {item.customer_id}</Text>
        <Text style={styles.reportMeta}>Area ID: {item.area_id}</Text>
      </View>
    </Pressable> // Changed from TouchableOpacity
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Reports...</Text>
      </View>
    );
  }

  if (reports.length === 0 && !loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>No damage reports found.</Text>
        <Button title="Refresh" onPress={onRefresh} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Damage Reports</Text>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id.toString()} // Assuming ID is a string or can be converted
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
      {/* Floating Action Button */}
      <Pressable // Changed from TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddDamageReport', { customerId: customerId, areaId: areaId })} // Pass params to modal
        android_ripple={{ color: '#fff' }} // Added ripple effect for Android
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable> // Changed from TouchableOpacity
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#007AFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  reportItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 10,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  reportImage: {
    width: 80,
    height: 80,
    borderRadius: 4,
    marginRight: 10,
    backgroundColor: '#e0e0e0',
  },
  noImageIcon: {
    width: 80,
    height: 80,
    borderRadius: 4,
    marginRight: 10,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImageText: {
    fontSize: 12,
    color: '#666',
  },
  reportDetails: {
    flex: 1,
  },
  reportDescription: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  reportDate: {
    fontSize: 12,
    color: '#888',
    marginBottom: 3,
  },
  reportMeta: {
    fontSize: 12,
    color: '#666',
  },
  listContent: {
    paddingBottom: 20, // Add some padding at the bottom of the list
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 20,
    backgroundColor: '#007AFF',
    borderRadius: 28,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  fabText: {
    fontSize: 24,
    color: 'white',
  },
});

export default DamageReportListScreen;
