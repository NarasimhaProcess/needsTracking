import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { FontAwesome as Icon } from '@expo/vector-icons';
import { useCart } from '../context/CartContext';
import { supabase } from '../services/supabase';
import { showAlert } from '../utils/alertUtils';
import PreLoginFooter from './PreLoginFooter';

const { width, height } = Dimensions.get('window');

export default function PortalsMenuModal({ visible, onClose, navigation }) {
  const { user, role } = useCart();

  const safeNavigate = (screenName, params = {}) => {
    if (onClose) onClose();
    if (!navigation) return;

    try {
      if (screenName === 'ProductTabs') {
        navigation.navigate('ProductTabs', { role: 'seller', ...params });
      } else {
        navigation.navigate(screenName, params);
      }
    } catch (e) {
      console.warn(`[PortalsMenuModal] Navigation to ${screenName} failed:`, e);
      try {
        navigation.reset({
          index: 0,
          routes: [{ name: screenName, params }],
        });
      } catch (rErr) {
        console.warn('[PortalsMenuModal] Reset navigation failed:', rErr);
      }
    }
  };

  const handleLogout = () => {
    showAlert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            if (onClose) onClose();
            await supabase.auth.signOut();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Welcome' }],
            });
          } catch (err) {
            console.error('[PortalsMenuModal] Logout error:', err);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={styles.menuCard}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={styles.menuHeader}>
            <View>
              <Text style={styles.menuHeaderTitle}>Needs Tracker</Text>
              <Text style={styles.menuHeaderSubtitle}>Portals, Access & Support</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.menuCloseBtn}>
              <Icon name="times" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.menuScrollView}
            contentContainerStyle={styles.menuScrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* If user is logged in, show user profile info */}
            {user ? (
              <View style={styles.userSection}>
                <View style={styles.userProfileRow}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {(user.email || user.phone || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userEmail} numberOfLines={1}>
                      {user.email || user.phone || 'Signed In User'}
                    </Text>
                    <View style={styles.roleTag}>
                      <Text style={styles.roleTagText}>
                        {role ? role.toUpperCase() : 'USER'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.userQuickLinks}>
                  <TouchableOpacity
                    style={styles.quickLinkItem}
                    onPress={() => safeNavigate('OrderList')}
                  >
                    <Icon name="list-alt" size={15} color="#007AFF" />
                    <Text style={styles.quickLinkText}>My Orders</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickLinkItem}
                    onPress={() => safeNavigate('Cart')}
                  >
                    <Icon name="shopping-cart" size={15} color="#007AFF" />
                    <Text style={styles.quickLinkText}>My Cart</Text>
                  </TouchableOpacity>

                  {(role === 'seller' || role === 'admin') && (
                    <TouchableOpacity
                      style={styles.quickLinkItem}
                      onPress={() => safeNavigate('ProductTabs')}
                    >
                      <Icon name="cubes" size={15} color="#10B981" />
                      <Text style={styles.quickLinkText}>Manage Store</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null}

            {/* Portals Heading */}
            <Text style={styles.portalsHeading}>Portals & Access</Text>

            {/* 1. Buyer Portal */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.7}
              onPress={() => safeNavigate('BuyerLogin')}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Icon name="shopping-cart" size={20} color="#007AFF" />
              </View>
              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>Buyer Portal</Text>
                <Text style={styles.portalDesc}>Browse nearby stores & place orders</Text>
              </View>
              <Icon name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            {/* 2. Seller Portal */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.7}
              onPress={() => safeNavigate('SellerLogin')}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Icon name="home" size={20} color="#10B981" />
              </View>
              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>Seller Portal</Text>
                <Text style={styles.portalDesc}>Manage products, pricing & inventory</Text>
              </View>
              <Icon name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            {/* 3. Delivery Manager Portal */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.7}
              onPress={() => safeNavigate('DeliveryManagerLogin')}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#FAF5FF' }]}>
                <Icon name="truck" size={18} color="#8B5CF6" />
              </View>
              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>Delivery Portal</Text>
                <Text style={styles.portalDesc}>Real-time delivery management & tracking</Text>
              </View>
              <Icon name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            {/* 4. Sellers Map */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.7}
              onPress={() => safeNavigate('SellersMap')}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Icon name="map-marker" size={20} color="#D97706" />
              </View>
              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>Stores Map</Text>
                <Text style={styles.portalDesc}>View nearby sellers on interactive map</Text>
              </View>
              <Icon name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            {/* 5. Welcome & Overview */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.7}
              onPress={() => safeNavigate('Welcome')}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#F1F5F9' }]}>
                <Icon name="info-circle" size={18} color="#64748B" />
              </View>
              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>About & Overview</Text>
                <Text style={styles.portalDesc}>Platform info and features</Text>
              </View>
              <Icon name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            {/* Business Setup Card */}
            <PreLoginFooter containerStyle={{ marginTop: 14, paddingHorizontal: 0 }} />
          </ScrollView>

          {/* Sticky Logout if signed in */}
          {user && (
            <View style={styles.menuFooterContainer}>
              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Icon name="sign-out" size={16} color="#EF4444" />
                <Text style={styles.logoutButtonText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 20 : 16,
  },
  menuCard: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 440 : 390,
    maxHeight: Platform.OS === 'web' ? '86vh' : '86%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.22)',
      },
    }),
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  menuHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  menuHeaderSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  menuCloseBtn: {
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  menuScrollView: {
    flex: 1,
  },
  menuScrollContent: {
    paddingBottom: 30,
  },
  userSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  roleTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#007AFF',
  },
  userQuickLinks: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  quickLinkItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  portalsHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingLeft: 4,
  },
  portalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
      },
    }),
  },
  portalIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  portalDetails: {
    flex: 1,
  },
  portalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  portalDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  menuFooterContainer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    paddingVertical: 12,
    borderRadius: 12,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
});
