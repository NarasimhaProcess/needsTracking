import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native'; // Import useFocusEffect
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { getActiveProductsWithDetails } from '../services/supabase';

const CatalogScreen = ({ navigation, route }) => {
  const { customerId } = route.params;
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const fetchProducts = async () => {
        setLoading(true);
        const data = await getActiveProductsWithDetails(customerId);
        if (data) {
          setProducts(data);
        }
        setLoading(false);
      };

      fetchProducts();
      return () => {
        // Optional: cleanup function if needed
      };
    }, [customerId])
  );

  const renderProduct = ({ item }) => (
    <TouchableOpacity
      style={styles.productContainer}
      onPress={() => navigation.navigate('ProductDetail', { product: item })}
    >
      <Image
        style={styles.productImage}
        source={{ uri: item.product_media[0]?.media_url || 'https://placehold.co/600x400' }}
      />
      <Text style={styles.productName}>{item.product_name}</Text>
      <Text style={styles.productPrice}>${item.amount}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#0000ff" />;
  }

  return (
    <FlatList
      data={products}
      renderItem={renderProduct}
      keyExtractor={(item) => item.id.toString()}
      numColumns={2}
      contentContainerStyle={styles.container}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
  productContainer: {
    flex: 1,
    margin: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 3,
  },
  productImage: {
    width: '100%',
    height: 150,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    margin: 10,
  },
  productPrice: {
    fontSize: 14,
    color: '#888',
    margin: 10,
  },
});

export default CatalogScreen;
