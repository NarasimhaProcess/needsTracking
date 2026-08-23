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
  Alert,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Swiper from 'react-native-swiper';
import { Video } from 'expo-av';
import ImageViewer from 'react-native-image-zoom-viewer';
import { getTopProductsWithDetails, addToCart, getCart, updateCartItem, removeCartItem, supabase } from '../services/supabase';
import { useCart } from '../context/CartContext';

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
      Alert.alert('Error', 'Product information is incomplete.');
      return;
    }

    console.log('handleAddToCart: Before getUser, user state:', user);
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    console.log('handleAddToCart: After getUser, currentUser:', currentUser);

    if (!currentUser) {
      // Redirect to BuyerAuthScreen for mobile number authentication
      navigation.navigate('BuyerAuth', {
        redirectScreen: 'TopProducts',
        productId: selectedProduct.id,
        customerId: customerId,
      });
      return;
    }

    const result = await addToCart(currentUser.id, combination.id, quantity);
    if (result) {
      const cartData = await getCart(currentUser.id);
      setCart(cartData);
      setIsProductDetailModalVisible(false);
      Alert.alert('Success', 'Item added to cart!');
      if (role === 'buyer') {
        navigation.goBack();
      } else {
        setIsCartModalVisible(true);
      }
    } else {
      Alert.alert('Error', 'Failed to add item to cart.');
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

  const renderProduct = ({ item }) => (
    <View style={styles.productContainer}>
      <TouchableOpacity onPress={() => openProductDetailModal(item)} activeOpacity={0.8}>
        <Image
          style={styles.productImage}
          source={{ uri: item.product_media?.[0]?.media_url || 'https://placehold.co/600x400' }}
        />
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
    return <ActivityIndicator size="large" color="#0000ff" />;
  }

  return (
    <View style={{flex: 1}}>
      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.container}
      />

      {/* Product Detail Modal */}
      {selectedProduct && (
        <Modal
          animationType="slide"
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
              <ScrollView>
                <Swiper style={styles.swiper} showsButtons={true}>
                  {selectedProduct.product_media.map((media) => (
                    <View key={media.id} style={styles.slide}>
                      <TouchableOpacity onPress={() => {
                        const imageUrls = selectedProduct.product_media
                          .filter(m => m.media_type === 'image')
                          .map(m => ({ url: m.media_url }));
                        setViewerImages(imageUrls);
                        setIsImageViewerVisible(true);
                      }} style={styles.mediaContainer}>
                        {media.media_type === 'image' ? (
                          <Image source={{ uri: (typeof media.media_url === 'string' && media.media_url.length > 0) ? media.media_url : 'https://placehold.co/600x400' }} style={styles.media} />
                        ) : (
                          <Video
                            source={{ uri: media.media_url }}
                            style={styles.media}
                            useNativeControls
                            resizeMode="contain"
                          />
                        )}
                        {media.media_type === 'image' && (
                          <TouchableOpacity
                            style={styles.zoomIcon}
                            onPress={() => {
                              const imageUrls = selectedProduct.product_media
                                .filter(m => m.media_type === 'image')
                                .map(m => ({ url: m.media_url }));
                              setViewerImages(imageUrls);
                              setIsImageViewerVisible(true);
                            }}
                          >
                            <MaterialIcons name="zoom-out-map" size={24} color="white" />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </Swiper>

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

                  {selectedProduct.product_variants.map((variant) => (
                    <View key={variant.id} style={styles.variantContainer}>
                      <Text style={styles.variantName}>{variant.name}</Text>
                      <View style={styles.optionsContainer}>
                        {variant.variant_options.map((option) => (
                          <TouchableOpacity
                            key={option.id}
                            style={[
                              styles.optionButton,
                              selectedVariants[variant.name] === option.value && styles.selectedOption,
                            ]}
                            onPress={() => handleVariantSelect(variant.name, option.value)}
                          >
                            <Text>{option.value}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}

                  {/* Quantity selector for adding to cart */}
                  <View style={styles.quantitySelector}>
                    <Text style={styles.quantityLabel}>Quantity:</Text>
                    <TouchableOpacity 
                      onPress={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                      style={{ padding: 4 }}
                    >
                      <Icon name="minus-circle" size={30} color={quantity <= 1 ? '#ccc' : '#E53935'} />
                    </TouchableOpacity>
                    <Text style={styles.quantityText}>{quantity}</Text>
                    <TouchableOpacity 
                      onPress={() => setQuantity(quantity + 1)}
                      style={{ padding: 4 }}
                    >
                      <Icon name="plus-circle" size={30} color="#43A047" />
                    </TouchableOpacity>
                  </View>
                  
                  <TouchableOpacity style={styles.modalAddToCartButton} onPress={handleAddToCart}>
                    <Icon name="shopping-cart" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.modalAddToCartButtonText}>Add to Cart</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

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
              navigation.navigate('Checkout', { cart: cart, customerId: customerId });
            }} />
          </View>
        </View>
      </Modal>
    {/* Full Screen Image Viewer Modal */}
      <Modal visible={isImageViewerVisible} transparent={true} onRequestClose={() => setIsImageViewerVisible(false)}>
        <ImageViewer imageUrls={viewerImages} enableSwipeDown={true} onSwipeDown={() => setIsImageViewerVisible(false)} />
      </Modal>
    </View>
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
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardAddButton: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
    marginHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  cardAddButtonText: {
    color: '#2E7D32',
    fontWeight: 'bold',
    fontSize: 14,
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 15,
    color: '#333',
  },
  modalAddToCartButton: {
    backgroundColor: '#43A047',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 15,
    elevation: 2,
  },
  modalAddToCartButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  zoomIcon: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 5,
  },
});

export default TopProductsScreen;
