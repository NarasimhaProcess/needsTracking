import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabase';
import { Alert } from 'react-native';
import { getCart, updateCartItem, removeCartItem } from '../services/supabase'; // Assuming these are in supabase.js

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchUserAndCart = async () => {
      try {
        setLoading(true);
        const { data: { user } = {} } = await supabase.auth.getUser();
        if (!isMounted) return;
        setUser(user || null);

        if (user) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .maybeSingle();
            if (isMounted) setRole(profile?.role || null);
          } catch (profileErr) {
            console.warn('Profile fetch error in CartContext:', profileErr);
          }

          try {
            const cartData = await getCart(user.id);
            if (isMounted) setCart(cartData);
          } catch (cartErr) {
            console.warn('Cart fetch error in CartContext:', cartErr);
          }

          // Listen for real-time changes to the cart
          try {
            const subscription = supabase
              .channel('public:cart_items')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items' }, (payload) => {
                console.log('Cart change received!', payload);
                if (isMounted) {
                  getCart(user.id).then(newCart => {
                    if (isMounted) setCart(newCart);
                  }).catch(console.warn);
                }
              })
              .subscribe();

            return () => {
              supabase.removeChannel(subscription);
            };
          } catch (chanErr) {
            console.warn('Channel subscription error in CartContext:', chanErr);
          }
        } else {
          if (isMounted) {
            setCart(null);
            setRole(null);
          }
        }
      } catch (err) {
        console.warn('fetchUserAndCart error:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUserAndCart();

    // Listen for auth state changes to re-fetch cart
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        if (isMounted) {
          setCart(null);
          setUser(null);
          setRole(null);
          setLoading(false);
        }
      } else if (session?.user) {
        fetchUserAndCart();
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  // Functions to interact with the cart (these will call supabase.js functions)
  const updateItemQuantity = async (cartItemId, quantity) => {
    if (!user) return; // Should not happen if cart is only for authenticated users
    const updated = await updateCartItem(cartItemId, quantity);
    if (updated) {
      // Optimistically update UI
      const newCart = { ...cart };
      const itemIndex = newCart.cart_items.findIndex(item => item.id === cartItemId);
      if (itemIndex > -1) {
        newCart.cart_items[itemIndex].quantity = quantity;
        setCart(newCart);
      }
    }
  };

  const removeItem = async (cartItemId) => {
    if (!user) return; // Should not happen
    Alert.alert(
      "Remove Item",
      "Are you sure you want to remove this item from your cart?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Remove",
          onPress: async () => {
            await removeCartItem(cartItemId);
            // Optimistically update UI
            const newCart = { ...cart };
            newCart.cart_items = newCart.cart_items.filter(item => item.id !== cartItemId);
            setCart(newCart);
          }
        }
      ],
      { cancelable: true }
    );
  };

  const cartItemCount = cart?.cart_items?.reduce((total, item) => total + item.quantity, 0) || 0;

  return (
    <CartContext.Provider value={{ cart, loading, user, role, cartItemCount, updateItemQuantity, removeItem, setCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
