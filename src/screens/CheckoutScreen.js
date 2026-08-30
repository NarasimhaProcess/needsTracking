import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { Picker } from '@react-native-picker/picker';
import { supabase, getCart } from '../services/supabase';
import { getGuestCart, clearGuestCart } from '../services/localStorageService';
import { schedulePushNotification } from '../services/notificationService';
import { showAlert } from '../utils/alertUtils';

const CheckoutScreen = ({ navigation, route }) => {
  const { cart: initialCart, customerId } = route?.params || {};
  const [cart, setCart] = useState(initialCart || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('India');
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [profile, setProfile] = useState(null);
  const [orderType, setOrderType] = useState('Dine-in');
  const [tableNo, setTableNo] = useState('Main counter');

  const normalizeGuestCart = (guestCartData) => ({
    cart_items: (guestCartData || []).map((item) => {
      const existingMedia = item.product_variant_combinations?.products?.product_media;
      const mediaUrl = item.image_url || (Array.isArray(existingMedia) && existingMedia[0]?.media_url) || null;
      return {
        id: item.product_variant_combination_id || item.id,
        quantity: item.quantity || 1,
        product_variant_combinations: {
          id: item.product_variant_combination_id || item.id,
          combination_string: item.combination_string || 'Default',
          price: item.price || 0,
          products: {
            id: item.product_id || item.product_variant_combinations?.products?.id,
            product_name: item.product_name || item.product_variant_combinations?.products?.product_name || 'Product',
            customer_id: item.customer_id || item.product_variant_combinations?.products?.customer_id || null,
            user_id: item.user_id || item.product_variant_combinations?.products?.user_id || null,
            product_media: existingMedia && existingMedia.length > 0
              ? existingMedia
              : (mediaUrl ? [{ media_url: mediaUrl, media_type: 'image' }] : []),
          },
        },
      };
    }),
  });

  const refreshCartAndUser = useCallback(async () => {
    try {
      const { data: { user } = {} } = await supabase.auth.getUser();
      setCurrentUser(user || null);

      if (user) {
        setName((prev) => prev || user.user_metadata?.full_name || user.user_metadata?.name || '');
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profileData) {
          setProfile(profileData);
          setAddress((prev) => prev || profileData.address_line_1 || '');
          setCity((prev) => prev || profileData.city || '');
          setPostalCode((prev) => prev || profileData.zip_code || '');
        }

        const userCart = await getCart(user.id);
        if (userCart && userCart.cart_items && userCart.cart_items.length > 0) {
          setCart(userCart);
        } else if (initialCart?.cart_items && initialCart.cart_items.length > 0) {
          setCart(initialCart);
        }
      } else {
        if (!initialCart || !initialCart.cart_items || initialCart.cart_items.length === 0) {
          const guestCartData = await getGuestCart();
          setCart(normalizeGuestCart(guestCartData));
        }
      }
    } catch (err) {
      console.warn('Error in refreshCartAndUser:', err);
    }
  }, [initialCart]);

  useEffect(() => {
    refreshCartAndUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        refreshCartAndUser();
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe?.();
    };
  }, [refreshCartAndUser]);

  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'India',
  });

  useEffect(() => {
    setShippingAddress({
      name,
      address,
      city,
      postalCode,
      country,
    });
  }, [name, address, city, postalCode, country]);

  const cartItems = cart?.cart_items || [];
  const totalAmount = cartItems.reduce(
    (total, item) =>
      total +
      (Number(item?.product_variant_combinations?.price || item?.price || 0) *
        Number(item?.quantity || 1)),
    0
  );

  const tableOptions = ['Main counter', ...Array.from({ length: 10 }, (_, i) => (i + 1).toString())];

  const handlePlaceOrder = async () => {
    if (!paymentMethod) {
      showAlert('Payment Method', 'Please select a payment method.');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const orderUserId = user?.id;

    if (!orderUserId) {
      setLoading(false);
      showAlert(
        'Sign In Required',
        'Please sign in or create an account to place your order.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In / Sign Up',
            onPress: () =>
              navigation.navigate('BuyerLogin', {
                redirectTo: 'Checkout',
                redirectParams: { cart, customerId },
              }),
          },
        ]
      );
      return;
    }

    if (!name.trim()) {
      setLoading(false);
      showAlert('Shipping Details', 'Please enter your full name.');
      return;
    }

    if (!address.trim()) {
      setLoading(false);
      showAlert('Shipping Details', 'Please enter your delivery address.');
      return;
    }

    const orderStatus = paymentMethod === 'cod' ? 'processing' : 'pending_payment';
    const isShopOrder = profile && profile.role === 'seller';

    // Group cart items by seller (product vendor user_id)
    const itemsBySeller = {};
    for (const item of cartItems) {
      const prod = item.product_variant_combinations?.products;
      const sellerId = prod?.user_id || prod?.customer_id || 'store';
      if (!itemsBySeller[sellerId]) {
        itemsBySeller[sellerId] = {
          sellerId: sellerId === 'store' ? null : sellerId,
          items: [],
          subtotal: 0,
        };
      }
      const itemPrice = Number(item.product_variant_combinations?.price || 0);
      const itemQty = Number(item.quantity || 1);
      itemsBySeller[sellerId].items.push(item);
      itemsBySeller[sellerId].subtotal += itemPrice * itemQty;
    }

    const sellerKeys = Object.keys(itemsBySeller);
    if (sellerKeys.length === 0) {
      setLoading(false);
      showAlert('Empty Cart', 'No items in cart to checkout.');
      return;
    }

    const createdOrders = [];

    try {
      for (const sellerKey of sellerKeys) {
        const sellerGroup = itemsBySeller[sellerKey];
        const orderPayload = {
          user_id: orderUserId,
          shipping_address: shippingAddress,
          total_amount: sellerGroup.subtotal,
          status: orderStatus,
          payment_method: paymentMethod,
          order_type: isShopOrder ? 'shop-order' : 'delivery',
        };

        if (isShopOrder) {
          orderPayload.table_no = orderType === 'Dine-in' ? tableNo : 'Parcel';
        }

        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert(orderPayload)
          .select()
          .single();

        if (orderError) {
          console.error('Error creating sub-order:', orderError.message);
          throw orderError;
        }

        const orderItemsPayload = sellerGroup.items.map((item) => ({
          order_id: order.id,
          product_variant_combination_id: item.product_variant_combinations.id,
          quantity: item.quantity,
          price: item.product_variant_combinations.price,
        }));

        const { error: orderItemsError } = await supabase
          .from('order_items')
          .insert(orderItemsPayload);

        if (orderItemsError) {
          console.error('Error creating order items:', orderItemsError.message);
          throw orderItemsError;
        }

        createdOrders.push(order);

        // Trigger Delivery Manager Assignment for Delivery Orders
        if (!isShopOrder) {
          try {
            await supabase.functions.invoke('assign-delivery-manager', {
              body: { order: { id: order.id } },
            });
          } catch (assignErr) {
            console.warn('Assign delivery manager notice:', assignErr);
          }
        }

        // Send local confirmation notification
        try {
          const notificationTitle = isShopOrder
            ? (orderType === 'Dine-in' ? `Order Placed for Table #${tableNo}` : 'Parcel Order Placed')
            : '🎉 Order Placed Successfully!';
          const notificationBody = `Order #${order.order_number || order.id.substring(0, 8)} for ₹${sellerGroup.subtotal.toFixed(2)} is confirmed.`;

          await schedulePushNotification(
            notificationTitle,
            notificationBody,
            { orderId: order.id }
          );
        } catch (notifErr) {
          console.warn('Push notification notice:', notifErr);
        }
      }

      // Clear the user's cart in database if cart.id is present
      if (cart?.id) {
        await supabase.from('cart_items').delete().eq('cart_id', cart.id);
      }
      // Also clear local guest cart
      await clearGuestCart();

      setLoading(false);

      if (createdOrders.length > 1) {
        showAlert(
          '🎉 Multi-Store Orders Placed!',
          `Your cart contained products from ${createdOrders.length} different sellers. ${createdOrders.length} separate orders have been created so each store can dispatch independently.`,
          [
            {
              text: 'View My Orders',
              onPress: () => navigation.navigate('OrderList'),
            },
          ]
        );
      } else {
        showAlert(
          '🎉 Order Placed!',
          'Your order has been placed successfully.',
          [
            {
              text: 'View My Orders',
              onPress: () => navigation.navigate('OrderList'),
            },
          ]
        );
      }
    } catch (err) {
      setLoading(false);
      showAlert('Checkout Error', err.message || 'Failed to place order. Please try again.');
    }
  };

  if (!cartItems || cartItems.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: 'white' }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Checkout</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyCartContainer}>
          <Icon name="shopping-cart" size={64} color="#cbd5e1" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyCartTitle}>Your cart is empty</Text>
          <Text style={styles.emptyCartSubtitle}>
            Add items from the catalog to proceed to checkout.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => navigation.navigate('Catalog')}
          >
            <Text style={styles.browseButtonText}>Browse Catalog</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Checkout</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.container}>
        {/* Guest Sign-In Notice Banner */}
        {!currentUser && (
          <View style={styles.guestBanner}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.guestBannerTitle}>🛍️ Sign in to complete order</Text>
              <Text style={styles.guestBannerSubtitle}>
                Log in or create an account to save your address and track orders.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.guestSignInButton}
              onPress={() =>
                navigation.navigate('BuyerLogin', {
                  redirectTo: 'Checkout',
                  redirectParams: { cart, customerId },
                })
              }
            >
              <Text style={styles.guestSignInButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Order Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          <Text style={styles.summaryItems}>
            {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} in cart
          </Text>
          <Text style={styles.summaryTotal}>Total: ₹{totalAmount.toFixed(2)}</Text>
        </View>

        <Text style={styles.title}>Shipping Address</Text>
        <TextInput
          style={styles.input}
          placeholder="Full Name *"
          placeholderTextColor="#94a3b8"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Address / Street / Landmark *"
          placeholderTextColor="#94a3b8"
          value={address}
          onChangeText={setAddress}
        />
        <TextInput
          style={styles.input}
          placeholder="City *"
          placeholderTextColor="#94a3b8"
          value={city}
          onChangeText={setCity}
        />
        <TextInput
          style={styles.input}
          placeholder="Postal Code"
          placeholderTextColor="#94a3b8"
          value={postalCode}
          onChangeText={setPostalCode}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Country"
          placeholderTextColor="#94a3b8"
          value={country}
          onChangeText={setCountry}
        />

        {profile && profile.role === 'seller' && (
          <>
            <Text style={styles.title}>Order Type</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={orderType}
                onValueChange={(itemValue) => setOrderType(itemValue)}
                style={styles.picker}
              >
                <Picker.Item label="Dine-in" value="Dine-in" />
                <Picker.Item label="Parcel" value="Parcel" />
              </Picker>
            </View>

            {orderType === 'Dine-in' && (
              <>
                <Text style={styles.title}>Dine-in Details</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={tableNo}
                    onValueChange={(itemValue) => setTableNo(itemValue)}
                    style={styles.picker}
                  >
                    {tableOptions.map((option) => (
                      <Picker.Item key={option} label={option} value={option} />
                    ))}
                  </Picker>
                </View>
              </>
            )}
          </>
        )}

        <Text style={styles.title}>Payment Method</Text>
        <View style={styles.paymentMethodContainer}>
          <TouchableOpacity
            style={[styles.paymentButton, paymentMethod === 'upi' && styles.selectedPaymentButton]}
            onPress={() => setPaymentMethod('upi')}
          >
            <Icon
              name="qrcode"
              size={20}
              color={paymentMethod === 'upi' ? '#FFFFFF' : '#007AFF'}
              style={{ marginBottom: 6 }}
            />
            <Text
              style={[
                styles.paymentButtonText,
                paymentMethod === 'upi' && styles.selectedPaymentButtonText,
              ]}
            >
              Pay with UPI
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentButton, paymentMethod === 'cod' && styles.selectedPaymentButton]}
            onPress={() => setPaymentMethod('cod')}
          >
            <Icon
              name="money"
              size={20}
              color={paymentMethod === 'cod' ? '#FFFFFF' : '#007AFF'}
              style={{ marginBottom: 6 }}
            />
            <Text
              style={[
                styles.paymentButtonText,
                paymentMethod === 'cod' && styles.selectedPaymentButtonText,
              ]}
            >
              Cash on Delivery
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.placeOrderButton, loading && styles.placeOrderButtonDisabled]}
          onPress={handlePlaceOrder}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.placeOrderButtonText}>
              Place Order • ₹{totalAmount.toFixed(2)}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    flex: 1,
    padding: 20,
  },
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  guestBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 3,
  },
  guestBannerSubtitle: {
    fontSize: 12,
    color: '#3B82F6',
    lineHeight: 16,
  },
  guestSignInButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  guestSignInButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryItems: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },
  summaryTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 12,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
    fontSize: 15,
    color: '#1E293B',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    marginBottom: 15,
  },
  picker: {
    height: 50,
    width: '100%',
  },
  paymentMethodContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  paymentButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  selectedPaymentButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  paymentButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  selectedPaymentButtonText: {
    color: '#FFFFFF',
  },
  buttonContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: 'white',
  },
  placeOrderButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeOrderButtonDisabled: {
    opacity: 0.7,
  },
  placeOrderButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  emptyCartContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyCartTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  emptyCartSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  browseButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default CheckoutScreen;