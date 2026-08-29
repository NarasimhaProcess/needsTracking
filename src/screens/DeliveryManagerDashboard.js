import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import {
  supabase,
  getAssignedOrders,
  getAvailableDeliveryOrders,
  acceptDeliveryOrder,
  updateOrderStatus,
  updateDeliveryPartnerLocation,
} from '../services/supabase';
import * as Location from 'expo-location';
import { announceNewOrder } from '../services/speechService';

const DeliveryManagerDashboard = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState('available'); // 'available' | 'active' | 'completed'
  const [assignedOrders, setAssignedOrders] = useState([]);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [user, setUser] = useState(null);
  const locationSubscription = useRef(null);

  const fetchAllOrders = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const [assigned, available] = await Promise.all([
        getAssignedOrders(userId),
        getAvailableDeliveryOrders(),
      ]);
      setAssignedOrders(assigned || []);
      setAvailableOrders(available || []);
    } catch (e) {
      console.error('Error loading delivery orders:', e);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    if (user?.id) {
      setRefreshing(true);
      await fetchAllOrders(user.id);
      setRefreshing(false);
    }
  }, [user, fetchAllOrders]);

  useEffect(() => {
    let orderChannel = null;

    const startDashboard = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        await fetchAllOrders(user.id);
        await startLocationTracking(user.id);

        // Realtime subscription for all order changes (new orders, assignments, status changes)
        orderChannel = supabase
          .channel('public:delivery_dashboard_orders')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'orders',
            },
            (payload) => {
              console.log('[DeliveryDashboard] Realtime order change received:', payload.eventType);
              fetchAllOrders(user.id);
              if (payload.eventType === 'INSERT') {
                announceNewOrder(payload.new);
                Alert.alert('🛵 New Order Received!', 'A new delivery order has just been placed and is ready for pickup.');
              }
            }
          )
          .subscribe();
      }
      setLoading(false);
    };

    startDashboard();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      if (orderChannel) {
        supabase.removeChannel(orderChannel);
      }
    };
  }, [fetchAllOrders]);

  const startLocationTracking = async (userId) => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission denied for delivery manager.');
        return;
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (location) => {
          if (location?.coords) {
            const { latitude, longitude, heading, speed } = location.coords;
            const activeOrder = assignedOrders.find(
              o => o.status === 'Out for Delivery' || o.status === 'out_for_delivery' || o.status === 'Processing' || o.status === 'processing'
            );
            const activeOrderId = activeOrder ? activeOrder.id : null;

            updateDeliveryPartnerLocation(userId, activeOrderId, {
              latitude,
              longitude,
              heading: heading || 0,
              speed: speed || 0,
            });
          }
        }
      );
    } catch (locErr) {
      console.warn('Location watch setup notice:', locErr);
    }
  };

  const handleAcceptOrder = async (orderItem) => {
    if (!user?.id) return;
    setActionLoading(prev => ({ ...prev, [orderItem.id]: true }));
    try {
      const updated = await acceptDeliveryOrder(orderItem.id, user.id);
      if (updated) {
        Alert.alert('🛵 Order Accepted!', `You have claimed Order #${orderItem.order_number || orderItem.id.substring(0, 8)}. It is now in your Active Deliveries.`);
        await fetchAllOrders(user.id);
        setActiveTab('active');
      } else {
        Alert.alert('Error', 'Failed to accept order. It may have already been claimed.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not accept order.');
    } finally {
      setActionLoading(prev => ({ ...prev, [orderItem.id]: false }));
    }
  };

  const handleUpdateStatus = async (orderId, newStatus, statusLabel) => {
    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await updateOrderStatus(orderId, newStatus);
      if (res) {
        Alert.alert('Status Updated', `Order status changed to: ${statusLabel}`);
        await fetchAllOrders(user.id);
      } else {
        Alert.alert('Error', 'Could not update status.');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Update failed');
    } finally {
      setActionLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handleOpenDirections = (item) => {
    const lat = item?.shipping_address?.latitude;
    const lon = item?.shipping_address?.longitude;
    const addressStr = getCustomerAddress(item);

    if (lat && lon) {
      const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
      const latLng = `${lat},${lon}`;
      const url = Platform.select({
        ios: `${scheme}${latLng}`,
        android: `${scheme}${latLng}(Delivery Location)`,
      });
      Linking.openURL(url);
    } else if (addressStr && addressStr !== 'No address') {
      const query = encodeURIComponent(addressStr);
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    } else {
      Alert.alert('No Location', 'No GPS location or address provided for this order.');
    }
  };

  const handleCallCustomer = (phone) => {
    if (!phone) {
      Alert.alert('No Phone', 'No customer phone number available.');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out from Delivery Manager?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              if (locationSubscription.current) {
                locationSubscription.current.remove();
              }
              await supabase.auth.signOut();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
              });
            } catch (err) {
              console.error('Logout error in DeliveryManagerDashboard:', err);
            }
          },
        },
      ]
    );
  };

  const getCustomerName = (item) => {
    if (!item?.shipping_address) return 'Customer';
    if (typeof item.shipping_address === 'string') {
      try {
        const parsed = JSON.parse(item.shipping_address);
        return parsed.name || 'Customer';
      } catch {
        return 'Customer';
      }
    }
    return item.shipping_address.name || 'Customer';
  };

  const getCustomerPhone = (item) => {
    if (!item?.shipping_address) return null;
    if (typeof item.shipping_address === 'string') {
      try {
        const parsed = JSON.parse(item.shipping_address);
        return parsed.phone || parsed.mobile || null;
      } catch {
        return null;
      }
    }
    return item.shipping_address.phone || item.shipping_address.mobile || null;
  };

  const getCustomerAddress = (item) => {
    if (!item?.shipping_address) return 'No address provided';
    if (typeof item.shipping_address === 'string') {
      try {
        const parsed = JSON.parse(item.shipping_address);
        return [parsed.address, parsed.city, parsed.postal_code || parsed.postalCode].filter(Boolean).join(', ') || item.shipping_address;
      } catch {
        return item.shipping_address;
      }
    }
    return [item.shipping_address.address, item.shipping_address.city, item.shipping_address.postal_code || item.shipping_address.postalCode].filter(Boolean).join(', ') || 'No address';
  };

  const activeAssignedOrders = assignedOrders.filter(
    o => o.status !== 'Completed' && o.status !== 'completed' && o.status !== 'Cancelled' && o.status !== 'cancelled'
  );
  const completedOrders = assignedOrders.filter(
    o => o.status === 'Completed' || o.status === 'completed'
  );

  const displayedOrders = activeTab === 'available'
    ? availableOrders
    : activeTab === 'active'
      ? activeAssignedOrders
      : completedOrders;

  const renderAvailableOrderItem = ({ item }) => {
    const isBusy = actionLoading[item.id];
    const customerPhone = getCustomerPhone(item);

    return (
      <View style={styles.orderCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.orderBadgeText}>NEW ORDER</Text>
            <Text style={styles.orderId}>#{item.order_number || item.id.substring(0, 8)}</Text>
          </View>
          <Text style={styles.orderAmount}>₹{item.total_amount}</Text>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.infoRow}>
          <Icon name="user" size={15} color="#475569" style={styles.infoIcon} />
          <Text style={styles.infoTextBold}>{getCustomerName(item)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Icon name="map-marker" size={16} color="#e11d48" style={styles.infoIcon} />
          <Text style={styles.infoText}>{getCustomerAddress(item)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Icon name="clock-o" size={15} color="#64748b" style={styles.infoIcon} />
          <Text style={styles.timeText}>{new Date(item.created_at).toLocaleString()}</Text>
        </View>

        {item.order_items && item.order_items.length > 0 && (
          <View style={styles.itemsSummary}>
            <Text style={styles.itemsSummaryText}>
              📦 {item.order_items.reduce((sum, it) => sum + (it.quantity || 1), 0)} items: {' '}
              {item.order_items.map(it => it.product_variant_combinations?.products?.product_name || 'Item').join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.detailsBtn}
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
          >
            <Icon name="eye" size={14} color="#007AFF" style={{ marginRight: 6 }} />
            <Text style={styles.detailsBtnText}>Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.acceptBtn, isBusy && styles.btnDisabled]}
            onPress={() => handleAcceptOrder(item)}
            disabled={isBusy}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Icon name="check-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.acceptBtnText}>Accept Delivery</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderActiveOrderItem = ({ item }) => {
    const isBusy = actionLoading[item.id];
    const customerPhone = getCustomerPhone(item);
    const isOutForDelivery = item.status === 'Out for Delivery' || item.status === 'out_for_delivery';

    return (
      <View style={[styles.orderCard, styles.activeCardBorder]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={[styles.statusTag, isOutForDelivery ? styles.statusTagDelivery : styles.statusTagProcessing]}>
              {item.status.toUpperCase()}
            </Text>
            <Text style={styles.orderId}>#{item.order_number || item.id.substring(0, 8)}</Text>
          </View>
          <Text style={styles.orderAmount}>₹{item.total_amount}</Text>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.infoRow}>
          <Icon name="user" size={15} color="#475569" style={styles.infoIcon} />
          <Text style={styles.infoTextBold}>{getCustomerName(item)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Icon name="map-marker" size={16} color="#e11d48" style={styles.infoIcon} />
          <Text style={styles.infoText}>{getCustomerAddress(item)}</Text>
        </View>

        <View style={styles.quickToolsRow}>
          <TouchableOpacity style={styles.toolBtn} onPress={() => handleOpenDirections(item)}>
            <Icon name="location-arrow" size={15} color="#007AFF" style={{ marginRight: 6 }} />
            <Text style={styles.toolBtnText}>Directions</Text>
          </TouchableOpacity>

          {customerPhone && (
            <TouchableOpacity style={styles.toolBtn} onPress={() => handleCallCustomer(customerPhone)}>
              <Icon name="phone" size={15} color="#16a34a" style={{ marginRight: 6 }} />
              <Text style={[styles.toolBtnText, { color: '#16a34a' }]}>Call</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.toolBtn} onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}>
            <Icon name="info-circle" size={15} color="#64748b" style={{ marginRight: 6 }} />
            <Text style={[styles.toolBtnText, { color: '#64748b' }]}>Items</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stageActionsRow}>
          {!isOutForDelivery ? (
            <TouchableOpacity
              style={[styles.stageBtn, styles.outForDeliveryBtn, isBusy && styles.btnDisabled]}
              onPress={() => handleUpdateStatus(item.id, 'Out for Delivery', 'Out for Delivery')}
              disabled={isBusy}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="truck" size={16} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.stageBtnText}>Start Delivery</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.stageBtn, styles.deliveredBtn, isBusy && styles.btnDisabled]}
              onPress={() => handleUpdateStatus(item.id, 'Completed', 'Delivered & Completed')}
              disabled={isBusy}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="check" size={16} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.stageBtnText}>Mark as Delivered</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderCompletedOrderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={[styles.statusTag, styles.statusTagCompleted]}>DELIVERED</Text>
          <Text style={styles.orderId}>#{item.order_number || item.id.substring(0, 8)}</Text>
        </View>
        <Text style={styles.orderAmount}>₹{item.total_amount}</Text>
      </View>
      <Text style={styles.infoTextBold}>👤 {getCustomerName(item)}</Text>
      <Text style={styles.infoText}>📍 {getCustomerAddress(item)}</Text>
      <Text style={styles.timeText}>Delivered: {new Date(item.updated_at || item.created_at).toLocaleString()}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 12, color: '#64748b' }}>Connecting Delivery Dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Delivery Partner</Text>
          <Text style={styles.headerSubtitle}>Live Order Management</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutWrapper}>
          <Icon name="sign-out" size={18} color="#ef4444" style={{ marginRight: 6 }} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'available' && styles.tabButtonActive]}
          onPress={() => setActiveTab('available')}
        >
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
            Available ({availableOrders.length})
          </Text>
          {availableOrders.length > 0 && <View style={styles.tabBadgeDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'active' && styles.tabButtonActive]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
            My Tasks ({activeAssignedOrders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'completed' && styles.tabButtonActive]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
            History ({completedOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Order List */}
      {displayedOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon
            name={activeTab === 'available' ? 'inbox' : activeTab === 'active' ? 'truck' : 'check-circle'}
            size={56}
            color="#cbd5e1"
          />
          <Text style={styles.noOrdersText}>
            {activeTab === 'available'
              ? 'No new delivery requests'
              : activeTab === 'active'
                ? 'No active deliveries in progress'
                : 'No delivery history yet'}
          </Text>
          <Text style={styles.emptySubText}>
            {activeTab === 'available'
              ? 'New orders placed by buyers or sellers will pop up here in real time.'
              : activeTab === 'active'
                ? 'Claim a delivery request from the Available tab to start delivering.'
                : 'Completed orders will be logged here.'}
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Icon name="refresh" size={14} color="#007AFF" style={{ marginRight: 6 }} />
            <Text style={styles.refreshBtnText}>Check for Updates</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayedOrders}
          renderItem={
            activeTab === 'available'
              ? renderAvailableOrderItem
              : activeTab === 'active'
                ? renderActiveOrderItem
                : renderCompletedOrderItem
          }
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#007AFF']} />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  logoutWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  logoutText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
    position: 'relative',
  },
  tabButtonActive: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  tabBadgeDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  listContainer: {
    padding: 14,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  activeCardBorder: {
    borderColor: '#93c5fd',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderBadgeText: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  statusTag: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  statusTagProcessing: {
    backgroundColor: '#fef3c7',
    color: '#b45309',
  },
  statusTagDelivery: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
  },
  statusTagCompleted: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  orderAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  infoIcon: {
    width: 20,
    marginTop: 2,
  },
  infoTextBold: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  infoText: {
    fontSize: 14,
    color: '#475569',
    flex: 1,
    lineHeight: 20,
  },
  timeText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  itemsSummary: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  itemsSummaryText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 10,
  },
  detailsBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
    elevation: 2,
  },
  acceptBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  quickToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  toolBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  stageActionsRow: {
    marginTop: 4,
  },
  stageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
  },
  outForDeliveryBtn: {
    backgroundColor: '#0284c7',
  },
  deliveredBtn: {
    backgroundColor: '#16a34a',
  },
  stageBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 28,
  },
  noOrdersText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    marginTop: 20,
  },
  refreshBtnText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
});

export default DeliveryManagerDashboard;

