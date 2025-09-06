import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
} from 'react-native';

const OrderConfirmationScreen = ({ navigation, route }) => {
  const { order } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Thank You for Your Order!</Text>
      <Text style={styles.orderId}>Order ID: {order.id}</Text>
      <Text style={styles.totalAmount}>Total Amount: ${order.total_amount}</Text>
      <Button title="Continue Shopping" onPress={() => navigation.navigate('Catalog')} />
    </View>
  );
};

const styles = StyleSheet.create({
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
