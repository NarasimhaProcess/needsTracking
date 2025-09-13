import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Button,
  Alert,
  ScrollView,
  TouchableOpacity
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { supabase } from '../services/supabase';

const CheckoutScreen = ({ navigation, route }) => {
  const { cart, customerId } = route.params; // Expect customerId for agent orders
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);

  const totalAmount = cart.cart_items.reduce(
    (total, item) => total + item.product_variant_combinations.price * item.quantity,
    0
  );

  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
  });

  useEffect(() => {
    const fetchProfileData = async () => {
      if (customerId) {
        const { data: customer, error } = await supabase
          .from('customers')
          .select('name, address_line_1, address_line_2, city, state, zip_code')
          .eq('id', customerId)
          .single();

        if (error) {
          console.error('Error fetching customer profile:', error.message);
        } else if (customer) {
          setName(customer.name || '');
          setAddress(customer.address_line_1 || '');
          setCity(customer.city || '');
          setPostalCode(customer.zip_code || '');
        }
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setName(user.user_metadata?.name || '');
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('address_line_1, address_line_2, city, state, zip_code')
            .eq('id', user.id)
            .single();

          if (error && error.code !== 'PGRST116') {
            console.error('Error fetching user profile:', error.message);
          } else if (profile) {
            setAddress(profile.address_line_1 || '');
            setCity(profile.city || '');
            setPostalCode(profile.zip_code || '');
          }
        }
      }
    };

    fetchProfileData();
  }, [customerId]);

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
    if (!paymentMethod) {
      Alert.alert('Payment Method', 'Please select a payment method.');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    let orderUserId;

    if (customerId) {
      // If customerId is provided (agent placing order for a customer)
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('user_id')
        .eq('id', customerId)
        .single();

      if (customerError) {
        console.error('Error fetching user_id for customer:', customerError.message);
        Alert.alert('Error', 'Failed to get customer user ID.');
        setLoading(false);
        return;
      }
      orderUserId = customerData.user_id;
    } else {
      // If no customerId (customer placing their own order)
      orderUserId = user?.id;
    }

    if (!orderUserId) {
      Alert.alert('Error', 'User not authenticated or customer not selected.');
      setLoading(false);
      return;
    }

    const orderStatus = paymentMethod === 'cod' ? 'processing' : 'pending_payment';

    console.log('CheckoutScreen: Placing order with customerId:', customerId);
    console.log('CheckoutScreen: Placing order with user_id:', orderUserId);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: orderUserId,
        shipping_address: shippingAddress,
        total_amount: totalAmount,
        status: orderStatus,
        payment_method: paymentMethod,
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError.message);
      Alert.alert('Error', `Failed to create order: ${orderError.message}`);
      setLoading(false);
      return;
    }

    const orderItems = cart.cart_items.map((item) => ({
      order_id: order.id,
      product_variant_combination_id: item.product_variant_combinations.id,
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

    if (paymentMethod === 'cod') {
      Alert.alert('Order Placed', 'Your order has been placed successfully.');
      navigation.navigate('OrderConfirmation', { order, customerId });
    } else {
      Alert.alert('Order Confirmed', 'Your order has been placed. Proceed to payment.');
      navigation.navigate('UpiQr', { order, totalAmount, shippingAddress });
    }
  };

  return (
    <View style={{flex: 1, backgroundColor: 'white'}}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Checkout</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Shipping Address</Text>
        <TextInput style={styles.input} placeholder="Full Name" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Address" value={address} onChangeText={setAddress} />
        <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />
        <TextInput style={styles.input} placeholder="Postal Code" value={postalCode} onChangeText={setPostalCode} />
        <TextInput style={styles.input} placeholder="Country" value={country} onChangeText={setCountry} />

        <Text style={styles.title}>Payment Method</Text>
        <View style={styles.paymentMethodContainer}>
          <TouchableOpacity
            style={[styles.paymentButton, paymentMethod === 'upi' && styles.selectedPaymentButton]}
            onPress={() => setPaymentMethod('upi')}
          >
            <Text style={styles.paymentButtonText}>Pay with UPI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentButton, paymentMethod === 'cod' && styles.selectedPaymentButton]}
            onPress={() => setPaymentMethod('cod')}
          >
            <Text style={styles.paymentButtonText}>Cash on Delivery</Text>
          </TouchableOpacity>
        </View>

        <Button title={loading ? 'Placing Order...' : 'Place Order'} onPress={handlePlaceOrder} disabled={loading} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
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
  paymentMethodContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  paymentButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    width: '45%',
  },
  selectedPaymentButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  paymentButtonText: {
    fontSize: 16,
  },
});

export default CheckoutScreen;
