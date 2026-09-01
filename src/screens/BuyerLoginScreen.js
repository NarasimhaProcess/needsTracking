import React, { useState } from 'react';
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
import { supabase, signInWithGoogle, addToCart, getAuthRedirectUrl } from '../services/supabase';
import { getGuestCart, clearGuestCart } from '../services/localStorageService';
import Icon from 'react-native-vector-icons/Ionicons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Constants from 'expo-constants';
import { showAlert } from '../utils/alertUtils';
import PreLoginFooter from '../components/PreLoginFooter';
import PortalsMenuModal from '../components/PortalsMenuModal';

const mergeGuestCart = async (userId) => {
  try {
    const guestCart = await getGuestCart();
    if (guestCart && guestCart.length > 0) {
      for (const item of guestCart) {
        await addToCart(userId, item.product_variant_combination_id || item.id, item.quantity || 1);
      }
      await clearGuestCart();
    }
  } catch (e) {
    console.warn('Error merging guest cart:', e);
  }
};

export default function BuyerLoginScreen({ navigation, route }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const onAuthSuccess = route.params?.onAuthSuccess;
  const redirectTo = route.params?.redirectTo || route.params?.redirectScreen;
  const redirectParams = route.params?.redirectParams || (route.params?.productId ? { productId: route.params.productId, customerId: route.params.customerId } : undefined);

  const navigateAfterAuth = (user) => {
    if (onAuthSuccess) {
      try {
        onAuthSuccess(user);
      } catch (e) {
        console.warn('onAuthSuccess error:', e);
      }
    }
    if (redirectTo) {
      navigation.navigate(redirectTo, redirectParams || {});
    } else {
      navigation.navigate('Catalog');
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      showAlert('Error', 'Please fill in both email and password');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        showAlert('Login Error', error.message);
      } else if (data?.user) {
        // Ensure profile exists with customer role
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', data.user.id)
          .maybeSingle();

        if (!profile) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email,
            full_name: data.user.user_metadata?.full_name || 'Buyer',
            role: 'customer',
            updated_at: new Date().toISOString(),
          });
        }

        await mergeGuestCart(data.user.id);
        navigateAfterAuth(data.user);
      }
    } catch (error) {
      showAlert('Error', 'An unexpected error occurred during login');
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const res = await signInWithGoogle('customer');
      if (res.success && res.user) {
        await mergeGuestCart(res.user.id);
        navigateAfterAuth(res.user);
      } else if (res.error) {
        showAlert('Google Sign-In Failed', res.error);
      }
    } catch (err) {
      showAlert('Error', err.message || 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (!email.trim()) {
      showAlert('Error', 'Please enter your email first');
      return;
    }

    supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getAuthRedirectUrl(),
    }).then(() => {
      showAlert('Success', 'Password reset email sent. Please check your inbox.');
    }).catch((error) => {
      showAlert('Error', error.message);
    });
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
          <Icon name="ellipsis-horizontal" size={22} color="#1E293B" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionIconButton} 
          onPress={() => navigation.goBack()}
        >
          <Icon name="close" size={24} color="#1E293B" />
        </TouchableOpacity>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.authCard}>
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Text style={styles.icon}>🛍️</Text>
            </View>
            <Text style={styles.title}>Buyer Sign In</Text>
            <Text style={styles.subtitle}>Sign in to browse shops, order & track items</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading || googleLoading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Signing In...' : 'Sign In'}
              </Text>
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
              onPress={handleGoogleLogin}
              disabled={loading || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#4285F4" />
              ) : (
                <View style={styles.googleButtonContent}>
                  <FontAwesome name="google" size={18} color="#EA4335" style={{ marginRight: 10 }} />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={handleForgotPassword}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('BuyerSignup', { redirectTo, redirectParams })}>
                <Text style={styles.signupLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>

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
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 14,
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
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
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
  googleButtonText: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '600',
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 14,
  },
  forgotPasswordText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  signupText: {
    fontSize: 14,
    color: '#64748B',
  },
  signupLink: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '700',
  },
});
