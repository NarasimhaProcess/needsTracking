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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import Swiper from 'react-native-swiper';
import ImageViewer from 'react-native-image-zoom-viewer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveProductsWithDetails, addToCart, getCart, updateCartItem, removeCartItem, supabase, setSellerProductsActiveStatus } from '../services/supabase';
import { getGuestCart } from '../services/localStorageService';
import { showAlert } from '../utils/alertUtils';
import PreLoginFooter from '../components/PreLoginFooter';
import PortalsMenuModal from '../components/PortalsMenuModal';

const { width } = Dimensions.get('window');

const CATEGORIES = {
  all: 'All Products',
  electronics: 'Electronics',
  clothing: 'Clothing',
  groceries: 'Groceries',
  books: 'Books',
  furniture: 'Furniture',
  toys: 'Toys',
  sports: 'Sports',
};

const getCategoryLabel = (productType) => {
  return CATEGORIES[productType] || productType;
};

const isImageMedia = (media) => {
  if (!media) return false;
  const url = media.media_url || media.uri || '';
  return url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
};

const isVideoMedia = (media) => {
  if (!media) return false;
  const url = media.media_url || media.uri || '';
  return url.match(/\.(mp4|webm|mov|mkv)$/i);
};

const CatalogScreen = ({ navigation, route }) => {
  const { userId: sellerId, customerId } = route?.params || {};
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
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
  const [selectedVariants, setSelectedVariants] = useState({});
  const [selectedVariantFilter, setSelectedVariantFilter] = useState(null);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const getProductCombinations = useCallback((product) => {
    if (!product) return [];
    const rawCombos = product.product_variant_combinations || [];
    if (rawCombos.length > 0) {
      const hasActiveVariants = (product.product_variants || []).some(
        v => (v.name || '').trim() && (v.variant_options || []).length > 0
      );
      if (!hasActiveVariants) {
        return [{
          ...rawCombos[0],
          combination_string: 'Default',
          price: rawCombos[0].price || product.amount || 0,
          quantity: rawCombos[0].quantity !== undefined ? rawCombos[0].quantity : 100,
        }];
      }

      const seen = new Set();
      const uniqueCombos = [];
      for (const c of rawCombos) {
        const key = (c.combination_string || '').trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueCombos.push(c);
        }
      }
      return uniqueCombos.length > 0 ? uniqueCombos : rawCombos;
    }
    return [{
      id: product.id,
      product_id: product.id,
      combination_string: 'Default',
      price: product.amount || 0,
      quantity: 100,
      sku: '',
    }];
  }, []);

  const quantityMap = useMemo(() => {
    const map = {};
    const items = user ? cart?.cart_items : guestCart;
    if (items && Array.isArray(items)) {
      items.forEach(item => {
        const comboId = user 
          ? (item?.product_variant_combinations?.id || item?.product_variant_combination_id)
          : (item?.product_variant_combination_id || item?.product_variant_combinations?.id || item?.id);
        const qty = item?.quantity || 0;
        if (comboId) {
          map[comboId] = (map[comboId] || 0) + qty;
        }
      });
    }
    return map;
  }, [cart, guestCart, user]);

  const productTotalQuantityInCart = useMemo(() => {
    const map = {};
    const items = user ? cart?.cart_items : guestCart;
    if (items && Array.isArray(items)) {
      items.forEach(item => {
        const pid = item?.product_id;
        const qty = item?.quantity || 0;
        if (pid) {
          map[pid] = (map[pid] || 0) + qty;
        }
      });
    }
    return map;
  }, [cart, guestCart, user]);

  useFocusEffect(
    useCallback(() => {
      const initScreen = async () => {
        try {
          setLoading(true);
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          setUser(currentUser || null);

          const fetchedProducts = await getActiveProductsWithDetails(sellerId);
          setProducts(fetchedProducts || []);

          if (currentUser) {
            const fetchedCart = await getCart(currentUser.id);
            setCart(fetchedCart);
          } else {
            const localCart = await getGuestCart();
            setGuestCart(localCart || []);
          }
        } catch (err) {
          console.error('Error initializing catalog:', err);
        } finally {
          setLoading(false);
        }
      };
      initScreen();
    }, [sellerId])
  );

  const openProductModal = (product) => {
    setSelectedProduct(product);
    setSelectedVariants({});
    setSelectedVariantFilter(null);
    setVariantSearch({});
    setIsProductModalVisible(true);
  };

  const closeProductModal = () => {
    setIsProductModalVisible(false);
    setTimeout(() => {
      setSelectedProduct(null);
      setSelectedVariants({});
      setSelectedVariantFilter(null);
      setVariantSearch({});
    }, 300);
  };

  const openImageViewer = (product) => {
    const images = (product?.product_media || [])
      .filter(m => isImageMedia(m))
      .map(m => ({ url: m.media_url || m.uri }));
    if (images.length > 0) {
      setViewerImages(images);
      setIsImageViewerVisible(true);
    }
  };

  const handleAddToCart = async (combination, quantity) => {
    if (!quantity || quantity < 1) {
      showAlert('Invalid Quantity', 'Please select a valid quantity.');
      return;
    }

    setUpdatingCart(true);
    try {
      if (user) {
        await addToCart(user.id, selectedProduct.id, combination.id, quantity);
        const updatedCart = await getCart(user.id);
        setCart(updatedCart);
      } else {
        const existingIndex = guestCart.findIndex(
          item => item?.product_variant_combination_id === combination.id || item?.id === combination.id
        );
        if (existingIndex > -1) {
          guestCart[existingIndex].quantity += quantity;
        } else {
          guestCart.push({
            product_id: selectedProduct.id,
            product_variant_combination_id: combination.id,
            product_name: selectedProduct.product_name,
            quantity: quantity,
            price: combination.price,
            combination_string: combination.combination_string,
            image_url: selectedProduct.image_url || (selectedProduct?.product_media?.[0]?.media_url),
          });
        }
        await AsyncStorage.setItem('guestCart', JSON.stringify(guestCart));
        setGuestCart([...guestCart]);
      }
      showAlert('Added to Cart', `${selectedProduct.product_name} added successfully!`);
      closeProductModal();
    } catch (error) {
      console.error('Error adding to cart:', error);
      showAlert('Error', 'Failed to add item to cart.');
    } finally {
      setUpdatingCart(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = (product.product_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || product.product_type === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const cartItems = user ? (cart?.cart_items || []) : guestCart;
  const cartTotals = useMemo(() => {
    const totalItems = cartItems.reduce((sum, item) => sum + (item?.quantity || 0), 0);
    const totalPrice = cartItems.reduce((sum, item) => {
      const price = item?.price || 0;
      const quantity = item?.quantity || 0;
      return sum + (price * quantity);
    }, 0);
    return { totalItems, totalPrice };
  }, [cartItems]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const renderProduct = ({ item }) => {
    const firstMedia = item?.product_media?.[0];
    const imageUrl = firstMedia ? (firstMedia.media_url || firstMedia.uri) : (item.image_url || null);
    const totalQty = productTotalQuantityInCart[item.id] || 0;

    return (
      <View style={styles.productContainer}>
        <TouchableOpacity onPress={() => openProductModal(item)} activeOpacity={0.8}>
          {imageUrl ? (
            <Image 
              style={styles.productImage} 
              source={{ uri: imageUrl }} 
              resizeMode="cover"
            />
          ) : (
            <View style={styles.productImagePlaceholder}>
              <Icon name="shopping-bag" size={32} color="#94a3b8" />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.productDetails}>
          {item.product_type ? (
            <View style={styles.cardCategoryTag}>
              <Text style={styles.cardCategoryTagText}>{getCategoryLabel(item.product_type)}</Text>
            </View>
          ) : null}
          <TouchableOpacity onPress={() => openProductModal(item)}>
            <Text style={styles.productName} numberOfLines={2}>{item.product_name || ''}</Text>
          </TouchableOpacity>
          <Text style={styles.productPrice}>₹{(item.amount || 0).toFixed(2)}</Text>
          {item.stock > 0 ? (
            <Text style={styles.stockText}>In Stock</Text>
          ) : (
            <Text style={[styles.stockText, { color: '#C62828' }]}>Out of Stock</Text>
          )}
          <TouchableOpacity 
            style={[styles.addButton, totalQty > 0 && styles.addButtonActive]}
            onPress={() => openProductModal(item)}
          >
            <Icon name={totalQty > 0 ? 'check' : 'plus'} size={14} color={totalQty > 0 ? '#1B5E20' : '#388E3C'} />
            <Text style={[styles.addButtonText, totalQty > 0 && styles.addButtonActiveText]}>
              {totalQty > 0 ? `${totalQty} in cart` : 'Add to Cart'}
            </Text>
            {totalQty > 0 && (
              <View style={styles.cardQtyBadge}>
                <Text style={styles.cardQtyText}>{totalQty}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, width: '100%', height: '100%', backgroundColor: 'white' }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ marginRight: 12 }}
            onPress={() => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
              });
            }}
          >
            <Icon name="home" size={22} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Store Directory</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ marginRight: 14, padding: 4 }}
            onPress={() => setIsMenuVisible(true)}
            accessibilityLabel="Portals Menu"
          >
            <Icon name="ellipsis-h" size={20} color="#1E293B" />
          </TouchableOpacity>

          {user && (
            <TouchableOpacity
              style={{ position: 'relative' }}
              onPress={() => setIsCartModalVisible(true)}
            >
              <Icon name="shopping-bag" size={24} color="#007AFF" />
              {cartTotals.totalItems > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartTotals.totalItems}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Search & Filter */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Category Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryContainer}>
          {Object.entries(CATEGORIES).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.categoryButton, selectedCategory === key && styles.categoryButtonActive]}
              onPress={() => setSelectedCategory(key)}
            >
              <Text style={[styles.categoryButtonText, selectedCategory === key && styles.categoryButtonTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Product Grid */}
        {filteredProducts.length > 0 ? (
          <FlatList
            data={filteredProducts}
            renderItem={renderProduct}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            columnWrapperStyle={styles.columnWrapper}
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.center}>
            <Icon name="search" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        )}

        {/* Cart Summary Bar */}
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
      </KeyboardAvoidingView>

      {/* PRODUCT DETAIL MODAL - PORTAL STYLE */}
      {selectedProduct && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={isProductModalVisible}
          onRequestClose={closeProductModal}
        >
          <View style={styles.centeredView}>
            <View style={styles.portalModalCard}>
              {/* Header */}
              <View style={styles.portalModalHeader}>
                <Text style={styles.portalModalTitle} numberOfLines={2}>
                  {selectedProduct.product_name}
                </Text>
                <TouchableOpacity
                  style={styles.closeButtonCircle}
                  onPress={closeProductModal}
                >
                  <Icon name="times" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Content - Scrollable */}
              <ScrollView
                style={styles.portalModalContent}
                contentContainerStyle={styles.portalScrollContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {/* Product Images */}
                <View style={styles.swiperContainer}>
                  {selectedProduct?.product_media && selectedProduct.product_media.length > 0 && selectedProduct.product_media.some(m => isImageMedia(m) && (m?.media_url || m?.uri)) ? (
                    Platform.OS === 'web' ? (
                      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={true} style={{ width: '100%', height: 200 }}>
                        {selectedProduct.product_media
                          .filter(m => isImageMedia(m) && (m?.media_url || m?.uri))
                          .map((media, index) => (
                            <TouchableOpacity key={index} onPress={() => openImageViewer(selectedProduct)} activeOpacity={0.9} style={{ width: width * 0.8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                              <Image source={{ uri: media.media_url || media.uri }} style={styles.modalProductImage} resizeMode="contain" />
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    ) : (
                      <Swiper showsButtons={false} loop={false}>
                        {selectedProduct.product_media
                          .filter(m => isImageMedia(m) && (m?.media_url || m?.uri))
                          .map((media, index) => (
                            <TouchableOpacity key={index} onPress={() => openImageViewer(selectedProduct)} activeOpacity={0.9}>
                              <Image source={{ uri: media.media_url || media.uri }} style={styles.modalProductImage} resizeMode="contain" />
                            </TouchableOpacity>
                          ))}
                      </Swiper>
                    )
                  ) : (
                    <View style={styles.modalProductImagePlaceholder}>
                      <Icon name="shopping-bag" size={48} color="#94a3b8" />
                      <Text style={styles.modalPlaceholderText}>{selectedProduct?.product_name || 'Product'}</Text>
                    </View>
                  )}
                </View>

                {/* Product Info */}
                <Text style={styles.productDetailPrice}>₹{(selectedProduct.amount || 0).toFixed(2)}</Text>
                <Text style={styles.productDetailDescription}>
                  {selectedProduct.description || 'No description available'}
                </Text>

                {/* Variants */}
                {getProductCombinations(selectedProduct).length > 1 && (
                  <View style={styles.variantsContainer}>
                    <Text style={styles.variantSectionTitle}>Select Variant</Text>
                    <FlatList
                      data={getProductCombinations(selectedProduct)}
                      keyExtractor={(item) => item.id?.toString() || item.combination_string}
                      renderItem={({ item: combo }) => (
                        <TouchableOpacity
                          style={[styles.variantOption, selectedVariantFilter?.id === combo.id && styles.variantOptionSelected]}
                          onPress={() => setSelectedVariantFilter(combo)}
                        >
                          <View>
                            <Text style={styles.variantOptionText}>{combo.combination_string}</Text>
                            <Text style={styles.variantOptionPrice}>₹{(combo.price || 0).toFixed(2)}</Text>
                          </View>
                          {selectedVariantFilter?.id === combo.id && (
                            <Icon name="check-circle" size={20} color="#10B981" />
                          )}
                        </TouchableOpacity>
                      )}
                      scrollEnabled={false}
                    />
                  </View>
                )}
              </ScrollView>

              {/* Footer - Add to Cart */}
              <View style={styles.portalModalFooter}>
                <TouchableOpacity
                  style={[styles.footerButton, styles.cancelButton]}
                  onPress={closeProductModal}
                  disabled={updatingCart}
                >
                  <Text style={styles.cancelButtonText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.footerButton, styles.submitButton]}
                  onPress={() => handleAddToCart(selectedVariantFilter || getProductCombinations(selectedProduct)[0], 1)}
                  disabled={updatingCart}
                >
                  {updatingCart ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Add to Cart</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* CART MODAL - PORTAL STYLE */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isCartModalVisible}
        onRequestClose={() => setIsCartModalVisible(!isCartModalVisible)}
      >
        <View style={styles.centeredView}>
          <View style={styles.portalModalCard}>
            {/* Header */}
            <View style={styles.portalModalHeader}>
              <Text style={styles.portalModalTitle}>Shopping Cart</Text>
              <TouchableOpacity
                style={styles.closeButtonCircle}
                onPress={() => setIsCartModalVisible(false)}
              >
                <Icon name="times" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Content - Scrollable */}
            <ScrollView
              style={styles.portalModalContent}
              contentContainerStyle={styles.portalScrollContent}
              showsVerticalScrollIndicator={true}
            >
              {cartItems && cartItems.length > 0 ? (
                <FlatList
                  data={cartItems}
                  keyExtractor={(item, idx) => idx.toString()}
                  renderItem={({ item }) => (
                    <View style={styles.cartItem}>
                      <Image
                        source={{ uri: item.image_url || item?.product_media?.[0]?.media_url || 'https://via.placeholder.com/80' }}
                        style={styles.cartItemImage}
                      />
                      <View style={styles.cartItemDetails}>
                        <Text style={styles.cartItemName}>{item.product_name}</Text>
                        <Text style={styles.cartItemVariant}>{item.combination_string || 'Default'}</Text>
                        <Text style={styles.cartItemPrice}>₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</Text>
                      </View>
                      <View style={styles.cartItemQty}>
                        <Text style={styles.cartItemQtyText}>Qty: {item.quantity}</Text>
                      </View>
                    </View>
                  )}
                  scrollEnabled={false}
                />
              ) : (
                <View style={styles.emptyCart}>
                  <Icon name="shopping-cart" size={48} color="#ccc" />
                  <Text style={styles.emptyCartText}>Your cart is empty</Text>
                </View>
              )}
            </ScrollView>

            {/* Footer - Checkout */}
            {cartItems.length > 0 && (
              <View style={styles.portalModalFooter}>
                <View style={styles.cartTotal}>
                  <Text style={styles.cartTotalLabel}>Total:</Text>
                  <Text style={styles.cartTotalPrice}>₹{cartTotals.totalPrice.toFixed(2)}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.footerButton, styles.submitButton]}
                  onPress={() => {
                    setIsCartModalVisible(false);
                    navigation.navigate('Checkout', { cartItems });
                  }}
                >
                  <Text style={styles.submitButtonText}>Proceed to Checkout</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Full Screen Image Viewer Modal */}
      <Modal visible={isImageViewerVisible} transparent={true} onRequestClose={() => setIsImageViewerVisible(false)}>
        <ImageViewer imageUrls={viewerImages} enableSwipeDown={true} onSwipeDown={() => setIsImageViewerVisible(false)} />
      </Modal>

      {/* Portals Menu Modal */}
      <PortalsMenuModal
        visible={isMenuVisible}
        onClose={() => setIsMenuVisible(false)}
        navigation={navigation}
      />
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
    paddingBottom: 80,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 5,
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
    backgroundColor: '#f8fafc',
  },
  productImagePlaceholder: {
    width: '100%',
    height: 150,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productDetails: {
    padding: 10,
  },
  cardCategoryTag: {
    backgroundColor: '#EBF5FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  cardCategoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0EA5E9',
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    minHeight: 32,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16a34a',
    marginTop: 6,
  },
  stockText: {
    fontSize: 12,
    color: '#388E3C',
    marginTop: 2,
  },
  addButton: {
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    gap: 4,
  },
  addButtonActive: {
    backgroundColor: '#C8E6C9',
    borderColor: '#81C784',
  },
  addButtonText: {
    fontSize: 12,
    color: '#388E3C',
    fontWeight: '600',
  },
  addButtonActiveText: {
    fontWeight: '700',
  },
  cardQtyBadge: {
    backgroundColor: '#43A047',
    width: 20,
    height: 20,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  cardQtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  searchContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#f8fafc',
  },
  categoryContainer: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginHorizontal: 4,
    backgroundColor: '#f1f5f9',
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  cartBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF5252',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    marginTop: 10,
  },
  viewCartContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    padding: 10,
  },
  viewCartButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewCartText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  /* ====== PORTAL-STYLE MODAL STYLES ====== */
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    padding: Platform.OS === 'web' ? 20 : 16,
  },
  portalModalCard: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 540 : '90%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
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
  portalModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  portalModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    marginRight: 10,
  },
  closeButtonCircle: {
    padding: 6,
  },
  portalModalContent: {
    flex: 1,
    width: '100%',
  },
  portalScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  portalModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    flexShrink: 0,
    gap: 10,
    alignItems: 'center',
  },
  footerButton: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  cancelButton: {
    backgroundColor: '#E2E8F0',
  },
  cancelButtonText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
  submitButton: {
    backgroundColor: '#10B981',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  swiperContainer: {
    height: 200,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden'
  },
  modalProductImage: {
    width: '100%',
    height: 200,
    resizeMode: 'contain',
  },
  modalProductImagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  modalPlaceholderText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
    fontWeight: '600',
  },
  productDetailPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16a34a',
    marginBottom: 8,
  },
  productDetailDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 12,
  },
  variantsContainer: {
    marginTop: 12,
  },
  variantSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  variantOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: '#f8fafc',
  },
  variantOptionSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  variantOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  variantOptionPrice: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  cartItem: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 10,
  },
  cartItemImage: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  cartItemDetails: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  cartItemVariant: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  cartItemPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
    marginTop: 2,
  },
  cartItemQty: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  cartItemQtyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyCartText: {
    fontSize: 14,
    color: '#888',
    marginTop: 10,
  },
  cartTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  cartTotalPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16a34a',
  },
});

export default CatalogScreen;
