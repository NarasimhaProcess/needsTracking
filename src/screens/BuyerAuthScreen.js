import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase, addToCart, signInWithGoogle } from '../services/supabase';
import { getGuestCart, clearGuestCart } from '../services/localStorageService';
import { showAlert } from '../utils/alertUtils';
import PreLoginFooter from '../components/PreLoginFooter';
import PortalsMenuModal from '../components/PortalsMenuModal';

const mergeGuestCart = async (userId) => {
  const guestCart = await getGuestCart();
  if (guestCart && guestCart.length > 0) {
    for (const item of guestCart) {
      await addToCart(userId, item.product_variant_combination_id || item.id, item.quantity || 1);
    }
    await clearGuestCart();
  }
};

export default function BuyerAuthScreen({ navigation, route }) {
  const [mobileNumber, setMobileNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const res = await signInWithGoogle('customer');
      if (res.success && res.user) {
        await mergeGuestCart(res.user.id);
        if (route.params?.onAuthSuccess) {
          try { route.params.onAuthSuccess(res.user); } catch (e) {}
        }
        if (route.params?.redirectTo) {
          navigation.navigate(route.params.redirectTo, route.params.redirectParams || {});
        } else {
          navigation.navigate('Catalog');
        }
      } else if (res.error) {
        showAlert('Google Sign-In Failed', res.error);
      }
    } catch (err) {
      showAlert('Error', err.message || 'Failed to sign in with Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!mobileNumber) {
      showAlert('Error', 'Please enter your mobile number.');
      return;
    }

    setLoading(true);
    try {
      // --- DEVELOPMENT DUMMY OTP GENERATION START ---
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
      const day = String(today.getDate()).padStart(2, '0');
      const dummyOtp = `${year}${month}${day}`;

      showAlert('Dummy OTP Generated', `For development, use OTP: ${dummyOtp}`);
      setOtpSent(true); // Proceed to show OTP input field
      // --- DEVELOPMENT DUMMY OTP GENERATION END ---

    } catch (error) {
      showAlert('Error', 'An unexpected error occurred.');
      console.error('Send OTP error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!mobileNumber || !otp) {
      showAlert('Error', 'Please enter both mobile number and OTP.');
      return;
    }

    setLoading(true);
    try {
      // --- DEVELOPMENT BYPASS START ---
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const bypassOtp = `${year}${month}${day}`;

      if (otp !== bypassOtp) {
        showAlert('Verification Failed', 'Invalid OTP entered. Please try again.');
        setLoading(false);
        return;
      }
      // --- DEVELOPMENT BYPASS END ---

      const dummyEmail = `${mobileNumber.replace('+', '')}@buyer.local`;
      const dummyPassword = `buyer_${mobileNumber.replace('+', '')}`;

      let { data, error } = await supabase.auth.signInWithPassword({
        email: dummyEmail,
        password: dummyPassword,
      });

      if (error) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: dummyEmail,
          password: dummyPassword,
          options: {
            data: {
              role: 'customer',
              mobile: mobileNumber,
            },
          },
        });

        if (signUpError) {
          showAlert('Sign Up Error', signUpError.message);
          setLoading(false);
          return;
        }

        data = signUpData;
      }

      if (data?.user) {
        const userId = data.user.id;
        await mergeGuestCart(userId);

        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('mobile', mobileNumber)
          .maybeSingle();

        if (!existingProfile) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id')
            .eq('mobile', mobileNumber)
            .maybeSingle();

          const userRole = customer ? 'customer' : 'buyer';

          await supabase
            .from('profiles')
            .insert({ id: userId, role: userRole, mobile: mobileNumber });
        }
        if (route.params?.onAuthSuccess) {
          try { route.params.onAuthSuccess(data.user); } catch (e) {}
        }
        if (route.params?.redirectTo) {
          navigation.navigate(route.params.redirectTo, route.params.redirectParams || {});
        } else {
          navigation.navigate('Catalog');
        }
      }
    } catch (error) {
      showAlert('Error', 'An unexpected error occurred.');
      console.error('Verify OTP error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topRightActions}>
        <TouchableOpacity 
          style={styles.actionIconButton} 
          onPress={() => setIsMenuVisible(true)}
          accessibilityLabel="Portals Menu"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#1E293B" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionIconButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={24} color="#1E293B" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.authCard}>
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Text style={styles.icon}>🛍️</Text>
            </View>
            <Text style={styles.title}>Buyer Login</Text>
            <Text style={styles.subtitle}>Sign in with Google or mobile number</Text>
          </View>

          <TouchableOpacity 
            style={[styles.googleButton, googleLoading && styles.buttonDisabled]} 
            onPress={handleGoogleSignIn}
            disabled={googleLoading || loading}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#4285F4" />
            ) : (
              <View style={styles.googleButtonContent}>
                <Icon name="google" size={18} color="#EA4335" style={styles.googleIcon} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR WITH MOBILE</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mobile Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., +919876543210"
              placeholderTextColor="#94A3B8"
              value={mobileNumber}
              onChangeText={setMobileNumber}
              keyboardType="phone-pad"
              autoCapitalize="none"
              editable={!otpSent}
            />
          </View>

          {!otpSent ? (
            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSendOtp} disabled={loading || googleLoading}>
              <Text style={styles.buttonText}>{loading ? 'Sending OTP...' : 'Send OTP'}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>One-Time Password (OTP)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter OTP"
                  placeholderTextColor="#94A3B8"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="numeric"
                  secureTextEntry
                />
              </View>
              <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleVerifyOtp} disabled={loading || googleLoading}>
                <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify OTP'}</Text>
              </TouchableOpacity>
            </>
          )}

          {loading && <ActivityIndicator size="large" color="#007AFF" style={styles.activityIndicator} />}

          <PreLoginFooter containerStyle={{ marginTop: 16, paddingHorizontal: 0 }} />
        </View>
      </ScrollView>

      {/* Portals & Pre-login 3-dots Menu Modal */}
      <PortalsMenuModal
        visible={isMenuVisible}
        onClose={() => setIsMenuVisible(false)}
        navigation={navigation}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topRightActions: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    right: 18,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 24 : 16,
    paddingTop: Platform.OS === 'ios' ? 80 : 64,
    paddingBottom: 40,
  },
  authCard: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 440 : 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
      },
    }),
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: '#334155',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0F172A',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    elevation: 2,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  activityIndicator: {
    marginTop: 15,
  },
});
