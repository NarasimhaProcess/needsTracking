import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { FontAwesome as Icon } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useCart } from '../context/CartContext';
import { supabase } from '../services/supabase';
import { showAlert } from '../utils/alertUtils';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const navigation = useNavigation();
  const { user, role } = useCart();

  // Role-based automatic redirection if logged in
  useEffect(() => {
    try {
      if (user) {
        if (role === 'delivery_manager') {
          navigation.replace('DeliveryManagerDashboard');
        } else if (role === 'seller' || role === 'admin') {
          navigation.replace('ProductTabs');
        }
      }
    } catch (e) {
      console.warn('Role redirection notice:', e.message);
    }
  }, [user, role, navigation]);

  const handleLogout = () => {
    showAlert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Welcome' }],
            });
          } catch (err) {
            console.error('Logout error:', err);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* Upper Brand / Logo Section */}
        <View style={styles.brandContainer}>
          <View style={styles.logoIconBox}>
            <Icon name="map-marker" size={54} color="#007AFF" />
          </View>
          <Text style={styles.appName}>Needs Tracker</Text>
          <Text style={styles.tagline}>
            Your Hyperlocal Logistics & Marketplace Platform
          </Text>
          <Text style={styles.description}>
            Find verified local stores near you, purchase products with ease, and track your orders or deliveries in real-time.
          </Text>
        </View>

        {/* Action Buttons Section */}
        <View style={styles.actionsContainer}>
          {/* Main call-to-action: Sellers Map */}
          <TouchableOpacity
            style={styles.mainMapButton}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('SellersMap')}
          >
            <View style={styles.mainButtonContent}>
              <Icon name="map" size={20} color="#FFFFFF" style={styles.buttonIcon} />
              <Text style={styles.mainButtonText}>Browse Sellers Map</Text>
            </View>
            <Icon name="chevron-right" size={14} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Portal Separator */}
          <Text style={styles.sectionHeader}>Portals & Access</Text>

          <View style={styles.portalsGrid}>
            {/* Buyer Portal */}
            <TouchableOpacity
              style={styles.portalCard}
              activeOpacity={0.8}
              onPress={() => {
                if (user && (role === 'buyer' || role === 'customer')) {
                  navigation.navigate('Catalog');
                } else {
                  navigation.navigate('BuyerLogin');
                }
              }}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Icon name="shopping-cart" size={24} color="#007AFF" />
              </View>
              <Text style={styles.portalTitle}>Buyer</Text>
              <Text style={styles.portalDesc}>Shop Local Stores</Text>
            </TouchableOpacity>

            {/* Seller Portal */}
            <TouchableOpacity
              style={styles.portalCard}
              activeOpacity={0.8}
              onPress={() => {
                if (user && (role === 'seller' || role === 'admin')) {
                  navigation.navigate('ProductTabs');
                } else {
                  navigation.navigate('SellerLogin');
                }
              }}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Icon name="home" size={22} color="#10B981" />
              </View>
              <Text style={styles.portalTitle}>Seller</Text>
              <Text style={styles.portalDesc}>Manage Inventory</Text>
            </TouchableOpacity>

            {/* Delivery Portal */}
            <TouchableOpacity
              style={styles.portalCard}
              activeOpacity={0.8}
              onPress={() => {
                if (user && role === 'delivery_manager') {
                  navigation.navigate('DeliveryManagerDashboard');
                } else {
                  navigation.navigate('DeliveryManagerLogin');
                }
              }}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#FAF5FF' }]}>
                <Icon name="truck" size={22} color="#8B5CF6" />
              </View>
              <Text style={styles.portalTitle}>Delivery</Text>
              <Text style={styles.portalDesc}>Track & Deliver</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer Info / Logout */}
        <View style={styles.footer}>
          {user ? (
            <View style={styles.userFooterInfo}>
              <Text style={styles.signedInText} numberOfLines={1}>
                Signed in as: <Text style={styles.userEmailText}>{user.email || user.phone}</Text>
              </Text>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                <Icon name="sign-out" size={14} color="#EF4444" />
                <Text style={styles.logoutText}>Logout</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.footerVersion}>Version 1.0.0</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 30,
  },
  brandContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: Platform.OS === 'ios' ? 24 : 36,
  },
  logoIconBox: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 24,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 16,
    paddingHorizontal: 12,
  },
  actionsContainer: {
    paddingHorizontal: 20,
    width: '100%',
    marginBottom: 20,
  },
  mainMapButton: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 24,
  },
  mainButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: 12,
  },
  mainButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingLeft: 4,
  },
  portalsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  portalCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  portalIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  portalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  portalDesc: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  userFooterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  signedInText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
    marginRight: 10,
  },
  userEmailText: {
    fontWeight: '600',
    color: '#0F172A',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logoutText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  footerVersion: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
