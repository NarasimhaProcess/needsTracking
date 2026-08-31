import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { getCart, updateCartItem, removeCartItem, supabase } from '../services/supabase';
import { getGuestCart, updateGuestCartItemQuantity, removeGuestCartItem } from '../services/localStorageService';
import Icon from 'react-native-vector-icons/FontAwesome';

const CartScreen = ({ navigation }) => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const normalizeGuestCart = (guestCartData) => ({
    cart_items: (guestCartData || []).map(item => {
      const existingMedia = item.product_variant_combinations?.products?.product_media;
      const mediaUrl = item.image_url || (Array.isArray(existingMedia) && existingMedia[0]?.media_url) || null;
      return {
        id: item.product_variant_combination_id || item.id,
        quantity: item.quantity,
        product_variant_combinations: {
          id: item.product_variant_combination_id || item.id,
          combination_string: item.combination_string || 'Default',
          price: item.price || 0,
          products: {
            product_name: item.product_name || item.product_variant_combinations?.products?.product_name || 'Product',
            product_media: existingMedia && existingMedia.length > 0
              ? existingMedia
              : (mediaUrl ? [{ media_url: mediaUrl, media_type: 'image' }] : [])
          }
        }
      };
    })
  });

  useEffect(() => {
    const fetchUserAndCart = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const cartData = await getCart(user.id);
        setCart(cartData);
      } else {
        const guestCartData = await getGuestCart();
        setCart(normalizeGuestCart(guestCartData));
      }
      setLoading(false);
    };

    fetchUserAndCart();
  }, []);

  const handleUpdateQuantity = async (cartItemId, quantity) => {
    if (quantity < 1) {
      handleRemoveItem(cartItemId);
      return;
    }
    if (user) {
      const updatedItem = await updateCartItem(cartItemId, quantity);
      if (updatedItem) {
        const newCart = { ...cart };
        const itemIndex = newCart.cart_items.findIndex((item) => item.id === cartItemId);
        newCart.cart_items[itemIndex].quantity = quantity;
        setCart(newCart);
      }
    } else {
      await updateGuestCartItemQuantity(cartItemId, quantity);
      const guestCartData = await getGuestCart();
      setCart(normalizeGuestCart(guestCartData));
    }
  };

  const handleRemoveItem = async (cartItemId) => {
    if (user) {
      await removeCartItem(cartItemId);
      const newCart = { ...cart };
      newCart.cart_items = newCart.cart_items.filter((item) => item.id !== cartItemId);
      setCart(newCart);
    } else {
      await removeGuestCartItem(cartItemId);
      const guestCartData = await getGuestCart();
      setCart(normalizeGuestCart(guestCartData));
    }
  };

  const getItemImageUrl = (item) => {
    const prod = item?.product_variant_combinations?.products;
    if (prod?.product_media && Array.isArray(prod.product_media) && prod.product_media.length > 0) {
      const found = prod.product_media.find(m => m?.media_url);
      if (found?.media_url) return found.media_url;
    }
    if (item?.image_url) return item.image_url;
    return null;
  };

  const renderCartItem = ({ item }) => {
    const imageUrl = getItemImageUrl(item);
    return (
      <View style={styles.itemContainer}>
        {imageUrl ? (
          <Image
            style={styles.itemImage}
            source={{ uri: imageUrl }}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.itemImage, styles.placeholderImage]}>
            <Icon name="shopping-bag" size={24} color="#94a3b8" />
          </View>
        )}
        <View style={styles.itemDetails}>
          <Text style={styles.itemName}>{item?.product_variant_combinations?.products?.product_name || 'Product'}</Text>
          <Text style={styles.itemVariant}>{item?.product_variant_combinations?.combination_string || ''}</Text>
          <Text style={styles.itemPrice}>₹{item?.product_variant_combinations?.price || 0}</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity onPress={() => handleUpdateQuantity(item.id, item.quantity - 1)} style={{ padding: 4 }}>
              <Icon name="minus-circle" size={24} color="#E53935" />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{item.quantity}</Text>
            <TouchableOpacity onPress={() => handleUpdateQuantity(item.id, item.quantity + 1)} style={{ padding: 4 }}>
              <Icon name="plus-circle" size={24} color="#43A047" />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={() => handleRemoveItem(item.id)} style={{ padding: 10 }}>
          <Icon name="trash" size={22} color="#E53935" />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0000ff" /></View>;
  }

  if (!cart || cart.cart_items.length === 0) {
    return (
      <View style={{flex: 1, backgroundColor: 'white'}}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Cart</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <Text style={styles.emptyCartText}>Your cart is empty.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, width: '100%', height: '100%', backgroundColor: 'white' }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Cart</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={cart.cart_items}
        renderItem={renderCartItem}
        keyExtractor={(item) => item.id.toString()}
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.container, { flexGrow: 1, paddingBottom: 40 }]}
      />
      <TouchableOpacity style={styles.checkoutButton} onPress={() => {
        let customerIdToPass = null;
        if (user?.user_metadata?.customerId) {
          customerIdToPass = user.user_metadata.customerId;
        } else if (cart?.cart_items?.length > 0) {
          // Assuming all products in cart belong to the same customer (catalog provider)
          customerIdToPass = cart.cart_items[0]?.product_variant_combinations?.products?.customer_id || null;
        }
        navigation.navigate('Checkout', { cart: cart, customerId: customerIdToPass });
        console.log('CartScreen: customerIdToPass', customerIdToPass);
        console.log('CartScreen: user', user);
        console.log('CartScreen: user.user_metadata.customerId', user?.user_metadata?.customerId);
        console.log('CartScreen: cart', cart);
        console.log('CartScreen: cart.cart_items.length', cart?.cart_items?.length);
        console.log('CartScreen: cart.cart_items[0].product_variant_combinations.products.customer_id', cart?.cart_items?.[0]?.product_variant_combinations?.products?.customer_id);
      }}>
        <Text style={styles.checkoutButtonText}>Checkout</Text>
      </TouchableOpacity>
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
    backgroundColor: '#f1f5f9',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
  checkoutButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    margin: 20,
  },
  checkoutButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default CartScreen;