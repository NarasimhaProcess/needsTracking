import 'react-native-get-random-values'; // Polyfill for crypto.getRandomValues
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet } from 'react-native';
import { registerRootComponent } from 'expo';

// Import screens
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import AccountScreen from './src/screens/AccountScreen';
import ProductScreen from './src/screens/ProductScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import FieldManagerScreen from './src/screens/FieldManagerScreen'; // New import
import Icon from 'react-native-vector-icons/FontAwesome'; // Add this import

// Import services
import { supabase } from './src/services/supabase';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack({ route }) {
  const { session, customerId } = route.params;
  console.log('AuthStack - areaId:', route.params.areaId);
  {console.log('AuthStack - customerId:', customerId)}
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        initialParams={{ session: session, customerId: customerId }}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon name="home" color={color} size={size} /> // Example icon
          ),
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductScreen}
        initialParams={{ session: session, customerId: customerId }}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon name="shopping-bag" color={color} size={size} /> // Example icon
          ),
        }}
      />
      <Tab.Screen // "Add Report" as a tab
        name="Damage Report"
        component={FieldManagerScreen}
        initialParams={{ session: session, customerId: customerId, areaId: route.params.areaId }} // Pass areaId from AuthStack's params
        options={{
          headerShown: true, // Show header for this tab
          title: 'Damage Report',
          tabBarIcon: ({ color, size }) => (
            <Icon name="plus-circle" color={color} size={size} /> // Example icon for adding
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        initialParams={{ session: session, customerId: customerId }}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon name="user" color={color} size={size} /> // Example icon
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [appCustomerId, setAppCustomerId] = useState(null);
  const [appAreaId, setAppAreaId] = useState(null); // New state for areaId from DB
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAndSetSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      console.log("App.js - Current Supabase Session:", session); // Add this line
      if (session && session.user) {
        // Fetch customerId and area_id from customers table
        const { data: customerData, error } = await supabase
          .from('customers')
          .select('id, area_id')
          .eq('email', session.user.email)
          .maybeSingle();

        if (error) {
          console.error("Error fetching customerId/areaId in App.js:", error.message);
          setAppCustomerId(null); // Ensure it's null on error
          setAppAreaId(null); // Ensure it's null on error
        } else if (customerData) {
          setAppCustomerId(customerData.id);
          setAppAreaId(customerData.area_id); // Set areaId
        } else {
          setAppCustomerId(null); // User not found in customers table
          setAppAreaId(null); // Clear areaId
        }
      } else {
        setAppCustomerId(null); // No session or user
        setAppAreaId(null); // Clear areaId
      }
      setLoading(false);
    };

    fetchAndSetSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      console.log("App.js - Auth State Change Session:", session); // Add this line
      if (session && session.user) {
        // Fetch customerId and area_id from customers table on auth state change
        const { data: customerData, error } = await supabase
          .from('customers')
          .select('id, area_id')
          .eq('email', session.user.email)
          .maybeSingle();

        if (error) {
          console.error("Error fetching customerId/areaId on auth state change in App.js:", error.message);
          setAppCustomerId(null);
          setAppAreaId(null);
        } else if (customerData) {
          setAppCustomerId(customerData.id);
          setAppAreaId(customerData.area_id);
        } else {
          setAppCustomerId(null);
          setAppAreaId(null);
        }
      } else {
        setAppCustomerId(null);
        setAppAreaId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator>
        {session && session.user && appCustomerId ? (
          <>
            <Stack.Screen
              name="Auth"
              component={AuthStack}
              initialParams={{ session: session, customerId: appCustomerId, areaId: appAreaId }} // Pass areaId
              options={{ headerShown: false }}
            />
            </>
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }}/>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }}/>
            <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }}/>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    fontSize: 18,
    color: '#007AFF',
  },
});

registerRootComponent(App);