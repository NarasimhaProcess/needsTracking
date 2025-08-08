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

// Import services
import { supabase } from './src/services/supabase';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack({ route }) {
  const { session, customerId } = route.params;
  {console.log('AuthStack - customerId:', customerId)}
  return (
    <Tab.Navigator>
      <Tab.Screen name="Account" component={AccountScreen} initialParams={{ session: session, customerId: customerId }} options={{ headerShown: false }} />
      <Tab.Screen name="Products" component={ProductScreen} initialParams={{ session: session, customerId: customerId }} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={ProfileScreen} initialParams={{ session: session, customerId: customerId }} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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
        {session && session.user ? (
          <Stack.Screen name="Auth" component={AuthStack} initialParams={{ session: session, customerId: session.user.user_metadata.customerId }} options={{ headerShown: false }}/>
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