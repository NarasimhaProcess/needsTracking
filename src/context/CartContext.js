import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabase';
import { getCart, updateCartItem, removeCartItem } from '../services/supabase'; // Assuming these are in supabase.js

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const fetchUserAndCart = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        setRole(profile?.role);

        const cartData = await getCart(user.id);
        setCart(cartData);

        // Listen for real-time changes to the cart
        const subscription = supabase
          .channel('public:cart_items')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items' }, (payload) => {
            console.log('Cart change received!', payload);
            // Re-fetch cart to get the latest state
            getCart(user.id).then(setCart);
          })
          .subscribe();

        return () => {
          supabase.removeChannel(subscription);
        };
      } else {
        setCart(null); // No user, no cart
        setRole(null);
      }
      setLoading(false);
    };

    fetchUserAndCart();

    // Listen for auth state changes to re-fetch cart
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserAndCart(); // Re-fetch cart if user logs in
      } else {
        setCart(null); // Clear cart if user logs out
        setUser(null);
        setRole(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
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
    await removeCartItem(cartItemId);
    // Optimistically update UI
    const newCart = { ...cart };
    newCart.cart_items = newCart.cart_items.filter(item => item.id !== cartItemId);
    setCart(newCart);
  };

  const cartItemCount = cart?.cart_items?.length || 0;

  return (
    <CartContext.Provider value={{ cart, loading, user, role, cartItemCount, updateItemQuantity, removeItem, setCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
