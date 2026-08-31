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
import { showAlert } from '../utils/alertUtils';

const { width } = Dimensions.get('window');

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

export const CATALOG_CATEGORIES = [
  { id: 'all', label: 'All Items', icon: 'th-large' },
  { id: 'grocery', label: 'Grocery', icon: 'shopping-basket' },
  { id: 'fruits_vegetables', label: 'Fruits & Veg', icon: 'lemon-o' },
  { id: 'dairy_bakery', label: 'Dairy & Bakery', icon: 'birthday-cake' },
  { id: 'snacks_beverages', label: 'Snacks & Drinks', icon: 'coffee' },
  { id: 'clothing', label: 'Clothing', icon: 'tag' },
  { id: 'electronics', label: 'Electronics', icon: 'laptop' },
  { id: 'beauty_personal_care', label: 'Beauty & Care', icon: 'heart' },
  { id: 'home_kitchen', label: 'Home & Kitchen', icon: 'home' },
  { id: 'pharmacy', label: 'Pharmacy', icon: 'medkit' },
  { id: 'other', label: 'Other', icon: 'cube' },
];

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

  const getProductCombinations = useCallback((product) => {
    if (!product) return [];
    const rawCombos = product.product_variant_combinations || [];
    if (rawCombos.length > 0) {
      const hasActiveVariants = (product.product_variants || []).some(
        v => (v.name || '').trim() && (v.variant_options || []).length > 0
      );
      if (!hasActiveVariants) {
        // Single item product without variants -> strictly return only 1 default combination
        return [{
          ...rawCombos[0],
          combination_string: 'Default',
          price: rawCombos[0].price || product.amount || 0,
          quantity: rawCombos[0].quantity !== undefined ? rawCombos[0].quantity : 100,
        }];
      }

      // If has variants, deduplicate any repeated combination strings
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

  const getCategoryLabel = useCallback((productType) => {
    if (!productType) return 'General';
    const cat = CATALOG_CATEGORIES.find(c => c.id === productType.toLowerCase());
    return cat ? cat.label : productType.charAt(0).toUpperCase() + productType.slice(1);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts = { all: products.length };
    products.forEach((p) => {
      const cat = (p?.product_type || 'other').toLowerCase();
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedCategory && selectedCategory !== 'all') {
      result = result.filter((product) => {
        const pType = (product?.product_type || 'other').toLowerCase();
        return pType === selectedCategory.toLowerCase();
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((product) => {
        const nameMatch = (product?.product_name || '').toLowerCase().includes(query);
        const descMatch = (product?.description || '').toLowerCase().includes(query);
        const typeMatch = (product?.product_type || '').toLowerCase().includes(query);
        const unitMatch = (product?.unit || '').toLowerCase().includes(query);

        const catObj = CATALOG_CATEGORIES.find(c => c.id === (product?.product_type || '').toLowerCase());
        const catLabelMatch = catObj ? catObj.label.toLowerCase().includes(query) : false;

        const variantMatch = (product?.product_variant_combinations || []).some(
          combo => (combo?.combination_string || '').toLowerCase().includes(query) ||
                   (combo?.sku || '').toLowerCase().includes(query)
        );

        const variantOptionMatch = (product?.product_variants || []).some(
          v => (v.name || '').toLowerCase().includes(query) ||
               (v.variant_options || []).some(opt => {
                 const val = typeof opt === 'string' ? opt : (opt?.value || opt?.name || '');
                 return val.toLowerCase().includes(query);
               })
        );

        return nameMatch || descMatch || typeMatch || unitMatch || catLabelMatch || variantMatch || variantOptionMatch;
      });
    }

    return result;
  }, [products, searchQuery, selectedCategory]);

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

  const formatCombinationTitle = useCallback((combinationString, product) => {
    if (!combinationString || combinationString === 'Default') {
      return product?.product_name ? `${product.product_name} (Standard)` : 'Standard Option';
    }
    const parts = combinationString.split(',').map(p => p.trim()).filter(Boolean);
    return parts.map(part => {
      const colonIdx = part.indexOf(':');
      if (colonIdx > -1) {
        return part.substring(colonIdx + 1).trim();
      }
      return part;
    }).join(' • ');
  }, []);

  const openProductModal = (product) => {
    setSelectedProduct(product);
    setSelectedVariantFilter(null);
    const variants = product?.product_variants || [];
    if (variants.length > 0) {
      const defaultVars = {};
      variants.forEach((v) => {
        const vName = v.name || v.variant_name;
        if (vName && v.variant_options && v.variant_options.length > 0) {
          const firstOpt = v.variant_options[0];
          const val = typeof firstOpt === 'string' ? firstOpt : (firstOpt.value || firstOpt.name || '');
          defaultVars[vName] = val;
        }
      });
      setSelectedVariants(defaultVars);
    } else {
      const combos = getProductCombinations(product);
      if (combos.length > 0 && combos[0].combination_string && combos[0].combination_string !== 'Default') {
        const parts = combos[0].combination_string.split(',');
        const defaultVars = {};
        parts.forEach(part => {
          const [k, v] = part.split(':');
          if (k && v) {
            defaultVars[k.trim()] = v.trim();
          }
        });
        setSelectedVariants(defaultVars);
      } else {
        setSelectedVariants({});
      }
    }
    setIsProductModalVisible(true);
  };

  const closeProductModal = () => {
    setSelectedProduct(null);
    setSelectedVariants({});
    setSelectedVariantFilter(null);
    setIsProductModalVisible(false);
  };

  const getSelectedCombination = useCallback(() => {
    if (!selectedProduct) return null;
    const combos = getProductCombinations(selectedProduct);
    if (combos.length === 0) {
      return { id: selectedProduct.id, combination_string: 'Default', price: selectedProduct.amount || 0, quantity: 100 };
    }
    if (combos.length === 1) {
      return combos[0];
    }

    const variantKeys = Object.keys(selectedVariants).filter(k => selectedVariants[k]);
    if (variantKeys.length === 0) {
      return combos[0];
    }

    const sortedKeys = [...variantKeys].sort();
    const combinationString = sortedKeys
      .map((key) => `${key}:${selectedVariants[key]}`)
      .join(',');
    const normalizedCombinationString = combinationString.replace(/\s/g, '').toLowerCase();

    let found = combos.find((c) => {
      if (c.combination_string) {
        const normalizedDbString = c.combination_string.replace(/\s/g, '').toLowerCase();
        return normalizedDbString === normalizedCombinationString;
      }
      return false;
    });

    if (!found) {
      found = combos.find((c) => {
        if (!c.combination_string) return false;
        const dbNormalized = c.combination_string.replace(/\s/g, '').toLowerCase();
        return variantKeys.every(k => {
          const pair = `${k.toLowerCase()}:${String(selectedVariants[k]).toLowerCase().trim()}`;
          return dbNormalized.includes(pair);
        });
      });
    }

    return found || combos[0];
  }, [selectedProduct, selectedVariants, getProductCombinations]);

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
        const comboId = freshUser 
          ? (item.product_variant_combinations?.id || item.product_variant_combination_id) 
          : (item.product_variant_combination_id || item.product_variant_combinations?.id || item.id);
        const qty = item.quantity || 0;
        if (comboId) localQuantityMap[comboId] = (localQuantityMap[comboId] || 0) + qty;
      });
    }
    // --- End get fresh data ---

    const currentQuantity = localQuantityMap[targetCombinationId] || 0;
    const newQuantity = currentQuantity + change;

    if (newQuantity < 0) {
        setUpdatingCart(false);
        return;
    }

    const stock = combination.quantity !== undefined && combination.quantity !== null ? combination.quantity : 100; 

    if (change > 0 && stock > 0 && currentQuantity >= stock) {
        showAlert("Stock Limit", `Sorry, you can only add up to ${stock} items.`);
        setUpdatingCart(false);
        return;
    }

    if (freshUser) {
        try {
            const originalCartItem = (freshCart?.cart_items || []).find(item => 
              (item.product_variant_combinations?.id === targetCombinationId) ||
              (item.product_variant_combination_id === targetCombinationId) ||
              (item.id === targetCombinationId)
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
            showAlert("Error", `There was a problem updating your cart: ${error.message}`);
        } finally {
            setUpdatingCart(false);
        }
    } else {
        // Guest user logic
        const optimisticGuestCart = JSON.parse(JSON.stringify(freshGuestCart || []));
        const itemIndex = optimisticGuestCart.findIndex(item => 
          item.product_variant_combination_id === targetCombinationId ||
          item.id === targetCombinationId ||
          item.product_variant_combinations?.id === targetCombinationId
        );

        if (newQuantity > 0) {
            if (itemIndex > -1) {
                optimisticGuestCart[itemIndex].quantity = newQuantity;
            } else {
                optimisticGuestCart.push({
                    id: targetCombinationId,
                    product_variant_combination_id: targetCombinationId,
                    combination_string: combination.combination_string,
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
            showAlert("Error", "There was a problem updating your cart.");
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
        showAlert("Stock Limit", `Sorry, you can only have up to ${stock} items in your cart.`);
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
            showAlert("Error", "Could not update item quantity.");
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
            showAlert("Error", "Could not update item quantity.");
            setGuestCart(guestCart);
        } finally {
            setUpdatingCart(false);
        }
    }
  };

  const handleRemoveItem = (cartItemId) => {
    showAlert(
      "Remove Item",
      "Are you sure you want to remove this item from your cart?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            if (updatingCart) return;
            setUpdatingCart(true);

            if (user) {
                try {
                    await removeCartItem(cartItemId);
                    const finalCartData = await getCart(user.id);
                    setCart(finalCartData);
                } catch (error) {
                    console.error("Error removing item:", error);
                    showAlert("Error", "Could not remove item from cart.");
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
                    showAlert("Error", "Could not remove item from cart.");
                    setGuestCart(guestCart);
                } finally {
                    setUpdatingCart(false);
                }
            }
          },
        },
      ]
    );
  };

  const openImageViewer = (product) => {
    const imageUrls = (product?.product_media || [])
      .filter(m => isImageMedia(m) && (m.media_url || m.uri))
      .map(m => ({ url: m.media_url || m.uri }));
    
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
    const firstMedia = (item.product_media || []).find(m => isImageMedia(m) && (m.media_url || m.uri));
    const imageUrl = firstMedia ? (firstMedia.media_url || firstMedia.uri) : (item.image_url || null);

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
          <Text style={styles.productPrice}>{getPriceDisplay(item)}</Text>
          <Text style={styles.stockText}>
            In Stock: {totalStock} {item.unit || ''}
          </Text>
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
    const prodMedia = prod?.product_media;
    const mediaUrl = (Array.isArray(prodMedia) && prodMedia.length > 0)
      ? (prodMedia.find(m => m?.media_url)?.media_url || prodMedia[0]?.media_url)
      : (item.image_url || null);

    return (
        <View style={styles.itemContainer}>
        {mediaUrl ? (
          <Image
              style={styles.itemImage}
              source={{ uri: mediaUrl }}
              resizeMode="cover"
          />
        ) : (
          <View style={[styles.itemImage, { backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }]}>
            <Icon name="shopping-bag" size={20} color="#94a3b8" />
          </View>
        )}
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
          <Text style={styles.headerTitle}>Catalog</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {user && (
            <TouchableOpacity
              style={{ marginRight: 15 }}
              onPress={() => {
                showAlert('Logout', 'Are you sure you want to log out?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await supabase.auth.signOut();
                        navigation.reset({
                          index: 0,
                          routes: [{ name: 'Welcome' }],
                        });
                      } catch (err) {
                        console.error('Logout error in CatalogScreen:', err);
                      }
                    },
                  },
                ]);
              }}
            >
              <Icon name="sign-out" size={20} color="#EF4444" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Welcome' }],
                });
              }
            }}
          >
            <Icon name="close" size={22} color="#333" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Horizontal Filter Bar */}
      <View style={styles.categoryBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScrollContainer}
        >
          {CATALOG_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;
            if (cat.id !== 'all' && count === 0 && !isSelected) return null;

            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  isSelected && styles.categoryChipSelected
                ]}
                onPress={() => {
                  setSelectedCategory(cat.id === selectedCategory ? 'all' : cat.id);
                }}
                activeOpacity={0.7}
              >
                <Icon
                  name={cat.icon}
                  size={12}
                  color={isSelected ? '#FFFFFF' : '#475569'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    isSelected && styles.categoryChipTextSelected
                  ]}
                >
                  {cat.label} {count > 0 ? `(${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
        extraData={{ cart, guestCart, updatingCart, searchQuery, selectedCategory }}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptySearchContainer}>
              <Icon name="search" size={40} color="#ccc" style={{ marginBottom: 12 }} />
              <Text style={styles.emptySearchTitle}>
                {searchQuery.trim() || selectedCategory !== 'all'
                  ? `No products found matching ${searchQuery.trim() ? `"${searchQuery}"` : ''} ${selectedCategory !== 'all' ? `in category "${getCategoryLabel(selectedCategory)}"` : ''}`
                  : 'No products available in catalog'}
              </Text>
              {(searchQuery.trim().length > 0 || selectedCategory !== 'all') && (
                <TouchableOpacity
                  style={styles.clearSearchBtn}
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                >
                  <Text style={styles.clearSearchBtnText}>Reset Filters</Text>
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
            <View style={styles.swiggyModalContent}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeProductModal}
              >
                <Icon name="times-circle" size={30} color="#333" />
              </TouchableOpacity>
              
              <View style={styles.swiperContainer}>
                {selectedProduct?.product_media && selectedProduct.product_media.length > 0 && selectedProduct.product_media.some(m => isImageMedia(m) && (m?.media_url || m?.uri)) ? (
                  <Swiper showsButtons={false} loop={false}>
                    {selectedProduct.product_media
                      .filter(m => isImageMedia(m) && (m?.media_url || m?.uri))
                      .map((media, index) => (
                        <TouchableOpacity key={index} onPress={() => openImageViewer(selectedProduct)} activeOpacity={0.9}>
                          <Image source={{ uri: media.media_url || media.uri }} style={styles.modalProductImage} resizeMode="contain" />
                        </TouchableOpacity>
                      ))}
                  </Swiper>
                ) : (
                  <View style={styles.modalProductImagePlaceholder}>
                    <Icon name="shopping-bag" size={48} color="#94a3b8" />
                    <Text style={styles.modalPlaceholderText}>{selectedProduct?.product_name || 'Product'}</Text>
                  </View>
                )}
              </View>

              <View style={styles.swiggyHeaderSection}>
                <View style={styles.swiggyMetaBadgesRow}>
                  {selectedProduct?.product_type ? (
                    <View style={styles.swiggyCategoryBadge}>
                      <Icon name="tag" size={11} color="#007AFF" style={{ marginRight: 4 }} />
                      <Text style={styles.swiggyCategoryBadgeText}>
                        {getCategoryLabel(selectedProduct.product_type)}
                      </Text>
                    </View>
                  ) : null}
                  {selectedProduct?.unit ? (
                    <View style={styles.swiggyUnitBadge}>
                      <Text style={styles.swiggyUnitBadgeText}>Unit: {selectedProduct.unit}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.swiggyProductName}>{selectedProduct?.product_name || ''}</Text>
                {selectedProduct?.description ? (
                  <Text style={styles.swiggyProductDesc}>{selectedProduct.description}</Text>
                ) : null}
              </View>
              
              <ScrollView
                style={{ flex: 1, width: '100%' }}
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {(() => {
                  const combos = getProductCombinations(selectedProduct);
                  const isMultiCombo = combos.length > 1;

                  // Filter by selected variant filter if active
                  const filteredCombos = combos.filter(combo => {
                    if (!selectedVariantFilter) return true;
                    const normalizedCombo = (combo?.combination_string || '').toLowerCase();
                    return normalizedCombo.includes(selectedVariantFilter.toLowerCase());
                  });

                  return (
                    <View style={{ flex: 1 }}>
                      {/* Filter chips if product has multiple variants */}
                      {selectedProduct?.product_variants && selectedProduct.product_variants.length > 1 && (
                        <View style={styles.swiggyFilterSection}>
                          <Text style={styles.swiggyFilterLabel}>Filter by:</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.swiggyFilterScroll}>
                            <TouchableOpacity
                              style={[styles.swiggyFilterChip, !selectedVariantFilter && styles.swiggyFilterChipActive]}
                              onPress={() => setSelectedVariantFilter(null)}
                            >
                              <Text style={[styles.swiggyFilterChipText, !selectedVariantFilter && styles.swiggyFilterChipTextActive]}>
                                All ({combos.length})
                              </Text>
                            </TouchableOpacity>
                            {selectedProduct.product_variants.map(v => (
                              (v.variant_options || []).map((opt, oIdx) => {
                                const optVal = typeof opt === 'string' ? opt : (opt?.value || opt?.name || '');
                                const isChipActive = selectedVariantFilter === optVal;
                                return (
                                  <TouchableOpacity
                                    key={`${v.id}-${oIdx}`}
                                    style={[styles.swiggyFilterChip, isChipActive && styles.swiggyFilterChipActive]}
                                    onPress={() => setSelectedVariantFilter(isChipActive ? null : optVal)}
                                  >
                                    <Text style={[styles.swiggyFilterChipText, isChipActive && styles.swiggyFilterChipTextActive]}>
                                      {optVal}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {/* Section Title */}
                      <View style={styles.swiggyOptionsHeaderRow}>
                        <Text style={styles.swiggyOptionsSectionTitle}>
                          {isMultiCombo ? 'Available Options & Sizes' : 'Product Details'}
                        </Text>
                        <Text style={styles.swiggyOptionsSectionSubtitle}>
                          {isMultiCombo ? 'Select quantity for each option you want to add' : 'Add to your cart'}
                        </Text>
                      </View>

                      {/* Swiggy/Zomato style Options list */}
                      <View style={styles.swiggyOptionsList}>
                        {filteredCombos.map((combo, index) => {
                          const qtyInCart = quantityMap[combo.id] || 0;
                          const comboPrice = combo?.price !== undefined && combo?.price !== null ? combo.price : (selectedProduct.amount || 0);
                          const stockQty = combo?.quantity !== undefined && combo?.quantity !== null ? combo.quantity : 100;
                          const isOutOfStock = stockQty <= 0;
                          
                          const comboTitle = formatCombinationTitle(combo.combination_string, selectedProduct);
                          const parts = (combo.combination_string || '')
                            .split(',')
                            .map(p => p.trim())
                            .filter(Boolean);

                          return (
                            <View 
                              key={combo.id || index} 
                              style={[styles.swiggyOptionCard, qtyInCart > 0 && styles.swiggyOptionCardActive]}
                            >
                              <View style={styles.swiggyOptionInfoCol}>
                                <Text style={styles.swiggyOptionTitle}>{comboTitle}</Text>
                                
                                {parts.length > 0 && combo.combination_string !== 'Default' && (
                                  <View style={styles.swiggyBadgesRow}>
                                    {parts.map((part, pIdx) => {
                                      const colonIdx = part.indexOf(':');
                                      const vName = colonIdx > -1 ? part.substring(0, colonIdx).trim() : '';
                                      const vVal = colonIdx > -1 ? part.substring(colonIdx + 1).trim() : part.trim();
                                      return (
                                        <View key={pIdx} style={styles.swiggyBadge}>
                                          {vName ? <Text style={styles.swiggyBadgeName}>{vName}: </Text> : null}
                                          <Text style={styles.swiggyBadgeVal}>{vVal}</Text>
                                        </View>
                                      );
                                    })}
                                  </View>
                                )}

                                <View style={styles.swiggyPriceStockRow}>
                                  <Text style={styles.swiggyOptionPriceText}>₹{comboPrice}</Text>
                                  <Text style={[styles.swiggyStockText, isOutOfStock && styles.swiggyStockOutText]}>
                                    {isOutOfStock ? '• Out of Stock' : `• In Stock: ${stockQty} ${selectedProduct.unit || 'units'}`}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.swiggyActionCol}>
                                {qtyInCart > 0 ? (
                                  <View style={styles.swiggyStepperBox}>
                                    <TouchableOpacity
                                      style={styles.swiggyStepperBtn}
                                      onPress={() => handleUpdateCart(selectedProduct, combo.id, -1)}
                                      disabled={updatingCart}
                                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                      <Icon name="minus" size={12} color="#166534" />
                                    </TouchableOpacity>
                                    <Text style={styles.swiggyStepperQtyText}>{qtyInCart}</Text>
                                    <TouchableOpacity
                                      style={[styles.swiggyStepperBtn, (qtyInCart >= stockQty || updatingCart) && styles.swiggyBtnDisabled]}
                                      onPress={() => handleUpdateCart(selectedProduct, combo.id, 1)}
                                      disabled={updatingCart || qtyInCart >= stockQty}
                                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                      <Icon name="plus" size={12} color="#166534" />
                                    </TouchableOpacity>
                                  </View>
                                ) : (
                                  <TouchableOpacity
                                    style={[styles.swiggyAddBtn, isOutOfStock && styles.swiggyAddBtnDisabled]}
                                    onPress={() => handleUpdateCart(selectedProduct, combo.id, 1)}
                                    disabled={updatingCart || isOutOfStock}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={[styles.swiggyAddBtnText, isOutOfStock && styles.swiggyAddBtnTextDisabled]}>
                                      {isOutOfStock ? 'OUT' : 'ADD +'}
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })()}
              </ScrollView>

              {/* Swiggy/Zomato style Sticky Footer Bar */}
              <View style={styles.swiggyModalFooter}>
                <View style={styles.swiggyFooterInfo}>
                  <Text style={styles.swiggyFooterItemsCount}>
                    {productTotalQuantityInCart[selectedProduct?.id] || 0} {(productTotalQuantityInCart[selectedProduct?.id] || 0) === 1 ? 'item' : 'items'} added
                  </Text>
                  <Text style={styles.swiggyFooterTotalPrice}>
                    ₹{(productTotalPriceInCart[selectedProduct?.id] || 0).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.swiggyFooterActionsRow}>
                  <TouchableOpacity
                    style={styles.swiggyDoneBtn}
                    onPress={closeProductModal}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.swiggyDoneBtnText}>Done</Text>
                  </TouchableOpacity>
                  {cartTotals.totalItems > 0 && (
                    <TouchableOpacity
                      style={styles.swiggyViewCartBtn}
                      onPress={() => {
                        closeProductModal();
                        setIsCartModalVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.swiggyViewCartBtnText}>View Cart</Text>
                      <Icon name="arrow-right" size={12} color="#ffffff" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
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
    backgroundColor: '#f8fafc',
  },
  productImagePlaceholder: {
    width: '100%',
    height: 150,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalProductImagePlaceholder: {
    width: '100%',
    height: 250,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPlaceholderText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
    fontWeight: '600',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 16 : 0,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderRadius: Platform.OS === 'web' ? 16 : 0,
    width: '100%',
    maxWidth: 600,
    height: Platform.OS === 'web' ? '85vh' : '80%',
    maxHeight: Platform.OS === 'web' ? '85vh' : '80%',
    overflow: 'hidden',
  },
  productModalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderRadius: Platform.OS === 'web' ? 16 : 0,
    width: '100%',
    maxWidth: 700,
    height: Platform.OS === 'web' ? '90vh' : '90%',
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    overflow: 'hidden',
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
  swiggyModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderRadius: Platform.OS === 'web' ? 20 : 0,
    width: '100%',
    maxWidth: 720,
    height: Platform.OS === 'web' ? '90vh' : '92%',
    maxHeight: Platform.OS === 'web' ? '90vh' : '92%',
    paddingTop: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  swiggyHeaderSection: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  swiggyProductName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  swiggyProductDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 6,
  },
  swiggyFilterSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  swiggyFilterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  swiggyFilterScroll: {
    flexDirection: 'row',
  },
  swiggyFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 8,
  },
  swiggyFilterChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  swiggyFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  swiggyFilterChipTextActive: {
    color: '#ffffff',
  },
  swiggyOptionsHeaderRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  swiggyOptionsSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  swiggyOptionsSectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  swiggyOptionsList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  swiggyOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  swiggyOptionCardActive: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  swiggyOptionInfoCol: {
    flex: 1,
    paddingRight: 12,
  },
  swiggyOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  swiggyBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  swiggyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  swiggyBadgeName: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  swiggyBadgeVal: {
    fontSize: 11,
    color: '#0f172a',
    fontWeight: '700',
  },
  swiggyPriceStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swiggyOptionPriceText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginRight: 8,
  },
  swiggyStockText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600',
  },
  swiggyStockOutText: {
    color: '#dc2626',
  },
  swiggyActionCol: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  swiggyAddBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#16a34a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  swiggyAddBtnDisabled: {
    borderColor: '#cbd5e1',
    backgroundColor: '#f1f5f9',
  },
  swiggyAddBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#16a34a',
  },
  swiggyAddBtnTextDisabled: {
    color: '#94a3b8',
    fontSize: 11,
  },
  swiggyStepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 96,
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  swiggyStepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swiggyStepperQtyText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    paddingHorizontal: 8,
  },
  swiggyBtnDisabled: {
    opacity: 0.5,
  },
  swiggyModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 8,
  },
  swiggyFooterInfo: {
    flex: 1,
  },
  swiggyFooterItemsCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  swiggyFooterTotalPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  swiggyFooterActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swiggyDoneBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
  },
  swiggyDoneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  swiggyViewCartBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  swiggyViewCartBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginRight: 4,
  },
  labelText: {
    fontSize: 12,
    color: '#888',
  },
  categoryBarWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 10,
  },
  categoryScrollContainer: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cardCategoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  cardCategoryTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#007AFF',
  },
  swiggyMetaBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  swiggyCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  swiggyCategoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#007AFF',
  },
  swiggyUnitBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  swiggyUnitBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
});

export default CatalogScreen;
