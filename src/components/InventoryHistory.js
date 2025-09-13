import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../services/supabase';

const InventoryHistory = ({ product_variant_combination_id }) => {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (product_variant_combination_id) {
      fetchHistory();
    }
  }, [product_variant_combination_id]);

  const fetchHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_history')
      .select('*')
      .eq('product_variant_combination_id', product_variant_combination_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching inventory history:', error.message);
    } else {
      setHistory(data);
    }
    setLoading(false);
  };

  if (!product_variant_combination_id) {
    return <View />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inventory History</Text>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.itemContainer}>
            <Text>{new Date(item.created_at).toLocaleString()}</Text>
            <Text>Type: {item.change_type}</Text>
            <Text>Change: {item.quantity_change}</Text>
            <Text>New Quantity: {item.new_quantity}</Text>
          </View>
        )}
        ListEmptyComponent={<Text>No history found for this item.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  itemContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});

export default InventoryHistory;
