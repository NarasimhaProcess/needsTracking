import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useCart } from '../context/CartContext';
import { getGuestCart } from '../services/localStorageService';

const StoreNavigationFooter = ({
  activeTab = 'store',
  navigation,
  route,
  sellerId: propSellerId,
  sellerName: propSellerName,
  customerId: propCustomerId,
  onStorePress,
  forceShow = false,
}) => {
  const { cart, cartItemCount: contextCartItemCount, user } = useCart();
  const [guestCount, setGuestCount] = React.useState(0);

  // Compute effective store / customer params
  const sellerId = propSellerId || route?.params?.sellerId || null;
  const sellerName = propSellerName || route?.params?.sellerName || null;
  const customerId = propCustomerId || route?.params?.customerId || null;

  // Load guest cart count if not logged in
  React.useEffect(() => {
    let isMounted = true;
    if (!user) {
      getGuestCart()
        .then((items) => {
          if (isMounted && Array.isArray(items)) {
            const count = items.reduce((sum, it) => sum + Number(it?.quantity || 1), 0);
            setGuestCount(count);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [user, cart]);

  const totalCartCount = useMemo(() => {
    if (user) {
      if (contextCartItemCount > 0) return contextCartItemCount;
      if (cart?.cart_items && Array.isArray(cart.cart_items)) {
        return cart.cart_items.reduce((sum, it) => sum + Number(it?.quantity || 1), 0);
      }
      return 0;
    }
    return guestCount;
  }, [user, contextCartItemCount, cart, guestCount]);

  // Do not duplicate if directly inside a React Navigation Tab Navigator unless forceShow is true
  const isInsideParentTab = useMemo(() => {
    if (forceShow) return false;
    try {
      const parent1 = navigation?.getParent?.();
      if (parent1?.getState?.()?.type === 'tab') return true;
    } catch (_) {}
    return false;
  }, [navigation, forceShow]);

  if (isInsideParentTab) {
    return null;
  }

  const handleTabPress = (tab) => {
    if (tab === activeTab) {
      if (tab === 'store' && onStorePress) {
        onStorePress();
      }
      return;
    }

    const navParams = {
      sellerId,
      sellerName,
      customerId,
    };

    if (tab === 'store') {
      navigation.navigate('Catalog', navParams);
    } else if (tab === 'cart') {
      navigation.navigate('Cart', navParams);
    } else if (tab === 'orders') {
      navigation.navigate('OrderList', navParams);
    }
  };

  return (
    <View style={styles.footerContainer}>
      {/* Store Tab */}
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'store' && styles.tabButtonActive]}
        onPress={() => handleTabPress('store')}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Store Tab"
      >
        <Text style={[styles.tabLabel, activeTab === 'store' && styles.tabLabelActive]}>
          Store
        </Text>
      </TouchableOpacity>

      {/* Cart Tab */}
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'cart' && styles.tabButtonActive]}
        onPress={() => handleTabPress('cart')}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Cart Tab"
      >
        <View style={styles.cartLabelRow}>
          <Text style={[styles.tabLabel, activeTab === 'cart' && styles.tabLabelActive]}>
            Cart
          </Text>
          {totalCartCount > 0 && (
            <View style={styles.badgePill}>
              <Text style={styles.badgeText}>{totalCartCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Orders Tab */}
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'orders' && styles.tabButtonActive]}
        onPress={() => handleTabPress('orders')}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Orders Tab"
      >
        <Text style={[styles.tabLabel, activeTab === 'orders' && styles.tabLabelActive]}>
          Orders
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 999,
    flexShrink: 0,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    marginHorizontal: 4,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: '#007AFF',
    fontWeight: '800',
  },
  cartLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePill: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 6,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});

export default StoreNavigationFooter;
