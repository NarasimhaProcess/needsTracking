import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { supabase, getProductsWithDetails, deleteProductMedia, deleteProduct } from '../services/supabase';
import Icon from 'react-native-vector-icons/FontAwesome';
// import { Video } from 'expo-av'; // Temporarily commented out

import ProductFormModal from '../components/ProductFormModal';

const ProductScreen = ({ route, navigation }) => {
  const { session } = route.params;
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    console.log('ProductScreen: useEffect triggered. Current session prop:', session);
    
    const user = session?.user ? session.user : session;

    if (!user) {
      console.log('ProductScreen: User is missing.');
      setUserId(null);
      setProducts([]);
      return;
    }

    const id = user.id;
    setUserId(id);
    console.log('ProductScreen: User ID set:', id);
    fetchProducts(id); // Call fetchProducts immediately after userId is set
  }, [session]);
  
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]); // Stores fetched products
  const [showProductModal, setShowProductModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState(null);
  const [customerMediaUrl, setCustomerMediaUrl] = useState(null); // Renamed from customerBucketUrl
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [allMediaForViewer, setAllMediaForViewer] = useState([]);

  // Define fetchProductsAndMediaUrl outside useEffect to ensure stable reference
  const fetchProducts = async (currentUserId) => { // Accept userId as parameter
    console.log('ProductScreen: fetchProducts called. Current userId:', currentUserId);
    const user = session?.user ? session.user : session;

    if (!user || !currentUserId) { // Use currentUserId
      console.log('ProductScreen: Skipping fetchProducts due to missing user or userId.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getProductsWithDetails(currentUserId); // Use currentUserId
      console.log('ProductScreen: Data received from getProductsWithDetails:', data);
      if (data) {
        setProducts(data);
        console.log('ProductScreen: products state after setProducts:', data);
      }
    } catch (error) {
      console.error("ProductScreen: Error in fetching products:", error.message);
      Alert.alert("Error", "An unexpected error occurred while fetching data.");
    } finally {
      setLoading(false);
    }
  };

  

  const handleEditProduct = (product) => {
    setProductToEdit(product);
    setShowProductModal(true);
  };

  const handleModalSubmit = () => {
    fetchProducts(userId); // Refresh the list after add/edit
  };

  const handleDeleteProductMedia = async (mediaId, mediaUrl) => {
    return new Promise((resolve) => {
      Alert.alert(
        "Delete Media",
        "Are you sure you want to delete this media? This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Delete",
            onPress: async () => {
              setLoading(true);
              const success = await deleteProductMedia(mediaId, mediaUrl);
              if (success) {
                Alert.alert("Success", "Media deleted successfully.");
                fetchProducts(); // Refresh the list
                resolve(true);
              } else {
                Alert.alert("Error", "Failed to delete media.");
                resolve(false);
              }
              setLoading(false);
            },
          },
        ]
      );
    });
  };

  const handleDeleteProduct = (productId) => {
    Alert.alert(
      "Delete Product",
      "Are you sure you want to delete this product and all its associated media? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            setLoading(true);
            const success = await deleteProduct(productId);
            if (success) {
              Alert.alert("Success", "Product deleted successfully.");
              fetchProducts(); // Refresh the list
            } else {
              Alert.alert("Error", "Failed to delete product.");
            }
            setLoading(false);
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.productsListTitle}>Your Products</Text>
        <TouchableOpacity onPress={() => navigation.navigate('ProductMapScreen', { customerId })}>
          <Icon name="map" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => { setProductToEdit(null); setShowProductModal(true); }}
      >
        <Icon name="plus" size={24} color="white" />
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : products.length > 0 ? (
        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell}>Name</Text>
            <Text style={styles.tableHeaderCell}>Start Date</Text>
            <Text style={styles.tableHeaderCell}>End Date</Text>
            <Text style={styles.tableHeaderCell}>Media</Text>
            <Text style={styles.tableHeaderCell}>Edit</Text>
          </View>
          <FlatList
            data={products}
            renderItem={({ item }) => {
              return (
                <View style={styles.productRow}>
                  <Text style={styles.productCell}>{item.product_name}</Text>
                  <Text style={styles.productCell}>{new Date(item.start_date).toLocaleDateString()}</Text>
                  <Text style={styles.productCell}>{new Date(item.end_date).toLocaleDateString()}</Text>
                  <View style={styles.productCellMedia}>
                    <FlatList
                      data={item.product_media}
                      horizontal
                      showsHorizontalScrollIndicator={true}
                      keyExtractor={(media) => media.id.toString()}
                      renderItem={({ item: media, index: mediaIndex }) => (
                        <TouchableOpacity
                          onPress={() => {
                            setAllMediaForViewer(item.product_media);
                            setCurrentMediaIndex(mediaIndex);
                            setShowMediaViewer(true);
                          }}
                          style={styles.mediaContainer}
                        >
                          {media.media_type === 'image' ? (
                            <Image source={{ uri: media.media_url }} style={styles.productImage} />
                          ) : (
                            <Text style={styles.videoPlaceholder}>Video</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                  <TouchableOpacity onPress={() => handleEditProduct(item)} style={styles.editIcon}>
                    <Icon name="edit" size={20} color="#007AFF" />
                  </TouchableOpacity>
                </View>
              );
            }}
            keyExtractor={(item) => item.id.toString()}
            style={styles.productsList}
            showsVerticalScrollIndicator={true}
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
        customerMediaUrl={customerMediaUrl}
        onDeleteMedia={handleDeleteProductMedia}
        onDeleteProduct={handleDeleteProduct}
        session={session}
      />

      {/* Media Viewer Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showMediaViewer}
        onRequestClose={() => setShowMediaViewer(false)}
      >
        <View style={styles.mediaViewerContainer}>
          <TouchableOpacity style={styles.mediaViewerCloseButton} onPress={() => setShowMediaViewer(false)}>
            <Icon name="times-circle" size={30} color="white" />
          </TouchableOpacity>

          {allMediaForViewer.length > 0 && (
            <>
              <TouchableOpacity
                style={[styles.mediaNavButton, styles.mediaNavButtonLeft]}
                onPress={() => setCurrentMediaIndex(prevIndex => Math.max(0, prevIndex - 1))}
                disabled={currentMediaIndex === 0}
              >
                <Icon name="chevron-left" size={30} color="white" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.mediaNavButton, styles.mediaNavButtonRight]}
                onPress={() => setCurrentMediaIndex(prevIndex => Math.min(allMediaForViewer.length - 1, prevIndex + 1))}
                disabled={currentMediaIndex === allMediaForViewer.length - 1}
              >
                <Icon name="chevron-right" size={30} color="white" />
              </TouchableOpacity>

              {allMediaForViewer[currentMediaIndex].media_type === 'image' ? (
                <Image
                  source={{ uri: allMediaForViewer[currentMediaIndex].media_url }}
                  style={styles.fullScreenMedia}
                  resizeMode="contain"
                />
              ) : allMediaForViewer[currentMediaIndex].media_type === 'video' ? (
                // <Video // Temporarily commented out
                //   source={{ uri: allMediaForViewer[currentMediaIndex].media_url }}
                //   style={styles.fullScreenMedia}
                //   useNativeControls
                //   resizeMode="contain"
                //   isLooping
                // />
                <Text style={styles.noMediaText}>Video playback temporarily disabled</Text> // Placeholder
              ) : (
                <Text style={styles.noMediaText}>No media to display</Text>
              )}
            </>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  productsListTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 20,
    backgroundColor: '#03A9F4',
    borderRadius: 30,
    elevation: 8,
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
  productNameCell: {
    flex: 2, // Give more space to the product name
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
  mediaContainer: {
    position: 'relative',
    margin: 2,
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
  mediaViewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaViewerCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 1,
  },
  fullScreenMedia: {
    width: '100%',
    height: '80%',
  },
  noMediaText: {
    color: 'white',
    fontSize: 18,
  },
  mediaNavButton: {
    position: 'absolute',
    top: '50%',
    zIndex: 1,
    padding: 10,
  },
  mediaNavButtonLeft: {
    left: 10,
  },
  mediaNavButtonRight: {
    right: 10,
  },
  editIcon: {
    padding: 5,
  },
});

export default ProductScreen;
