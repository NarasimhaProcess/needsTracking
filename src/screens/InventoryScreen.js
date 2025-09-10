import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { supabase } from '../services/supabase';

const InventoryScreen = ({ route }) => {
  const { customerId } = route.params;
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [inventoryHistory, setInventoryHistory] = useState([]);
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('0');
  const [restockQuantity, setRestockQuantity] = useState('0');

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    const allVariants = products.flatMap((p) => p.product_variant_combinations);
    if (allVariants.length > 0) {
      if (selectedProduct) {
        const updatedSelectedProduct = allVariants.find(v => v.id === selectedProduct.id);
        if (updatedSelectedProduct) {
          setSelectedProduct(updatedSelectedProduct);
        }
      } else {
        const firstVariant = allVariants[0];
        setSelectedProduct(firstVariant);
        fetchInventoryHistory(firstVariant.id);
      }
    }
  }, [products]);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*, product_variant_combinations(*)')
      .eq('customer_id', customerId);
    if (error) {
      // console.error('Error fetching products:', error.message);
    } else {
      setProducts(data);
    }
    setLoading(false);
  };

  const fetchInventoryHistory = async (productVariantCombinationId) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_history')
      .select('*')
      .eq('product_variant_combination_id', productVariantCombinationId)
      .order('created_at', { ascending: false });
    if (error) {
      // console.error('Error fetching inventory history:', error.message);
    } else {
      setInventoryHistory(data);
    }
    setLoading(false);
  };

  const handleAdjustInventory = async () => {
    if (!selectedProduct) return;

    const { data, error } = await supabase.functions.invoke('adjust-inventory', {
      body: {
        product_variant_combination_id: selectedProduct.id,
        new_quantity: parseInt(adjustmentQuantity, 10),
        notes: adjustmentNotes,
      },
    });

    if (error) {
      Alert.alert('Error', 'Failed to adjust inventory.');
    } else {
      Alert.alert('Success', 'Inventory adjusted successfully.');
      fetchProducts();
      fetchInventoryHistory(selectedProduct.id);
    }
  };

  const handleRestockInventory = async () => {
    if (!selectedProduct) return;

    const { data, error } = await supabase.functions.invoke('restock-inventory', {
      body: {
        product_variant_combination_id: selectedProduct.id,
        quantity_to_add: parseInt(restockQuantity, 10),
      },
    });

    if (error) {
      Alert.alert('Error', 'Failed to restock inventory.');
    } else {
      Alert.alert('Success', 'Inventory restocked successfully.');
      fetchProducts();
      fetchInventoryHistory(selectedProduct.id);
    }
  };

  const renderProductVariant = ({ item }) => (
    <TouchableOpacity
      style={styles.variantContainer}
      onPress={() => {
        setSelectedProduct(item);
        fetchInventoryHistory(item.id);
      }}
    >
      <Text>{item.combination_string}</Text>
      <Text>Quantity: {item.quantity}</Text>
    </TouchableOpacity>
  );

  const renderInventoryHistory = ({ item }) => (
    <View style={styles.historyItem}>
      <Text>{new Date(item.created_at).toLocaleString()}</Text>
      <Text>{item.change_type}</Text>
      <Text>Change: {item.quantity_change}</Text>
      <Text>New Quantity: {item.new_quantity}</Text>
      {item.notes && <Text>Notes: {item.notes}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.leftPanel}>
        <FlatList
          data={products.flatMap((p) => p.product_variant_combinations)}
          renderItem={renderProductVariant}
          keyExtractor={(item) => item.id}
        />
      </View>
      <View style={styles.rightPanel}>
        {selectedProduct && (
          <View>
            <Text style={styles.title}>Inventory for {selectedProduct.combination_string}</Text>
            <View style={styles.tabContainer}>
              {/* Tabs would go here */}
            </View>
            <View style={styles.managementContainer}>
              <Text style={styles.subtitle}>Adjust Inventory</Text>
              <TextInput
                style={styles.input}
                placeholder="New Quantity"
                value={adjustmentQuantity}
                onChangeText={setAdjustmentQuantity}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                placeholder="Notes"
                value={adjustmentNotes}
                onChangeText={setAdjustmentNotes}
              />
              <TouchableOpacity style={styles.button} onPress={handleAdjustInventory}>
                <Text style={styles.buttonText}>Adjust</Text>
              </TouchableOpacity>

              <Text style={styles.subtitle}>Restock Inventory</Text>
              <TextInput
                style={styles.input}
                placeholder="Quantity to Add"
                value={restockQuantity}
                onChangeText={setRestockQuantity}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.button} onPress={handleRestockInventory}>
                <Text style={styles.buttonText}>Restock</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.title}>Inventory History</Text>
            <FlatList
              data={inventoryHistory}
              renderItem={renderInventoryHistory}
              keyExtractor={(item) => item.id}
            />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: '#ccc',
  },
  rightPanel: {
    flex: 2,
    padding: 20,
  },
  variantContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  historyItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
  },
  managementContainer: {
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
});

export default InventoryScreen;