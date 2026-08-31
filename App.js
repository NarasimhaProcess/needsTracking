import 'react-native-get-random-values'; // Polyfill for crypto.getRandomValues
import React, { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
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
import SellersMapScreen from './src/screens/SellersMapScreen';
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
import CustomerDamageScreen from './src/screens/CustomerDamageScreen';

// Import custom navigators
import ProductTabNavigator from './src/navigation/ProductTabNavigator';

// Import services
import { supabase, ensureUserProfile } from './src/services/supabase';
import { CartProvider } from './src/context/CartContext';
import { announceNewOrder } from './src/services/speechService';

const Stack = createStackNavigator();

export default function App() {
  const navigationRef = useNavigationContainerRef();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const navigateToRoleScreen = async (user, currentSession) => {
      if (!user) return;
      try {
        const profile = await ensureUserProfile(user);
        const role = profile?.role || user.user_metadata?.role || 'customer';

        const currentRoute = navigationRef.current?.getCurrentRoute()?.name;
        const rootAuthScreens = [
          'Welcome',
          'Login',
          'Signup',
          'SellerLogin',
          'BuyerLogin',
          'BuyerSignup',
          'BuyerAuth',
          'DeliveryManagerLogin',
          'DeliveryManagerSignup',
        ];

        if (!currentRoute || rootAuthScreens.includes(currentRoute)) {
          if (role === 'delivery_manager') {
            navigationRef.current?.navigate('DeliveryManagerDashboard');
          } else if (role === 'seller') {
            navigationRef.current?.navigate('ProductTabs', { session: currentSession });
          } else {
            navigationRef.current?.navigate('Catalog');
          }
        }
      } catch (err) {
        console.warn('[App] Error in navigateToRoleScreen:', err);
      }
    };

    const fetchAndSetSession = async () => {
      try {
        const { data: { session } = {} } = await supabase.auth.getSession();
        if (isMounted) {
          setSession(session || null);
          if (session?.user) {
            navigateToRoleScreen(session.user, session);
          }
        }
      } catch (err) {
        console.warn('Error fetching session:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAndSetSession(); // Initial fetch

    // Fallback safety timeout: Never keep the user stuck on the loading spinner for more than 2.5s
    const timeoutTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 2500);

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (isMounted) {
        setSession(currentSession || null);
        setLoading(false);
      }

      if (event === 'SIGNED_OUT' || (!currentSession && event !== 'INITIAL_SESSION')) {
        try {
          if (navigationRef.isReady()) {
            navigationRef.reset({
              index: 0,
              routes: [{ name: 'Welcome' }],
            });
          }
        } catch (navErr) {
          console.warn('[App] Navigation reset on SIGNED_OUT notice:', navErr);
        }
      } else if (currentSession?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION')) {
        navigateToRoleScreen(currentSession.user, currentSession);

        // Clean up URL hash / code query on Web for a clean URL bar
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
            try {
              window.history.replaceState(null, '', window.location.pathname);
            } catch (_) {}
          }
        }
      }
    });

    const handleDeepLink = async (url) => {
      if (!url) return;
      console.log('[App] Deep link received:', url);

      try {
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
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error('[App] Error setting session from deep link:', error.message);
          } else if (data?.session && isMounted) {
            setSession(data.session);
            if (data.session.user) {
              navigateToRoleScreen(data.session.user, data.session);
            }
          }
        }
      } catch (sessionErr) {
        console.error('[App] Failed to set session from deep link:', sessionErr);
      }
    };

    // Check initial launch URL
    Linking.getInitialURL().then(handleDeepLink).catch(err => console.warn('Linking initial URL error:', err));

    // Listen to incoming deep links
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      isMounted = false;
      clearTimeout(timeoutTimer);
      authListener?.subscription?.unsubscribe?.();
      linkSubscription?.remove?.();
    };
  }, []);

  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    async function requestLocationPermission() {
      try {
        if (Platform.OS !== 'web') {
          console.log('[App] Requesting location permissions on startup...');
          await Location.requestForegroundPermissionsAsync();
        }
      } catch (err) {
        console.warn('Error requesting startup location permission:', err);
      }
    }
    requestLocationPermission();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return; // Push notifications handled differently on web

    registerForPushNotificationsAsync()
      .then(token => {
        if (token) setExpoPushToken(token);
      })
      .catch(err => {
        console.warn('Push notification initialization error:', err);
      });

    try {
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
          navigationRef.current?.navigate('ProductDetailScreen', { productId: data.productId });
        }
      });
    } catch (notifErr) {
      console.warn('Notification listener error:', notifErr);
    }

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // This effect runs whenever the push token or session changes
  useEffect(() => {
    const savePushToken = async () => {
      if (expoPushToken && session?.user?.id) {
        try {
          console.log(`Saving push token for user ${session.user.id}:`, expoPushToken);

          // Check if token already exists
          const { data: existingToken, error: fetchErr } = await supabase
            .from('push_tokens')
            .select('id, user_id')
            .eq('token', expoPushToken)
            .maybeSingle();

          if (!fetchErr && existingToken) {
            if (existingToken.user_id === session.user.id) {
              console.log('Push token is already registered for this user.');
              return;
            }
            // If registered to a different user, attempt update
            const { error: updateErr } = await supabase
              .from('push_tokens')
              .update({ user_id: session.user.id })
              .eq('token', expoPushToken);

            if (!updateErr) {
              console.log('Push token re-assigned to current user.');
              return;
            }
          }

          // Otherwise insert new push token
          const { error: insertErr } = await supabase
            .from('push_tokens')
            .insert({ 
              user_id: session.user.id, 
              token: expoPushToken 
            });

          if (insertErr) {
            console.warn('Note: Push token save notice (non-fatal):', insertErr.message);
          } else {
            console.log('Push token saved successfully.');
          }
        } catch (saveErr) {
          console.warn('Non-fatal error in savePushToken:', saveErr);
        }
      }
    };

    savePushToken();
  }, [expoPushToken, session]);

  // Web & In-App Realtime Order Voice Notification listener
  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel(`app_realtime_orders:${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('[App] Realtime order notification received:', payload.new);
          try {
            announceNewOrder(payload.new);
          } catch (e) {
            console.warn('[App] Realtime voice announcement error:', e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

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
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Welcome" component={WelcomeScreen} initialParams={{ session }} />
          <Stack.Screen name="SellersMap" component={SellersMapScreen} />
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
          <Stack.Screen name="CustomerDamage" component={CustomerDamageScreen} />
          <Stack.Screen name="DamageScreen" component={CustomerDamageScreen} />
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