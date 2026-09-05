import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import {
  addInAppNotificationListener,
  handleNotificationClick,
} from '../services/notificationService';

export default function NotificationBanner({ navigationRef }) {
  const [activeNotification, setActiveNotification] = useState(null);
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const dismissTimerRef = useRef(null);

  useEffect(() => {
    const unsubscribe = addInAppNotificationListener((notif) => {
      if (!notif) return;

      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }

      setActiveNotification(notif);

      // Slide down and fade in
      slideAnim.setValue(-120);
      opacityAnim.setValue(0);

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 320,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();

      // Auto dismiss after 6.5 seconds
      dismissTimerRef.current = setTimeout(() => {
        dismissBanner();
      }, 6500);
    });

    return () => {
      unsubscribe();
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const dismissBanner = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 250,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => {
      setActiveNotification(null);
    });
  };

  const handlePress = () => {
    if (!activeNotification) return;
    const data = activeNotification.data;
    dismissBanner();

    if (data?.orderId) {
      navigationRef?.current?.navigate('OrderDetail', { orderId: data.orderId });
    } else if (data?.productId) {
      navigationRef?.current?.navigate('ProductDetailScreen', { productId: data.productId });
    } else {
      handleNotificationClick(data);
    }
  };

  if (!activeNotification) return null;

  const notifType = activeNotification.data?.type || '';
  const title = activeNotification.title || 'Notification';
  const body = activeNotification.body || '';

  // Dynamic icon based on notification context
  let iconEmoji = '🔔';
  if (title.includes('🛵') || notifType === 'delivery_assignment' || notifType === 'delivery_accepted') {
    iconEmoji = '🛵';
  } else if (title.includes('🚚') || notifType === 'out_for_delivery') {
    iconEmoji = '🚚';
  } else if (title.includes('✅') || notifType === 'delivered' || notifType === 'completed') {
    iconEmoji = '✅';
  } else if (title.includes('❌') || notifType === 'cancelled') {
    iconEmoji = '❌';
  } else if (title.includes('🎉') || title.includes('Order') || notifType === 'new_order') {
    iconEmoji = '📦';
  }

  // Remove leading emoji from title if already present
  const cleanTitle = title.replace(/^[\p{Emoji}\s]+/u, '').trim() || title;

  return (
    <Animated.View
      style={[
        styles.bannerContainer,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.88}
        onPress={handlePress}
      >
        <View style={styles.iconContainer}>
          <Text style={styles.iconEmoji}>{iconEmoji}</Text>
        </View>

        <View style={styles.textContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              {cleanTitle}
            </Text>
            <Text style={styles.timeText}>Just now</Text>
          </View>
          {!!body && (
            <Text style={styles.body} numberOfLines={2}>
              {body}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={dismissBanner}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Dismiss Notification"
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    top: Platform.OS === 'web' ? 18 : 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999999,
    elevation: 999999,
    paddingHorizontal: 16,
  },
  card: {
    maxWidth: 520,
    width: '100%',
    backgroundColor: '#0F172A', // Dark Slate
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconEmoji: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  body: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 6,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 14,
  },
});
