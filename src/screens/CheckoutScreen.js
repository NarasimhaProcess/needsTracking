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
  const [profile, setProfile] = useState(null);
  const [tableNo, setTableNo] = useState('');

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
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setName(user.user_metadata?.name || '');
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching user profile:', error.message);
        } else if (profileData) {
          setProfile(profileData);
          setAddress(profileData.address_line_1 || '');
          setCity(profileData.city || '');
          setPostalCode(profileData.zip_code || '');
        }
      }
    };

    fetchProfileData();
  }, []);

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
    const orderUserId = user?.id;

    if (!orderUserId) {
      Alert.alert('Error', 'User not authenticated or customer not selected.');
      setLoading(false);
      return;
    }

    const orderStatus = paymentMethod === 'cod' ? 'processing' : 'pending_payment';

    const orderPayload = {
      user_id: orderUserId,
      shipping_address: shippingAddress,
      total_amount: totalAmount,
      status: orderStatus,
      payment_method: paymentMethod,
    };

    if (profile && profile.role === 'seller' && tableNo) {
      orderPayload.order_type = 'shop-order';
      orderPayload.table_no = tableNo;
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
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
      navigation.navigate('Catalog', { userId: orderUserId });
    } else {
      Alert.alert('Order Confirmed', 'Your order has been placed. Proceed to payment.');
      navigation.navigate('Catalog', { userId: orderUserId });
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

        {profile && profile.role === 'seller' && (
          <>
            <Text style={styles.title}>Dine-in Details</Text>
            <TextInput
              style={styles.input}
              placeholder="Table Number"
              value={tableNo}
              onChangeText={setTableNo}
              keyboardType="numeric"
            />
          </>
        )}

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
      </ScrollView>
      <View style={styles.buttonContainer}>
        <Button title={loading ? 'Placing Order...' : 'Place Order'} onPress={handlePlaceOrder} disabled={loading} />
      </View>
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
  buttonContainer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: 'white',
  },
});

export default CheckoutScreen;
