import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

const OrderConfirmationScreen = ({ navigation, route }) => {
  const { order } = route.params;

  return (
    <View style={{flex: 1, backgroundColor: 'white'}}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order Confirmation</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <View style={styles.container}>
        <Text style={styles.title}>Thank You for Your Order!</Text>
        <Text style={styles.orderId}>Order ID: {order.id}</Text>
        <Text style={styles.totalAmount}>Total Amount: ₹{order.total_amount}</Text>
        <Button title="Continue Shopping" onPress={() => navigation.navigate('Catalog')} />
        <Button title="View My Orders" onPress={() => navigation.navigate('OrderList')} />
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
    marginBottom: 20,
  },
});

export default OrderConfirmationScreen;