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
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Swiper from 'react-native-swiper';
import { Video } from 'expo-av';
import ImageViewer from 'react-native-image-zoom-viewer';
import { getActiveProductsWithDetails, addToCart, getCart, updateCartItem, removeCartItem, supabase } from '../services/supabase';
import { getGuestCart, addGuestCartItem } from '../services/localStorageService';

const { width } = Dimensions.get('window');

const CatalogScreen = ({ navigation, route }) => {
  const { customerId: routeCustomerId } = route.params || {};
  const [customerId, setCustomerId] = useState(routeCustomerId);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState(null);
  const [guestCart, setGuestCart] = useState([]);
  const [isCartModalVisible, setIsCartModalVisible] = useState(false);
  const [isProductDetailModalVisible, setIsProductDetailModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [user, setUser] = useState(null);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);

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
          console.error('Error fetching customer ID in CatalogScreen:', customerError.message);
        } else if (customerData) {
          currentCustomerId = customerData.id;
          setCustomerId(customerData.id);
        }
      }
      
      // Now fetch products and cart using the determined customerId
      setLoading(true);
      const data = await getActiveProductsWithDetails(currentCustomerId);
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
    const combinationString = Object.entries(selectedVariants)
      .map(([key, value]) => `${key}:${value}`)
      .join(',');
    return selectedProduct.product_variant_combinations.find(
      (c) => c.combination_string === combinationString
    );
  };

  const handleAddToCart = async () => {
    const combination = getVariantCombination();
    if (!combination) {
      Alert.alert('Please select all variant options.');
      return;
    }

    if (!user) {
      const guestCartItem = {
        product_variant_combination_id: combination.id,
        quantity: quantity,
        product_name: selectedProduct.product_name,
        combination_string: combination.combination_string,
        price: combination.price,
        image_url: selectedProduct.product_media[0]?.media_url || 'https://placehold.co/600x400'
      };
      await addGuestCartItem(guestCartItem);
      Alert.alert('Added to Cart', 'Item has been added to your guest cart.');
      setIsProductDetailModalVisible(false);
      return;
    }

    const result = await addToCart(user.id, combination.id, quantity);
    if (result) {
      const cartData = await getCart(user.id);
      setCart(cartData);
      setIsProductDetailModalVisible(false);
      setIsCartModalVisible(true);
    } else {
      Alert.alert('Error', 'Failed to add item to cart.');
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

  const openProductDetailModal = (product) => {
    setSelectedProduct(product);
    setQuantity(1);
    setIsProductDetailModalVisible(true);
    const imagesForViewer = product.product_media
      .filter(media => media.media_type === 'image')
      .map(media => ({ url: media.media_url }));
    setViewerImages(imagesForViewer);
    if (product.product_variants.length === 1 && product.product_variants[0].variant_options.length === 1) {
      const variantName = product.product_variants[0].name;
      const optionValue = product.product_variants[0].variant_options[0].value;
      setSelectedVariants({ [variantName]: optionValue });
    } else {
      setSelectedVariants({});
    }
  };

  const renderProduct = ({ item }) => (
    <View style={styles.productContainer}>
      <TouchableOpacity onPress={() => openProductDetailModal(item)}>
        <Image
          style={styles.productImage}
          source={{ uri: item.product_media[0]?.media_url || 'https://placehold.co/600x400' }}
        />
        <Text style={styles.productName}>{item.product_name}</Text>
        <Text style={styles.productPrice}>₹{item.amount}</Text>
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
                <Swiper style={styles.swiper} showsButtons={true} removeClippedSubviews={false}>
                  {selectedProduct.product_media.map((media) => (
                    <View key={media.id} style={styles.slide}>
                      {media.media_type === 'image' ? (
                        <View style={styles.mediaContainer}>
                          <Image source={{ uri: media.media_url }} style={styles.media} />
                          <TouchableOpacity
                            style={styles.zoomIcon}
                            onPress={() => setIsImageViewerVisible(true)}
                          >
                            <MaterialIcons name="zoom-out-map" size={24} color="white" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Video
                          source={{ uri: media.media_url }}
                          style={styles.media}
                          useNativeControls
                          resizeMode="contain"
                        />
                      )}
                    </View>
                  ))}
                </Swiper>

                <View style={styles.detailsContainer}>
                  <Text style={styles.productName}>{selectedProduct.product_name}</Text>
                  <Text style={styles.productDescription}>{selectedProduct.description}</Text>
                  
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

                  {getVariantCombination() && (
                    <View style={styles.quantitySelector}>
                      <TouchableOpacity onPress={() => setQuantity(Math.max(1, quantity - 1))}>
                        <Icon name="minus-circle" size={24} color="#555" />
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>{quantity}</Text>
                      <TouchableOpacity onPress={() => setQuantity(quantity + 1)}>
                        <Icon name="plus-circle" size={24} color="#555" />
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  <Button title="Add to Cart" onPress={handleAddToCart} />
                </View>
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
              navigation.navigate('Checkout', { cart: cart, customerId: customerId });
            }} />
          </View>
        </View>
      </Modal>
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
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomIcon: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 5,
  },
  media: {
    width: width - 40, // modal padding is 20 on each side
    height: 300,
    resizeMode: 'contain',
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
  
});

export default CatalogScreen;