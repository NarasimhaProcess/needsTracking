import 'react-native-get-random-values'; // Polyfill for crypto.getRandomValues
import React, { useState, useEffect } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Text
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { registerRootComponent } from 'expo';

// Import screens
import WelcomeScreen from './src/screens/WelcomeScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import BuyerAuthScreen from './src/screens/BuyerAuthScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrderConfirmationScreen from './src/screens/OrderConfirmationScreen';
import OrderListScreen from './src/screens/OrderListScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TopProductsScreen from './src/screens/TopProductsScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import OrderEditScreen from './src/screens/OrderEditScreen';
import LoginScreen from './src/screens/LoginScreen';
import SellerLoginScreen from './src/screens/SellerLoginScreen';
import InventoryScreen from './src/screens/InventoryScreen';

// Import services
import { supabase } from './src/services/supabase';
import { CartProvider } from './src/context/CartContext';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState(null);
  const [modalParams, setModalParams] = useState({});

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

  const navigation = {
    navigate: (modalName, params = {}) => {
      setModalParams(params);
      setActiveModal(modalName);
    },
    goBack: () => {
      setActiveModal(null);
      setModalParams({});
    },
  };

  const renderModalContent = () => {
    switch (activeModal) {
      case 'Catalog':
        return <CatalogScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'BuyerAuth':
        return <BuyerAuthScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'Cart':
        return <CartScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'Checkout':
        return <CheckoutScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'OrderConfirmation':
        return <OrderConfirmationScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'OrderList':
        return <OrderListScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'Profile':
        return <ProfileScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'TopProducts':
        return <TopProductsScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'Login':
        return <LoginScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'SellerLogin':
        return <SellerLoginScreen navigation={navigation} route={{ params: modalParams }} />;
      case 'Inventory':
        return <InventoryScreen navigation={navigation} route={{ params: modalParams }} />;
      default:
        return null;
    }
  };

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
      <View style={{ flex: 1 }}>
        <StatusBar style="auto" />
        <WelcomeScreen navigation={navigation} />
        <Modal
          visible={activeModal !== null}
          animationType="slide"
          transparent={true}
          onRequestClose={() => navigation.goBack()}
        >
          {renderModalContent()}
        </Modal>
      </View>
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