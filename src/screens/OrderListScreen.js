import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, TextInput } from 'react-native';
import { getOrders, deleteOrder, supabase } from '../services/supabase';
import Icon from 'react-native-vector-icons/FontAwesome';
import DateTimePickerModal from "react-native-modal-datetime-picker";

const OrderListScreen = ({ navigation, route }) => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
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
        setFilteredOrders(fetchedOrders);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [route.params, route.params?.customerId]);

  useEffect(() => {
    let filtered = orders;

    if (searchQuery) {
      filtered = filtered.filter(order =>
        order.order_number && order.order_number.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedStatus) {
      filtered = filtered.filter(order => order.status === selectedStatus);
    }

    if (selectedDate) {
      filtered = filtered.filter(order =>
        new Date(order.created_at).toLocaleDateString() === new Date(selectedDate).toLocaleDateString()
      );
    }

    setFilteredOrders(filtered);
  }, [searchQuery, selectedStatus, selectedDate, orders]);

  useEffect(() => {
    const total = filteredOrders.reduce((sum, order) => sum + order.total_amount, 0);
    setTotalAmount(total);
  }, [filteredOrders]);

  const showDatePicker = () => {
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleConfirmDate = (date) => {
    setSelectedDate(date);
    hideDatePicker();
  };

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
        <Text style={styles.orderId}>Order No: {item.order_number}</Text>
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
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('Invoice')} style={{ marginRight: 15 }}>
            <Icon name="file-text" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Order No..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.statusFilterContainer}>
          {['All', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'].map(status => (
            <TouchableOpacity
              key={status}
              style={[styles.statusButton, selectedStatus === (status === 'All' ? null : status) && styles.selectedStatusButton]}
              onPress={() => setSelectedStatus(status === 'All' ? null : status)}
            >
              <Text style={styles.statusButtonText}>{status}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.datePickerButton} onPress={showDatePicker}>
          <Text style={styles.datePickerButtonText}>
            {selectedDate ? new Date(selectedDate).toLocaleDateString() : 'Select Date'}
          </Text>
        </TouchableOpacity>
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          onConfirm={handleConfirmDate}
          onCancel={hideDatePicker}
        />
      </View>
      <View style={styles.totalAmountContainer}>
        <Text style={styles.totalAmountText}>Total Amount: ₹{totalAmount.toFixed(2)}</Text>
      </View>
      {filteredOrders.length === 0 ? (
        <Text style={styles.noOrdersText}>No orders found.</Text>
      ) : (
        <FlatList
          data={filteredOrders}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchContainer: {
    padding: 10,
    backgroundColor: '#f0f0f0',
  },
  searchInput: {
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 10,
  },
  statusFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    margin: 4,
  },
  selectedStatusButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  statusButtonText: {
    color: '#333',
  },
  datePickerButton: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  datePickerButtonText: {
    fontSize: 16,
  },
  totalAmountContainer: {
    padding: 10,
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
  },
  totalAmountText: {
    fontSize: 18,
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