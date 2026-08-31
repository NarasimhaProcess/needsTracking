import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FontAwesome as Icon } from '@expo/vector-icons';
import { useCart } from '../context/CartContext';

// Import the screens that will be part of the tabs
import ProductScreen from '../screens/ProductScreen';
import InventoryScreen from '../screens/InventoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CatalogScreen from '../screens/CatalogScreen';
import OrderListScreen from '../screens/OrderListScreen';
import CustomerDamageScreen from '../screens/CustomerDamageScreen';
import CustomerMapScreen from '../screens/CustomerMapScreen';
import SellersMapScreen from '../screens/SellersMapScreen';
import CartScreen from '../screens/CartScreen';

const Tab = createBottomTabNavigator();

function ProductTabNavigator({ route }) {
  const { session } = route.params || {};
  const { role: contextRole, cartItemCount } = useCart();
  const user = session?.user || session;
  const userId = user?.id;
  const userMetadata = user?.user_metadata || session?.user_metadata;
  const role = contextRole || userMetadata?.role || route.params?.role || 'seller';
  const customerId = userMetadata?.customerId || route.params?.customerId;
  const isBuyer = role === 'customer' || role === 'buyer';

  return (
    <Tab.Navigator
      initialRouteName={isBuyer ? 'CatalogTab' : 'ProductsTab'}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'ProductsTab') {
            iconName = 'shopping-bag';
          } else if (route.name === 'ProfileTab') {
            iconName = focused ? 'user-circle' : 'user-circle-o';
          } else if (route.name === 'CatalogTab') {
            iconName = 'book';
          } else if (route.name === 'OrdersTab') {
            iconName = 'list-alt';
          } else if (route.name === 'DamageTab') {
            iconName = 'exclamation-triangle';
          } else if (route.name === 'MapTab') {
            iconName = 'map-marker';
          } else if (route.name === 'InventoryTab') {
            iconName = 'cubes';
          } else if (route.name === 'CartTab') {
            iconName = 'shopping-cart';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          height: 58,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerShown: false,
      })}
    >
      {isBuyer ? (
        // ===== BUYER TABS =====
        <>
          <Tab.Screen
            name="CatalogTab"
            component={CatalogScreen}
            options={{ title: 'Catalog' }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="CartTab"
            component={CartScreen}
            options={{
              title: 'Cart',
              tabBarBadge: cartItemCount > 0 ? cartItemCount : undefined,
              tabBarBadgeStyle: { backgroundColor: '#10B981', color: '#FFFFFF', fontSize: 10 },
            }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="OrdersTab"
            component={OrderListScreen}
            options={{ title: 'My Orders' }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="MapTab"
            component={SellersMapScreen}
            options={{ title: 'Stores' }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="ProfileTab"
            component={ProfileScreen}
            options={{ title: 'Profile' }}
            initialParams={{ session, userId, customerId }}
          />
        </>
      ) : (
        // ===== SELLER / ADMIN TABS =====
        <>
          <Tab.Screen
            name="CatalogTab"
            component={CatalogScreen}
            options={{
              title: 'Catalog',
              tabBarBadge: cartItemCount > 0 ? cartItemCount : undefined,
              tabBarBadgeStyle: { backgroundColor: '#10B981', color: '#FFFFFF', fontSize: 10 },
            }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="ProductsTab"
            component={ProductScreen}
            options={{ title: 'Products' }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="OrdersTab"
            component={OrderListScreen}
            options={{ title: 'Orders' }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="InventoryTab"
            component={InventoryScreen}
            options={{ title: 'Inventory' }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="DamageTab"
            component={CustomerDamageScreen}
            options={{ title: 'Damage' }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="MapTab"
            component={CustomerMapScreen}
            options={{ title: 'Map' }}
            initialParams={{ session, userId, customerId }}
          />
          <Tab.Screen
            name="ProfileTab"
            component={ProfileScreen}
            options={{ title: 'Profile' }}
            initialParams={{ session, userId, customerId }}
          />
        </>
      )}
    </Tab.Navigator>
  );
}

export default ProductTabNavigator;