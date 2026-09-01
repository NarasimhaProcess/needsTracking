import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, getProductsWithDetails, deleteProductMedia, deleteProduct } from '../services/supabase';
import Icon from 'react-native-vector-icons/FontAwesome';
import { showAlert } from '../utils/alertUtils';
import ProductFormModal from '../components/ProductFormModal';
import PreLoginFooter from '../components/PreLoginFooter';
import PortalsMenuModal from '../components/PortalsMenuModal';

const isImageMedia = (media) => {
  if (!media) return false;
  const type = (media.media_type || media.type || '').toLowerCase();
  const url = media.media_url || media.uri || '';
  if (type === 'video') return false;
  if (type === 'image' || type === 'url' || !type) return true;
  if (type.startsWith('image/')) return true;
  if (typeof url === 'string' && /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url)) return true;
  return true;
};

const ProductScreen = ({ route, navigation }) => {
  const { session: initialSession, userId: initialUserId } = route?.params || {};
  const [session, setSession] = useState(initialSession || null);
  const [userId, setUserId] = useState(initialUserId || null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]); // Stores fetched products
  const [showProductModal, setShowProductModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState(null);
  const [customerMediaUrl, setCustomerMediaUrl] = useState(null);
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [allMediaForViewer, setAllMediaForViewer] = useState([]);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  // Robust fetchProducts that accurately resolves current seller's user ID
  const fetchProducts = useCallback(async (explicitUserId) => {
    let activeUserId = explicitUserId || userId || initialUserId || route?.params?.userId;

    if (!activeUserId) {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.user?.id) {
          activeUserId = currentSession.user.id;
          setSession(currentSession);
          setUserId(activeUserId);
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            activeUserId = user.id;
            setUserId(activeUserId);
          }
        }
      } catch (authErr) {
        console.warn('ProductScreen: Error retrieving active auth user:', authErr);
      }
    }

    if (!activeUserId) {
      console.log('ProductScreen: Skipping fetchProducts due to missing activeUserId.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setUserId(activeUserId);
    setLoading(true);
    try {
      console.log('ProductScreen: Fetching products for userId:', activeUserId);
      const data = await getProductsWithDetails(activeUserId);
      console.log('ProductScreen: Data received from getProductsWithDetails count:', data?.length || 0);
      if (data) {
        setProducts(data);
      }
    } catch (error) {
      console.error("ProductScreen: Error in fetching products:", error.message);
      showAlert("Error", "An unexpected error occurred while fetching data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, initialUserId, route?.params?.userId]);

  // Initial load
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Refresh whenever screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [fetchProducts])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchProducts();
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
      showAlert(
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
                showAlert("Success", "Media deleted successfully.");
                fetchProducts(userId); // Refresh the list
                resolve(true);
              } else {
                showAlert("Error", "Failed to delete media.");
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
    showAlert(
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
              showAlert("Success", "Product deleted successfully.");
              fetchProducts(userId); // Refresh the list
            } else {
              showAlert("Error", "Failed to delete product.");
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity onPress={() => navigation.navigate('ProductMapScreen', { userId })}>
            <Icon name="map" size={22} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsMenuVisible(true)} accessibilityLabel="Portals Menu">
            <Icon name="ellipsis-h" size={20} color="#1E293B" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : products.length > 0 ? (
        <View style={{flex: 1}}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.tableHeaderCellEdit]}>Edit</Text>
            <Text style={styles.tableHeaderCell}>Name</Text>
            <Text style={styles.tableHeaderCell}>Start Date</Text>
            <Text style={styles.tableHeaderCell}>End Date</Text>
            <Text style={styles.tableHeaderCell}>Media</Text>
          </View>
          <FlatList
            data={products}
            renderItem={({ item }) => {
              return (
                <View style={styles.productRow}>
                  <TouchableOpacity onPress={() => handleEditProduct(item)} style={styles.editIcon}>
                    <Icon name="edit" size={20} color="#007AFF" />
                  </TouchableOpacity>
                  <Text style={styles.productCell}>{item.product_name}</Text>
                  <Text style={styles.productCell}>{new Date(item.start_date).toLocaleDateString()}</Text>
                  <Text style={styles.productCell}>{new Date(item.end_date).toLocaleDateString()}</Text>
                  <View style={styles.productCellMedia}>
                    {item.product_media && item.product_media.length > 0 ? (
                      <FlatList
                        data={item.product_media}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(media, idx) => (media?.id ? media.id.toString() : `media-${idx}`)}
                        renderItem={({ item: media, index: mediaIndex }) => (
                          <TouchableOpacity
                            onPress={() => {
                              setAllMediaForViewer(item.product_media);
                              setCurrentMediaIndex(mediaIndex);
                              setShowMediaViewer(true);
                            }}
                            style={styles.mediaContainer}
                          >
                            {isImageMedia(media) && media.media_url ? (
                              <Image source={{ uri: media.media_url }} style={styles.productImage} />
                            ) : (
                              <Text style={styles.videoPlaceholder}>Video</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      />
                    ) : (
                      <View style={styles.noMediaPlaceholder}>
                        <Icon name="image" size={16} color="#bbb" />
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
            keyExtractor={(item) => item.id.toString()}
            style={styles.productsList}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 140 }}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#007AFF']} tintColor="#007AFF" />
            }
            ListFooterComponent={<PreLoginFooter containerStyle={{ marginVertical: 20, width: '100%' }} />}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingBottom: 140 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#007AFF']} tintColor="#007AFF" />
          }
        >
          <View style={styles.center}>
            <Icon name="shopping-bag" size={54} color="#CBD5E1" style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 8 }}>No products added yet</Text>
            <Text style={{ fontSize: 14, color: '#64748B', marginBottom: 20, textAlign: 'center' }}>
              Add products to your store so buyers can view and order them.
            </Text>
            <TouchableOpacity
              style={styles.addFirstProductBtn}
              onPress={() => { setProductToEdit(null); setShowProductModal(true); }}
            >
              <Icon name="plus" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.addFirstProductBtnText}>Add Your First Product</Text>
            </TouchableOpacity>
          </View>
          <PreLoginFooter containerStyle={{ marginTop: 24, width: '100%' }} />
        </ScrollView>
      )}

      <ProductFormModal
        isVisible={showProductModal}
        onClose={() => {
    setShowProductModal(false);
    setProductToEdit(null);
  }}
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

              {isImageMedia(allMediaForViewer[currentMediaIndex]) && allMediaForViewer[currentMediaIndex]?.media_url ? (
                <Image
                  source={{ uri: allMediaForViewer[currentMediaIndex].media_url }}
                  style={styles.fullScreenMedia}
                  resizeMode="contain"
                />
              ) : allMediaForViewer[currentMediaIndex]?.media_type === 'video' ? (
                <Text style={styles.noMediaText}>Video playback temporarily disabled</Text> // Placeholder
              ) : (
                <Text style={styles.noMediaText}>No media to display</Text>
              )}
            </>
          )}
        </View>
      </Modal>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => { setProductToEdit(null); setShowProductModal(true); }}
      >
        <Icon name="plus" size={24} color="white" />
      </TouchableOpacity>

      {/* Portals & Pre-login 3-dots Menu Modal */}
      <PortalsMenuModal
        visible={isMenuVisible}
        onClose={() => setIsMenuVisible(false)}
        navigation={navigation}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  productsListTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
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
    zIndex: 10,
  },
  productsList: {
    flex: 1,
    width: '100%',
    marginTop: 10,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 5,
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
    lineHeight: 40,
    fontSize: 8,
    backgroundColor: '#f0f0f0',
  },
  noMediaPlaceholder: {
    width: 40,
    height: 40,
    margin: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
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
  tableHeaderCellEdit: {
    flex: 0.5,
    textAlign: 'left',
    paddingLeft: 5
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
    flex: 0.5,
    alignItems: 'flex-start',
    paddingLeft: 5,
  },
  addFirstProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  addFirstProductBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ProductScreen;
