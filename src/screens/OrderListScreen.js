import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { getOrders, deleteOrder, supabase } from '../services/supabase';
import Icon from 'react-native-vector-icons/FontAwesome';

const OrderListScreen = ({ navigation, route }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    const { customerId } = route.params || {};
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = customerId || user?.id;

    if (targetUserId) {
      const fetchedOrders = await getOrders(targetUserId);
      if (fetchedOrders) {
        setOrders(fetchedOrders);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [route.params]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const handleDeleteOrder = async (orderId) => {
    Alert.alert(
      'Delete Order',
      'Are you sure you want to delete this order? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          onPress: async () => {
            const success = await deleteOrder(orderId);
            if (success) {
              Alert.alert('Success', 'Order deleted successfully.');
              fetchOrders(); // Refresh the list
            } else {
              Alert.alert('Error', 'Failed to delete order.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderOrderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.orderItem}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
    >
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>Order ID: {item.id.substring(0, 8)}...</Text>
        <Text style={styles.orderStatus}>Status: {item.status}</Text>
      </View>
      <Text style={styles.orderAmount}>Total: ₹{item.total_amount.toFixed(2)}</Text>
      <Text style={styles.orderDate}>Date: {new Date(item.created_at).toLocaleDateString()}</Text>
      <View style={styles.actionButtons}>
        <TouchableOpacity onPress={() => navigation.navigate('OrderEdit', { orderId: item.id })}>
          <Icon name="edit" size={20} color="#007AFF" style={styles.actionIcon} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteOrder(item.id)}>
          <Icon name="trash" size={20} color="#FF3B30" style={styles.actionIcon} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: 'white'}}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Orders</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      {orders.length === 0 ? (
        <Text style={styles.noOrdersText}>No orders found.</Text>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          contentContainerStyle={styles.listContent}
        />
      )}
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
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 20,
  },
  orderItem: {
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
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
  },
  orderStatus: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  orderAmount: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
  orderDate: {
    fontSize: 12,
    color: '#888',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionIcon: {
    marginLeft: 15,
  },
  noOrdersText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 18,
    color: '#777',
  },
});

export default OrderListScreen;
