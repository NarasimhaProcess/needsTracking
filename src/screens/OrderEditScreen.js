import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, Button, Alert, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { getOrderById, updateOrderStatus } from '../services/supabase'; // Assuming these functions are in supabase.js

const OrderEditScreen = ({ route, navigation }) => {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      setLoading(true);
      const fetchedOrder = await getOrderById(orderId);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
        setStatus(fetchedOrder.status); // Set initial status from fetched order
      }
      setLoading(false);
    };

    fetchOrderDetails();
  }, [orderId]);

  const handleSave = async () => {
    setIsSaving(true);
    const updatedOrder = await updateOrderStatus(orderId, status);
    if (updatedOrder) {
      Alert.alert('Success', 'Order updated successfully!');
      navigation.goBack(); // Go back to the previous screen (OrderListScreen or OrderDetailScreen)
    } else {
      Alert.alert('Error', 'Failed to update order.');
    }
    setIsSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centered}>
        <Text>Order not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Edit Order</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Order ID:</Text>
        <TextInput
          style={styles.input}
          value={order.id}
          editable={false} // Order ID should not be editable
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Update Status:</Text>
        <Picker
          selectedValue={status}
          onValueChange={(itemValue) => setStatus(itemValue)}
          style={styles.input}
        >
          <Picker.Item label="Pending" value="pending" />
          <Picker.Item label="Completed" value="completed" />
          <Picker.Item label="Shipped" value="shipped" />
          <Picker.Item label="Cancelled" value="cancelled" />
        </Picker>
      </View>

      {/* You can add more fields here for editing shipping address, total amount, etc.
          Remember to update the updateOrderStatus function in supabase.js if you add more fields. */}

      <Button
        title={isSaving ? 'Saving...' : 'Save Changes'}
        onPress={handleSave}
        disabled={isSaving}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8f8f8',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
});

export default OrderEditScreen;
