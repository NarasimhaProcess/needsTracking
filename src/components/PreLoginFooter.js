import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { FontAwesome as Icon } from '@expo/vector-icons';
import { showAlert } from '../utils/alertUtils';

const BUSINESS_PHONE = '9849414545';
const FORMATTED_PHONE = '+91 98494 14545';
const BRAND_NAME = 'LocalWala';

export default function PreLoginFooter({ containerStyle, compact = false }) {
  const handleOpenUrl = async (url, fallbackMsg) => {
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
        return;
      }
      const canOpen = await Linking.canOpenURL(url).catch(() => true);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        showAlert('Contact LocalWala', fallbackMsg || `Please reach us at ${FORMATTED_PHONE}`);
      }
    } catch (err) {
      console.warn('[PreLoginFooter] Error opening URL:', err);
      showAlert('Contact LocalWala', fallbackMsg || `Please reach us at ${FORMATTED_PHONE}`);
    }
  };

  const handleWhatsAppCall = () => {
    const text = encodeURIComponent(
      `Hello ${BRAND_NAME} Team, I would like to request a WhatsApp Call to set up my business on ${BRAND_NAME}.`
    );
    const url = `https://wa.me/91${BUSINESS_PHONE}?text=${text}`;
    handleOpenUrl(url, `Call our WhatsApp at ${FORMATTED_PHONE}`);
  };

  const handleWhatsAppMessage = () => {
    const text = encodeURIComponent(
      `Hello ${BRAND_NAME} Team, I want to set up my business/store on ${BRAND_NAME}. Please guide me with onboarding.`
    );
    const url = `https://wa.me/91${BUSINESS_PHONE}?text=${text}`;
    handleOpenUrl(url, `Message us on WhatsApp at ${FORMATTED_PHONE}`);
  };

  const handlePhoneCall = () => {
    const url = `tel:+91${BUSINESS_PHONE}`;
    handleOpenUrl(url, `Direct dial: ${FORMATTED_PHONE}`);
  };

  const handleSms = () => {
    const message = encodeURIComponent(
      `Hello ${BRAND_NAME} Team, I am interested in setting up my business on ${BRAND_NAME}.`
    );
    const url =
      Platform.OS === 'ios'
        ? `sms:+91${BUSINESS_PHONE}&body=${message}`
        : `sms:+91${BUSINESS_PHONE}?body=${message}`;
    handleOpenUrl(url, `Send SMS to ${FORMATTED_PHONE}`);
  };

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {/* Outer Card Container */}
      <View style={styles.cardContainer}>
        {/* Brand Header */}
        <View style={styles.headerRow}>
          <View style={styles.badgePill}>
            <Icon name="rocket" size={12} color="#059669" style={{ marginRight: 5 }} />
            <Text style={styles.badgeText}>Grow with {BRAND_NAME}</Text>
          </View>
        </View>

        <Text style={styles.title}>For setup your business</Text>
        <Text style={styles.subtitle}>
          Take your shop online, reach nearby customers & manage orders effortlessly with <Text style={styles.brandHighlight}>{BRAND_NAME}</Text>.
        </Text>

        {/* Action Buttons Grid (4 Icons: WhatsApp Call, WhatsApp Message, Call, Message) */}
        <View style={styles.actionsGrid}>
          {/* 1. WhatsApp Call */}
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.75}
            onPress={handleWhatsAppCall}
            accessibilityLabel="WhatsApp Call LocalWala"
          >
            <View style={[styles.iconCircle, styles.waCallCircle]}>
              <Icon name="whatsapp" size={22} color="#16A34A" />
              <View style={styles.miniCallBadge}>
                <Icon name="phone" size={9} color="#FFFFFF" />
              </View>
            </View>
            <Text style={styles.actionLabel}>WA Call</Text>
          </TouchableOpacity>

          {/* 2. WhatsApp Message */}
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.75}
            onPress={handleWhatsAppMessage}
            accessibilityLabel="WhatsApp Message LocalWala"
          >
            <View style={[styles.iconCircle, styles.waMsgCircle]}>
              <Icon name="whatsapp" size={24} color="#059669" />
            </View>
            <Text style={styles.actionLabel}>WA Chat</Text>
          </TouchableOpacity>

          {/* 3. Direct Phone Call */}
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.75}
            onPress={handlePhoneCall}
            accessibilityLabel="Call LocalWala"
          >
            <View style={[styles.iconCircle, styles.callCircle]}>
              <Icon name="phone" size={22} color="#0284C7" />
            </View>
            <Text style={styles.actionLabel}>Call</Text>
          </TouchableOpacity>

          {/* 4. SMS Message */}
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.75}
            onPress={handleSms}
            accessibilityLabel="SMS LocalWala"
          >
            <View style={[styles.iconCircle, styles.smsCircle]}>
              <Icon name="commenting" size={22} color="#7C3AED" />
            </View>
            <Text style={styles.actionLabel}>Message</Text>
          </TouchableOpacity>
        </View>

        {/* Direct Helpline Row */}
        <TouchableOpacity
          style={styles.helplineRow}
          activeOpacity={0.8}
          onPress={handlePhoneCall}
        >
          <Icon name="phone-square" size={16} color="#0284C7" style={{ marginRight: 6 }} />
          <Text style={styles.helplinePrefix}>Partner Desk:</Text>
          <Text style={styles.helplineNumber}>{FORMATTED_PHONE}</Text>
        </TouchableOpacity>
      </View>

      {/* Brand Trustline */}
      <Text style={styles.tagline}>
        {BRAND_NAME} • Empowering Local Businesses & Neighborhoods
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)',
      },
    }),
  },
  headerRow: {
    marginBottom: 8,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  brandHighlight: {
    fontWeight: '700',
    color: '#0284C7',
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  actionItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  waCallCircle: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  waMsgCircle: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  callCircle: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  smsCircle: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  miniCallBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#16A34A',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  helplineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  helplinePrefix: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginRight: 6,
  },
  helplineNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
});
