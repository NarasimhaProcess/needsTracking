import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useCart } from '../context/CartContext';
import { getPendingOrdersCount, supabase } from '../services/supabase';

const OrderIconComponent = ({ navigation }) => {
  const { user } = useCart();
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  useEffect(() => {
    if (user) {
      const fetchOrdersCount = async () => {
        const count = await getPendingOrdersCount(user.id);
        setPendingOrdersCount(count);
      };

      fetchOrdersCount();

      // Subscribe to order changes
      const subscription = supabase
        .channel('public:orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          fetchOrdersCount();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }
  }, [user]);

  return (
    <TouchableOpacity onPress={() => navigation.navigate('OrderList')} style={styles.orderIconContainer}>
      <Icon name="dropbox" size={24} color="#000" />
      {pendingOrdersCount > 0 && (
        <View style={styles.orderBadge}>
          <Text style={styles.orderBadgeText}>{pendingOrdersCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  orderIconContainer: {
    backgroundColor: '#007AFF',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5, // For Android shadow
    shadowColor: '#000', // For iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    marginBottom: 10,
  },
  orderBadge: {
    position: 'absolute',
    right: -5,
    top: -5,
    backgroundColor: 'red',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default OrderIconComponent;
