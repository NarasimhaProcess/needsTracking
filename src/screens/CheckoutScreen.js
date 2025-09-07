import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Button,
  Alert,
  ScrollView,
} from 'react-native';
import { supabase } from '../services/supabase';

const CheckoutScreen = ({ navigation, route }) => {
  const { cart } = route.params;
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [loading, setLoading] = useState(false);

  // Calculate totalAmount outside of handlePlaceOrder
  const totalAmount = cart.cart_items.reduce(
    (total, item) => total + item.product_variant_combinations.price * item.quantity,
    0
  );

  // Define shippingAddress as a state variable
  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
  });

  // Update shippingAddress state as user types
  useEffect(() => {
    setShippingAddress({
      name,
      address,
      city,
      postalCode,
      country,
    });
  }, [name, address, city, postalCode, country]);

  const handlePlaceOrder = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        shipping_address: shippingAddress,
        total_amount: totalAmount,
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError.message);
      Alert.alert('Error', 'Failed to create order.');
      setLoading(false);
      return;
    }

    const orderItems = cart.cart_items.map((item) => ({
      order_id: order.id,
      product_variant_combination_id: item.product_variant_combination_id,
      quantity: item.quantity,
      price: item.product_variant_combinations.price,
    }));

    const { error: orderItemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (orderItemsError) {
      console.error('Error creating order items:', orderItemsError.message);
      Alert.alert('Error', 'Failed to create order items.');
      setLoading(false);
      return;
    }

    await supabase.from('cart_items').delete().eq('cart_id', cart.id);

    setLoading(false);
    navigation.navigate('OrderConfirmation', { order });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Shipping Address</Text>
      <TextInput
        style={styles.input}
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Address"
        value={address}
        onChangeText={setAddress}
      />
      <TextInput
        style={styles.input}
        placeholder="City"
        value={city}
        onChangeText={setCity}
      />
      <TextInput
        style={styles.input}
        placeholder="Postal Code"
        value={postalCode}
        onChangeText={setPostalCode}
      />
      <TextInput
        style={styles.input}
        placeholder="Country"
        value={country}
        onChangeText={setCountry}
      />
      <Button title={loading ? 'Placing Order...' : 'Place Order'} onPress={handlePlaceOrder} disabled={loading} />
      <Button title="Pay with UPI QR" onPress={() => navigation.navigate('UpiQr', { cart, totalAmount, shippingAddress })} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
});

export default CheckoutScreen;
