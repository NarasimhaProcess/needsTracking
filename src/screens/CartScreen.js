import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Button,
  ActivityIndicator,
} from 'react-native';
import { getCart, updateCartItem, removeCartItem, supabase } from '../services/supabase';
import Icon from 'react-native-vector-icons/FontAwesome';

const CartScreen = ({ navigation }) => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchUserAndCart = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const cartData = await getCart(user.id);
        setCart(cartData);
      }
      setLoading(false);
    };

    fetchUserAndCart();
  }, []);

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

  const renderCartItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <Image
        style={styles.itemImage}
        source={{ uri: item.product_variant_combinations.products.product_media[0]?.media_url || 'https://placehold.co/600x400' }}
      />
      <View style={styles.itemDetails}>
        <Text style={styles.itemName}>{item.product_variant_combinations.products.product_name}</Text>
        <Text style={styles.itemVariant}>{item.product_variant_combinations.combination_string}</Text>
        <Text style={styles.itemPrice}>${item.product_variant_combinations.price}</Text>
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

  if (!cart || cart.cart_items.length === 0) {
    return <Text style={styles.emptyCartText}>Your cart is empty.</Text>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={cart.cart_items}
        renderItem={renderCartItem}
        keyExtractor={(item) => item.id.toString()}
      />
      <Button title="Checkout" onPress={() => navigation.navigate('Checkout', { cart: cart })} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
});

export default CartScreen;
