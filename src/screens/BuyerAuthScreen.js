import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { supabase, addToCart, signInWithGoogle } from '../services/supabase';
import { getGuestCart, clearGuestCart } from '../services/localStorageService';

const mergeGuestCart = async (userId) => {
  const guestCart = await getGuestCart();
  if (guestCart && guestCart.length > 0) {
    for (const item of guestCart) {
      await addToCart(userId, item.product_variant_combination_id, item.quantity);
    }
    await clearGuestCart();
    Alert.alert('Cart Merged', 'The items from your guest cart have been added to your account.');
  }
};

export default function BuyerAuthScreen({ navigation, route }) {
  const [mobileNumber, setMobileNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const res = await signInWithGoogle('customer');
      if (res.success && res.user) {
        await mergeGuestCart(res.user.id);
        Alert.alert('Welcome!', `Logged in successfully as ${res.user.user_metadata?.full_name || res.user.email}`);
        if (route.params?.onAuthSuccess) {
          route.params.onAuthSuccess(res.user);
        }
        if (route.params?.redirectTo) {
          navigation.navigate(route.params.redirectTo, route.params.redirectParams || {});
        } else {
          navigation.navigate('Catalog');
        }
      } else if (res.error) {
        Alert.alert('Google Sign-In Failed', res.error);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to sign in with Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!mobileNumber) {
      Alert.alert('Error', 'Please enter your mobile number.');
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

      Alert.alert('Dummy OTP Generated', `For development, use OTP: ${dummyOtp}`);
      setOtpSent(true); // Proceed to show OTP input field
      // --- DEVELOPMENT DUMMY OTP GENERATION END ---

    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred.');
      console.error('Send OTP error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!mobileNumber || !otp) {
      Alert.alert('Error', 'Please enter both mobile number and OTP.');
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

      if (otp === bypassOtp) {
        Alert.alert(
          'Development Login',
          'This is a guest login for development. A new profile will not be created.'
        );

        const { data: guestAuthData, error: guestAuthError } = await supabase.auth.signInWithPassword({
          email: 'guest@example.com',
          password: 'guestpassword',
        });

        if (guestAuthError) {
          Alert.alert('Guest Login Error', `Failed to log in as guest: ${guestAuthError.message}`);
          setLoading(false);
          return;
        }

        await mergeGuestCart(guestAuthData.user.id);

        const { error: updateProfileError } = await supabase
          .from('profiles')
          .update({ mobile: mobileNumber })
          .eq('id', guestAuthData.user.id);

        if (updateProfileError) {
          console.error('Error updating guest profile with mobile:', updateProfileError.message);
        }

        setLoading(false);
        navigation.goBack();
        return;
      }
      // --- DEVELOPMENT BYPASS END ---

      const { data, error } = await supabase.auth.verifyOtp({
        phone: mobileNumber,
        token: otp,
        type: 'sms',
      });

      if (error) {
        Alert.alert('Error verifying OTP', error.message);
      } else {
        Alert.alert('Success', 'Mobile number verified. You are now logged in.');

        await mergeGuestCart(data.user.id);

        const userId = data.user.id;
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, mobile')
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
          route.params.onAuthSuccess(data.user);
        }
        if (route.params?.redirectTo) {
          navigation.navigate(route.params.redirectTo, route.params.redirectParams || {});
        } else {
          navigation.navigate('Catalog');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred.');
      console.error('Verify OTP error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalContent}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            <Text style={styles.title}>Buyer Login / Signup</Text>

            <TouchableOpacity 
              style={[styles.googleButton, googleLoading && styles.buttonDisabled]} 
              onPress={handleGoogleSignIn}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#4285F4" />
              ) : (
                <View style={styles.googleButtonContent}>
                  <Icon name="google" size={20} color="#EA4335" style={styles.googleIcon} />
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
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '92%',
    maxHeight: '85%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 6,
  },
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#1e293b',
  },
  googleButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
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
    color: '#334155',
    fontSize: 16,
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
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    marginHorizontal: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: '#475569',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  activityIndicator: {
    marginTop: 15,
  },
});
