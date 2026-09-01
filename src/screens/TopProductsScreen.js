import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Button,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Swiper from 'react-native-swiper';
import { Video } from 'expo-av';
import ImageViewer from 'react-native-image-zoom-viewer';
import { getTopProductsWithDetails, addToCart, getCart, updateCartItem, removeCartItem, supabase } from '../services/supabase';
import { useCart } from '../context/CartContext';
import { showAlert } from '../utils/alertUtils';
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

const TopProductsScreen = ({ navigation, route }) => {
  const { customerId: routeCustomerId } = route?.params || {};
  const [customerId, setCustomerId] = useState(routeCustomerId);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { cart, setCart, role, updateItemQuantity, removeItem } = useCart();
  const [isCartModalVisible, setIsCartModalVisible] = useState(false);
  const [isProductDetailModalVisible, setIsProductDetailModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [user, setUser] = useState(null);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false); // New state for full screen image viewer
  const [viewerImages, setViewerImages] = useState([]); // New state for images in viewer
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  useEffect(() => {
    const fetchUserAndCustomerId = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);

      let currentCustomerId = routeCustomerId;
      if (!currentCustomerId && currentUser?.email) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('id')
          .eq('email', currentUser.email)
          .single();

        if (customerError) {
          console.error('Error fetching customer ID in TopProductsScreen:', customerError.message);
        } else if (customerData) {
          currentCustomerId = customerData.id;
          setCustomerId(customerData.id);
        }
      }
      
      // Now fetch products and cart using the determined customerId
      setLoading(true);
      const data = await getTopProductsWithDetails(currentCustomerId);
      if (data) {
        setProducts(data);
      }
      setLoading(false);
    };

    fetchUserAndCustomerId();
  }, [routeCustomerId]);

  const handleVariantSelect = (variantName, optionValue) => {
    setSelectedVariants({
      ...selectedVariants,
      [variantName]: optionValue,
    });
  };

  const getVariantCombination = () => {
    if (!selectedProduct) return null;
    const combos = selectedProduct.product_variant_combinations || [];
    if (combos.length === 0) {
      return { id: selectedProduct.id, combination_string: 'Default', price: selectedProduct.amount || 0, quantity: 100 };
    }
    if (combos.length === 1) {
      return combos[0];
    }
    const sortedKeys = Object.keys(selectedVariants).sort();
    const combinationString = sortedKeys
      .map((key) => `${key}:${selectedVariants[key]}`)
      .join(',');
    const normalizedCombinationString = combinationString.replace(/\s/g, '').toLowerCase();

    const found = combos.find(
      (c) => {
        if (c.combination_string) {
          const normalizedDbString = c.combination_string.replace(/\s/g, '').toLowerCase();
          return normalizedDbString === normalizedCombinationString;
        }
        return false;
      }
    );
    return found || combos[0];
  };

  const handleAddToCart = async () => {
    const combination = getVariantCombination();
    if (!combination) {
      showAlert('Error', 'Product information is incomplete.');
      return;
    }

    console.log('handleAddToCart: Before getUser, user state:', user);
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    console.log('handleAddToCart: After getUser, currentUser:', currentUser);

    if (!currentUser) {
      // Redirect to BuyerLogin for buyer authentication
      navigation.navigate('BuyerLogin', {
        redirectTo: 'TopProducts',
        redirectParams: {
          productId: selectedProduct.id,
          customerId: customerId,
        },
      });
      return;
    }

    const result = await addToCart(currentUser.id, combination.id, quantity);
    if (result) {
      const cartData = await getCart(currentUser.id);
      setCart(cartData);
      setIsProductDetailModalVisible(false);
      showAlert('Success', 'Item added to cart!');
      if (role === 'buyer' || role === 'customer') {
        navigation.goBack();
      } else {
        setIsCartModalVisible(true);
      }
    } else {
      showAlert('Error', 'Failed to add item to cart.');
    }
  };

  const handleUpdateQuantity = async (cartItemId, quantity) => {
    await updateItemQuantity(cartItemId, quantity);
  };

  const handleRemoveItem = async (cartItemId) => {
    await removeItem(cartItemId);
  };

  const openProductDetailModal = (product) => {
    setSelectedProduct(product);
    setQuantity(1); // Reset quantity to 1
    setIsProductDetailModalVisible(true);

    const variants = product.product_variants || [];
    if (variants.length > 0) {
      const defaultVars = {};
      variants.forEach((v) => {
        if (v.variant_options && v.variant_options.length > 0) {
          defaultVars[v.name] = v.variant_options[0].value;
        }
      });
      setSelectedVariants(defaultVars);
    } else {
      setSelectedVariants({});
    }
  };

  const renderProduct = ({ item }) => {
    const imgUrl = item.product_media && item.product_media.length > 0 ? item.product_media[0]?.media_url : null;
    return (
      <View style={styles.productContainer}>
        <TouchableOpacity onPress={() => openProductDetailModal(item)} activeOpacity={0.8}>
          {imgUrl ? (
            <Image
              style={styles.productImage}
              source={{ uri: imgUrl }}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Icon name="shopping-bag" size={32} color="#94a3b8" />
            </View>
          )}
          <Text style={styles.productName} numberOfLines={2}>{item.product_name}</Text>
          <Text style={styles.productPrice}>₹{item.amount}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.cardAddButton} 
          onPress={() => openProductDetailModal(item)}
        >
          <Icon name="plus" size={12} color="#2E7D32" style={{ marginRight: 6 }} />
          <Text style={styles.cardAddButtonText}>ADD</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCartItem = ({ item }) => {
    const prodMedia = item?.product_variant_combinations?.products?.product_media;
    const mediaUrl = (Array.isArray(prodMedia) && prodMedia.length > 0) ? prodMedia[0]?.media_url : item?.image_url;
    return (
      <View style={styles.itemContainer}>
        {mediaUrl ? (
          <Image
            style={styles.itemImage}
            source={{ uri: mediaUrl }}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.itemImage, styles.placeholderImage]}>
            <Icon name="shopping-bag" size={20} color="#94a3b8" />
          </View>
        )}
        <View style={styles.itemDetails}>
          <Text style={styles.itemName}>{item?.product_variant_combinations?.products?.product_name || 'Product'}</Text>
          <Text style={styles.itemVariant}>{item?.product_variant_combinations?.combination_string || ''}</Text>
          <Text style={styles.itemPrice}>₹{item?.product_variant_combinations?.price || 0}</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity onPress={() => handleUpdateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1}>
              <Icon name="minus-circle" size={20} color="#555" />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{item.quantity}</Text>
            <TouchableOpacity onPress={() => handleUpdateQuantity(item.id, item.quantity + 1)}>
              <Icon name="plus-circle" size={20} color="#555" />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={() => handleRemoveItem(item.id)}>
          <Icon name="trash" size={24} color="red" />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#0000ff" />;
  }

  const modalMediaList = (selectedProduct?.product_media || []).filter(m => m && (m.media_url || m.uri));

  return (
    <View style={{ flex: 1, width: '100%', height: '100%', backgroundColor: 'white' }}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ marginRight: 12 }}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('Welcome');
              }
            }}
          >
            <Icon name="arrow-left" size={18} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.topHeaderTitle}>Featured Products</Text>
        </View>

        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => setIsMenuVisible(true)}
          accessibilityLabel="Portals Menu"
        >
          <Icon name="ellipsis-h" size={20} color="#1E293B" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.container, { flexGrow: 1, paddingBottom: 120 }]}
        ListFooterComponent={<PreLoginFooter containerStyle={{ marginVertical: 20, width: '100%' }} />}
      />

      {/* Product Detail Modal */}
      {selectedProduct && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={isProductDetailModalVisible}
          onRequestClose={() => {
            setIsProductDetailModalVisible(!isProductDetailModalVisible);
          }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsProductDetailModalVisible(false)}
              >
                <Icon name="times-circle" size={30} color="#333" />
              </TouchableOpacity>
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {modalMediaList.length > 0 ? (
                  <Swiper style={styles.swiper} showsButtons={modalMediaList.length > 1} loop={modalMediaList.length > 1}>
                    {modalMediaList.map((media, index) => {
                      const mediaUrl = media.media_url || media.uri;
                      const isImage = isImageMedia(media);
                      return (
                        <View key={media.id || `modal-media-${index}`} style={styles.slide}>
                          <TouchableOpacity onPress={() => {
                            const imageUrls = modalMediaList
                              .filter(m => isImageMedia(m) && (m.media_url || m.uri))
                              .map(m => ({ url: m.media_url || m.uri }));
                            if (imageUrls.length > 0) {
                              setViewerImages(imageUrls);
                              setIsImageViewerVisible(true);
                            }
                          }} style={styles.mediaContainer}>
                            {isImage ? (
                              <Image source={{ uri: mediaUrl }} style={styles.media} resizeMode="contain" />
                            ) : (
                              <Video
                                source={{ uri: mediaUrl }}
                                style={styles.media}
                                useNativeControls
                                resizeMode="contain"
                              />
                            )}
                            {isImage && (
                              <TouchableOpacity
                                style={styles.zoomIcon}
                                onPress={() => {
                                  const imageUrls = modalMediaList
                                    .filter(m => isImageMedia(m) && (m.media_url || m.uri))
                                    .map(m => ({ url: m.media_url || m.uri }));
                                  if (imageUrls.length > 0) {
                                    setViewerImages(imageUrls);
                                    setIsImageViewerVisible(true);
                                  }
                                }}
                              >
                                <MaterialIcons name="zoom-out-map" size={24} color="white" />
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </Swiper>
                ) : (
                  <View style={styles.modalPlaceholderBanner}>
                    <Icon name="shopping-bag" size={48} color="#94a3b8" />
                    <Text style={styles.modalPlaceholderText}>{selectedProduct.product_name}</Text>
                  </View>
                )}

                <View style={styles.detailsContainer}>
                  <Text style={styles.productName}>{selectedProduct.product_name}</Text>
                  <Text style={styles.productDescription}>{selectedProduct.description}</Text>
                  
                  {/* Display price and quantity based on selected variant */}
                  {(() => {
                    const selectedCombination = getVariantCombination();
                    const displayPrice = selectedCombination ? selectedCombination.price : selectedProduct.amount;
                    const displayQuantity = selectedCombination ? selectedCombination.quantity : 'N/A';

                    return (
                      <>
                        <Text style={styles.productPrice}>₹{displayPrice}</Text>
                        <Text style={styles.stockText}>In Stock: {displayQuantity} {selectedProduct.unit}</Text>
                      </>
                    );
                  })()}

                  {selectedProduct.product_variants && selectedProduct.product_variants.map((variant) => (
                    <View key={variant.id} style={styles.variantContainer}>
                      <Text style={styles.variantName}>{variant.name}</Text>
                      <View style={styles.optionsContainer}>
                        {variant.variant_options && variant.variant_options.map((option) => (
                          <TouchableOpacity
                            key={option.id}
                            style={[
                              styles.optionButton,
                              selectedVariants[variant.name] === option.value && styles.selectedOption,
                            ]}
                            onPress={() => handleVariantSelect(variant.name, option.value)}
                          >
                            <Text style={selectedVariants[variant.name] === option.value ? { color: '#fff', fontWeight: 'bold' } : {}}>{option.value}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* Sticky Footer for Quantity and Add to Cart */}
              <View style={styles.productModalFooter}>
                <View style={styles.quantitySelector}>
                  <Text style={styles.quantityLabel}>Qty:</Text>
                  <TouchableOpacity 
                    onPress={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    style={{ padding: 4 }}
                  >
                    <Icon name="minus-circle" size={26} color={quantity <= 1 ? '#ccc' : '#E53935'} />
                  </TouchableOpacity>
                  <Text style={styles.quantityText}>{quantity}</Text>
                  <TouchableOpacity 
                    onPress={() => setQuantity(quantity + 1)}
                    style={{ padding: 4 }}
                  >
                    <Icon name="plus-circle" size={26} color="#43A047" />
                  </TouchableOpacity>
                </View>
                
                <TouchableOpacity style={styles.modalAddToCartButton} onPress={handleAddToCart}>
                  <Icon name="shopping-cart" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.modalAddToCartButtonText}>Add to Cart</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Cart Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isCartModalVisible}
        onRequestClose={() => {
          setIsCartModalVisible(!isCartModalVisible);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsCartModalVisible(false)}
            >
              <Icon name="times-circle" size={30} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Your Cart</Text>
            {cart && cart.cart_items && cart.cart_items.length > 0 ? (
              <FlatList
                style={{ flex: 1, width: '100%' }}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
                showsVerticalScrollIndicator={true}
                data={cart.cart_items}
                renderItem={renderCartItem}
                keyExtractor={(item) => item.id.toString()}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Icon name="shopping-cart" size={48} color="#cbd5e1" />
                <Text style={styles.emptyCartText}>Your cart is empty.</Text>
              </View>
            )}
            <View style={styles.cartFooterContainer}>
              <TouchableOpacity
                style={styles.checkoutButton}
                onPress={() => {
                  setIsCartModalVisible(false);
                  navigation.navigate('Checkout', { cart: cart, customerId: customerId });
                }}
              >
                <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
                <Icon name="arrow-right" size={16} color="#ffffff" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    {/* Full Screen Image Viewer Modal */}
      <Modal visible={isImageViewerVisible} transparent={true} onRequestClose={() => setIsImageViewerVisible(false)}>
        <ImageViewer imageUrls={viewerImages} enableSwipeDown={true} onSwipeDown={() => setIsImageViewerVisible(false)} />
      </Modal>

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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
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
  productDescription: {
    fontSize: 14,
    color: '#666',
    margin: 10,
  },
  stockText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 20 : 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 24,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 580 : 420,
    height: Platform.OS === 'web' ? '88vh' : '86%',
    maxHeight: Platform.OS === 'web' ? '88vh' : '86%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.22)',
      },
    }),
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 5,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 5,
  },
  itemDetails: {
    flex: 1,
    marginLeft: 10,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemVariant: {
    fontSize: 14,
    color: '#555',
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#888',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  quantityText: {
    marginHorizontal: 10,
    fontSize: 16,
  },
  emptyCartText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 18,
  },
  swiper: {
    height: 300,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  detailsContainer: {
    padding: 20,
  },
  variantContainer: {
    marginBottom: 20,
  },
  variantName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginRight: 10,
    marginBottom: 10,
  },
  selectedOption: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  productModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    gap: 12,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quantityLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginRight: 6,
    color: '#475569',
  },
  modalAddToCartButton: {
    flex: 1,
    backgroundColor: '#43A047',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#43A047',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  modalAddToCartButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cartFooterContainer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    marginTop: 8,
  },
  checkoutButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  zoomIcon: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 5,
  },
  placeholderImage: {
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPlaceholderBanner: {
    height: 250,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalPlaceholderText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
});

export default TopProductsScreen;
