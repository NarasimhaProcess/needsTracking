import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, SectionList, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { getOrders, deleteOrder, supabase } from '../services/supabase';
import { printReceipt, extractOrderNumbers } from '../services/printerService';
import Icon from 'react-native-vector-icons/FontAwesome';
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { showAlert } from '../utils/alertUtils';

const OrderListScreen = ({ navigation, route }) => {
  const [orders, setOrders] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [sectionedOrders, setSectionedOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { customerId } = route.params || {};
      const { data: { user } = {} } = await supabase.auth.getUser();
      setCurrentUser(user || null);
      const targetUserId = customerId || user?.id;

      if (targetUserId) {
        const fetchedOrders = await getOrders(targetUserId);
        if (fetchedOrders && Array.isArray(fetchedOrders)) {
          setOrders(fetchedOrders);
        } else {
          setOrders([]);
        }
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.warn('Error in fetchOrders:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [route.params]);

  useEffect(() => {
    fetchOrders();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setCurrentUser(session.user);
        fetchOrders();
      } else {
        setCurrentUser(null);
        if (!route.params?.customerId) {
          setOrders([]);
        }
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe?.();
    };
  }, [fetchOrders, route.params]);

  useEffect(() => {
    let filtered = orders;

    if (searchQuery) {
      filtered = filtered.filter(order => {
        const { orderNumber, dayOrderNo } = extractOrderNumbers(order);
        const query = searchQuery.toLowerCase().trim();
        return (
          (orderNumber && orderNumber.toLowerCase().includes(query)) ||
          (dayOrderNo && dayOrderNo.toLowerCase().includes(query)) ||
          (order.id && order.id.toLowerCase().includes(query))
        );
      });
    }

    if (selectedStatus) {
      filtered = filtered.filter(order => order.status === selectedStatus);
    }

    if (selectedDate) {
      filtered = filtered.filter(order =>
        new Date(order.created_at).toLocaleDateString() === new Date(selectedDate).toLocaleDateString()
      );
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
    await fetchOrders();
    setRefreshing(false);
  };

  const handleDeleteOrder = async (orderId) => {
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

  const renderOrderItem = ({ item }) => {
    const { orderNumber, dayOrderNo } = extractOrderNumbers(item);
    return (
      <TouchableOpacity
        style={styles.orderItem}
        onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
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
        <Text style={styles.orderAmount}>Total: ₹{item.total_amount.toFixed(2)}</Text>
        <Text style={styles.orderDate}>Date: {new Date(item.created_at).toLocaleDateString()}</Text>
        {item.table_no && <Text style={styles.orderDate}>Table No: {item.table_no}</Text>}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={() => printReceipt(item)}
            style={{ marginRight: 8 }}
            accessibilityLabel="Print Receipt"
          >
            <Icon name="print" size={20} color="#10B981" style={styles.actionIcon} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('OrderEdit', { orderId: item.id })}>
            <Icon name="edit" size={20} color="#007AFF" style={styles.actionIcon} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteOrder(item.id)}>
            <Icon name="trash" size={20} color="#FF3B30" style={styles.actionIcon} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const isGuest = !currentUser && !route.params?.customerId;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
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
          <Text style={styles.headerTitle}>Your Orders</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('Invoice')} style={{ marginRight: 15 }}>
            <Icon name="file-text" size={22} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
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
              placeholder="Search by Order No..."
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
            <TouchableOpacity style={styles.datePickerButton} onPress={showDatePicker}>
              <Icon name="calendar" size={14} color="#007AFF" style={{ marginRight: 8 }} />
              <Text style={styles.datePickerButtonText}>
                {selectedDate ? new Date(selectedDate).toLocaleDateString() : 'Filter by Date'}
              </Text>
              {selectedDate && (
                <TouchableOpacity onPress={() => setSelectedDate(null)} style={{ marginLeft: 8 }}>
                  <Icon name="times-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="date"
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
              <Text style={styles.noOrdersText}>No orders found.</Text>
              <Text style={styles.noOrdersSubtext}>Looks like you haven't placed any orders matching this filter.</Text>
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => navigation.navigate('Catalog')}
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
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={[styles.listContent, { flexGrow: 1, paddingBottom: 40 }]}
            />
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
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
  datePickerButton: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerButtonText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  totalAmountContainer: {
    padding: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
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
  orderAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 12,
    color: '#64748B',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
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