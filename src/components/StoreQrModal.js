import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome as Icon } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { printStoreStandee } from '../services/printerService';
import { setPreferredStore } from '../services/localStorageService';
import { showAlert } from '../utils/alertUtils';

export function getStoreDirectUrl(seller) {
  if (!seller?.id) return '';
  let baseUrl = 'https://narasimhareddyaiapp2-localwala.github.io/needsTracking';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    const pathname = window.location.pathname.replace(/\/$/, '');
    baseUrl = `${origin}${pathname}`;
  }
  const nameParam = seller.full_name ? `&sellerName=${encodeURIComponent(seller.full_name)}` : '';
  return `${baseUrl}/?sellerId=${encodeURIComponent(seller.id)}${nameParam}`;
}

export default function StoreQrModal({ visible, onClose, seller, onBrowseStore }) {
  const [copied, setCopied] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  if (!seller) return null;

  const storeUrl = getStoreDirectUrl(seller);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&margin=10&data=${encodeURIComponent(storeUrl)}`;

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      showAlert('Error', 'Failed to copy link to clipboard');
    }
  };

  const handlePrintStandee = async () => {
    setPrinting(true);
    try {
      await printStoreStandee({
        sellerName: seller.full_name || 'Store',
        sellerAddress: seller.city || seller.address || '',
        sellerPhone: seller.mobile || seller.phone || '',
        storeUrl,
        qrImageUrl,
      });
    } catch (err) {
      showAlert('Print Error', err.message || 'Could not launch print standee');
    } finally {
      setPrinting(false);
    }
  };

  const handleBrowseNow = async () => {
    try {
      await setPreferredStore(seller.id, seller.full_name);
    } catch (_) {}
    onClose?.();
    if (onBrowseStore) {
      onBrowseStore(seller);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconBox}>
                <Icon name="qrcode" size={18} color="#007AFF" />
              </View>
              <View>
                <Text style={styles.modalTitle}>Store QR Code</Text>
                <Text style={styles.modalSubtitle}>Scan to browse & order on mobile</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Icon name="times" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Store Information Card */}
            <View style={styles.storeCard}>
              <View style={styles.storeLogoBox}>
                {seller.firstPhoto || seller.avatar_url ? (
                  <Image
                    source={{ uri: seller.firstPhoto || seller.avatar_url }}
                    style={styles.storeLogo}
                  />
                ) : (
                  <Icon name="building" size={20} color="#007AFF" />
                )}
              </View>
              <View style={styles.storeCardInfo}>
                <Text style={styles.storeCardName} numberOfLines={1}>
                  {seller.full_name}
                </Text>
                <Text style={styles.storeCardAddress} numberOfLines={1}>
                  <Icon name="map-marker" size={11} color="#64748B" />{' '}
                  {seller.city || seller.address || 'Local Marketplace'}
                </Text>
              </View>
              <View style={styles.verifiedTag}>
                <Icon name="check-circle" size={12} color="#059669" />
                <Text style={styles.verifiedTagText}>Verified</Text>
              </View>
            </View>

            {/* QR Code Container */}
            <View style={styles.qrCard}>
              <View style={styles.qrImageFrame}>
                {imageLoading && (
                  <View style={styles.qrLoadingBox}>
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text style={styles.qrLoadingText}>Generating QR...</Text>
                  </View>
                )}
                <Image
                  source={{ uri: qrImageUrl }}
                  style={[styles.qrImage, imageLoading && { display: 'none' }]}
                  onLoadEnd={() => setImageLoading(false)}
                  resizeMode="contain"
                />
              </View>

              <Text style={styles.qrInstruction}>
                Scan with any mobile camera to open this store's digital catalog directly.
              </Text>
              <Text style={styles.noAppNote}>No app download required • Works on any smartphone</Text>
            </View>

            {/* Store Direct Link Box */}
            <View style={styles.urlBox}>
              <View style={styles.urlTextWrap}>
                <Icon name="link" size={12} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.urlText} numberOfLines={1}>
                  {storeUrl}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.copyUrlBtn, copied && styles.copyUrlBtnSuccess]}
                onPress={handleCopyLink}
                activeOpacity={0.8}
              >
                <Icon
                  name={copied ? 'check' : 'clone'}
                  size={12}
                  color={copied ? '#FFFFFF' : '#007AFF'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.copyUrlText, copied && styles.copyUrlTextSuccess]}>
                  {copied ? 'Copied' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Primary Action Buttons */}
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={styles.browseStoreBtn}
                onPress={handleBrowseNow}
                activeOpacity={0.85}
              >
                <Icon name="shopping-bag" size={15} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.browseStoreBtnText}>Browse This Store</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.printStandeeBtn}
                onPress={handlePrintStandee}
                disabled={printing}
                activeOpacity={0.85}
              >
                {printing ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <>
                    <Icon name="print" size={15} color="#007AFF" style={{ marginRight: 8 }} />
                    <Text style={styles.printStandeeBtnText}>Print Shop Standee</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Shopkeeper Tip */}
            <View style={styles.tipBox}>
              <Icon name="lightbulb-o" size={16} color="#D97706" style={{ marginRight: 8, marginTop: 2 }} />
              <Text style={styles.tipText}>
                <Text style={{ fontWeight: '700' }}>For Shop Owners:</Text> Click "Print Shop Standee" to print a counter standee or poster to place at your store counter so walk-in customers can browse your items on their phones!
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
  },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storeLogoBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginRight: 10,
  },
  storeLogo: {
    width: 44,
    height: 44,
  },
  storeCardInfo: {
    flex: 1,
    marginRight: 8,
  },
  storeCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  storeCardAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 4,
  },
  verifiedTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  qrCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
  },
  qrImageFrame: {
    width: 220,
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  qrLoadingBox: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  qrLoadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  qrImage: {
    width: 204,
    height: 204,
  },
  qrInstruction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 4,
  },
  noAppNote: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  urlTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  urlText: {
    fontSize: 12,
    color: '#334155',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyUrlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  copyUrlBtnSuccess: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  copyUrlText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  copyUrlTextSuccess: {
    color: '#FFFFFF',
  },
  actionsGrid: {
    gap: 10,
    marginBottom: 16,
  },
  browseStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 13,
    borderRadius: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  browseStoreBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  printStandeeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  printStandeeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284C7',
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
});
