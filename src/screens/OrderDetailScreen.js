import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/FontAwesome';
import { getOrderById, updateOrderStatus } from '../services/supabase';

const OrderDetailScreen = ({ navigation, route }) => {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState(null);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      setLoading(true);
      const fetchedOrder = await getOrderById(orderId);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
        setSelectedStatus(fetchedOrder.status);
      }
      setLoading(false);
    };

    fetchOrderDetails();
  }, [orderId]);

  const handleUpdateStatus = async () => {
    if (selectedStatus !== order.status) {
      setLoading(true);
      const success = await updateOrderStatus(orderId, selectedStatus);
      if (success) {
        setOrder({ ...order, status: selectedStatus });
        Alert.alert('Success', 'Order status updated successfully.');
      } else {
        Alert.alert('Error', 'Failed to update order status.');
      }
      setLoading(false);
    }
  };

  const renderOrderItem = ({ item }) => (
    <View style={styles.orderItemDetail}>
      <Text style={styles.itemProductName}>
        {item.product_variant_combinations?.products?.product_name || 'N/A'}
        {item.product_variant_combinations?.combination_string ? ` (${item.product_variant_combinations.combination_string})` : ''}
      </Text>
      <Text style={styles.itemQuantity}>Quantity: {item.quantity}</Text>
      <Text style={styles.itemPrice}>Price: ₹{item.price.toFixed(2)}</Text>
    </View>
  );

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
    <View style={{flex: 1, backgroundColor: 'white'}}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order Details</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.container}>
        <View style={styles.detailCard}>
          <Text style={styles.label}>Order ID:</Text>
          <Text style={styles.value}>{order.id}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Status:</Text>
          <Text style={styles.value}>{order.status}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Update Status:</Text>
          <Picker
            selectedValue={selectedStatus}
            onValueChange={(itemValue) => setSelectedStatus(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Pending" value="pending" />
            <Picker.Item label="Completed" value="completed" />
            <Picker.Item label="Shipped" value="shipped" />
            <Picker.Item label="Cancelled" value="cancelled" />
          </Picker>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Total Amount:</Text>
          <Text style={styles.value}>₹{order.total_amount.toFixed(2)}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Order Date:</Text>
          <Text style={styles.value}>{new Date(order.created_at).toLocaleString()}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Shipping Address:</Text>
          <Text style={styles.value}>
            {order.shipping_address.street}, {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zipCode}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Order Items</Text>
        {order.order_items && order.order_items.length > 0 ? (
          <FlatList
            data={order.order_items}
            keyExtractor={(item) => item.id}
            renderItem={renderOrderItem}
            scrollEnabled={false}
            contentContainerStyle={styles.itemsList}
          />
        ) : (
          <Text style={styles.noItemsText}>No items in this order.</Text>
        )}

        <TouchableOpacity style={styles.saveButton} onPress={handleUpdateStatus}>
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </TouchableOpacity>
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
  detailCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 5,
  },
  value: {
    fontSize: 16,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#333',
  },
  itemsList: {
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    padding: 10,
  },
  orderItemDetail: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemProductName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  itemQuantity: {
    fontSize: 14,
    color: '#666',
  },
  itemPrice: {
    fontSize: 14,
    color: '#666',
  },
  noItemsText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#777',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
});

export default OrderDetailScreen;