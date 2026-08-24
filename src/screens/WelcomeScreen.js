import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';

import { FontAwesome as Icon } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useCart } from '../context/CartContext';
import { supabase } from '../services/supabase';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const navigation = useNavigation();
  const { user, role } = useCart();

  const [isMenuVisible, setIsMenuVisible] = useState(false);

  // ---------------------------------------------------------
  // INITIAL LOAD
  // ---------------------------------------------------------
  useEffect(() => {
    console.log('====================================');
    console.log('NEEDS TRACKER - WELCOME SCREEN LOADED');
    console.log('====================================');

    // Keep this screen simple for initial APK testing.
    // GPS, Supabase seller loading and WebView map
    // are intentionally disabled for this test.
  }, []);

  // ---------------------------------------------------------
  // ROLE REDIRECTION
  // ---------------------------------------------------------
  useEffect(() => {
    if (role === 'delivery_manager') {
      console.log('Redirecting delivery manager...');

      navigation.replace('DeliveryManagerDashboard');
    }
  }, [role, navigation]);

  // ---------------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------------
  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsMenuVisible(false);

              const { error } = await supabase.auth.signOut();

              if (error) {
                console.error('Logout error:', error);
                Alert.alert('Logout Error', error.message);
              }
            } catch (error) {
              console.error('Logout exception:', error);
            }
          },
        },
      ]
    );
  };

  // ---------------------------------------------------------
  // PORTAL NAVIGATION
  // ---------------------------------------------------------
  const openBuyerPortal = () => {
    setIsMenuVisible(false);

    try {
      navigation.navigate('BuyerLogin');
    } catch (error) {
      console.error('Buyer navigation error:', error);
      Alert.alert('Navigation Error', 'Buyer Login screen is not configured.');
    }
  };

  const openSellerPortal = () => {
    setIsMenuVisible(false);

    try {
      navigation.navigate('SellerLogin');
    } catch (error) {
      console.error('Seller navigation error:', error);
      Alert.alert('Navigation Error', 'Seller Login screen is not configured.');
    }
  };

  const openDeliveryPortal = () => {
    setIsMenuVisible(false);

    try {
      navigation.navigate('DeliveryManagerLogin');
    } catch (error) {
      console.error('Delivery navigation error:', error);
      Alert.alert(
        'Navigation Error',
        'Delivery Login screen is not configured.'
      );
    }
  };

  // ---------------------------------------------------------
  // WELCOME SCREEN
  // ---------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>

      {/* Main Welcome Area */}
      <View style={styles.welcomeContainer}>

        <View style={styles.logoCircle}>
          <Icon
            name="map-marker"
            size={54}
            color="#FFFFFF"
          />
        </View>

        <Text style={styles.title}>
          Needs Tracker
        </Text>

        <Text style={styles.welcomeText}>
          Welcome
        </Text>

        <Text style={styles.subtitle}>
          Find nearby sellers and manage your needs easily.
        </Text>

        <View style={styles.statusBox}>
          <Icon
            name="check-circle"
            size={20}
            color="#10B981"
          />

          <Text style={styles.statusText}>
            App loaded successfully
          </Text>
        </View>

        {/* Open Portals Button */}
        <TouchableOpacity
          style={styles.openButton}
          activeOpacity={0.8}
          onPress={() => setIsMenuVisible(true)}
        >
          <Icon
            name="ellipsis-h"
            size={20}
            color="#FFFFFF"
          />

          <Text style={styles.openButtonText}>
            Open Portals
          </Text>
        </TouchableOpacity>

      </View>

      {/* ---------------------------------------------------
          PORTAL MENU
      --------------------------------------------------- */}
      <Modal
        visible={isMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>

          <View style={styles.menuCard}>

            {/* Header */}
            <View style={styles.menuHeader}>

              <View>
                <Text style={styles.menuTitle}>
                  Needs Tracking
                </Text>

                <Text style={styles.menuSubtitle}>
                  Access Portals & Services
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsMenuVisible(false)}
              >
                <Icon
                  name="times"
                  size={18}
                  color="#64748B"
                />
              </TouchableOpacity>

            </View>

            {/* Logged in user */}
            {user && (
              <View style={styles.userSection}>

                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {(user.email || user.phone || 'U')
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>

                <View style={styles.userInfo}>

                  <Text
                    style={styles.userEmail}
                    numberOfLines={1}
                  >
                    {user.email ||
                      user.phone ||
                      'Signed In User'}
                  </Text>

                  <Text style={styles.userRole}>
                    {role
                      ? role.toUpperCase()
                      : 'USER'}
                  </Text>

                </View>

              </View>
            )}

            {/* Portals */}
            <Text style={styles.portalsTitle}>
              Portals
            </Text>

            {/* Buyer */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.8}
              onPress={openBuyerPortal}
            >
              <View
                style={[
                  styles.portalIcon,
                  { backgroundColor: '#EFF6FF' },
                ]}
              >
                <Icon
                  name="shopping-cart"
                  size={22}
                  color="#007AFF"
                />
              </View>

              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>
                  Buyer Portal
                </Text>

                <Text style={styles.portalDescription}>
                  Browse nearby sellers & place orders
                </Text>
              </View>

              <Icon
                name="chevron-right"
                size={14}
                color="#94A3B8"
              />
            </TouchableOpacity>

            {/* Seller */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.8}
              onPress={openSellerPortal}
            >
              <View
                style={[
                  styles.portalIcon,
                  { backgroundColor: '#ECFDF5' },
                ]}
              >
                <Icon
                  name="home"
                  size={22}
                  color="#10B981"
                />
              </View>

              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>
                  Seller Portal
                </Text>

                <Text style={styles.portalDescription}>
                  Manage products, pricing & inventory
                </Text>
              </View>

              <Icon
                name="chevron-right"
                size={14}
                color="#94A3B8"
              />
            </TouchableOpacity>

            {/* Delivery */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.8}
              onPress={openDeliveryPortal}
            >
              <View
                style={[
                  styles.portalIcon,
                  { backgroundColor: '#FAF5FF' },
                ]}
              >
                <Icon
                  name="truck"
                  size={22}
                  color="#8B5CF6"
                />
              </View>

              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>
                  Delivery Portal
                </Text>

                <Text style={styles.portalDescription}>
                  Real-time delivery management & tracking
                </Text>
              </View>

              <Icon
                name="chevron-right"
                size={14}
                color="#94A3B8"
              />
            </TouchableOpacity>

            {/* Logged-in user actions */}
            {user && (
              <>
                <Text style={styles.quickActionsTitle}>
                  My Account
                </Text>

                <View style={styles.quickActionsRow}>

                  <TouchableOpacity
                    style={styles.quickAction}
                    onPress={() => {
                      setIsMenuVisible(false);

                      try {
                        navigation.navigate('OrderList');
                      } catch (error) {
                        console.error(error);
                      }
                    }}
                  >
                    <Icon
                      name="list-alt"
                      size={17}
                      color="#007AFF"
                    />

                    <Text style={styles.quickActionText}>
                      My Orders
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickAction}
                    onPress={() => {
                      setIsMenuVisible(false);

                      try {
                        navigation.navigate('Cart');
                      } catch (error) {
                        console.error(error);
                      }
                    }}
                  >
                    <Icon
                      name="shopping-cart"
                      size={17}
                      color="#007AFF"
                    />

                    <Text style={styles.quickActionText}>
                      My Cart
                    </Text>
                  </TouchableOpacity>

                </View>

                {/* Store management */}
                {(role === 'seller' || role === 'admin') && (
                  <TouchableOpacity
                    style={styles.manageStoreButton}
                    onPress={() => {
                      setIsMenuVisible(false);

                      try {
                        navigation.navigate('ProductTabs');
                      } catch (error) {
                        console.error(error);
                      }
                    }}
                  >
                    <Icon
                      name="cubes"
                      size={17}
                      color="#10B981"
                    />

                    <Text style={styles.manageStoreText}>
                      Manage Store
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Logout */}
                <TouchableOpacity
                  style={styles.logoutButton}
                  onPress={handleLogout}
                >
                  <Icon
                    name="sign-out"
                    size={17}
                    color="#EF4444"
                  />

                  <Text style={styles.logoutText}>
                    Log Out
                  </Text>
                </TouchableOpacity>
              </>
            )}

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// =========================================================
// STYLES
// =========================================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  welcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  logoCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 15,

    elevation: 8,
  },

  title: {
    marginTop: 24,
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
  },

  welcomeText: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '600',
    color: '#007AFF',
  },

  subtitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
  },

  statusBox: {
    marginTop: 25,
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#ECFDF5',

    paddingHorizontal: 16,
    paddingVertical: 10,

    borderRadius: 12,

    borderWidth: 1,
    borderColor: '#A7F3D0',
  },

  statusText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#047857',
  },

  openButton: {
    marginTop: 28,

    height: 50,
    paddingHorizontal: 28,

    borderRadius: 25,

    backgroundColor: '#007AFF',

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,

    elevation: 6,
  },

  openButtonText: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // -------------------------------------------------------
  // MODAL
  // -------------------------------------------------------

  modalOverlay: {
    flex: 1,

    backgroundColor: 'rgba(15, 23, 42, 0.6)',

    justifyContent: 'center',
    alignItems: 'center',

    padding: 20,
  },

  menuCard: {
    width: width > 420 ? 380 : '100%',

    maxHeight: '90%',

    backgroundColor: '#FFFFFF',

    borderRadius: 24,

    padding: 20,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,

    elevation: 10,
  },

  menuHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',

    marginBottom: 18,
  },

  menuTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0F172A',
  },

  menuSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: '#64748B',
  },

  closeButton: {
    width: 36,
    height: 36,

    borderRadius: 18,

    backgroundColor: '#F1F5F9',

    alignItems: 'center',
    justifyContent: 'center',
  },

  // -------------------------------------------------------
  // USER
  // -------------------------------------------------------

  userSection: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#F8FAFC',

    borderWidth: 1,
    borderColor: '#E2E8F0',

    borderRadius: 14,

    padding: 12,

    marginBottom: 18,
  },

  userAvatar: {
    width: 42,
    height: 42,

    borderRadius: 21,

    backgroundColor: '#007AFF',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 11,
  },

  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  userInfo: {
    flex: 1,
  },

  userEmail: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '600',
  },

  userRole: {
    alignSelf: 'flex-start',

    marginTop: 4,

    color: '#0284C7',

    fontSize: 10,
    fontWeight: '800',

    backgroundColor: '#E0F2FE',

    paddingHorizontal: 7,
    paddingVertical: 3,

    borderRadius: 5,
  },

  // -------------------------------------------------------
  // PORTALS
  // -------------------------------------------------------

  portalsTitle: {
    marginBottom: 10,

    fontSize: 13,
    fontWeight: '800',

    color: '#94A3B8',

    textTransform: 'uppercase',

    letterSpacing: 0.5,
  },

  portalItem: {
    flexDirection: 'row',
    alignItems: 'center',

    padding: 12,

    marginBottom: 10,

    borderRadius: 14,

    backgroundColor: '#FFFFFF',

    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  portalIcon: {
    width: 44,
    height: 44,

    borderRadius: 12,

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 12,
  },

  portalDetails: {
    flex: 1,
  },

  portalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },

  portalDescription: {
    marginTop: 3,

    fontSize: 11.5,

    color: '#64748B',
  },

  // -------------------------------------------------------
  // ACCOUNT
  // -------------------------------------------------------

  quickActionsTitle: {
    marginTop: 6,
    marginBottom: 9,

    fontSize: 13,
    fontWeight: '700',

    color: '#94A3B8',

    textTransform: 'uppercase',
  },

  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },

  quickAction: {
    flex: 1,

    flexDirection: 'row',

    alignItems: 'center',
    justifyContent: 'center',

    paddingVertical: 10,

    backgroundColor: '#F8FAFC',

    borderWidth: 1,
    borderColor: '#E2E8F0',

    borderRadius: 10,
  },

  quickActionText: {
    marginLeft: 7,

    fontSize: 12,
    fontWeight: '600',

    color: '#334155',
  },

  manageStoreButton: {
    marginTop: 9,

    flexDirection: 'row',

    alignItems: 'center',
    justifyContent: 'center',

    paddingVertical: 11,

    borderRadius: 10,

    backgroundColor: '#ECFDF5',

    borderWidth: 1,
    borderColor: '#A7F3D0',
  },

  manageStoreText: {
    marginLeft: 8,

    fontSize: 13,
    fontWeight: '700',

    color: '#047857',
  },

  logoutButton: {
    marginTop: 10,

    flexDirection: 'row',

    alignItems: 'center',
    justifyContent: 'center',

    paddingVertical: 11,

    borderRadius: 10,

    backgroundColor: '#FEF2F2',

    borderWidth: 1,
    borderColor: '#FECACA',
  },

  logoutText: {
    marginLeft: 8,

    color: '#EF4444',

    fontSize: 13,
    fontWeight: '700',
  },

});