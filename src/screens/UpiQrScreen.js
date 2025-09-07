import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase, getActiveQrCode } from '../services/supabase';

const UpiQrScreen = ({ navigation, route }) => {
  const { cart, totalAmount, shippingAddress } = route.params; // Receive shippingAddress
  const [loading, setLoading] = useState(true);
  const [activeQrImageUrl, setActiveQrImageUrl] = useState(null);

  useEffect(() => {
    const fetchActiveQr = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const activeQr = await getActiveQrCode(user.id);
        if (activeQr) {
          setActiveQrImageUrl(activeQr.qr_image_url);
        }
      }
      setLoading(false);
    };
    fetchActiveQr();
  }, []);

  const handlePaymentConfirmation = async () => {
    Alert.alert(
      'Payment Confirmation',
      'Please confirm if you have completed the payment via UPI.',
      [
        {
          text: 'No, I haven\'t paid',
          style: 'cancel',
        },
        {
          text: 'Yes, I have paid',
          onPress: async () => {
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
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>Loading QR Code...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan to Pay with UPI</Text>
      <Text style={styles.amount}>Amount: ${totalAmount?.toFixed(2) || 'N/A'}</Text>
      {activeQrImageUrl ? (
        <Image source={{ uri: activeQrImageUrl }} style={styles.qrCode} />
      ) : (
        <Text style={styles.noQrText}>No active QR code found. Please upload one in your profile.</Text>
      )}
      <Text style={styles.instructions}>Open your UPI app and scan this QR code to complete the payment.</Text>
      <TouchableOpacity style={styles.button} onPress={handlePaymentConfirmation} disabled={loading}>
        <Text style={styles.buttonText}>I have paid</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f8f8',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  amount: {
    fontSize: 18,
    marginBottom: 10,
    color: '#555',
  },
  qrCode: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  instructions: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#000',
  },
  noQrText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    marginBottom: 20,
  },
});

export default UpiQrScreen;
