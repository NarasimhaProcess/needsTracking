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
        const normalizedCart = {
          cart_items: guestCartData.map(item => ({
            id: item.product_variant_combination_id,
            quantity: item.quantity,
            product_variant_combinations: {
              id: item.product_variant_combination_id,
              combination_string: item.combination_string,
              price: item.price,
              products: {
                product_name: item.product_name,
                product_media: [{ media_url: item.image_url }]
              }
            }
          }))
        };
        setCart(normalizedCart);
      }
      setLoading(false);
    };

    fetchUserAndCart();
  }, []);

  const handleUpdateQuantity = async (cartItemId, quantity) => {
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
      const normalizedCart = {
        cart_items: guestCartData.map(item => ({
          id: item.product_variant_combination_id,
          quantity: item.quantity,
          product_variant_combinations: {
            id: item.product_variant_combination_id,
            combination_string: item.combination_string,
            price: item.price,
            products: {
              product_name: item.product_name,
              product_media: [{ media_url: item.image_url }]
            }
          }
        }))
      };
      setCart(normalizedCart);
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
      const normalizedCart = {
        cart_items: guestCartData.map(item => ({
          id: item.product_variant_combination_id,
          quantity: item.quantity,
          product_variant_combinations: {
            id: item.product_variant_combination_id,
            combination_string: item.combination_string,
            price: item.price,
            products: {
              product_name: item.product_name,
              product_media: [{ media_url: item.image_url }]
            }
          }
        }))
      };
      setCart(normalizedCart);
    }
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
    <View style={{flex: 1, backgroundColor: 'white'}}>
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
        contentContainerStyle={styles.container}
      />
      <TouchableOpacity style={styles.checkoutButton} onPress={() => {
        let customerIdToPass = null;
        if (user && user.user_metadata && user.user_metadata.customerId) {
          customerIdToPass = user.user_metadata.customerId;
        } else if (cart && cart.cart_items.length > 0) {
          // Assuming all products in cart belong to the same customer (catalog provider)
          customerIdToPass = cart.cart_items[0].product_variant_combinations.products.customer_id;
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