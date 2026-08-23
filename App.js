import 'react-native-get-random-values'; // Polyfill for crypto.getRandomValues
import React, { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from './src/services/notificationService';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// React Navigation imports
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Import screens
import WelcomeScreen from './src/screens/WelcomeScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import BuyerAuthScreen from './src/screens/BuyerAuthScreen';
import BuyerLoginScreen from './src/screens/BuyerLoginScreen';
import BuyerSignupScreen from './src/screens/BuyerSignupScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrderConfirmationScreen from './src/screens/OrderConfirmationScreen';
import OrderListScreen from './src/screens/OrderListScreen';
// ProfileScreen, InventoryScreen, InvoiceScreen, ProductScreen will be imported by ProductTabNavigator
import TopProductsScreen from './src/screens/TopProductsScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import OrderEditScreen from './src/screens/OrderEditScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import SellerLoginScreen from './src/screens/SellerLoginScreen';
import ProductMapScreen from './src/screens/ProductMapScreen';
import DeliveryManagerLoginScreen from './src/screens/DeliveryManagerLoginScreen';
import DeliveryManagerDashboard from './src/screens/DeliveryManagerDashboard';
import DeliveryManagerSignupScreen from './src/screens/DeliveryManagerSignupScreen';
import AdminMapScreen from './src/screens/AdminMapScreen';
import UpiQrScreen from './src/screens/UpiQrScreen';
// import InventoryScreen from './src/screens/InventoryScreen'; // Moved to ProductTabNavigator
// import InvoiceScreen from './src/screens/InvoiceScreen'; // Moved to ProductTabNavigator

// Import custom navigators
import ProductTabNavigator from './src/navigation/ProductTabNavigator';

// Import services
import { supabase } from './src/services/supabase';
import { CartProvider } from './src/context/CartContext';

const Stack = createStackNavigator();

export default function App() {
  const navigationRef = useNavigationContainerRef();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAndSetSession = async () => {
      setLoading(true);
      try {
        let { data: { session } } = await supabase.auth.getSession();
        setSession(session);
      } catch (err) {
        console.error('Error fetching session:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAndSetSession(); // Initial fetch

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    const handleDeepLink = async (url) => {
      if (!url) return;
      console.log('[App] Deep link received:', url);

      let accessToken = null;
      let refreshToken = null;

      if (url.includes('#')) {
        const hashParams = new URLSearchParams(url.split('#')[1]);
        accessToken = hashParams.get('access_token');
        refreshToken = hashParams.get('refresh_token');
      }

      if (!accessToken && url.includes('?')) {
        const queryParams = new URLSearchParams(url.split('?')[1]);
        accessToken = queryParams.get('access_token');
        refreshToken = queryParams.get('refresh_token');
      }

      if (accessToken && refreshToken) {
        console.log('[App] Setting session from OAuth deep link tokens');
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error('[App] Error setting session from deep link:', error.message);
          } else if (data?.session) {
            setSession(data.session);

            // Navigate to appropriate screen based on user role
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', data.session.user.id)
                .maybeSingle();

              if (profile?.role === 'delivery_manager') {
                navigationRef.current?.navigate('DeliveryManagerDashboard');
              } else if (profile?.role === 'seller') {
                navigationRef.current?.navigate('ProductTabs');
              } else {
                navigationRef.current?.navigate('Catalog');
              }
            } catch (navErr) {
              navigationRef.current?.navigate('Catalog');
            }
          }
        } catch (sessionErr) {
          console.error('[App] Failed to set session from deep link:', sessionErr);
        }
      }
    };

    // Check initial launch URL
    Linking.getInitialURL().then(handleDeepLink);

    // Listen to incoming deep links
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    if (Platform.OS === 'web') return; // Push notifications handled differently on web

    registerForPushNotificationsAsync().then(token => setExpoPushToken(token));

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log("Notification tapped with data: ", data);

      // Navigate based on the data received
      if (data?.orderId) {
        navigationRef.current?.navigate('OrderDetail', { orderId: data.orderId });
      } else if (data?.productId) {
        // Ensure 'ProductDetailScreen' is a valid screen name in your navigation setup
        navigationRef.current?.navigate('ProductDetailScreen', { productId: data.productId });
      }
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  // This effect runs whenever the push token or session changes
  useEffect(() => {
    const savePushToken = async () => {
      if (expoPushToken && session?.user?.id) {
        console.log(`Saving push token for user ${session.user.id}:`, expoPushToken);
        const { error } = await supabase
          .from('push_tokens')
          .upsert({ 
            user_id: session.user.id,
            token: expoPushToken 
          }, { 
            onConflict: 'token' 
          });

        if (error) {
          console.error('Error saving push token:', error.message);
        } else {
          console.log('Push token saved successfully.');
        }
      }
    };

    savePushToken();
  }, [expoPushToken, session]);

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
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="auto" />
        <Stack.Navigator key={session ? 'app' : 'auth'} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Welcome" component={WelcomeScreen} initialParams={{ session }} />
          <Stack.Screen name="Catalog" component={CatalogScreen} />
          <Stack.Screen name="BuyerAuth" component={BuyerAuthScreen} />
          <Stack.Screen name="BuyerLogin" component={BuyerLoginScreen} />
          <Stack.Screen name="BuyerSignup" component={BuyerSignupScreen} />
          <Stack.Screen name="Cart" component={CartScreen} />
          <Stack.Screen name="Checkout" component={CheckoutScreen} />
          <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
          <Stack.Screen name="UpiQr" component={UpiQrScreen} />
          <Stack.Screen name="OrderList" component={OrderListScreen} />
          <Stack.Screen name="TopProducts" component={TopProductsScreen} />
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
          <Stack.Screen name="OrderEdit" component={OrderEditScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="SellerLogin" component={SellerLoginScreen} />
          <Stack.Screen name="ProductMapScreen" component={ProductMapScreen} />
          <Stack.Screen name="DeliveryManagerLogin" component={DeliveryManagerLoginScreen} />
          <Stack.Screen name="DeliveryManagerDashboard" component={DeliveryManagerDashboard} />
          <Stack.Screen name="DeliveryManagerSignup" component={DeliveryManagerSignupScreen} />
          <Stack.Screen name="AdminMap" component={AdminMapScreen} />
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