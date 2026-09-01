import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import {
  getPrinterConfig,
  savePrinterConfig,
  scanAndConnectWebBluetooth,
  printTestReceipt,
  DEFAULT_PRINTER_CONFIG,
} from '../services/printerService';
import { showAlert } from '../utils/alertUtils';

const PrinterSettingsModal = ({ visible, onClose }) => {
  const [config, setConfig] = useState(DEFAULT_PRINTER_CONFIG);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);

  useEffect(() => {
    if (visible) {
      loadConfig();
    }
  }, [visible]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const saved = await getPrinterConfig();
      setConfig(saved);
    } catch (err) {
      console.warn('Error loading printer config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await savePrinterConfig(config);
      showAlert('Saved', 'Printer settings saved successfully.');
      onClose();
    } catch (err) {
      showAlert('Error', 'Failed to save printer settings.');
    }
  };

  const handleScanBluetooth = async () => {
    setScanning(true);
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.bluetooth) {
          const result = await scanAndConnectWebBluetooth();
          setConfig(result.config);
          showAlert('Connected!', `Successfully connected to ${result.deviceName}.`);
        } else {
          showAlert(
            'Web Bluetooth Notice',
            'Direct Bluetooth pairing from the browser is only supported in Chrome, Edge, and Opera (on PC and Android) over HTTPS.\n\nYou can still print receipts directly using your browser\'s Print / PDF dialog!'
          );
        }
      } else {
        showAlert(
          'Bluetooth Pairing',
          '1. Ensure your Bluetooth printer is turned ON.\n2. Open your phone\'s Bluetooth Settings and pair with your printer (PIN: 0000 or 1234).\n3. Enter the printer name or MAC address below and tap Save.'
        );
      }
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        showAlert('Bluetooth Scan', err.message || 'Could not discover Bluetooth devices.');
      }
    } finally {
      setScanning(false);
    }
  };

  const handleTestPrint = async () => {
    setTestPrinting(true);
    try {
      await savePrinterConfig(config);
      await printTestReceipt();
    } catch (err) {
      console.error('Test print error:', err);
    } finally {
      setTestPrinting(false);
    }
  };

  const handleDisconnect = async () => {
    const updated = {
      ...config,
      printerName: '',
      printerAddress: '',
    };
    setConfig(updated);
    await savePrinterConfig(updated);
    showAlert('Disconnected', 'Printer unlinked.');
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Icon name="print" size={22} color="#007AFF" style={{ marginRight: 8 }} />
              <Text style={styles.headerTitle}>Thermal Printer Setup</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="times" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={{ marginTop: 10, color: '#666' }}>Loading settings...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* Connected Device Status Card */}
              <View style={styles.statusCard}>
                <View style={styles.statusHeader}>
                  <Text style={styles.statusLabel}>DEVICE STATUS</Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: config.printerName ? '#E8F5E9' : '#FFF3E0' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: config.printerName ? '#2E7D32' : '#E65100' },
                      ]}
                    >
                      {config.printerName ? 'Configured' : 'No Printer'}
                    </Text>
                  </View>
                </View>

                {config.printerName ? (
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{config.printerName}</Text>
                    {config.printerAddress ? (
                      <Text style={styles.deviceAddress}>ID: {config.printerAddress}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={styles.disconnectBtn}
                      onPress={handleDisconnect}
                    >
                      <Icon name="chain-broken" size={14} color="#D32F2F" />
                      <Text style={styles.disconnectText}>Unlink Printer</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.noDeviceText}>
                    No Bluetooth printer linked yet. Scan to pair or enter device name below.
                  </Text>
                )}

                {/* Scan / Pair Button */}
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={handleScanBluetooth}
                  disabled={scanning}
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Icon name="bluetooth" size={18} color="#fff" />
                      <Text style={styles.scanButtonText}>
                        {Platform.OS === 'web' ? 'Scan Bluetooth Printers' : 'Pair / Scan Bluetooth'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Paper Size Setting */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Paper Width</Text>
                <View style={styles.paperRow}>
                  <TouchableOpacity
                    style={[
                      styles.paperOption,
                      config.paperWidth === '58mm' && styles.paperOptionSelected,
                    ]}
                    onPress={() => setConfig({ ...config, paperWidth: '58mm' })}
                  >
                    <Icon
                      name="file-text-o"
                      size={20}
                      color={config.paperWidth === '58mm' ? '#007AFF' : '#666'}
                    />
                    <Text
                      style={[
                        styles.paperOptionText,
                        config.paperWidth === '58mm' && styles.paperOptionTextSelected,
                      ]}
                    >
                      58mm (2-inch POS)
                    </Text>
                    <Text style={styles.paperOptionSub}>Standard handheld</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.paperOption,
                      config.paperWidth === '80mm' && styles.paperOptionSelected,
                    ]}
                    onPress={() => setConfig({ ...config, paperWidth: '80mm' })}
                  >
                    <Icon
                      name="file-text-o"
                      size={20}
                      color={config.paperWidth === '80mm' ? '#007AFF' : '#666'}
                    />
                    <Text
                      style={[
                        styles.paperOptionText,
                        config.paperWidth === '80mm' && styles.paperOptionTextSelected,
                      ]}
                    >
                      80mm (3-inch POS)
                    </Text>
                    <Text style={styles.paperOptionSub}>Desktop counter</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Store & Receipt Customization */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Receipt Header & Details</Text>

                <Text style={styles.inputLabel}>Store / Business Name</Text>
                <TextInput
                  style={styles.input}
                  value={config.storeName}
                  onChangeText={(text) => setConfig({ ...config, storeName: text })}
                  placeholder="e.g. Needs Supermarket"
                />

                <Text style={styles.inputLabel}>Address Line</Text>
                <TextInput
                  style={styles.input}
                  value={config.storeAddress}
                  onChangeText={(text) => setConfig({ ...config, storeAddress: text })}
                  placeholder="e.g. Shop #4, Main Road, City"
                />

                <View style={styles.rowTwoInputs}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.inputLabel}>Contact / Phone</Text>
                    <TextInput
                      style={styles.input}
                      value={config.storeContact}
                      onChangeText={(text) => setConfig({ ...config, storeContact: text })}
                      placeholder="e.g. 9876543210"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>GSTIN / Tax No</Text>
                    <TextInput
                      style={styles.input}
                      value={config.gstNumber}
                      onChangeText={(text) => setConfig({ ...config, gstNumber: text })}
                      placeholder="e.g. 29ABCDE1234F1Z5"
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Footer Note</Text>
                <TextInput
                  style={styles.input}
                  value={config.footerNote}
                  onChangeText={(text) => setConfig({ ...config, footerNote: text })}
                  placeholder="e.g. Thank You! Visit Again."
                />
              </View>

              {/* Test Print Slip */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Printer Diagnostics</Text>
                <TouchableOpacity
                  style={styles.testButton}
                  onPress={handleTestPrint}
                  disabled={testPrinting}
                >
                  {testPrinting ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <>
                      <Icon name="vcard-o" size={16} color="#007AFF" />
                      <Text style={styles.testButtonText}>Print Test Slip</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* Bottom Action Buttons */}
          <View style={styles.footerActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Icon name="check" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Save Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 20 : 16,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 560 : 420,
    height: Platform.OS === 'web' ? '88vh' : '86%',
    maxHeight: Platform.OS === 'web' ? '88vh' : '86%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.22)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  closeButton: {
    padding: 6,
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
    paddingBottom: 30,
  },
  statusCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deviceInfo: {
    marginBottom: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  deviceAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  disconnectText: {
    fontSize: 13,
    color: '#D32F2F',
    fontWeight: '600',
    marginLeft: 6,
  },
  noDeviceText: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
    lineHeight: 18,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 6,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 10,
  },
  paperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paperOption: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  paperOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
  },
  paperOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 6,
  },
  paperOptionTextSelected: {
    color: '#007AFF',
  },
  paperOptionSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
  },
  rowTwoInputs: {
    flexDirection: 'row',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
    paddingVertical: 12,
    borderRadius: 8,
  },
  testButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  footerActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default PrinterSettingsModal;
