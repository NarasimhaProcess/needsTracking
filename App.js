import 'react-native-get-random-values'; // Polyfill for crypto.getRandomValues
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { registerRootComponent } from 'expo';

// Import screens
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import AccountScreen from './src/screens/AccountScreen';
import ProductScreen from './src/screens/ProductScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import FieldManagerScreen from './src/screens/FieldManagerScreen'; // New import
import CatalogScreen from './src/screens/CatalogScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrderConfirmationScreen from './src/screens/OrderConfirmationScreen';
import OrderListScreen from './src/screens/OrderListScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import OrderEditScreen from './src/screens/OrderEditScreen';
import UpiQrScreen from './src/screens/UpiQrScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import CustomerMapScreen from './src/screens/CustomerMapScreen';
import TopProductsScreen from './src/screens/TopProductsScreen'; // New import
import Icon from 'react-native-vector-icons/FontAwesome'; // Add this import

// Import services
import { supabase } from './src/services/supabase';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const CartIcon = ({ navigation, userId }) => {
  const [cart, setCart] = useState(null);

  useEffect(() => {
    const fetchCart = async () => {
      const cartData = await supabase
        .from('carts')
        .select('cart_items(id)')
        .eq('user_id', userId)
        .single();
      setCart(cartData.data);
    };

    if (userId) {
      fetchCart();
    }

    const subscription = supabase
      .channel('public:cart_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items' }, (payload) => {
        console.log('Cart change received!', payload);
        fetchCart();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userId]);

  return (
    <TouchableOpacity onPress={() => navigation.navigate('Cart')} style={styles.cartIconContainer}>
      <Icon name="shopping-cart" size={24} color="#000" />
      {cart && cart.cart_items.length > 0 && (
        <>
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cart.cart_items.length}</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#000" style={{ marginLeft: 5 }} />
        </>
      )}
    </TouchableOpacity>
  );
};

const InventoryIcon = ({ navigation, customerId }) => {
  return (
    <TouchableOpacity onPress={() => navigation.navigate('Inventory', { customerId })} style={{ marginRight: 15 }}>
      <Icon name="tasks" size={24} color="#000" />
    </TouchableOpacity>
  );
};

function AuthStack({ route, navigation }) {
  const { session, customerId } = route.params;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        initialParams={{ session: session, customerId: customerId }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="home" color={color} size={size} /> // Example icon
          ),
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductScreen}
        initialParams={{ session: session, customerId: customerId }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="shopping-bag" color={color} size={size} /> // Example icon
          ),
        }}
      />
      <Tab.Screen
        name="Catalog"
        component={CatalogScreen}
        initialParams={{ session: session, customerId: customerId }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="book" color={color} size={size} /> // Example icon
          ),
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrderListScreen}
        initialParams={{ session: session, customerId: customerId }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="list-alt" color={color} size={size} /> // Icon for orders
          ),
        }}
      />
      <Tab.Screen // "Add Report" as a tab
        name="Damage Report"
        component={FieldManagerScreen}
        initialParams={{ session: session, customerId: customerId, areaId: route.params.areaId }} // Pass areaId from AuthStack's params
        options={{
          title: 'Damage Report',
          tabBarIcon: ({ color, size }) => (
            <Icon name="plus-circle" color={color} size={size} /> // Example icon for adding
          ),
        }}
      />
      <Tab.Screen
        name="Map"
        component={CustomerMapScreen}
        initialParams={{ session: session, customerId: customerId, areaId: route.params.areaId }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="map" color={color} size={size} /> // Example icon
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        initialParams={{ session: session, customerId: customerId }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="user" color={color} size={size} /> // Example icon
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const PublicNavigator = () => (
  <Stack.Navigator>
    <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }}/>
    <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }}/>
    <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }}/>
    <Stack.Screen name="Catalog" component={CatalogScreen} />
    <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
    <Stack.Screen name="TopProductsScreen" component={TopProductsScreen} />
  </Stack.Navigator>
);

const AuthNavigator = ({ session, customerId, areaId }) => (
  <Stack.Navigator>
    <Stack.Screen
      name="Auth"
      component={AuthStack}
      initialParams={{ session: session, customerId: customerId, areaId: areaId }}
      options={({ navigation }) => ({ 
        headerRight: () => (
          <View style={{ flexDirection: 'row' }}>
            <InventoryIcon navigation={navigation} customerId={customerId} />
            <CartIcon navigation={navigation} userId={session.user.id} />
          </View>
        ),
      })}
    />
    <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
    <Stack.Screen name="Cart" component={CartScreen} />
    <Stack.Screen name="Checkout" component={CheckoutScreen} />
    <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
    <Stack.Screen name="UpiQr" component={UpiQrScreen} />
    <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
    <Stack.Screen name="OrderEdit" component={OrderEditScreen} />
    <Stack.Screen name="Inventory" component={InventoryScreen} />
  </Stack.Navigator>
);

export default function App() {
  const [session, setSession] = useState(null);
  const [appCustomerId, setAppCustomerId] = useState(null);
  const [appAreaId, setAppAreaId] = useState(null); // New state for areaId from DB

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session && session.user) {
        const { data: customerData, error } = await supabase
          .from('customers')
          .select('id, area_id')
          .eq('email', session.user.email)
          .maybeSingle();

        if (error) {
          console.error("Error fetching customerId/areaId on auth state change in App.js:", error.message);
          setAppCustomerId(null);
          setAppAreaId(null);
        } else if (customerData) {
          setAppCustomerId(customerData.id);
          setAppAreaId(customerData.area_id);
        } else {
          setAppCustomerId(null);
          setAppAreaId(null);
        }
      } else {
        setAppCustomerId(null);
        setAppAreaId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      {session && session.user && appCustomerId ? (
        <AuthNavigator session={session} customerId={appCustomerId} areaId={appAreaId} />
      ) : (
        <PublicNavigator />
      )}
    </NavigationContainer>
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
  cartIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
  },
  cartBadge: {
    position: 'absolute',
    right: -6,
    top: -3,
    backgroundColor: 'red',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

registerRootComponent(App);