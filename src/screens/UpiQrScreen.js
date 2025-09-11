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
import { supabase, getActiveQrCode, updateOrderStatus } from '../services/supabase';

const UpiQrScreen = ({ navigation, route }) => {
  const { cart, totalAmount, shippingAddress, order } = route.params; // Receive order object
  const [activeQrImageUrl, setActiveQrImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQrCode = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const qrCode = await getActiveQrCode(user.id);
        if (qrCode) {
          setActiveQrImageUrl(qrCode.qr_code_url);
        }
      }
      setLoading(false);
    };

    fetchQrCode();
  }, []);

  const handleSimulatePaymentSuccess = async () => {
    setLoading(true);
    const updatedOrder = await updateOrderStatus(order.id, 'paid'); // Update status to 'paid'
    if (updatedOrder) {
      Alert.alert('Payment Successful', 'Your payment has been processed.');
      navigation.navigate('OrderConfirmation', { order: updatedOrder }); // Pass updated order
    } else {
      Alert.alert('Error', 'Failed to update order status after simulated payment.');
    }
    setLoading(false);
  };

  const handleSimulatePaymentFailure = async () => {
    setLoading(true);
    const updatedOrder = await updateOrderStatus(order.id, 'failed'); // Update status to 'failed'
    if (updatedOrder) {
      Alert.alert('Payment Failed', 'Your payment could not be processed. Please try again.');
      // Optionally navigate back or to a different screen
    } else {
      Alert.alert('Error', 'Failed to update order status after simulated payment failure.');
    }
    setLoading(false);
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
      <Text style={styles.amount}>Amount: ₹{totalAmount?.toFixed(2) || 'N/A'}</Text>
      {activeQrImageUrl ? (
        <Image source={{ uri: activeQrImageUrl }} style={styles.qrCode} />
      ) : (
        <Text style={styles.noQrText}>No active QR code found. Please upload one in your profile.</Text>
      )}
      <Text style={styles.instructions}>Open your UPI app and scan this QR code to complete the payment.</Text>
      <TouchableOpacity style={styles.button} onPress={handleSimulatePaymentSuccess} disabled={loading}>
        <Text style={styles.buttonText}>Simulate Payment Success</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.failButton]} onPress={handleSimulatePaymentFailure} disabled={loading}>
        <Text style={styles.buttonText}>Simulate Payment Failure</Text>
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
    marginTop: 10, // Added margin for spacing between buttons
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  failButton: {
    backgroundColor: '#FF3B30', // Red color for failure
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
