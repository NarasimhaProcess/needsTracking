import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/FontAwesome';
import { supabase, getOrderById, updateOrderStatus } from '../services/supabase';
import { printReceipt, extractOrderNumbers } from '../services/printerService';
import UniversalWebView from '../components/UniversalWebView';
import { useCart } from '../context/CartContext';
import PrinterSettingsModal from '../components/PrinterSettingsModal';

const OrderDetailScreen = ({ navigation, route }) => {
  const { orderId } = route?.params || {};
  const { role } = useCart();
  const [order, setOrder] = useState(null);
  const [deliveryPartner, setDeliveryPartner] = useState(null);
  const [partnerCoords, setPartnerCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const webViewRef = useRef(null);

  const fetchOrderDetails = async () => {
    try {
      const fetchedOrder = await getOrderById(orderId);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
        setSelectedStatus(fetchedOrder.status);

        // If delivery manager assigned, fetch their profile & live location
        if (fetchedOrder.delivery_manager_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, mobile')
            .eq('id', fetchedOrder.delivery_manager_id)
            .maybeSingle();

          if (profile) setDeliveryPartner(profile);

          const { data: loc } = await supabase
            .from('delivery_partner_locations')
            .select('latitude, longitude, heading, speed, updated_at')
            .eq('partner_id', fetchedOrder.delivery_manager_id)
            .maybeSingle();

          if (loc && loc.latitude && loc.longitude) {
            setPartnerCoords({ lat: loc.latitude, lon: loc.longitude });
          }
        }
      }
    } catch (err) {
      console.error('Error fetching order details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();

    if (!orderId) return;

    // Realtime channel for order updates & live delivery location
    const channel = supabase
      .channel(`order-live-tracking:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          if (payload.new) {
            setOrder((prev) => ({ ...prev, ...payload.new }));
            setSelectedStatus(payload.new.status);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_partner_locations',
        },
        (payload) => {
          if (payload.new && payload.new.latitude && payload.new.longitude) {
            const { latitude, longitude } = payload.new;
            setPartnerCoords({ lat: latitude, lon: longitude });

            // Send live update to map
            if (webViewRef.current) {
              const script = `if (window.updateMarkerLocation) { window.updateMarkerLocation(${latitude}, ${longitude}); } true;`;
              if (Platform.OS === 'web') {
                try {
                  webViewRef.current.contentWindow?.eval(script);
                } catch (e) {}
              } else {
                webViewRef.current.injectJavaScript?.(script);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const handleUpdateStatus = async () => {
    if (selectedStatus !== order.status) {
      setLoading(true);
      const success = await updateOrderStatus(orderId, selectedStatus);
      if (success) {
        setOrder({ ...order, status: selectedStatus });
        Alert.alert('Success', 'Order status updated successfully.');
      } else {
        Alert.alert('Error', 'Failed to update order status.');
      }
      setLoading(false);
    }
  };

  const handleCallPartner = (phone) => {
    if (!phone) {
      Alert.alert('No Phone', 'No phone number available for delivery partner.');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const getShippingLocation = () => {
    if (!order?.shipping_address) return null;
    if (typeof order.shipping_address === 'object') {
      return order.shipping_address;
    }
    try {
      return JSON.parse(order.shipping_address);
    } catch {
      return null;
    }
  };

  const renderOrderItem = ({ item }) => {
    const prod = item?.product_variant_combinations?.products;
    const media = prod?.product_media;
    const mediaUrl = Array.isArray(media) && media.length > 0 ? media[0]?.media_url : null;

    return (
      <View style={styles.orderItemDetail}>
        {mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={styles.orderItemImage} resizeMode="cover" />
        ) : (
          <View style={styles.orderItemPlaceholder}>
            <Icon name="shopping-bag" size={20} color="#94a3b8" />
          </View>
        )}
        <View style={styles.orderItemTextContainer}>
          <Text style={styles.itemProductName}>
            {prod?.product_name || 'Product'}
            {item.product_variant_combinations?.combination_string
              ? ` (${item.product_variant_combinations.combination_string})`
              : ''}
          </Text>
          <Text style={styles.itemQuantity}>Quantity: {item.quantity}</Text>
          <Text style={styles.itemPrice}>Price: ₹{Number(item.price || 0).toFixed(2)}</Text>
        </View>
      </View>
    );
  };

  const getHtmlContent = () => {
    const shipping = getShippingLocation();

    return `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Order Live Tracking</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
          <style>
              body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
              #mapid { width: 100vw; height: 280px; background-color: #f1f5f9; }

              .bike-marker-container {
                  position: relative;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
              }
              .radar-pulse {
                  position: absolute;
                  top: 0;
                  left: 2px;
                  width: 44px;
                  height: 44px;
                  border-radius: 50%;
                  background: rgba(0, 122, 255, 0.25);
                  animation: radarRipple 2s infinite ease-out;
                  z-index: 1;
              }
              @keyframes radarRipple {
                  0% { transform: scale(0.6); opacity: 1; }
                  100% { transform: scale(1.8); opacity: 0; }
              }
              .bike-pin {
                  width: 44px;
                  height: 44px;
                  border-radius: 50%;
                  background: linear-gradient(135deg, #007AFF 0%, #00C6FF 100%);
                  border: 2.5px solid #FFFFFF;
                  box-shadow: 0 4px 14px rgba(0, 122, 255, 0.5);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: #FFFFFF;
                  font-size: 19px;
                  z-index: 2;
                  position: relative;
                  transition: transform 0.2s ease;
              }
              .marker-badge {
                  margin-top: 3px;
                  background: rgba(15, 23, 42, 0.85);
                  color: #FFFFFF;
                  font-size: 10px;
                  font-weight: 700;
                  padding: 2px 7px;
                  border-radius: 6px;
                  white-space: nowrap;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.25);
                  z-index: 3;
              }

              .dest-marker-container {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
              }
              .dest-pin {
                  width: 38px;
                  height: 38px;
                  border-radius: 50%;
                  background: linear-gradient(135deg, #EF4444 0%, #F87171 100%);
                  border: 2.5px solid #FFFFFF;
                  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.45);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: #FFFFFF;
                  font-size: 16px;
              }
              .dest-badge {
                  margin-top: 3px;
                  background: rgba(239, 68, 68, 0.9);
                  color: #FFFFFF;
                  font-size: 10px;
                  font-weight: 700;
                  padding: 2px 6px;
                  border-radius: 6px;
                  white-space: nowrap;
              }
          </style>
      </head>
      <body>
          <div id="mapid"></div>
          <script>
              var map = L.map('mapid', { zoomControl: true }).setView([20.5937, 78.9629], 5);
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  attribution: '&copy; OpenStreetMap',
                  maxZoom: 19
              }).addTo(map);

              var managerCoords = ${JSON.stringify(partnerCoords)};
              var destCoords = ${JSON.stringify(
                shipping?.latitude && shipping?.longitude
                  ? { lat: shipping.latitude, lon: shipping.longitude }
                  : null
              )};

              var deliveryMarker = null;
              var waypoints = [];

              var deliveryIcon = L.divIcon({
                  className: 'custom-bike-wrapper',
                  html: '<div class="bike-marker-container"><div class="radar-pulse"></div><div class="bike-pin"><i class="fas fa-motorcycle"></i></div><div class="marker-badge">🛵 In Transit</div></div>',
                  iconSize: [60, 68],
                  iconAnchor: [30, 24]
              });

              var destIcon = L.divIcon({
                  className: 'custom-dest-wrapper',
                  html: '<div class="dest-marker-container"><div class="dest-pin"><i class="fas fa-home"></i></div><div class="dest-badge">📍 Delivery</div></div>',
                  iconSize: [50, 58],
                  iconAnchor: [25, 20]
              });

              if (managerCoords && managerCoords.lat && managerCoords.lon) {
                  deliveryMarker = L.marker([managerCoords.lat, managerCoords.lon], { icon: deliveryIcon })
                      .addTo(map)
                      .bindPopup('<b>🛵 Delivery Partner Live Location</b>')
                      .openPopup();
                  waypoints.push([managerCoords.lat, managerCoords.lon]);
              }

              if (destCoords && destCoords.lat && destCoords.lon) {
                  L.marker([destCoords.lat, destCoords.lon], { icon: destIcon })
                      .addTo(map)
                      .bindPopup('<b>📍 Customer Destination</b>');
                  waypoints.push([destCoords.lat, destCoords.lon]);
              }

              if (waypoints.length > 1) {
                  L.polyline(waypoints, { color: '#007AFF', weight: 4, dashArray: '6, 8', opacity: 0.8 }).addTo(map);
                  map.fitBounds(L.latLngBounds(waypoints).pad(0.35));
              } else if (waypoints.length === 1) {
                  map.setView(waypoints[0], 15);
              }

              window.updateMarkerLocation = function(lat, lon) {
                  if (deliveryMarker) {
                      deliveryMarker.setLatLng([lat, lon]);
                  } else {
                      deliveryMarker = L.marker([lat, lon], { icon: deliveryIcon })
                          .addTo(map)
                          .bindPopup('<b>🛵 Delivery Partner Live Location</b>');
                  }
                  map.panTo([lat, lon], { animate: true });
              };
          </script>
      </body>
      </html>
    `;
  };

  if (loading && !order) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Order not found.</Text>
      </View>
    );
  }

  const shipping = getShippingLocation();
  const isDeliveryAssigned = Boolean(order.delivery_manager_id);
  const canUpdateStatus = role === 'seller' || role === 'admin' || role === 'delivery_manager';
  const { orderNumber, dayOrderNo } = extractOrderNumbers(order);

  return (
    <View style={styles.mainContainer}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Order #{orderNumber}</Text>
          {dayOrderNo ? (
            <Text style={styles.headerSubTitle}>Day Order No: #{dayOrderNo}</Text>
          ) : null}
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={{ marginRight: 16 }} onPress={() => printReceipt(order)}>
            <Icon name="print" size={22} color="#1E293B" />
          </TouchableOpacity>
          <TouchableOpacity style={{ marginRight: 16 }} onPress={() => setShowPrinterSettings(true)}>
            <Icon name="cog" size={22} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="times" size={22} color="#1E293B" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container}>
        {/* Live Tracking Map if Delivery Partner is Assigned */}
        {isDeliveryAssigned && (
          <View style={styles.trackingCard}>
            <View style={styles.trackingHeader}>
              <View style={styles.trackingTitleRow}>
                <Icon name="motorcycle" size={18} color="#007AFF" />
                <Text style={styles.trackingTitle}>Live Delivery Tracking</Text>
              </View>
              <View style={styles.livePulseBadge}>
                <View style={styles.pulseDot} />
                <Text style={styles.livePulseText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.mapContainer}>
              <UniversalWebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: getHtmlContent() }}
                style={{ height: 280, width: '100%' }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
              />
            </View>

            {/* Delivery Partner Info */}
            <View style={styles.partnerInfoRow}>
              <View style={styles.partnerAvatar}>
                <Icon name="user" size={18} color="#007AFF" />
              </View>
              <View style={styles.partnerDetails}>
                <Text style={styles.partnerName}>
                  {deliveryPartner?.full_name || 'Assigned Delivery Partner'}
                </Text>
                <Text style={styles.partnerSub}>
                  {partnerCoords ? 'Broadcasting live location' : 'Partner assigned'}
                </Text>
              </View>
              {deliveryPartner?.mobile && (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => handleCallPartner(deliveryPartner.mobile)}
                >
                  <Icon name="phone" size={14} color="#FFFFFF" />
                  <Text style={styles.callBtnText}>Call</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Order Identification & Status Card */}
        <View style={styles.detailCard}>
          <View style={styles.orderMetaTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderNumberLarge}>Order No: {orderNumber}</Text>
              {dayOrderNo ? (
                <Text style={styles.dayOrderHighlight}>Day Order No: #{dayOrderNo}</Text>
              ) : null}
            </View>
            {dayOrderNo ? (
              <View style={styles.dayOrderBadgeBox}>
                <Text style={styles.dayOrderBadgeSmall}>DAY ORDER</Text>
                <Text style={styles.dayOrderBadgeNum}>#{dayOrderNo}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.innerDivider} />

          <Text style={styles.label}>Order Status</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, getStatusStyle(order.status)]}>
              <Text style={styles.statusBadgeText}>{(order.status || 'Pending').toUpperCase()}</Text>
            </View>
            <Text style={styles.statusDateText}>{new Date(order.created_at).toLocaleString()}</Text>
          </View>
        </View>

        {/* Status Update (for Sellers/Admins/Delivery Managers) */}
        {canUpdateStatus && (
          <View style={styles.detailCard}>
            <Text style={styles.label}>Update Order Status</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={selectedStatus}
                onValueChange={(itemValue) => setSelectedStatus(itemValue)}
                style={styles.picker}
              >
                <Picker.Item label="Pending" value="pending" />
                <Picker.Item label="Processing" value="processing" />
                <Picker.Item label="Out for Delivery" value="out_for_delivery" />
                <Picker.Item label="Shipped" value="shipped" />
                <Picker.Item label="Completed" value="completed" />
                <Picker.Item label="Cancelled" value="cancelled" />
              </Picker>
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleUpdateStatus}>
              <Text style={styles.saveButtonText}>Save Status</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Total Amount & Payment */}
        <View style={styles.detailCard}>
          <View style={styles.amountRow}>
            <Text style={styles.label}>Total Amount</Text>
            <Text style={styles.amountValue}>₹{Number(order.total_amount || 0).toFixed(2)}</Text>
          </View>
          <Text style={styles.paymentMethodText}>
            Payment Method: {(order.payment_method || 'Cash on Delivery').toUpperCase()}
          </Text>
        </View>

        {/* Shipping Address */}
        <View style={styles.detailCard}>
          <Text style={styles.label}>Delivery Address</Text>
          <Text style={styles.addressText}>
            {shipping?.address || order.shipping_address || 'No address provided'}
            {shipping?.city ? `, ${shipping.city}` : ''}
          </Text>
        </View>

        {/* Items List */}
        <Text style={styles.sectionTitle}>Order Items</Text>
        {order.order_items && order.order_items.length > 0 ? (
          <FlatList
            data={order.order_items}
            keyExtractor={(item) => item.id}
            renderItem={renderOrderItem}
            scrollEnabled={false}
            contentContainerStyle={styles.itemsList}
          />
        ) : (
          <Text style={styles.noItemsText}>No items in this order.</Text>
        )}
      </ScrollView>

      <PrinterSettingsModal
        visible={showPrinterSettings}
        onClose={() => setShowPrinterSettings(false)}
      />
    </View>
  );
};

function getStatusStyle(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('completed') || s.includes('delivered')) return { backgroundColor: '#ECFDF5' };
  if (s.includes('out')) return { backgroundColor: '#EFF6FF' };
  if (s.includes('cancelled')) return { backgroundColor: '#FEF2F2' };
  return { backgroundColor: '#FFFBEB' };
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
    marginTop: 2,
  },
  orderMetaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderNumberLarge: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  dayOrderHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284C7',
    marginTop: 3,
  },
  dayOrderBadgeBox: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
  },
  dayOrderBadgeSmall: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0369A1',
    letterSpacing: 0.5,
  },
  dayOrderBadgeNum: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0284C7',
  },
  innerDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  notFoundText: {
    fontSize: 16,
    color: '#64748B',
  },
  trackingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  trackingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  trackingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  livePulseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  livePulseText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  mapContainer: {
    height: 280,
    width: '100%',
  },
  partnerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  partnerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  partnerDetails: {
    flex: 1,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  partnerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  callBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusDateText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  picker: {
    height: 48,
    width: '100%',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  paymentMethodText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  addressText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
    marginBottom: 10,
  },
  itemsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  orderItemDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  orderItemImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  orderItemPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  orderItemTextContainer: {
    flex: 1,
  },
  itemProductName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemQuantity: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 2,
  },
  noItemsText: {
    textAlign: 'center',
    color: '#94A3B8',
    marginVertical: 16,
  },
});

export default OrderDetailScreen;
