import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_CART_KEY = 'guest_cart';

export const getGuestCart = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(GUEST_CART_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error getting guest cart:', e);
    return [];
  }
};

export const addGuestCartItem = async (item) => {
  try {
    const currentCart = await getGuestCart();
    const existingItemIndex = currentCart.findIndex(
      (cartItem) => cartItem.product_variant_combination_id === item.product_variant_combination_id
    );

    if (existingItemIndex > -1) {
      // Update quantity if item already exists
      currentCart[existingItemIndex].quantity += item.quantity;
    } else {
      // Add new item
      currentCart.push(item);
    }
    const jsonValue = JSON.stringify(currentCart);
    await AsyncStorage.setItem(GUEST_CART_KEY, jsonValue);
    return true;
  } catch (e) {
    console.error('Error adding item to guest cart:', e);
    return false;
  }
};

export const updateGuestCartItemQuantity = async (itemId, quantity) => {
  try {
    const currentCart = await getGuestCart();
    const itemIndex = currentCart.findIndex((cartItem) => cartItem.product_variant_combination_id === itemId);

    if (itemIndex > -1) {
      currentCart[itemIndex].quantity = quantity;
      const jsonValue = JSON.stringify(currentCart);
      await AsyncStorage.setItem(GUEST_CART_KEY, jsonValue);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Error updating guest cart item quantity:', e);
    return false;
  }
};

export const removeGuestCartItem = async (itemId) => {
  try {
    let currentCart = await getGuestCart();
    currentCart = currentCart.filter((cartItem) => cartItem.product_variant_combination_id !== itemId);
    const jsonValue = JSON.stringify(currentCart);
    await AsyncStorage.setItem(GUEST_CART_KEY, jsonValue);
    return true;
  } catch (e) {
    console.error('Error removing guest cart item:', e);
    return false;
  }
};

export const clearGuestCart = async () => {
  try {
    await AsyncStorage.removeItem(GUEST_CART_KEY);
    return true;
  } catch (e) {
    console.error('Error clearing guest cart:', e);
    return false;
  }
};

const PREFERRED_STORE_KEY = 'preferred_store';

export const getPreferredStore = async () => {
  try {
    const raw = await AsyncStorage.getItem(PREFERRED_STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Error getting preferred store:', e);
    return null;
  }
};

export const setPreferredStore = async (sellerId, sellerName = '') => {
  try {
    if (!sellerId) {
      await AsyncStorage.removeItem(PREFERRED_STORE_KEY);
      return true;
    }
    await AsyncStorage.setItem(
      PREFERRED_STORE_KEY,
      JSON.stringify({
        sellerId,
        sellerName: sellerName || '',
        updatedAt: new Date().toISOString(),
      })
    );
    return true;
  } catch (e) {
    console.warn('Error setting preferred store:', e);
    return false;
  }
};

export const clearPreferredStore = async () => {
  try {
    await AsyncStorage.removeItem(PREFERRED_STORE_KEY);
    return true;
  } catch (e) {
    console.warn('Error clearing preferred store:', e);
    return false;
  }
};

