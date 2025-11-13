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
import { supabase, addToCart } from '../services/supabase';
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
  const [otpSent, setOtpSent] = useState(false);

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
        navigation.goBack();
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
              <TouchableOpacity style={styles.button} onPress={handleSendOtp} disabled={loading}>
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
                <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
                  <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify OTP'}</Text>
                </TouchableOpacity>
              </>
            )}

            {loading && <ActivityIndicator size="large" color="#0000ff" style={styles.activityIndicator} />}
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
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  closeButton: {
    alignSelf: 'flex-end',
  },
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f8f8',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#333',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#555',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  activityIndicator: {
    marginTop: 20,
  },
});
