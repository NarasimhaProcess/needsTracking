import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { printReceipt } from '../services/printerService';

const OrderConfirmationScreen = ({ navigation, route }) => {
  const { order, customerId } = route.params;

  return (
    <View style={{flex: 1, backgroundColor: 'white'}}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order Confirmation</Text>
        <TouchableOpacity onPress={() => navigation.popToTop()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <View style={styles.container}>
        <Icon name="check-circle" size={80} color="green" style={styles.successIcon} />
        <Text style={styles.title}>Thank You for Your Order!</Text>
        <Text style={styles.orderId}>Order ID: {order.id}</Text>
        <Text style={styles.totalAmount}>Total Amount: ₹{order.total_amount}</Text>

        <TouchableOpacity
          style={styles.printButton}
          onPress={() => printReceipt(order)}
        >
          <Icon name="print" size={20} color="#fff" />
          <Text style={styles.printButtonText}>Print Receipt</Text>
        </TouchableOpacity>
        
        <View style={styles.navButtons}>
            <Button title="Continue Shopping" onPress={() => navigation.navigate('Catalog', { customerId })} />
            <Button title="View My Orders" onPress={() => navigation.navigate('OrderList')} />
        </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successIcon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  orderId: {
    fontSize: 16,
    marginBottom: 10,
  },
  totalAmount: {
    fontSize: 16,
    marginBottom: 30,
  },
  printButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 3,
  },
  printButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  navButtons: {
    marginTop: 20,
    width: '80%',
  },
});

export default OrderConfirmationScreen;