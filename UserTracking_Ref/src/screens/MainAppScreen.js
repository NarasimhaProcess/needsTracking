
// src/screens/MainAppScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, Button, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '../services/supabaseClient'; // Adjust path

const MainAppScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        Alert.alert('Logout Failed', error.message);
      } else {
        // Auth listener in App.js will handle navigation to LoginScreen
        Alert.alert('Success', 'You have been logged out.');
      }
    }
  } catch (error) {
    console.error('Logout exception:', error);
    Alert.alert('Error', 'An unexpected error occurred during logout.');
  } finally {
    setLoading(false);
  };

  const fetchData = async () => {
    if (!supabase) {
      Alert.alert('Error', 'Supabase not initialized.');
      return;
    }
    setLoading(true);
    try {
      const tableName = 'your_main_project_table'; // Now using a single table for all data
      console.log(`Fetching from ${tableName}`);

      const { data, error } = await supabase.from(tableName).select('*');
      if (error) {
        console.error(`Error fetching data from ${tableName}:`, error.message);
        Alert.alert('Error', `Failed to fetch data: ${error.message}`);
      }
    } catch (error) {
      console.error('Fetch data exception:', error);
      Alert.alert('Error', 'An unexpected error occurred while fetching data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to the App!</Text>
      <Text style={styles.infoText}>Logged in as: {supabase.auth.currentUser?.email}</Text>

      <View style={styles.buttonContainer}>
        <Button title={loading ? "Fetching..." : "Fetch Data"} onPress={fetchData} disabled={loading} />
        <View style={{ height: 10 }} />
        <Button title={loading ? "Logging out..." : "Logout"} onPress={handleLogout} disabled={loading} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  infoText: {
    fontSize: 16,
    marginBottom: 5,
    textAlign: 'center',
  },
  buttonContainer: {
    marginTop: 30,
    width: '80%',
  },
});

export default MainAppScreen;
