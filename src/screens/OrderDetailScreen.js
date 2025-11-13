import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/FontAwesome';
import { supabase, getOrderById, updateOrderStatus } from '../services/supabase';
import { WebView } from 'react-native-webview';

const OrderDetailScreen = ({ navigation, route }) => {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const webViewRef = useRef(null);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      const fetchedOrder = await getOrderById(orderId);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
        setSelectedStatus(fetchedOrder.status);
      }
      setLoading(false);
    };

    fetchOrderDetails();

    const channel = supabase
      .channel(`order-details:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_manager_locations',
          filter: `manager_id=eq.${order?.delivery_manager_id}`,
        },
        (payload) => {
          if (payload.new && webViewRef.current) {
            const point = payload.new.location.match(/POINT\(([-\d\.]+) ([-\d\.]+)\)/);
            if (point) {
              const newCoords = { lat: parseFloat(point[2]), lon: parseFloat(point[1]) };
              webViewRef.current.injectJavaScript(`updateMarkerLocation(${newCoords.lat}, ${newCoords.lon});`);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, order]);

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

  const renderOrderItem = ({ item }) => (
    <View style={styles.orderItemDetail}>
      <Text style={styles.itemProductName}>
        {item.product_variant_combinations?.products?.product_name || 'N/A'}
        {item.product_variant_combinations?.combination_string ? ` (${item.product_variant_combinations.combination_string})` : ''}
      </Text>
      <Text style={styles.itemQuantity}>Quantity: {item.quantity}</Text>
      <Text style={styles.itemPrice}>Price: ₹{item.price.toFixed(2)}</Text>
    </View>
  );

  const getHtmlContent = () => {
    const deliveryManagerLocation = order?.profiles?.latest_delivery_manager_locations[0]?.location;
    const shippingLocation = order?.shipping_address;

    let managerCoords = null;
    if (deliveryManagerLocation) {
      const point = deliveryManagerLocation.match(/POINT\(([-\d\.]+) ([-\d\.]+)\)/);
      if (point) {
        managerCoords = { lat: parseFloat(point[2]), lon: parseFloat(point[1]) };
      }
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Order Tracking</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/Leaflet.AnimatedMarker/1.0.0/Leaflet.AnimatedMarker.js"></script>
          <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css" />
          <script src="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js"></script>
          <style>
              body { margin: 0; padding: 0; }
              #mapid { width: 100%; height: 300px; }
          </style>
      </head>
      <body>
          <div id="mapid"></div>
          <script>
              document.addEventListener('DOMContentLoaded', function() {
                var map = L.map('mapid');
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

                var managerLocation = ${JSON.stringify(managerCoords)};
                var shippingLocation = ${JSON.stringify(shippingLocation)};
                var deliveryMarker = null;

                var waypoints = [];
                if (managerLocation) {
                  waypoints.push(L.latLng(managerLocation.lat, managerLocation.lon));
                  deliveryMarker = L.animatedMarker([L.latLng(managerLocation.lat, managerLocation.lon)], { autoStart: false, distance: 3000, interval: 2000 }).addTo(map);
                  deliveryMarker.bindPopup('Delivery Manager');
                }
                if (shippingLocation && shippingLocation.latitude && shippingLocation.longitude) {
                  waypoints.push(L.latLng(shippingLocation.latitude, shippingLocation.longitude));
                  L.marker([shippingLocation.latitude, shippingLocation.longitude]).addTo(map).bindPopup('Delivery Address');
                }

                if (waypoints.length > 0) {
                  setTimeout(function() { 
                    map.fitBounds(L.latLngBounds(waypoints).pad(0.5));
                    map.invalidateSize();
                  }, 200);
                } else {
                  // Fallback if no waypoints are available
                  setTimeout(function() { 
                    map.setView([20.5937, 78.9629], 5); // Default view of India
                    map.invalidateSize();
                  }, 200);
                }

                if (waypoints.length === 2) {
                  L.Routing.control({ waypoints: waypoints, routeWhileDragging: false, show: false }).addTo(map);
                }

                window.updateMarkerLocation = function(lat, lon) {
                  if (deliveryMarker) {
                    deliveryMarker.moveTo(L.latLng(lat, lon), 2000);
                  } else {
                    deliveryMarker = L.animatedMarker([L.latLng(lat, lon)], { autoStart: false, distance: 3000, interval: 2000 }).addTo(map);
                    deliveryMarker.bindPopup('Delivery Manager');
                  }
                }
              });
          </script>
      </body>
      </html>
    `;
  };

  if (loading && !order) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centered}>
        <Text>Order not found.</Text>
      </View>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: 'white'}}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order Details</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.container}>
        {order.delivery_manager_id && (
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: getHtmlContent() }}
            style={{ height: 300, width: '100%' }}
            javaScriptEnabled={true}
          />
        )}
        <View style={styles.detailCard}>
          <Text style={styles.label}>Order ID:</Text>
          <Text style={styles.value}>{order.id}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Status:</Text>
          <Text style={styles.value}>{order.status}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Update Status:</Text>
          <Picker
            selectedValue={selectedStatus}
            onValueChange={(itemValue) => setSelectedStatus(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Pending" value="pending" />
            <Picker.Item label="Out for Delivery" value="out_for_delivery" />
            <Picker.Item label="Completed" value="completed" />
            <Picker.Item label="Shipped" value="shipped" />
            <Picker.Item label="Cancelled" value="cancelled" />
          </Picker>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Total Amount:</Text>
          <Text style={styles.value}>₹{order.total_amount.toFixed(2)}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Order Date:</Text>
          <Text style={styles.value}>{new Date(order.created_at).toLocaleString()}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Shipping Address:</Text>
          <Text style={styles.value}>
            {order.shipping_address.address}, {order.shipping_address.city}
          </Text>
        </View>

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

        <TouchableOpacity style={styles.saveButton} onPress={handleUpdateStatus}>
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </TouchableOpacity>
      </ScrollView>
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
    padding: 16,
    backgroundColor: '#f8f8f8',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  detailCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 5,
  },
  value: {
    fontSize: 16,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#333',
  },
  itemsList: {
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    padding: 10,
  },
  orderItemDetail: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemProductName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  itemQuantity: {
    fontSize: 14,
    color: '#666',
  },
  itemPrice: {
    fontSize: 14,
    color: '#666',
  },
  noItemsText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#777',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
});

export default OrderDetailScreen;
