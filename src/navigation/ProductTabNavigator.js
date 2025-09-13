import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/FontAwesome';

// Import the screens that will be part of the tabs
import ProductScreen from '../screens/ProductScreen';
import InventoryScreen from '../screens/InventoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import InvoiceScreen from '../screens/InvoiceScreen';
import CatalogScreen from '../screens/CatalogScreen';
import OrderListScreen from '../screens/OrderListScreen';
import CustomerDamageScreen from '../screens/CustomerDamageScreen';

const Tab = createBottomTabNavigator();

function ProductTabNavigator({ route }) {
  console.log('ProductTabNavigator: route.params', route.params);
  const { session } = route.params || {};
  const customerId = session?.user?.user_metadata?.customerId;
  console.log('ProductTabNavigator: session', session);
  console.log('ProductTabNavigator: customerId', customerId);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'ProductsTab') {
            iconName = focused ? 'shopping-bag' : 'shopping-bag';
          } else if (route.name === 'InventoryTab') {
            iconName = focused ? 'cubes' : 'cubes';
          } else if (route.name === 'ProfileTab') {
            iconName = focused ? 'user-circle' : 'user-circle-o';
          } else if (route.name === 'InvoicesTab') {
            iconName = focused ? 'file-text' : 'file-text-o';
          } else if (route.name === 'CatalogTab') {
            iconName = focused ? 'book' : 'book';
          } else if (route.name === 'OrdersTab') {
            iconName = focused ? 'list-alt' : 'list-alt';
          } else if (route.name === 'DamageTab') {
            iconName = focused ? 'exclamation-triangle' : 'exclamation-triangle';
          }

          // You can return any component that you like here!
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
        headerShown: false, // Hide header for tab screens, stack navigator will handle it
      })}
    >
      <Tab.Screen
        name="ProductsTab"
        component={ProductScreen}
        options={{ title: 'Products' }}
        initialParams={{ session, customerId }} // Pass params to initial screen
      />
      <Tab.Screen
        name="InventoryTab"
        component={InventoryScreen}
        options={{ title: 'Inventory' }}
        initialParams={{ session, customerId }} // Pass params to initial screen
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
        initialParams={{ session, customerId }} // Pass params to initial screen
      />
      <Tab.Screen
        name="InvoicesTab"
        component={InvoiceScreen}
        options={{ title: 'Invoices' }}
        initialParams={{ session, customerId }} // Pass params to initial screen
      />
      <Tab.Screen
        name="CatalogTab"
        component={CatalogScreen}
        options={{ title: 'Catalog' }}
        initialParams={{ session, customerId }} // Pass params to initial screen
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrderListScreen}
        options={{ title: 'Orders' }}
        initialParams={{ session, customerId }} // Pass params to initial screen
      />
      <Tab.Screen
        name="DamageTab"
        component={CustomerDamageScreen}
        options={{ title: 'Damage' }}
        initialParams={{ session, customerId }} // Pass params to initial screen
      />
    </Tab.Navigator>
  );
}

export default ProductTabNavigator;