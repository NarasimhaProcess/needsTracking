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
} from 'react-native';
import { supabase, signInWithGoogle, getAuthRedirectUrl } from '../services/supabase';
import Icon from 'react-native-vector-icons/Ionicons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/alertUtils';
import PreLoginFooter from '../components/PreLoginFooter';
import PortalsMenuModal from '../components/PortalsMenuModal';

export default function DeliveryManagerSignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      const res = await signInWithGoogle('delivery_manager');
      if (res.success && res.user) {
        await supabase
          .from('profiles')
          .upsert({
            id: res.user.id,
            role: 'delivery_manager',
            full_name: res.user.user_metadata?.full_name || res.user.user_metadata?.name || 'Delivery Partner',
            email: res.user.email,
            updated_at: new Date().toISOString(),
          });

        navigation.navigate('DeliveryManagerDashboard');
      } else if (res.error) {
        showAlert('Google Sign-In Failed', res.error);
      }
    } catch (err) {
      showAlert('Error', err.message || 'Google sign-up failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      showAlert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      showAlert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      showAlert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      // Create auth account
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
          data: {
            full_name: name.trim(),
            name: name.trim(),
            role: 'delivery_manager',
            user_type: 'delivery_manager',
          }
        }
      });

      if (error) {
        showAlert('Signup Error', error.message);
      } else {
        if (data?.user) {
          const profileData = {
            id: data.user.id,
            full_name: name.trim(),
            email: email.trim(),
            role: 'delivery_manager',
            updated_at: new Date().toISOString(),
          };

          try {
            await supabase.from('profiles').upsert(profileData);
          } catch (pErr) {
            console.error('Error creating profile during delivery signup:', pErr);
          }
        }

        if (data?.session) {
          showAlert(
            'Success',
            'Account created successfully!',
            [{ text: 'Continue', onPress: () => navigation.navigate('DeliveryManagerDashboard') }]
          );
        } else {
          showAlert(
            'Success',
            'Account created successfully! Please check your email for verification.',
            [{ text: 'OK', onPress: () => navigation.navigate('DeliveryManagerLogin') }]
          );
        }
      }
    } catch (error) {
      showAlert('Error', 'An unexpected error occurred');
      console.error('Signup error:', error);
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
              <Text style={styles.icon}>🚚</Text>
            </View>
            <Text style={styles.title}>Delivery Signup</Text>
            <Text style={styles.subtitle}>Create your delivery partner account</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

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
                placeholder="Enter your password (min 6 chars)"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                placeholderTextColor="#94A3B8"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignup}
              disabled={loading || googleLoading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </Text>
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
              onPress={handleGoogleSignup}
              disabled={loading || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#4285F4" />
              ) : (
                <View style={styles.googleButtonContent}>
                  <FontAwesome name="google" size={18} color="#EA4335" style={{ marginRight: 10 }} />
                  <Text style={styles.googleButtonText}>Sign up with Google</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.loginContainer}>
              <Text style={styles.signupText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('DeliveryManagerLogin')}>
                <Text style={styles.signupLink}>Sign In</Text>
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
    backgroundColor: '#FAF5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9D5FF',
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
  loginContainer: {
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
