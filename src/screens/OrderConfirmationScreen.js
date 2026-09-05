import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { printReceipt, extractOrderNumbers, announceOrderPrint } from '../services/printerService';
import PrinterSettingsModal from '../components/PrinterSettingsModal';
import StoreNavigationFooter from '../components/StoreNavigationFooter';

const OrderConfirmationScreen = ({ navigation, route }) => {
  const { order, customerId } = route?.params || {};
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const { orderNumber, dayOrderNo } = extractOrderNumbers(order);

  const resolvedSellerId =
    route?.params?.sellerId ||
    order?.seller_id ||
    order?.order_items?.[0]?.product_variant_combinations?.products?.user_id ||
    null;
  const resolvedSellerName = route?.params?.sellerName || order?.seller_name || null;
  const resolvedCustomerId = route?.params?.customerId || customerId || order?.customer_id || null;

  return (
    <View
      style={[
        styles.mainContainer,
        Platform.OS === 'web' && { height: '100%', maxHeight: '100vh', minHeight: 0, overflow: 'hidden' },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backHeaderBtn}
          onPress={() => navigation.popToTop()}
          accessibilityLabel="Back"
        >
          <Icon name="arrow-left" size={16} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Confirmation</Text>
        <TouchableOpacity onPress={() => navigation.popToTop()} accessibilityLabel="Close">
          <Icon name="close" size={20} color="#64748B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={[
          styles.container,
          Platform.OS === 'web' ? { flex: 1, height: '100%', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' } : null,
        ]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 150 }]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
      >
        <View style={styles.confirmationCard}>
          <View style={styles.iconCircle}>
            <Icon name="check" size={42} color="#10B981" />
          </View>
          <Text style={styles.title}>Thank You for Your Order!</Text>
          <Text style={styles.subtitle}>Your order has been placed and received by the store.</Text>

          <View style={styles.orderIdBadge}>
            <Text style={styles.orderIdLabel}>Order No:</Text>
            <Text style={styles.orderId}>#{orderNumber}</Text>
          </View>

          {dayOrderNo ? (
            <View style={styles.dayOrderBadge}>
              <Text style={styles.dayOrderLabel}>Day Order No:</Text>
              <Text style={styles.dayOrderId}>#{dayOrderNo}</Text>
            </View>
          ) : null}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Paid / Due:</Text>
            <Text style={styles.totalAmount}>₹{Number(order?.total_amount || 0).toFixed(2)}</Text>
          </View>

          {order?.payment_method && (
            <Text style={styles.paymentMethod}>
              Payment: {order.payment_method.toUpperCase()}
            </Text>
          )}

          <View style={styles.printActionRow}>
            <TouchableOpacity
              style={styles.printButton}
              onPress={() => printReceipt(order)}
              activeOpacity={0.85}
            >
              <Icon name="print" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.printButtonText}>Print Receipt</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsIconBtn}
              onPress={() => announceOrderPrint(order)}
              accessibilityLabel="Announce Order Aloud"
              activeOpacity={0.8}
            >
              <Icon name="volume-up" size={20} color="#007AFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsIconBtn}
              onPress={() => setShowPrinterSettings(true)}
              accessibilityLabel="Printer Settings"
              activeOpacity={0.8}
            >
              <Icon name="cog" size={20} color="#007AFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.navButtons}>
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => navigation.navigate('Catalog', { sellerId: resolvedSellerId, sellerName: resolvedSellerName, customerId: resolvedCustomerId })}
              activeOpacity={0.85}
            >
              <Icon name="shopping-bag" size={15} color="#007AFF" style={{ marginRight: 8 }} />
              <Text style={styles.continueButtonText}>Continue Shopping</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ordersButton}
              onPress={() => navigation.navigate('OrderList', { sellerId: resolvedSellerId, sellerName: resolvedSellerName, customerId: resolvedCustomerId })}
              activeOpacity={0.85}
            >
              <Icon name="list-alt" size={15} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.ordersButtonText}>View My Orders</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation Footer (Store, Cart, Orders) */}
      <StoreNavigationFooter
        activeTab="orders"
        navigation={navigation}
        route={route}
        sellerId={resolvedSellerId}
        sellerName={resolvedSellerName}
        customerId={resolvedCustomerId}
        forceShow={true}
      />

      <PrinterSettingsModal
        visible={showPrinterSettings}
        onClose={() => setShowPrinterSettings(false)}
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
    flexShrink: 0,
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
  },
  container: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 150,
    justifyContent: 'center',
  },
  confirmationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  orderIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 8,
  },
  orderIdLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    marginRight: 6,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  dayOrderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 16,
  },
  dayOrderLabel: {
    fontSize: 13,
    color: '#0369A1',
    fontWeight: '700',
    marginRight: 6,
  },
  dayOrderId: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0284C7',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '600',
    marginRight: 8,
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  paymentMethod: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 20,
  },
  printActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    width: '100%',
  },
  printButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  printButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  settingsIconBtn: {
    marginLeft: 10,
    padding: 12,
    backgroundColor: '#F0F7FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtons: {
    width: '100%',
    gap: 10,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  continueButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '700',
  },
  ordersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  ordersButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default OrderConfirmationScreen;