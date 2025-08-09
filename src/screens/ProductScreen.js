import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { supabase, getProductsWithMedia } from '../services/supabase';
import Icon from 'react-native-vector-icons/FontAwesome';
import ProductFormModal from '../components/ProductFormModal';

const ProductScreen = ({ route }) => {
  const { session, customerId } = route.params;
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]); // Stores fetched products
  const [showProductModal, setShowProductModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState(null);
  const [customerMediaUrl, setCustomerMediaUrl] = useState(null); // Renamed from customerBucketUrl

  useEffect(() => {
    const fetchProductsAndMediaUrl = async () => {
      if (!session || !session.user || !customerId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // Fetch customer details to get the media_url
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('media_url')
          .eq('id', customerId)
          .maybeSingle();

        if (customerError) {
          console.error("Error fetching customer media URL:", customerError.message);
          Alert.alert("Error", "Failed to fetch customer media configuration.");
          setLoading(false);
          return;
        }

        if (customerData) {
          setCustomerMediaUrl(customerData.media_url);
        }

        // Fetch products with their media
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            customers(media_url),
            product_media (media_url, media_type)
          `)
          .eq('customer_id', customerId);

        if (error) {
          console.error('Error fetching products:', error.message);
          Alert.alert("Error", "Failed to fetch products.");
        } else {
          setProducts(data);
        }
      } catch (error) {
        console.error("Error in fetching products and media URL:", error.message);
        Alert.alert("Error", "An unexpected error occurred while fetching data.");
      } finally {
        setLoading(false);
      }
    };

    fetchProductsAndMediaUrl();
  }, [session, customerId]);

  const handleEditProduct = (product) => {
    setProductToEdit(product);
    setShowProductModal(true);
  };

  const handleModalSubmit = () => {
    fetchProductsForUser(); // Refresh the list after add/edit
  };

  const renderProductItem = ({ item }) => (
    <View style={styles.productRow}>
      <Text style={styles.productCell}>{item.product_name}</Text>
      <Text style={styles.productCell}>{item.amount}</Text>
      <Text style={styles.productCell}>{item.quantity}</Text>
      <Text style={styles.productCell}>{item.start_date}</Text>
      <Text style={styles.productCell}>{item.end_date}</Text>
      <View style={styles.productCellMedia}>
        {item.product_media.map((media, index) => (
          media.media_type === 'image' ? (
            <Image key={index} source={{ uri: media.media_url }} style={styles.productImage} />
          ) : (
            <Text key={index} style={styles.videoPlaceholder}>Video</Text>
          )
        ))}
      </View>
      <TouchableOpacity onPress={() => handleEditProduct(item)} style={styles.editIcon}>
        <Icon name="edit" size={20} color="#007AFF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addProductButton} onPress={() => { setProductToEdit(null); setShowProductModal(true); }}>
        <Text style={styles.addProductButtonText}>Add New Product</Text>
      </TouchableOpacity>

      <Text style={styles.productsListTitle}>Your Products</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : products.length > 0 ? (
        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell}>Name</Text>
            <Text style={styles.tableHeaderCell}>Amount</Text>
            <Text style={styles.tableHeaderCell}>Qty</Text>
            <Text style={styles.tableHeaderCell}>Start Date</Text>
            <Text style={styles.tableHeaderCell}>End Date</Text>
            <Text style={styles.tableHeaderCell}>Media</Text>
            <Text style={styles.tableHeaderCell}>Edit</Text>
          </View>
          <FlatList
            data={products}
            renderItem={({ item }) => {
              const mediaBaseUrl = item.customers.media_url || `https://otmklncbcfbfrvvtdgme.storage.supabase.co/storage/v1/object/public/productsmedia/`;
              return (
                <View style={styles.productRow}>
                  <Text style={styles.productCell}>{item.product_name}</Text>
                  <Text style={styles.productCell}>{item.amount}</Text>
                  <Text style={styles.productCell}>{item.quantity}</Text>
                  <Text style={styles.productCell}>{item.start_date}</Text>
                  <Text style={styles.productCell}>{item.end_date}</Text>
                  <View style={styles.productCellMedia}>
                    {item.product_media.map((media, index) => (
                      media.media_type === 'image' ? (
                        <Image key={index} source={{ uri: media.media_type === 'url' ? media.media_url : `${mediaBaseUrl}${media.media_url}` }} style={styles.productImage} />
                      ) : (
                        <Text key={index} style={styles.videoPlaceholder}>Video</Text>
                      )
                    ))}
                  </View>
                  <TouchableOpacity onPress={() => handleEditProduct(item)} style={styles.editIcon}>
                    <Icon name="edit" size={20} color="#007AFF" />
                  </TouchableOpacity>
                </View>
              );
            }}
            keyExtractor={(item) => item.id.toString()}
            style={styles.productsList}
          />
        </View>
      ) : (
        <Text>No products found.</Text>
      )}

      <ProductFormModal
        isVisible={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSubmit={handleModalSubmit}
        productToEdit={productToEdit}
        customerId={customerId}
        customerMediaUrl={customerMediaUrl}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  addProductButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 20,
  },
  addProductButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  productsListTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  productsList: {
    marginTop: 10,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productCell: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
  },
  productCellMedia: {
    flex: 1.5,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  productImage: {
    width: 40,
    height: 40,
    margin: 2,
    borderRadius: 3,
  },
  videoPlaceholder: {
    width: 40,
    height: 40,
    margin: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#ddd',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 8,
    backgroundColor: '#f0f0f0',
  },
  editIcon: {
    padding: 5,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  tableHeaderCell: {
    flex: 1,
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default ProductScreen;