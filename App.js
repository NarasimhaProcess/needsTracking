import 'react-native-get-random-values'; // Polyfill for crypto.getRandomValues
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { registerRootComponent } from 'expo';

// React Navigation imports
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Import screens
import WelcomeScreen from './src/screens/WelcomeScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import BuyerAuthScreen from './src/screens/BuyerAuthScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrderConfirmationScreen from './src/screens/OrderConfirmationScreen';
import OrderListScreen from './src/screens/OrderListScreen';
// ProfileScreen, InventoryScreen, InvoiceScreen, ProductScreen will be imported by ProductTabNavigator
import TopProductsScreen from './src/screens/TopProductsScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import OrderEditScreen from './src/screens/OrderEditScreen';
import LoginScreen from './src/screens/LoginScreen';
import SellerLoginScreen from './src/screens/SellerLoginScreen';
import ProductMapScreen from './src/screens/ProductMapScreen';
// import InventoryScreen from './src/screens/InventoryScreen'; // Moved to ProductTabNavigator
// import InvoiceScreen from './src/screens/InvoiceScreen'; // Moved to ProductTabNavigator

// Import custom navigators
import ProductTabNavigator from './src/navigation/ProductTabNavigator';

// Import services
import { supabase } from './src/services/supabase';
import { CartProvider } from './src/context/CartContext';

const Stack = createStackNavigator();

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAndSetSession = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      console.log('App.js session?.user?.user_metadata?.customerId (on mount/auth change):', session?.user?.user_metadata?.customerId);
      setLoading(false);
    };

    fetchAndSetSession(); // Initial fetch

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchAndSetSession(); // Re-fetch the session to ensure user_metadata is up-to-date
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <CartProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Stack.Navigator key={session ? 'app' : 'auth'} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Welcome" component={WelcomeScreen} initialParams={{ session }} />
          <Stack.Screen name="Catalog" component={CatalogScreen} />
          <Stack.Screen name="BuyerAuth" component={BuyerAuthScreen} />
          <Stack.Screen name="Cart" component={CartScreen} />
          <Stack.Screen name="Checkout" component={CheckoutScreen} />
          <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
          <Stack.Screen name="OrderList" component={OrderListScreen} />
          <Stack.Screen name="TopProducts" component={TopProductsScreen} />
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
          <Stack.Screen name="OrderEdit" component={OrderEditScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SellerLogin" component={SellerLoginScreen} />
          <Stack.Screen name="ProductMapScreen" component={ProductMapScreen} />
          {/* ProductTabNavigator will handle Product, Inventory, Profile, Invoice screens */}
          <Stack.Screen name="ProductTabs" component={ProductTabNavigator} initialParams={{ session }} />
          {console.log('App.js: Session passed to ProductTabs:', session)}
        </Stack.Navigator>
      </NavigationContainer>
    </CartProvider>
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