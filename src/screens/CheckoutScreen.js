import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { Picker } from '@react-native-picker/picker';
import * as Clipboard from 'expo-clipboard';
import { supabase, getCart, getActiveQrCode } from '../services/supabase';
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

  // UPI QR Code State
  const [sellerQr, setSellerQr] = useState(null);
  const [sellerProfile, setSellerProfile] = useState(null);
  const [sellerUpiId, setSellerUpiId] = useState('');
  const [loadingSellerQr, setLoadingSellerQr] = useState(false);
  const [qrTab, setQrTab] = useState('dynamic'); // 'dynamic' (with bill amount) | 'profile' (uploaded QR)
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [customUpiId, setCustomUpiId] = useState('');
  const [showEditUpi, setShowEditUpi] = useState(false);

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

  // Fetch Seller QR Code & UPI Information whenever cart or paymentMethod changes
  const fetchSellerUpiInfo = useCallback(async () => {
    try {
      setLoadingSellerQr(true);
      // Determine primary seller ID from cart items
      let targetSellerId = customerId || null;
      if (!targetSellerId && cart?.cart_items && cart.cart_items.length > 0) {
        const prod = cart.cart_items[0]?.product_variant_combinations?.products;
        targetSellerId = prod?.user_id || prod?.customer_id || null;
      }
      if (!targetSellerId && profile?.role === 'seller' && currentUser?.id) {
        targetSellerId = currentUser.id;
      }

      if (targetSellerId) {
        const qrData = await getActiveQrCode(targetSellerId);
        if (qrData) {
          setSellerQr(qrData);
          if (qrData.name && qrData.name.includes('@')) {
            setSellerUpiId(qrData.name);
          }
        }

        const { data: profData } = await supabase
          .from('profiles')
          .select('id, full_name, mobile, email, media_urls')
          .eq('id', targetSellerId)
          .maybeSingle();

        if (profData) {
          setSellerProfile(profData);
          if (!sellerUpiId && profData.mobile) {
            setSellerUpiId(`${profData.mobile}@upi`);
          }
        }
      } else if (currentUser?.id) {
        const qrData = await getActiveQrCode(currentUser.id);
        if (qrData) {
          setSellerQr(qrData);
          if (qrData.name && qrData.name.includes('@')) {
            setSellerUpiId(qrData.name);
          }
        }
      }
    } catch (err) {
      console.warn('Error fetching seller UPI info:', err);
    } finally {
      setLoadingSellerQr(false);
    }
  }, [cart, customerId, profile, currentUser, sellerUpiId]);

  useEffect(() => {
    if (paymentMethod === 'upi') {
      fetchSellerUpiInfo();
    }
  }, [paymentMethod, fetchSellerUpiInfo]);

  // Derive active UPI parameters
  const activeUpiId =
    customUpiId.trim() ||
    sellerUpiId.trim() ||
    (sellerProfile?.mobile ? `${sellerProfile.mobile}@upi` : '') ||
    (profile?.mobile ? `${profile.mobile}@upi` : 'store@okaxis');

  const payeeName =
    sellerProfile?.full_name ||
    profile?.full_name ||
    'Store Merchant';

  const orderNote = `Bill #${(cart?.id || 'Order').toString().slice(-6)}`;

  // Official UPI Payment URI format (supported across all Indian UPI apps)
  const dynamicUpiUri = `upi://pay?pa=${encodeURIComponent(activeUpiId)}&pn=${encodeURIComponent(payeeName)}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(orderNote)}`;

  // Dynamic QR Code image incorporating exact order bill amount
  const dynamicQrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(dynamicUpiUri)}`;

  // Profile-uploaded QR image URL (from user_qr_codes table)
  const profileQrImageUrl = sellerQr?.qr_image_url || null;

  const handleCopyUpiId = async () => {
    try {
      if (Clipboard && Clipboard.setStringAsync) {
        await Clipboard.setStringAsync(activeUpiId);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(activeUpiId);
      }
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch (_) {}
  };

  const handleOpenDirectUpiPay = () => {
    Linking.openURL(dynamicUpiUri).catch(() => {
      showAlert(
        'UPI App Not Found',
        `Could not launch a UPI app automatically. Please scan the QR Code on screen using Google Pay, PhonePe, Paytm, or any UPI app to pay ₹${totalAmount.toFixed(2)}.`
      );
    });
  };

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
      <View style={styles.mainContainer}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backHeaderBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back"
          >
            <Icon name="arrow-left" size={16} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Checkout</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Close">
            <Icon name="close" size={20} color="#64748B" />
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
    <View style={styles.mainContainer}>
      {/* Header with Back button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backHeaderBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Back to Cart"
        >
          <Icon name="arrow-left" size={16} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Close">
          <Icon name="close" size={20} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Scrollable Container with Visible Scroll Indicator */}
      <ScrollView
        style={[
          styles.scrollView,
          Platform.OS === 'web' ? { overflowY: 'auto', WebkitOverflowScrolling: 'touch' } : null,
        ]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
      >
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

        <Text style={styles.sectionHeading}>Shipping Address</Text>
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
            <Text style={styles.sectionHeading}>Order Type</Text>
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
                <Text style={styles.sectionHeading}>Dine-in Details</Text>
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

        <Text style={styles.sectionHeading}>Payment Method</Text>
        <View style={styles.paymentMethodContainer}>
          <TouchableOpacity
            style={[styles.paymentButton, paymentMethod === 'upi' && styles.selectedPaymentButton]}
            onPress={() => setPaymentMethod('upi')}
            activeOpacity={0.8}
          >
            <Icon
              name="qrcode"
              size={22}
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
            activeOpacity={0.8}
          >
            <Icon
              name="money"
              size={22}
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

        {/* UPI PAYMENT CARD (Displayed when user selects UPI) */}
        {paymentMethod === 'upi' && (
          <View style={styles.upiCardContainer}>
            {/* Header */}
            <View style={styles.upiCardHeader}>
              <View style={styles.upiHeaderLeft}>
                <View style={styles.upiIconCircle}>
                  <Icon name="qrcode" size={18} color="#007AFF" />
                </View>
                <View>
                  <Text style={styles.upiCardTitle}>Instant UPI Payment</Text>
                  <Text style={styles.upiCardSubtitle}>
                    Pay to: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{payeeName}</Text>
                  </Text>
                </View>
              </View>
              <View style={styles.upiVerifiedBadge}>
                <Icon name="check-circle" size={12} color="#10B981" style={{ marginRight: 4 }} />
                <Text style={styles.upiVerifiedText}>Active</Text>
              </View>
            </View>

            {/* Bill Amount Banner */}
            <View style={styles.upiAmountPill}>
              <View>
                <Text style={styles.upiAmountLabel}>Order Bill Amount:</Text>
                <Text style={styles.upiAmountSub}>Pre-filled in QR code</Text>
              </View>
              <Text style={styles.upiAmountValue}>₹{totalAmount.toFixed(2)}</Text>
            </View>

            {/* Tab Switcher if Profile QR is uploaded */}
            {profileQrImageUrl && (
              <View style={styles.qrTabContainer}>
                <TouchableOpacity
                  style={[styles.qrTabButton, qrTab === 'dynamic' && styles.qrTabButtonActive]}
                  onPress={() => setQrTab('dynamic')}
                  activeOpacity={0.8}
                >
                  <Icon
                    name="bolt"
                    size={12}
                    color={qrTab === 'dynamic' ? '#007AFF' : '#64748B'}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[styles.qrTabText, qrTab === 'dynamic' && styles.qrTabTextActive]}>
                    QR with Bill Amount
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.qrTabButton, qrTab === 'profile' && styles.qrTabButtonActive]}
                  onPress={() => setQrTab('profile')}
                  activeOpacity={0.8}
                >
                  <Icon
                    name="image"
                    size={12}
                    color={qrTab === 'profile' ? '#007AFF' : '#64748B'}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[styles.qrTabText, qrTab === 'profile' && styles.qrTabTextActive]}>
                    Profile QR Code
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* QR Code Container */}
            <View style={styles.qrBox}>
              {loadingSellerQr ? (
                <View style={styles.qrLoadingBox}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.qrLoadingText}>Loading QR Code...</Text>
                </View>
              ) : (
                <>
                  <Image
                    source={{
                      uri:
                        qrTab === 'profile' && profileQrImageUrl
                          ? profileQrImageUrl
                          : dynamicQrImageUrl,
                    }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                  <View style={styles.qrAmountOverlay}>
                    <Text style={styles.qrAmountOverlayText}>
                      Exact Bill: ₹{totalAmount.toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
            </View>

            <Text style={styles.qrScanInstruction}>
              {qrTab === 'profile'
                ? `Scan with GPay / PhonePe / Paytm and enter ₹${totalAmount.toFixed(2)}.`
                : `✨ Amount ₹${totalAmount.toFixed(2)} is automatically pre-filled when scanned!`}
            </Text>

            {/* Direct 1-Tap Pay via UPI App (GPay / PhonePe / Paytm) */}
            <TouchableOpacity
              style={styles.directUpiPayButton}
              onPress={handleOpenDirectUpiPay}
              activeOpacity={0.85}
            >
              <Icon name="mobile-phone" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.directUpiPayButtonText}>
                Pay ₹{totalAmount.toFixed(2)} in UPI App
              </Text>
            </TouchableOpacity>

            {/* Payee UPI ID & 1-Tap Copy */}
            <View style={styles.upiIdRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.upiIdLabel}>Merchant UPI ID / VPA:</Text>
                <Text style={styles.upiIdText} numberOfLines={1}>
                  {activeUpiId}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.copyUpiBtn, copiedUpi && styles.copyUpiBtnCopied]}
                onPress={handleCopyUpiId}
                activeOpacity={0.8}
              >
                <Icon
                  name={copiedUpi ? 'check' : 'clone'}
                  size={12}
                  color={copiedUpi ? '#FFFFFF' : '#007AFF'}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.copyUpiBtnText, copiedUpi && { color: '#FFFFFF' }]}>
                  {copiedUpi ? 'Copied!' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Expandable Custom UPI ID */}
            <TouchableOpacity
              style={styles.toggleEditUpiBtn}
              onPress={() => setShowEditUpi(!showEditUpi)}
            >
              <Text style={styles.toggleEditUpiText}>
                {showEditUpi ? 'Hide custom UPI ID' : 'Change or customize UPI ID'}
              </Text>
              <Icon
                name={showEditUpi ? 'chevron-up' : 'chevron-down'}
                size={11}
                color="#007AFF"
                style={{ marginLeft: 5 }}
              />
            </TouchableOpacity>

            {showEditUpi && (
              <View style={styles.editUpiBox}>
                <Text style={styles.editUpiLabel}>Custom Payee UPI ID:</Text>
                <TextInput
                  style={styles.editUpiInput}
                  placeholder="e.g. yourstore@okaxis, 9876543210@paytm"
                  placeholderTextColor="#94a3b8"
                  value={customUpiId}
                  onChangeText={setCustomUpiId}
                  autoCapitalize="none"
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Docked Action Footer Bar (Visible on Web & Mobile, Never disappears) */}
      <View style={styles.dockedFooterBar}>
        <TouchableOpacity
          style={styles.footerBackBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Icon name="arrow-left" size={14} color="#0F172A" style={{ marginRight: 6 }} />
          <Text style={styles.footerBackBtnText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.footerTotalBox}>
          <Text style={styles.footerTotalLabel}>Total</Text>
          <Text style={styles.footerTotalAmount}>₹{totalAmount.toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.footerPlaceOrderBtn, loading && styles.placeOrderButtonDisabled]}
          onPress={handlePlaceOrder}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Icon
                name={paymentMethod === 'upi' ? 'qrcode' : 'check-circle'}
                size={15}
                color="#FFFFFF"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.footerPlaceOrderBtnText}>
                {paymentMethod === 'upi' ? 'Pay with UPI' : 'Place Order'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    height: Platform.OS === 'web' ? '100%' : undefined,
    minHeight: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backHeaderBtn: {
    padding: 8,
    marginRight: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40,
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
    marginBottom: 16,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryTitle: {
    fontSize: 13,
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
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 10,
    marginTop: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14,
    color: '#1E293B',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    marginBottom: 14,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  paymentMethodContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  paymentButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
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
    fontWeight: '700',
  },

  /* UPI Card Styles */
  upiCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  upiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  upiHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  upiIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  upiCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  upiCardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  upiVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  upiVerifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  upiAmountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  upiAmountLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  upiAmountSub: {
    fontSize: 11,
    color: '#0284C7',
    marginTop: 1,
  },
  upiAmountValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0284C7',
  },
  qrTabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  qrTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrTabButtonActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#007AFF',
  },
  qrTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  qrTabTextActive: {
    color: '#007AFF',
    fontWeight: '700',
  },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12,
  },
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: 8,
  },
  qrLoadingBox: {
    height: 220,
    width: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLoadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
  },
  qrAmountOverlay: {
    marginTop: 10,
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  qrAmountOverlayText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  qrScanInstruction: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  directUpiPayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 13,
    marginBottom: 14,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  directUpiPayButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  upiIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  upiIdLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  upiIdText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  copyUpiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 10,
  },
  copyUpiBtnCopied: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  copyUpiBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#007AFF',
  },
  toggleEditUpiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  toggleEditUpiText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  editUpiBox: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  editUpiLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  editUpiInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
  },

  /* Docked Action Footer Bar */
  dockedFooterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 6,
  },
  footerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  footerBackBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  footerTotalBox: {
    alignItems: 'center',
  },
  footerTotalLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  footerTotalAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  footerPlaceOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  placeOrderButtonDisabled: {
    opacity: 0.7,
  },
  footerPlaceOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Empty Cart */
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