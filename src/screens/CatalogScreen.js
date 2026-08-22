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
import { getActiveProductsWithDetails, addToCart, getCart, updateCartItem, removeCartItem, supabase } from '../services/supabase';
import { getGuestCart } from '../services/localStorageService';

const { width } = Dimensions.get('window');

const CatalogScreen = ({ navigation, route }) => {
  const { userId: sellerId, customerId } = route?.params || {};
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
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

  const getProductCombinations = useCallback((product) => {
    if (!product) return [];
    if (product.product_variant_combinations && product.product_variant_combinations.length > 0) {
      return product.product_variant_combinations;
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
        const comboId = user ? item?.product_variant_combinations?.id : item?.product_variant_combination_id;
        const prodId = 
          item?.product_variant_combinations?.products?.id || 
          item?.product_variant_combinations?.product_id ||
          item?.product_id;
        const qty = item?.quantity || 0;
        if (comboId) {
          map[comboId] = (map[comboId] || 0) + qty;
        }
        if (prodId) {
          map[prodId] = (map[prodId] || 0) + qty;
        }
        if (item?.id) {
          map[item.id] = (map[item.id] || 0) + qty;
        }
      });
    }
    return map;
  }, [cart, guestCart, user]);

  const productTotalQuantityInCart = useMemo(() => {
    const map = {}; // { productId: total_quantity }
    const items = user ? cart?.cart_items : guestCart;
    if (items && Array.isArray(items)) {
      items.forEach(cartItem => {
        const productId = 
          cartItem?.product_variant_combinations?.products?.id || 
          cartItem?.product_variant_combinations?.product_id ||
          cartItem?.product_id;
        if (productId) {
          if (!map[productId]) {
            map[productId] = 0;
          }
          map[productId] += cartItem.quantity || 0;
        }
      });
    }
    return map;
  }, [cart, guestCart, user]);
  
  const productTotalPriceInCart = useMemo(() => {
    const map = {}; // { productId: total_price }
    const items = user ? cart?.cart_items : guestCart;
    if (items && Array.isArray(items)) {
      items.forEach(cartItem => {
        const productId = 
          cartItem?.product_variant_combinations?.products?.id || 
          cartItem?.product_variant_combinations?.product_id ||
          cartItem?.product_id;
        const price = cartItem?.product_variant_combinations?.price || cartItem?.price || 0;
        const quantity = cartItem?.quantity || 0;
        
        if (productId) {
          if (!map[productId]) {
            map[productId] = 0;
          }
          map[productId] += quantity * price;
        }
      });
    }
    return map;
  }, [cart, guestCart, user]);

  const cartTotals = useMemo(() => {
    let totalItems = 0;
    let totalPrice = 0;
    const items = user ? cart?.cart_items : guestCart;
    if (items && Array.isArray(items)) {
      items.forEach(item => {
        const qty = item?.quantity || 0;
        const price = item?.product_variant_combinations?.price || item?.price || 0;
        totalItems += qty;
        totalPrice += qty * price;
      });
    }
    return { totalItems, totalPrice };
  }, [cart, guestCart, user]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase().trim();
    return products.filter((product) => {
      const nameMatch = (product?.product_name || '').toLowerCase().includes(query);
      const descMatch = (product?.description || '').toLowerCase().includes(query);
      const typeMatch = (product?.product_type || '').toLowerCase().includes(query);
      const variantMatch = (product?.product_variant_combinations || []).some(
        combo => (combo?.combination_string || '').toLowerCase().includes(query) ||
                 (combo?.sku || '').toLowerCase().includes(query)
      );
      return nameMatch || descMatch || typeMatch || variantMatch;
    });
  }, [products, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      const fetchUserAndProducts = async () => {
        setLoading(true);
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setUser(currentUser);

        // Determine target seller:
        // 1. Explicit sellerId or customerId passed via navigation
        // 2. Logged-in user's own products
        const targetSellerId = sellerId || customerId || (currentUser ? currentUser.id : null);

        let data = [];
        if (targetSellerId) {
          // Strictly fetch ONLY this seller's products (do not fallback to all products if 0 items)
          data = await getActiveProductsWithDetails(targetSellerId);
        } else {
          // Only for unauthenticated general browse
          data = await getActiveProductsWithDetails();
        }

        setProducts(data || []);

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
    }, [sellerId, customerId])
  );

  const openProductModal = (product) => {
    setSelectedProduct(product);
    setIsProductModalVisible(true);
  };

  const closeProductModal = () => {
    setSelectedProduct(null);
    setIsProductModalVisible(false);
  };

  const handleUpdateCart = async (product, combinationId, change) => {
    if (updatingCart) return;
    setUpdatingCart(true);

    const combos = getProductCombinations(product);
    const combination = combos.find(c => c.id === combinationId) || combos[0];
    const targetCombinationId = combination?.id || combinationId || product.id;

    // --- Get fresh data ---
    let freshCart;
    let freshGuestCart;
    let freshUser;
    try {
        const { data: { user } } = await supabase.auth.getUser();
        freshUser = user;
        if (user) {
            freshCart = await getCart(user.id);
        } else {
            freshGuestCart = await getGuestCart();
        }
    } catch(e) {
        console.error("Error fetching fresh cart data:", e);
        setUpdatingCart(false);
        return;
    }
    
    const items = freshUser ? freshCart?.cart_items : freshGuestCart;
    const localQuantityMap = {};
    if (items) {
      items.forEach(item => {
        const comboId = freshUser ? item.product_variant_combinations?.id : item.product_variant_combination_id;
        const prodId = 
          item.product_variant_combinations?.products?.id || 
          item.product_variant_combinations?.product_id || 
          item.product_id;
        const qty = item.quantity || 0;
        if (comboId) localQuantityMap[comboId] = (localQuantityMap[comboId] || 0) + qty;
        if (prodId) localQuantityMap[prodId] = (localQuantityMap[prodId] || 0) + qty;
        if (item.id) localQuantityMap[item.id] = (localQuantityMap[item.id] || 0) + qty;
      });
    }
    // --- End get fresh data ---

    const currentQuantity = localQuantityMap[targetCombinationId] || localQuantityMap[product.id] || 0;
    const newQuantity = currentQuantity + change;

    if (newQuantity < 0) {
        setUpdatingCart(false);
        return;
    }

    const stock = combination.quantity !== undefined && combination.quantity !== null ? combination.quantity : 100; 

    if (change > 0 && stock > 0 && currentQuantity >= stock) {
        Alert.alert("Stock Limit", `Sorry, you can only add up to ${stock} items.`);
        setUpdatingCart(false);
        return;
    }

    if (freshUser) {
        try {
            const originalCartItem = (freshCart?.cart_items || []).find(item => 
              (item.product_variant_combinations?.id === targetCombinationId) ||
              (item.product_variant_combination_id === targetCombinationId) ||
              (item.product_variant_combinations?.product_id === product.id) ||
              (item.product_variant_combinations?.products?.id === product.id)
            );
            if (newQuantity > 0) {
                if (originalCartItem) {
                    await updateCartItem(originalCartItem.id, newQuantity);
                } else {
                    await addToCart(freshUser.id, targetCombinationId, newQuantity);
                }
            } else {
                if (originalCartItem) {
                    await removeCartItem(originalCartItem.id);
                }
            }
            const finalCartData = await getCart(freshUser.id);
            setCart(finalCartData);
        } catch (error) {
            console.error("Error updating cart:", error);
            Alert.alert("Error", `There was a problem updating your cart: ${error.message}`);
        } finally {
            setUpdatingCart(false);
        }
    } else {
        // Guest user logic
        const optimisticGuestCart = JSON.parse(JSON.stringify(freshGuestCart || []));
        const itemIndex = optimisticGuestCart.findIndex(item => 
          item.product_variant_combination_id === targetCombinationId ||
          item.id === targetCombinationId ||
          item.product_variant_combinations?.id === targetCombinationId ||
          item.product_variant_combinations?.products?.id === product.id
        );

        if (newQuantity > 0) {
            if (itemIndex > -1) {
                optimisticGuestCart[itemIndex].quantity = newQuantity;
            } else {
                optimisticGuestCart.push({
                    id: targetCombinationId,
                    product_variant_combination_id: targetCombinationId,
                    quantity: newQuantity,
                    price: combination.price || product.amount || 0,
                    product_name: product.product_name,
                    product_variant_combinations: { 
                      ...combination, 
                      products: { 
                        id: product.id, 
                        product_name: product.product_name, 
                        product_media: product.product_media 
                      } 
                    }
                });
            }
        } else {
            if (itemIndex > -1) {
                optimisticGuestCart.splice(itemIndex, 1);
            }
        }
        setGuestCart(optimisticGuestCart);
        try {
            await AsyncStorage.setItem('guest_cart', JSON.stringify(optimisticGuestCart));
        } catch (error) {
            console.error("Error updating guest cart:", error);
            Alert.alert("Error", "There was a problem updating your cart.");
            setGuestCart(freshGuestCart); // set back to original fresh state on error
        } finally {
            setUpdatingCart(false);
        }
    }
  };

  const handleUpdateQuantity = async (cartItemId, newQuantity) => {
    if (updatingCart) return;

    const items = user ? cart?.cart_items : guestCart;
    const itemToUpdate = items.find(item => (user ? item.id : item.product_variant_combination_id) === cartItemId);

    if (!itemToUpdate) return;
    
    const stock = itemToUpdate.product_variant_combinations?.quantity || 100;
    if (newQuantity > stock) {
        Alert.alert("Stock Limit", `Sorry, you can only have up to ${stock} items in your cart.`);
        return;
    }
    
    if (newQuantity < 1) {
      handleRemoveItem(cartItemId);
      return;
    }

    setUpdatingCart(true);

    if (user) {
        try {
            await updateCartItem(cartItemId, newQuantity);
            const finalCartData = await getCart(user.id);
            setCart(finalCartData);
        } catch (error) {
            console.error("Error updating cart quantity:", error);
            Alert.alert("Error", "Could not update item quantity.");
        } finally {
            setUpdatingCart(false);
        }
    } else {
        const optimisticGuestCart = JSON.parse(JSON.stringify(guestCart));
        const itemIndex = optimisticGuestCart.findIndex(item => item.product_variant_combination_id === cartItemId);
        if (itemIndex === -1) {
            setUpdatingCart(false);
            return;
        }
        optimisticGuestCart[itemIndex].quantity = newQuantity;
        setGuestCart(optimisticGuestCart);
        try {
            await AsyncStorage.setItem('guest_cart', JSON.stringify(optimisticGuestCart));
        } catch (error) {
            console.error("Error updating guest cart quantity:", error);
            Alert.alert("Error", "Could not update item quantity.");
            setGuestCart(guestCart);
        } finally {
            setUpdatingCart(false);
        }
    }
  };

  const handleRemoveItem = async (cartItemId) => {
    if (updatingCart) return;
    setUpdatingCart(true);

    if (user) {
        try {
            await removeCartItem(cartItemId);
            const finalCartData = await getCart(user.id);
            setCart(finalCartData);
        } catch (error) {
            console.error("Error removing item:", error);
            Alert.alert("Error", "Could not remove item from cart.");
        } finally {
            setUpdatingCart(false);
        }
    } else {
        const optimisticGuestCart = guestCart.filter(item => item.product_variant_combination_id !== cartItemId);
        setGuestCart(optimisticGuestCart);
        try {
            await AsyncStorage.setItem('guest_cart', JSON.stringify(optimisticGuestCart));
        } catch (error) {
            console.error("Error removing guest item:", error);
            Alert.alert("Error", "Could not remove item from cart.");
            setGuestCart(guestCart);
        } finally {
            setUpdatingCart(false);
        }
    }
  };

  const openImageViewer = (product) => {
    const imageUrls = (product?.product_media || [])
      .filter(m => m.media_type === 'image' || !m.media_type)
      .map(m => ({ url: m.media_url }));
    
    if (imageUrls.length > 0) {
      setViewerImages(imageUrls);
      setIsImageViewerVisible(true);
    }
  };

  const getPriceDisplay = (product) => {
    if (!product) return '₹0';
    const combos = getProductCombinations(product);
    if (combos && combos.length > 1) {
      const prices = combos.map(p => p?.price || 0);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      if (minPrice === maxPrice) {
        return `₹${minPrice}`;
      }
      return `₹${minPrice} - ₹${maxPrice}`;
    }
    if (combos && combos.length === 1) {
      return `₹${combos[0]?.price || 0}`;
    }
    return `₹${product.amount || 0}`;
  };

  const renderProduct = ({ item }) => {
    if (!item) return null;
    const combos = getProductCombinations(item);
    const isMultiVariant = combos.length > 1;
    const singleCombo = combos[0];
    const singleComboId = singleCombo?.id;
    const singleComboQty = quantityMap[singleComboId] || 0;
    const totalQuantity = productTotalQuantityInCart[item.id] || singleComboQty || 0;
    const totalStock = combos.reduce((sum, combo) => sum + (combo?.quantity || 0), 0);

    return (
      <View style={styles.productContainer}>
        <TouchableOpacity onPress={() => openProductModal(item)} activeOpacity={0.8}>
          <Image style={styles.productImage} source={{ uri: item.product_media?.[0]?.media_url || 'https://placehold.co/600x400' }} />
        </TouchableOpacity>
        <View style={styles.productDetails}>
          <TouchableOpacity onPress={() => openProductModal(item)}>
            <Text style={styles.productName} numberOfLines={2}>{item.product_name || ''}</Text>
          </TouchableOpacity>
          <Text style={styles.productPrice}>{getPriceDisplay(item)}</Text>
          <Text style={styles.stockText}>In Stock: {totalStock}</Text>
        </View>

        {isMultiVariant ? (
          <TouchableOpacity 
            style={[styles.addButton, totalQuantity > 0 && styles.addButtonActive]} 
            onPress={() => openProductModal(item)}
          >
            <Text style={[styles.addButtonText, totalQuantity > 0 && styles.addButtonTextActive]}>
              {totalQuantity > 0 ? `Qty: ${totalQuantity} (Options)` : '+ ADD (Options)'}
            </Text>
          </TouchableOpacity>
        ) : (
          totalQuantity > 0 ? (
            <View style={styles.cardQuantityContainer}>
              <TouchableOpacity 
                style={styles.cardQtyBtnMinus}
                onPress={() => handleUpdateCart(item, singleComboId, -1)} 
                disabled={updatingCart}
              >
                <Icon name="minus" size={14} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.cardQtyText}>{totalQuantity}</Text>
              <TouchableOpacity 
                style={styles.cardQtyBtnPlus}
                onPress={() => handleUpdateCart(item, singleComboId, 1)} 
                disabled={updatingCart}
              >
                <Icon name="plus" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.addButton} 
              onPress={() => handleUpdateCart(item, singleComboId, 1)}
              disabled={updatingCart}
            >
              <Icon name="plus" size={12} color="#2E7D32" style={{ marginRight: 6 }} />
              <Text style={styles.addButtonText}>ADD</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    );
  };

  const renderCartItem = ({ item }) => {
    if (!item) return null;
    const cartItemId = user ? item.id : item.product_variant_combination_id;
    const combo = item.product_variant_combinations;
    const prod = combo?.products;
    const mediaUrl = prod?.product_media?.[0]?.media_url || 'https://placehold.co/600x400';
    return (
        <View style={styles.itemContainer}>
        <Image
            style={styles.itemImage}
            source={{ uri: mediaUrl }}
        />
        <View style={styles.itemDetails}>
            <Text style={styles.itemName}>{prod?.product_name || 'Product'}</Text>
            <Text style={styles.itemVariant}>{combo?.combination_string || ''}</Text>
            <Text style={styles.itemPrice}>₹{combo?.price || 0}</Text>
            <View style={styles.quantityContainer}>
            <TouchableOpacity onPress={() => handleUpdateQuantity(cartItemId, item.quantity - 1)} disabled={updatingCart}>
                <Icon name="minus-circle" size={24} color="#E53935" />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{item.quantity}</Text>
            <TouchableOpacity onPress={() => handleUpdateQuantity(cartItemId, item.quantity + 1)} disabled={updatingCart}>
                <Icon name="plus-circle" size={24} color="#43A047" />
            </TouchableOpacity>
            </View>
        </View>
        <TouchableOpacity onPress={() => handleRemoveItem(cartItemId)} disabled={updatingCart} style={{ padding: 10 }}>
            <Icon name="trash" size={22} color="#E53935" />
        </TouchableOpacity>
        </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  const cartItems = user ? cart?.cart_items : guestCart;

  return (
    <View style={{flex: 1, backgroundColor: 'white'}}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Catalog</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={filteredProducts}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: cartTotals.totalItems > 0 ? 155 : 95 }
        ]}
        extraData={{ cart, guestCart, updatingCart, searchQuery }}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptySearchContainer}>
              <Icon name="search" size={40} color="#ccc" style={{ marginBottom: 12 }} />
              <Text style={styles.emptySearchTitle}>
                {searchQuery.trim()
                  ? `No products found matching "${searchQuery}"`
                  : 'No products available in catalog'}
              </Text>
              {searchQuery.trim().length > 0 && (
                <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearSearchBtnText}>Clear Search</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }
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
                  {((selectedProduct?.product_media && selectedProduct.product_media.length > 0) 
                    ? selectedProduct.product_media 
                    : [{ media_url: 'https://placehold.co/600x400' }]
                  ).map((media, index) => (
                    <TouchableOpacity key={index} onPress={() => openImageViewer(selectedProduct)}>
                      <Image source={{ uri: media?.media_url }} style={styles.modalProductImage} />
                    </TouchableOpacity>
                  ))}
                </Swiper>
              </View>

              <Text style={styles.modalProductName}>{selectedProduct?.product_name || ''}</Text>
              
              <ScrollView style={{ flex: 1 }}>
                {(() => {
                  const combos = getProductCombinations(selectedProduct);
                  if (combos.length > 1) {
                    return (
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
                        {combos
                          .filter(combo => 
                            (combo?.combination_string || '').toLowerCase().includes((variantSearch[selectedProduct.id] || '').toLowerCase())
                          )
                          .map(combo => {
                            if (!combo) return null;
                            const quantity = quantityMap[combo.id] || 0;
                            return (
                              <View key={combo.id} style={styles.variantRow}>
                                <View style={styles.variantInfo}>
                                    <Text style={styles.variantNameText}>{combo.combination_string}</Text>
                                    <Text style={styles.stockText}><Text style={styles.labelText}>Price: </Text>₹{combo.price}</Text>
                                    <Text style={styles.stockText}><Text style={styles.labelText}>In Stock: </Text>{combo.quantity || 0}</Text>
                                </View>
                                <View style={styles.quantitySelector}>
                                  <Text style={styles.labelText}>Qty:</Text>
                                  <TouchableOpacity 
                                    onPress={() => handleUpdateCart(selectedProduct, combo.id, -1)} 
                                    disabled={updatingCart || quantity === 0}
                                    style={{ padding: 4 }}
                                  >
                                    <Icon name="minus-circle" size={32} color={quantity === 0 ? '#ccc' : '#E53935'} style={updatingCart && { opacity: 0.5 }} />
                                  </TouchableOpacity>
                                  <Text style={styles.quantityText}>{quantity}</Text>
                                  <TouchableOpacity 
                                    onPress={() => handleUpdateCart(selectedProduct, combo.id, 1)} 
                                    disabled={updatingCart}
                                    style={{ padding: 4 }}
                                  >
                                    <Icon name="plus-circle" size={32} color="#43A047" style={updatingCart && { opacity: 0.5 }} />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })}
                      </View>
                    );
                  } else {
                    const combo = combos[0];
                    const quantity = quantityMap[combo.id] || 0;
                    return (
                      <View style={styles.singleVariantModalContainer}>
                        <View style={styles.variantRow}>
                          <View style={styles.variantInfo}>
                            <Text style={styles.variantNameText}>{getPriceDisplay(selectedProduct)}</Text>
                            <Text style={styles.stockText}><Text style={styles.labelText}>In Stock: </Text>{combo?.quantity || 100}</Text>
                          </View>
                          <View style={styles.quantitySelector}>
                            <Text style={styles.labelText}>Qty:</Text>
                            <TouchableOpacity 
                              onPress={() => handleUpdateCart(selectedProduct, combo.id, -1)} 
                              disabled={updatingCart || quantity === 0}
                              style={{ padding: 4 }}
                            >
                              <Icon name="minus-circle" size={32} color={quantity === 0 ? '#ccc' : '#E53935'} style={updatingCart && { opacity: 0.5 }} />
                            </TouchableOpacity>
                            <Text style={styles.quantityText}>{quantity}</Text>
                            <TouchableOpacity 
                              onPress={() => handleUpdateCart(selectedProduct, combo.id, 1)} 
                              disabled={updatingCart}
                              style={{ padding: 4 }}
                            >
                              <Icon name="plus-circle" size={32} color="#43A047" style={updatingCart && { opacity: 0.5 }} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        {quantity === 0 && (
                          <TouchableOpacity 
                            style={styles.modalAddToCartButton}
                            onPress={() => handleUpdateCart(selectedProduct, combo.id, 1)}
                            disabled={updatingCart}
                          >
                            <Icon name="shopping-cart" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.modalAddToCartButtonText}>Add to Cart</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  }
                })()}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isCartModalVisible}
        onRequestClose={() => setIsCartModalVisible(!isCartModalVisible)}
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
            {cartItems && cartItems.length > 0 ? (
              <FlatList
                data={cartItems}
                renderItem={renderCartItem}
                keyExtractor={(item) => (user ? item.id.toString() : item.product_variant_combination_id.toString())}
              />
            ) : (
              <Text style={styles.emptyCartText}>Your cart is empty.</Text>
            )}
            <Button title="Checkout" onPress={() => {
              setIsCartModalVisible(false);
              navigation.navigate('Checkout', { cart: user ? cart : { cart_items: guestCart } });
            }} />
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={styles.bottomFixedContainer}
      >
        {/* Bottom Search Bar */}
        <View style={styles.bottomSearchBarWrapper}>
          <View style={styles.bottomSearchBox}>
            <Icon name="search" size={16} color="#007AFF" style={styles.searchIcon} />
            <TextInput
              style={styles.bottomSearchInput}
              placeholder="Search products, variants..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearIconBtn}>
                <Icon name="times-circle" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* View Cart Floating Bar */}
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
    minHeight: 44,
  },
  productPrice: {
    fontSize: 14,
    color: '#888',
    marginTop: 5,
  },
  stockText: {
    fontSize: 12,
    color: '#388E3C',
    marginTop: 2,
  },
  addButton: {
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
  addButtonActive: {
    backgroundColor: '#C8E6C9',
    borderColor: '#81C784',
  },
  addButtonText: {
    color: '#2E7D32',
    fontWeight: 'bold',
    fontSize: 14,
  },
  addButtonTextActive: {
    color: '#1B5E20',
  },
  cardQuantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F8E9',
    borderRadius: 8,
    marginTop: 5,
    marginHorizontal: 10,
    marginBottom: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  cardQtyBtnMinus: {
    backgroundColor: '#E53935',
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardQtyBtnPlus: {
    backgroundColor: '#43A047',
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardQtyText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1B5E20',
    paddingHorizontal: 8,
  },
  singleVariantModalContainer: {
    padding: 10,
  },
  modalAddToCartButton: {
    backgroundColor: '#43A047',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 20,
    elevation: 2,
  },
  modalAddToCartButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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
  variantInfo: {
      flex: 1,
  },
  variantNameText: {
    fontSize: 16,
    fontWeight: '500',
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
  bottomFixedContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  bottomSearchBarWrapper: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  bottomSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 25,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchIcon: {
    marginRight: 8,
  },
  bottomSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
    paddingVertical: 4,
  },
  clearIconBtn: {
    padding: 4,
    marginLeft: 4,
  },
  emptySearchContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySearchTitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 22,
  },
  clearSearchBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  clearSearchBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  viewCartContainer: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
    backgroundColor: '#fff',
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
  labelText: {
    fontSize: 12,
    color: '#888',
  }
});

export default CatalogScreen;
