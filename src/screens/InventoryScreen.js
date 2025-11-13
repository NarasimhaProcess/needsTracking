import { supabase } from '../services/supabase';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Button,
  Alert
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import debounce from 'lodash.debounce';
import InventoryHistory from '../components/InventoryHistory';


const InventoryScreen = ({ route }) => {
  const { session, userId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [quantityChange, setQuantityChange] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('adjust'); // 'adjust' or 'restock'

  useEffect(() => {
    if (userId) {
      fetchInventory();
    }
  }, [userId]);

  const fetchInventory = async (query = '') => {
    if (!userId) {
      setInventory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let supabaseQuery = supabase
      .from('product_variant_combinations')
      .select(`
        id,
        combination_string,
        quantity,
        products!inner(product_name, user_id)
      `)
      .eq('products.user_id', userId);

    if (query) {
      supabaseQuery = supabaseQuery.ilike('products.product_name', `%${query}%`);
    }

    const { data, error } = await supabaseQuery;

    if (error) {
      console.error('Error fetching inventory:', error.message);
      Alert.alert('Error', 'Failed to fetch inventory.');
    } else {
      setInventory(data);
    }
    setLoading(false);
  };

  const debouncedFetchInventory = useCallback(debounce(fetchInventory, 300), [userId]);

  useEffect(() => {
    debouncedFetchInventory(searchQuery);
  }, [searchQuery, debouncedFetchInventory]);

  

  const handleAdjustQuantity = async () => {
    if (!selectedItem || !quantityChange || isNaN(parseInt(quantityChange))) {
      Alert.alert('Invalid Input', 'Please select an item and enter a valid quantity.');
      return;
    }

    setLoading(true);
    const parsedQuantityChange = parseInt(quantityChange);
    const newQuantity = selectedItem.quantity + parsedQuantityChange;

    const { error: updateError } = await supabase
      .from('product_variant_combinations')
      .update({ quantity: newQuantity })
      .eq('id', selectedItem.id);

    if (updateError) {
      console.error('Error updating quantity:', updateError.message);
      Alert.alert('Error', 'Failed to update quantity.');
    } else {
      // Record in inventory_history
      const { error: historyError } = await supabase
        .from('inventory_history')
        .insert({
          product_variant_combination_id: selectedItem.id,
          change_type: parsedQuantityChange > 0 ? 'restock' : 'manual_adjustment',
          quantity_change: parsedQuantityChange,
          new_quantity: newQuantity,
          notes: 'Manual adjustment from app',
        });

      if (historyError) {
        console.error('Error recording inventory history:', historyError.message);
      }

      Alert.alert('Success', 'Inventory updated successfully!');
      setQuantityChange('');
      fetchInventory(searchQuery); // Refresh inventory list
    }
    setLoading(false);
  };

  const handleSelectItem = (item) => {
    setSelectedItem(item);
    setSelectedItemId(item.id);
  };

  const restockProduct = async (product_variant_combination_id, quantity) => {
    if (!quantity || isNaN(parseInt(quantity))) {
      Alert.alert('Invalid Input', 'Please enter a valid quantity.');
      return;
    }
    setLoading(true);
    const parsedQuantity = parseInt(quantity);
    const { error } = await supabase
      .from('product_variant_combinations')
      .update({ quantity: parsedQuantity })
      .eq('id', product_variant_combination_id);

    if (error) {
      Alert.alert('Error', `Failed to restock product: ${error.message}`);
    } else {
      // Record in inventory_history
      const { error: historyError } = await supabase
        .from('inventory_history')
        .insert({
          product_variant_combination_id: product_variant_combination_id,
          change_type: 'restock',
          quantity_change: parsedQuantity,
          new_quantity: parsedQuantity,
          notes: 'Restocked from app',
        });

      if (historyError) {
        console.error('Error recording inventory history:', historyError.message);
      }
      Alert.alert('Success', 'Product restocked successfully!');
      setQuantityChange('');
      fetchInventory(searchQuery);
    }
    setLoading(false);
  };

  if (loading && inventory.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory Management</Text>
      </View>
      <View style={styles.filtersContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by product name..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      <View style={styles.mainContent}>
        <View style={styles.leftPane}>
          {loading && <ActivityIndicator style={styles.listLoader} size="small" color="#007AFF" />}
          <FlatList
            data={inventory}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.itemContainer, selectedItem?.id === item.id && styles.selectedItemContainer]} 
                onPress={() => handleSelectItem(item)}
              >
                <Text style={styles.itemName}>{item.products ? item.products.product_name : 'Product not found'} - {item.combination_string}</Text>
                <Text style={styles.itemQuantity}>Stock: {item.quantity}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No inventory items found.</Text>}
          />
        </View>
        <View style={styles.rightPane}>
          {selectedItem ? (
            <View>
              <View style={styles.tabContainer}>
                <TouchableOpacity 
                  style={[styles.tabButton, activeTab === 'adjust' && styles.activeTabButton]}
                  onPress={() => setActiveTab('adjust')}
                >
                  <Text style={styles.tabButtonText}>Adjust Quantity</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tabButton, activeTab === 'restock' && styles.activeTabButton]}
                  onPress={() => setActiveTab('restock')}
                >
                  <Text style={styles.tabButtonText}>Restock</Text>
                </TouchableOpacity>
              </View>

              {activeTab === 'adjust' ? (
                <View style={styles.detailsContainer}>
                  <Text style={styles.modalTitle}>Adjust Quantity for {selectedItem.products ? selectedItem.products.product_name : 'Product not found'} - {selectedItem.combination_string}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Quantity Change (e.g., 5 or -2)"
                    keyboardType="numeric"
                    value={quantityChange}
                    onChangeText={setQuantityChange}
                  />
                  <Button title="Adjust Inventory" onPress={handleAdjustQuantity} />
                </View>
              ) : (
                <View style={styles.detailsContainer}>
                  <Text style={styles.modalTitle}>Restock Inventory for {selectedItem.products ? selectedItem.products.product_name : 'Product not found'} - {selectedItem.combination_string}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Restock Quantity"
                    keyboardType="numeric"
                    value={quantityChange}
                    onChangeText={setQuantityChange}
                  />
                  <Button title="Restock" onPress={() => restockProduct(selectedItem.id, quantityChange)} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text>Select an item to see details</Text>
            </View>
          )}
          <InventoryHistory product_variant_combination_id={selectedItemId} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  restockButton: {
    backgroundColor: '#4CAF50', // Green
  },
  filtersContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPane: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  rightPane: {
    flex: 1,
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedItemContainer: {
    backgroundColor: '#e0f7ff',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemQuantity: {
    fontSize: 14,
    color: '#555',
    marginTop: 5,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#888',
  },
  detailsContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 5,
    width: '100%',
    marginBottom: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  activeTabButton: {
    backgroundColor: '#007AFF',
  },
  tabButtonText: {
    fontWeight: 'bold',
    color: '#333',
  },
  activeTabButtonText: {
    color: '#fff',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listLoader: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    zIndex: 1,
  },
});

export default InventoryScreen;