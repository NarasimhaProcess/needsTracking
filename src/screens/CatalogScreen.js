import { useFocusEffect } from '@react-navigation/native';
import React, { useState, useCallback, useMemo } from 'react';
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
  Alert,
  ScrollView,
  Dimensions,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import Swiper from 'react-native-swiper';
import ImageViewer from 'react-native-image-zoom-viewer';
import { getActiveProductsWithDetails, addToCart, getCart, updateCartItem, removeCartItem, supabase } from '../services/supabase';
import { getGuestCart } from '../services/localStorageService';

const { width } = Dimensions.get('window');

const CatalogScreen = ({ navigation, route }) => {
  const { userId: sellerId } = route.params || {};
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState(null);
  const [guestCart, setGuestCart] = useState([]);
  const [isCartModalVisible, setIsCartModalVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [updatingCart, setUpdatingCart] = useState(false);
  const [variantSearch, setVariantSearch] = useState({});
  const [isProductModalVisible, setIsProductModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const quantityMap = useMemo(() => {
    const map = {};
    if (cart && cart.cart_items) {
      cart.cart_items.forEach(item => {
        map[item.product_variant_combination_id] = item.quantity;
      });
    }
    return map;
  }, [cart]);

  const productTotalQuantityInCart = useMemo(() => {
    const map = {}; // { productId: total_quantity }
    if (cart && cart.cart_items) {
      cart.cart_items.forEach(cartItem => {
        if (cartItem.product_variant_combinations && cartItem.product_variant_combinations.products) {
          const productId = cartItem.product_variant_combinations.products.id;
          if (productId) {
            if (!map[productId]) {
              map[productId] = 0;
            }
            map[productId] += cartItem.quantity; // Sum the quantity
          }
        }
      });
    }
    return map;
  }, [cart]);

  const cartTotals = useMemo(() => {
    let totalItems = 0;
    let totalPrice = 0;
    if (cart && cart.cart_items) {
      cart.cart_items.forEach(item => {
        totalItems += item.quantity;
        totalPrice += item.quantity * item.product_variant_combinations.price;
      });
    }
    return { totalItems, totalPrice };
  }, [cart]);

  useFocusEffect(
    useCallback(() => {
      const fetchUserAndProducts = async () => {
        setLoading(true);
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setUser(currentUser);

        const userIdToFetch = sellerId || currentUser?.id;
        const data = await getActiveProductsWithDetails(userIdToFetch);
        if (data) {
          setProducts(data);
        }

        if (currentUser) {
          const cartData = await getCart(currentUser.id);
          setCart(cartData);
        } else {
          const guestCartData = await getGuestCart();
          setGuestCart(guestCartData);
        }
        setLoading(false);
      };

      fetchUserAndProducts();
    }, [sellerId])
  );

  const openProductModal = (product) => {
    setSelectedProduct(product);
    setIsProductModalVisible(true);
  };

  const closeProductModal = () => {
    setSelectedProduct(null);
    setIsProductModalVisible(false);
  };

  const handleUpdateCart = async (product, combinationId, currentQuantity, change) => {
    if (updatingCart) return; // Prevent concurrent updates
    if (!user) {
      Alert.alert("Please log in to add items to your cart.");
      return;
    }

    setUpdatingCart(true);
    try {
      const newQuantity = currentQuantity + change;
      const originalCartItem = (cart?.cart_items || []).find(item => item.product_variant_combination_id === combinationId);

      if (newQuantity > 0) {
        if (originalCartItem) {
          await updateCartItem(originalCartItem.id, newQuantity);
        } else {
          await addToCart(user.id, combinationId, newQuantity);
        }
      } else {
        if (originalCartItem) {
          await removeCartItem(originalCartItem.id);
        }
      }
    } catch (error) {
      console.error("Error updating cart:", error);
      Alert.alert("Error", `There was a problem updating your cart: ${error.message}`);
    } finally {
      if (user) {
        const finalCartData = await getCart(user.id);
        setCart(finalCartData);
      }
      setUpdatingCart(false);
    }
  };

  const handleUpdateQuantity = async (cartItemId, quantity) => {
    const updatedItem = await updateCartItem(cartItemId, quantity);
    if (updatedItem) {
      const newCart = { ...cart };
      const itemIndex = newCart.cart_items.findIndex((item) => item.id === cartItemId);
      newCart.cart_items[itemIndex].quantity = quantity;
      setCart(newCart);
    }
  };

  const handleRemoveItem = async (cartItemId) => {
    await removeCartItem(cartItemId);
    const newCart = { ...cart };
    newCart.cart_items = newCart.cart_items.filter((item) => item.id !== cartItemId);
    setCart(newCart);
  };

  const openImageViewer = (product) => {
    const imageUrls = product.product_media
      .filter(m => m.media_type === 'image')
      .map(m => ({ url: m.media_url }));
    
    if (imageUrls.length > 0) {
      setViewerImages(imageUrls);
      setIsImageViewerVisible(true);
    }
  };

  const getPriceDisplay = (product) => {
    if (product.product_variant_combinations && product.product_variant_combinations.length > 1) {
      const prices = product.product_variant_combinations.map(p => p.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      if (minPrice === maxPrice) {
        return `₹${minPrice}`;
      }
      return `₹${minPrice} - ₹${maxPrice}`;
    }
    if (product.product_variant_combinations && product.product_variant_combinations.length === 1) {
      return `₹${product.product_variant_combinations[0].price}`;
    }
    return `₹${product.amount}`;
  };

  const renderProduct = ({ item }) => {
    const totalQuantity = productTotalQuantityInCart[item.id] || 0;
    const buttonText = totalQuantity > 0 
      ? `${totalQuantity} item${totalQuantity > 1 ? 's' : ''} added` 
      : 'Add';

    return (
      <View style={styles.productContainer}>
        <TouchableOpacity onPress={() => openProductModal(item)}>
          <Image style={styles.productImage} source={{ uri: item.product_media[0]?.media_url || 'https://placehold.co/600x400' }} />
        </TouchableOpacity>
        <View style={styles.productDetails}>
          <Text style={styles.productName}>{item.product_name}</Text>
          <Text style={styles.productPrice}>{getPriceDisplay(item)}</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => openProductModal(item)}>
          <Text style={styles.addButtonText}>{buttonText}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <Image
        style={styles.itemImage}
        source={{ uri: item.product_variant_combinations.products.product_media[0]?.media_url || 'https://placehold.co/600x400' }}
      />
      <View style={styles.itemDetails}>
        <Text style={styles.itemName}>{item.product_variant_combinations.products.product_name}</Text>
        <Text style={styles.itemVariant}>{item.product_variant_combinations.combination_string}</Text>
        <Text style={styles.itemPrice}>₹{item.product_variant_combinations.price}</Text>
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0000ff" /></View>;
  }

  return (
    <View style={{flex: 1, backgroundColor: 'white'}}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Catalog</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.container}
        extraData={{ cart }}
      />

      {selectedProduct && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={isProductModalVisible}
          onRequestClose={closeProductModal}
        >
          <View style={styles.modalContainer}>
            <View style={styles.productModalContent}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeProductModal}
              >
                <Icon name="times-circle" size={30} color="#333" />
              </TouchableOpacity>
              
              <View style={styles.swiperContainer}>
                <Swiper showsButtons={false} loop={false}>
                  {selectedProduct.product_media.map((media, index) => (
                    <TouchableOpacity key={index} onPress={() => openImageViewer(selectedProduct)}>
                      <Image source={{ uri: media.media_url }} style={styles.modalProductImage} />
                    </TouchableOpacity>
                  ))}
                </Swiper>
              </View>

              <Text style={styles.modalProductName}>{selectedProduct.product_name}</Text>
              
              <ScrollView>
                {selectedProduct.product_variant_combinations.length > 1 ? (
                  <View style={styles.variantsContainer}>
                    <TextInput
                      style={styles.variantSearchInput}
                      placeholder="Search options..."
                      value={variantSearch[selectedProduct.id] || ''}
                      onChangeText={text => {
                        setVariantSearch(prevState => ({
                          ...prevState,
                          [selectedProduct.id]: text
                        }));
                      }}
                    />
                    {selectedProduct.product_variant_combinations
                      .filter(combo => 
                        combo.combination_string.toLowerCase().includes((variantSearch[selectedProduct.id] || '').toLowerCase())
                      )
                      .map(combo => {
                        const quantity = quantityMap[combo.id] || 0;
                        return (
                          <View key={combo.id} style={styles.variantRow}>
                            <Text style={styles.variantNameText}>{combo.combination_string} - ₹{combo.price}</Text>
                            <View style={styles.quantitySelector}>
                              <TouchableOpacity onPress={() => handleUpdateCart(selectedProduct, combo.id, quantity, -1)} disabled={updatingCart || quantity === 0}>
                                <Icon name="minus-circle" size={32} color={quantity === 0 ? '#ccc' : '#E53935'} style={updatingCart && { opacity: 0.5 }} />
                              </TouchableOpacity>
                              <Text style={styles.quantityText}>{quantity}</Text>
                              <TouchableOpacity onPress={() => handleUpdateCart(selectedProduct, combo.id, quantity, 1)} disabled={updatingCart}>
                                <Icon name="plus-circle" size={32} color="#43A047" style={updatingCart && { opacity: 0.5 }} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                  </View>
                ) : (
                  <View style={styles.variantRow}>
                      <Text style={styles.variantNameText}>{getPriceDisplay(selectedProduct)}</Text>
                      <View style={styles.quantitySelector}>
                          {(() => {
                              const combo = selectedProduct.product_variant_combinations[0];
                              const quantity = quantityMap[combo.id] || 0;
                              return (
                                  <>
                                      <TouchableOpacity onPress={() => handleUpdateCart(selectedProduct, combo.id, quantity, -1)} disabled={updatingCart || quantity === 0}>
                                          <Icon name="minus-circle" size={32} color={quantity === 0 ? '#ccc' : '#E53935'} style={updatingCart && { opacity: 0.5 }} />
                                      </TouchableOpacity>
                                      <Text style={styles.quantityText}>{quantity}</Text>
                                      <TouchableOpacity onPress={() => handleUpdateCart(selectedProduct, combo.id, quantity, 1)} disabled={updatingCart}>
                                          <Icon name="plus-circle" size={32} color="#43A047" style={updatingCart && { opacity: 0.5 }} />
                                      </TouchableOpacity>
                                  </>
                              );
                          })()}
                      </View>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Image Viewer Modal */}
      <Modal visible={isImageViewerVisible} transparent={true} onRequestClose={() => setIsImageViewerVisible(false)}>
        <ImageViewer imageUrls={viewerImages} enableSwipeDown={true} onSwipeDown={() => setIsImageViewerVisible(false)} />
      </Modal>

      {/* Cart Modal */}
      <Modal
        animationType="slide"
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
            {cart && cart.cart_items.length > 0 ? (
              <FlatList
                data={cart.cart_items}
                renderItem={renderCartItem}
                keyExtractor={(item) => item.id.toString()}
              />
            ) : (
              <Text style={styles.emptyCartText}>Your cart is empty.</Text>
            )}
            <Button title="Checkout" onPress={() => {
              setIsCartModalVisible(false);
              navigation.navigate('Checkout', { cart: cart });
            }} />
          </View>
        </View>
      </Modal>
      {cartTotals.totalItems > 0 && (
        <View style={styles.viewCartContainer}>
          <View style={styles.viewCartButton}>
            <Text style={styles.viewCartText}>
              {cartTotals.totalItems} {cartTotals.totalItems > 1 ? 'items' : 'item'} | ₹{cartTotals.totalPrice.toFixed(2)}
            </Text>
            <TouchableOpacity onPress={() => setIsCartModalVisible(true)}>
              <Text style={styles.viewCartText}>View Cart <Icon name="shopping-bag" size={16} /></Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  container: {
    padding: 5,
    paddingBottom: 80, // Add padding to the bottom to avoid overlap with the cart button
  },
  productContainer: {
    flex: 1,
    margin: 5,
    backgroundColor: '#fff',
    borderRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 150,
  },
  productDetails: {
    padding: 10,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    minHeight: 44, // Two lines
  },
  productPrice: {
    fontSize: 14,
    color: '#888',
    marginTop: 5,
  },
  actionsContainer: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  addButton: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
    marginHorizontal: 10,
    marginBottom: 10,
  },
  addButtonText: {
    color: '#43A047',
    fontWeight: 'bold',
    fontSize: 14,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 5,
    paddingVertical: 4,
  },
  quantityText: {
    marginHorizontal: 15,
    fontSize: 18,
    fontWeight: 'bold',
  },
  variantsContainer: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  variantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  variantNameText: {
    fontSize: 16,
    flex: 1,
  },
  variantSearchInput: {
    height: 40,
    borderColor: '#eee',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
  },
  productModalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 15,
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
  emptyCartText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 18,
  },
  media: {
    width: width - 40,
    height: 150,
    resizeMode: 'contain',
  },
  viewCartContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  viewCartButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewCartText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  swiperContainer: {
    height: 250,
    marginBottom: 20,
    borderRadius: 10,
    overflow: 'hidden'
  },
  modalProductImage: {
    width: '100%',
    height: 250,
    resizeMode: 'contain',
  },
  modalProductName: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
});

export default CatalogScreen;