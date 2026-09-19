import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, SectionList, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Linking, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getOrders, deleteOrder, updateOrderPaymentStatus, supabase } from '../services/supabase';
import { printReceipt, extractOrderNumbers, announceOrderPrint } from '../services/printerService';
import { getGuestOrderIds } from '../services/localStorageService';
import Icon from 'react-native-vector-icons/FontAwesome';
import UniversalDateTimePicker from '../components/UniversalDateTimePicker';
import { showAlert } from '../utils/alertUtils';
import StoreNavigationFooter from '../components/StoreNavigationFooter';
import { useCart } from '../context/CartContext';

const OrderListScreen = ({ navigation, route }) => {
  const { sellerId, sellerName, customerId } = route?.params || {};
  const { role: contextRole } = useCart();
  const [orders, setOrders] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(contextRole || null);
  const [sectionedOrders, setSectionedOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (contextRole) {
      setUserRole(contextRole);
    }
  }, [contextRole]);

  const canManageOrders = userRole === 'seller' || userRole === 'admin' || userRole === 'superadmin';

  const fetchOrders = useCallback(async (isSilent = false) => {
    // Only show full loading spinner on initial cold fetch when no orders are loaded yet
    if (!isSilent && orders.length === 0) {
      setLoading(true);
    } else if (isSilent) {
      setIsSyncing(true);
    }

    try {
      // 1. Instant check from local session cache (0 network delay)
      let user = null;
      const { data: { session } = {} } = await supabase.auth.getSession();
      if (session?.user) {
        user = session.user;
      } else {
        const { data: { user: authUser } = {} } = await supabase.auth.getUser();
        user = authUser;
      }

      setCurrentUser(user || null);

      let fetchedOrders = [];

      if (!user) {
        // Fallback for unauthenticated guest checkouts (e.g. dine-in QR orders)
        const guestIds = await getGuestOrderIds();
        if (guestIds && guestIds.length > 0) {
          const selectQuery = `
            *,
            order_items (
              id,
              quantity,
              price,
              product_variant_combination_id,
              product_variant_combinations (
                id,
                combination_string,
                price,
                products (
                  id,
                  product_name,
                  user_id,
                  customer_id,
                  product_media (media_url, media_type)
                )
              )
            )
          `;
          const { data: guestOrders, error: guestErr } = await supabase
            .from('orders')
            .select(selectQuery)
            .in('id', guestIds)
            .order('created_at', { ascending: false });

          if (!guestErr && Array.isArray(guestOrders)) {
            fetchedOrders = guestOrders;
          }
        }

        if (fetchedOrders.length === 0) {
          setOrders([]);
          return;
        }
      } else {
        // Authenticated user
        let effectiveRole = contextRole || userRole;
        if (!effectiveRole) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          effectiveRole = prof?.role || 'buyer';
          setUserRole(effectiveRole);
        }

        const isSeller = effectiveRole === 'seller';
        const isAdmin = effectiveRole === 'admin' || effectiveRole === 'superadmin';

        if (isSeller) {
          // Seller views all orders received by their store
          fetchedOrders = await getOrders(user.id, { role: 'seller', isSeller: true });
        } else if (isAdmin) {
          // Admin views store orders or all orders
          const targetSeller = route?.params?.sellerId;
          if (targetSeller) {
            fetchedOrders = await getOrders(targetSeller, { role: 'seller', isSeller: true });
          } else {
            fetchedOrders = await getOrders(user.id, { role: 'admin' });
          }
        } else {
          // Buyer views strictly their own orders (never seller's store orders)
          fetchedOrders = await getOrders(user.id, { role: 'buyer', isSeller: false });
        }
      }

      if (fetchedOrders && Array.isArray(fetchedOrders)) {
        setOrders(fetchedOrders);
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.warn('Error in fetchOrders:', err);
      if (orders.length === 0) {
        setOrders([]);
      }
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [contextRole, userRole, route?.params, orders.length]);

  // Immediately load fresh orders on screen focus & start auto-reload interval
  useFocusEffect(
    useCallback(() => {
      fetchOrders(orders.length > 0);

      // Auto-reload orders every 15 seconds in the background
      const intervalId = setInterval(() => {
        fetchOrders(true);
      }, 15000);

      return () => {
        clearInterval(intervalId);
      };
    }, [fetchOrders, orders.length])
  );

  // Realtime Supabase live update listener on orders table
  useEffect(() => {
    const ordersChannel = supabase
      .channel('orders-realtime-list-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('[OrderListScreen] Realtime order event received:', payload.eventType);
          fetchOrders(true);
        }
      )
      .subscribe();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setCurrentUser(session.user);
        fetchOrders(true);
      } else {
        setCurrentUser(null);
        setOrders([]);
      }
    });

    return () => {
      supabase.removeChannel(ordersChannel);
      authListener?.subscription?.unsubscribe?.();
    };
  }, [fetchOrders]);

  useEffect(() => {
    let filtered = orders;

    if (searchQuery) {
      filtered = filtered.filter(order => {
        const { orderNumber, dayOrderNo, paymentReference } = extractOrderNumbers(order);
        const query = searchQuery.toLowerCase().trim();
        return (
          (orderNumber && orderNumber.toLowerCase().includes(query)) ||
          (dayOrderNo && dayOrderNo.toLowerCase().includes(query)) ||
          (paymentReference && paymentReference.toLowerCase().includes(query)) ||
          (order.id && order.id.toLowerCase().includes(query)) ||
          (order.customer_name && order.customer_name.toLowerCase().includes(query)) ||
          (order.table_no && order.table_no.toLowerCase().includes(query))
        );
      });
    }

    if (selectedStatus) {
      filtered = filtered.filter(order => order.status === selectedStatus);
    }

    if (selectedDate) {
      const selDate = new Date(selectedDate);
      const selYear = selDate.getFullYear();
      const selMonth = selDate.getMonth();
      const selDay = selDate.getDate();

      filtered = filtered.filter(order => {
        const dateStr = order.created_at || order.order_date || order.date;
        if (!dateStr) return false;
        const oDate = new Date(dateStr);
        if (isNaN(oDate.getTime())) return false;
        return (
          oDate.getFullYear() === selYear &&
          oDate.getMonth() === selMonth &&
          oDate.getDate() === selDay
        );
      });
    }

    const shopOrders = [];
    const onlineOrders = [];

    filtered.forEach(order => {
      if (order.order_type === 'shop-order') {
        shopOrders.push(order);
      } else {
        onlineOrders.push(order);
      }
    });

    const sections = [];
    if (shopOrders.length > 0) {
      sections.push({ title: 'Shop Orders', data: shopOrders });
    }
    if (onlineOrders.length > 0) {
      sections.push({ title: 'Online Orders', data: onlineOrders });
    }
    
    setSectionedOrders(sections);

  }, [searchQuery, selectedStatus, selectedDate, orders]);

  useEffect(() => {
    const total = sectionedOrders.reduce((sum, section) => {
      return sum + section.data.reduce((sectionSum, order) => sectionSum + order.total_amount, 0);
    }, 0);
    setTotalAmount(total);
  }, [sectionedOrders]);

  const showDatePicker = () => {
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleConfirmDate = (date) => {
    setSelectedDate(date);
    hideDatePicker();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOrders(true);
    setRefreshing(false);
  };

  const handleTogglePaymentStatus = async (orderId, currentPaidStatus, payCode) => {
    if (!canManageOrders) {
      showAlert('Access Denied', 'Only store managers and sellers can verify payments.');
      return;
    }
    const nextStatus = currentPaidStatus ? 'pending' : 'paid';
    const codeDisplay = payCode ? ` (Code: ${payCode})` : '';

    showAlert(
      'Verify Payment',
      `Do you want to mark Order${codeDisplay} payment as "${nextStatus === 'paid' ? 'DONE (PAID)' : 'PENDING'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextStatus === 'paid' ? 'Mark Paid' : 'Mark Pending',
          onPress: async () => {
            // Optimistically update in local state for instant UI response
            setOrders(prev =>
              prev.map(o => (o.id === orderId ? { ...o, payment_status: nextStatus } : o))
            );
            const updated = await updateOrderPaymentStatus(orderId, nextStatus);
            if (!updated) {
              fetchOrders(true);
              showAlert('Error', 'Failed to update payment status.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteOrder = async (orderId) => {
    if (!canManageOrders) {
      showAlert('Access Denied', 'Buyers are not permitted to delete orders.');
      return;
    }
    showAlert(
      'Delete Order',
      'Are you sure you want to delete this order? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteOrder(orderId);
            if (success) {
              showAlert('Success', 'Order deleted successfully.');
              fetchOrders();
            } else {
              showAlert('Error', 'Failed to delete order.');
            }
          },
        },
      ]
    );
  };

  const openMapsDirections = (shippingAddress) => {
    if (!shippingAddress) {
      showAlert('No Address', 'This order has no delivery address.');
      return;
    }
    const parts = [
      shippingAddress.address,
      shippingAddress.city,
      shippingAddress.postalCode,
      shippingAddress.country,
    ].filter(Boolean);
    if (parts.length === 0) {
      showAlert('No Address', 'This order has no delivery address.');
      return;
    }
    const query = encodeURIComponent(parts.join(', '));
    const url = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
    Linking.openURL(url).catch(() => {
      showAlert('Error', 'Could not open maps. Please check if Google Maps is installed.');
    });
  };

  const renderOrderItem = ({ item }) => {
    const { orderNumber, dayOrderNo, paymentReference } = extractOrderNumbers(item);
    const isPaymentDone = (item.payment_status === 'paid' || item.status === 'completed' || item.status === 'paid');

    return (
      <TouchableOpacity
        style={styles.orderItem}
        onPress={() => navigation.navigate('OrderDetail', { orderId: item.id, sellerId, sellerName, customerId })}
        activeOpacity={0.88}
      >
        <View style={styles.orderHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderId}>Order No: {orderNumber}</Text>
            {dayOrderNo ? (
              <Text style={styles.dayOrderId}>Day Order No: #{dayOrderNo}</Text>
            ) : null}
          </View>
          <Text style={styles.orderStatus}>Status: {item.status}</Text>
        </View>

        {/* 6-Digit Payment Code & Verification Status Pill */}
        <View style={styles.paymentMetaRow}>
          {paymentReference ? (
            <View style={styles.payCodeBadge}>
              <Icon name="tag" size={12} color="#4F46E5" style={{ marginRight: 5 }} />
              <Text style={styles.payCodeLabel}>6-Digit Pay Code:</Text>
              <Text style={styles.payCodeValue}>{paymentReference}</Text>
            </View>
          ) : null}

          <View style={[styles.paymentStatusBadge, isPaymentDone ? styles.paymentStatusPaid : styles.paymentStatusPending]}>
            <Icon
              name={isPaymentDone ? "check-circle" : "clock-o"}
              size={11}
              color={isPaymentDone ? "#16A34A" : "#D97706"}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.paymentStatusText, isPaymentDone ? styles.textPaid : styles.textPending]}>
              {isPaymentDone ? 'Payment Done' : 'Payment Pending'}
            </Text>
          </View>
        </View>

        <View style={styles.orderPriceRow}>
          <Text style={styles.orderAmount}>Total: ₹{Number(item.total_amount || 0).toFixed(2)}</Text>
          {item.payment_method ? (
            <Text style={styles.paymentMethodText}>
              • {String(item.payment_method).toUpperCase()}
            </Text>
          ) : null}
        </View>

        <Text style={styles.orderDate}>
          Date: {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {item.table_no && <Text style={styles.orderDate}>Table No: {item.table_no}</Text>}
        {item.customer_name ? (
          <Text style={styles.orderCustomer}>
            Customer: {item.customer_name} {item.customer_mobile ? `• ${item.customer_mobile}` : ''}
          </Text>
        ) : null}

        <View style={styles.actionButtons}>
          {/* Quick Payment Verification Toggle for Sellers and Admins */}
          {canManageOrders && (
            <TouchableOpacity
              onPress={() => handleTogglePaymentStatus(item.id, isPaymentDone, paymentReference)}
              style={[
                styles.quickPayActionBtn,
                isPaymentDone ? styles.quickPayBtnDone : styles.quickPayBtnVerify
              ]}
              accessibilityLabel={isPaymentDone ? "Mark payment pending" : "Verify payment done"}
              activeOpacity={0.8}
            >
              <Icon
                name={isPaymentDone ? "undo" : "check"}
                size={12}
                color={isPaymentDone ? "#64748B" : "#16A34A"}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.quickPayActionBtnText, isPaymentDone ? styles.quickPayTextDone : styles.quickPayTextVerify]}>
                {isPaymentDone ? 'Mark Pending' : 'Verify Paid'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            onPress={() => announceOrderPrint(item)}
            style={{ marginRight: 8 }}
            accessibilityLabel="Announce Order Aloud"
          >
            <Icon name="volume-up" size={20} color="#007AFF" style={styles.actionIcon} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => printReceipt(item)}
            style={{ marginRight: 8 }}
            accessibilityLabel="Print Receipt"
          >
            <Icon name="print" size={20} color="#10B981" style={styles.actionIcon} />
          </TouchableOpacity>
          {/* Edit and Delete are strictly restricted to Sellers and Admins */}
          {canManageOrders && (
            <>
              <TouchableOpacity
                onPress={() => navigation.navigate('OrderEdit', { orderId: item.id, sellerId, sellerName, customerId })}
                accessibilityLabel="Edit Order Status"
                style={{ marginRight: 8 }}
              >
                <Icon name="edit" size={20} color="#007AFF" style={styles.actionIcon} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDeleteOrder(item.id)}
                accessibilityLabel="Delete Order"
              >
                <Icon name="trash" size={20} color="#FF3B30" style={styles.actionIcon} />
              </TouchableOpacity>
            </>
          )}
          {item.order_type !== 'shop-order' && item.shipping_address && (
            <TouchableOpacity
              onPress={() => openMapsDirections(item.shipping_address)}
              style={{ marginLeft: 8 }}
              accessibilityLabel="Get Directions"
            >
              <Icon name="map-marker" size={20} color="#FF9500" style={styles.actionIcon} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && orders.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const isGuest = !currentUser && orders.length === 0;

  return (
    <View
      style={[
        styles.mainContainer,
        Platform.OS === 'web' && { height: '100%', maxHeight: '100vh', minHeight: 0, overflow: 'hidden' },
      ]}
    >
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
          <Text style={styles.headerTitle}>{userRole === 'seller' ? 'Store Orders' : 'Your Orders'}</Text>
          {isSyncing && (
            <ActivityIndicator size="small" color="#007AFF" style={{ marginLeft: 8 }} />
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleRefresh}
            style={styles.refreshHeaderBtn}
            disabled={refreshing || isSyncing}
            accessibilityLabel="Refresh Orders"
          >
            {refreshing || isSyncing ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Icon name="refresh" size={19} color="#007AFF" />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Invoice')} style={{ marginRight: 15 }}>
            <Icon name="file-text" size={22} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else if (sellerId) {
                navigation.navigate('Catalog', { sellerId, sellerName, customerId });
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

      {isGuest ? (
        <View style={styles.notLoggedInContainer}>
          <View style={styles.notLoggedInIconBox}>
            <Icon name="shopping-bag" size={48} color="#007AFF" />
          </View>
          <Text style={styles.notLoggedInTitle}>Sign In to View Orders</Text>
          <Text style={styles.notLoggedInSubtitle}>
            Please sign in to your buyer account to view your active and previous orders.
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => navigation.navigate('BuyerLogin', { redirectTo: 'OrderList' })}
          >
            <Icon name="sign-in" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.signInButtonText}>Sign In / Sign Up</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by Order No, 6-digit Pay Code..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <View style={styles.statusFilterContainer}>
              {['All', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'].map(status => (
                <TouchableOpacity
                  key={status}
                  style={[styles.statusButton, selectedStatus === (status === 'All' ? null : status) && styles.selectedStatusButton]}
                  onPress={() => setSelectedStatus(status === 'All' ? null : status)}
                >
                  <Text style={[styles.statusButtonText, selectedStatus === (status === 'All' ? null : status) && styles.selectedStatusButtonText]}>
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.dateFilterRow}>
              <TouchableOpacity
                style={[styles.datePickerButton, selectedDate && styles.datePickerButtonActive]}
                onPress={showDatePicker}
                activeOpacity={0.7}
              >
                <Icon
                  name="calendar"
                  size={14}
                  color={selectedDate ? '#007AFF' : '#64748B'}
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.datePickerButtonText, selectedDate && styles.datePickerButtonTextActive]}>
                  {selectedDate
                    ? new Date(selectedDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Filter by Date'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.todayButton,
                  selectedDate &&
                    new Date(selectedDate).toDateString() === new Date().toDateString() &&
                    styles.todayButtonActive,
                ]}
                onPress={() => {
                  if (selectedDate && new Date(selectedDate).toDateString() === new Date().toDateString()) {
                    setSelectedDate(null);
                  } else {
                    setSelectedDate(new Date());
                  }
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.todayButtonText,
                    selectedDate &&
                      new Date(selectedDate).toDateString() === new Date().toDateString() &&
                      styles.todayButtonTextActive,
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>

              {selectedDate && (
                <TouchableOpacity
                  onPress={() => setSelectedDate(null)}
                  style={styles.clearDateBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Clear Date Filter"
                >
                  <Icon name="times-circle" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>

            <UniversalDateTimePicker
              isVisible={isDatePickerVisible}
              mode="date"
              date={selectedDate ? new Date(selectedDate) : new Date()}
              onConfirm={handleConfirmDate}
              onCancel={hideDatePicker}
            />
          </View>

          {sectionedOrders.length > 0 && (
            <View style={styles.totalAmountContainer}>
              <Text style={styles.totalAmountText}>Total Orders Value: ₹{totalAmount.toFixed(2)}</Text>
            </View>
          )}

          {sectionedOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="inbox" size={54} color="#cbd5e1" style={{ marginBottom: 12 }} />
              <Text style={styles.noOrdersText}>{userRole === 'seller' ? 'No store orders found.' : 'No orders found.'}</Text>
              <Text style={styles.noOrdersSubtext}>
                {userRole === 'seller'
                  ? "Looks like your store hasn't received any customer orders matching this filter."
                  : "Looks like you haven't placed any orders matching this filter."}
              </Text>
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => navigation.navigate('Catalog', { sellerId, sellerName, customerId })}
              >
                <Text style={styles.browseButtonText}>Browse Catalog</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <SectionList
              sections={sectionedOrders}
              keyExtractor={(item) => item.id}
              renderItem={renderOrderItem}
              renderSectionHeader={({ section: { title } }) => (
                <Text style={styles.sectionHeader}>{title}</Text>
              )}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              style={[
                styles.list,
                Platform.OS === 'web' ? { overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 } : null,
              ]}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              contentContainerStyle={[styles.listContent, { flexGrow: 1, paddingBottom: 90 }]}
            />
          )}
        </>
      )}

      {/* Bottom Navigation Footer (Store, Cart, Orders) */}
      <StoreNavigationFooter
        activeTab="orders"
        navigation={navigation}
        route={route}
        sellerId={sellerId}
        sellerName={sellerName}
        customerId={customerId}
        forceShow={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    height: Platform.OS === 'web' ? '100%' : undefined,
    maxHeight: Platform.OS === 'web' ? '100vh' : undefined,
    minHeight: 0,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchContainer: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexShrink: 0,
  },
  searchInput: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  statusFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statusButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    margin: 3,
    backgroundColor: '#F8FAFC',
  },
  selectedStatusButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  statusButtonText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '500',
  },
  selectedStatusButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePickerButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerButtonActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  datePickerButtonText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  datePickerButtonTextActive: {
    color: '#007AFF',
    fontWeight: '700',
  },
  todayButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  todayButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  clearDateBtn: {
    padding: 10,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalAmountContainer: {
    padding: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
    flexShrink: 0,
  },
  totalAmountText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E40AF',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 16,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  dayOrderId: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
    marginTop: 2,
  },
  orderStatus: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  paymentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  payCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  payCodeLabel: {
    fontSize: 11,
    color: '#4338CA',
    fontWeight: '600',
    marginRight: 4,
  },
  payCodeValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#312E81',
    letterSpacing: 0.5,
  },
  paymentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  paymentStatusPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  paymentStatusPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  paymentStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textPaid: {
    color: '#15803D',
  },
  textPending: {
    color: '#B45309',
  },
  orderPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  paymentMethodText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginLeft: 6,
  },
  orderDate: {
    fontSize: 12,
    color: '#64748B',
  },
  orderCustomer: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  quickPayActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  quickPayBtnVerify: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  quickPayBtnDone: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  quickPayActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  quickPayTextVerify: {
    color: '#15803D',
  },
  quickPayTextDone: {
    color: '#64748B',
  },
  refreshHeaderBtn: {
    padding: 6,
    marginRight: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  actionIcon: {
    marginLeft: 18,
  },
  notLoggedInContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  notLoggedInIconBox: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  notLoggedInTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  notLoggedInSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  signInButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 40,
  },
  noOrdersText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  noOrdersSubtext: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
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
    fontSize: 14,
  },
});

export default OrderListScreen;