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
} from 'react-native';
import { supabase } from '../services/supabaseClient';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from '../services/notificationService';



export default function LoginScreen({ navigation, route, onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // New useEffect hook for biometric login attempt
  useEffect(() => {
    const attemptBiometricLogin = async () => {
      setLoading(true); // Show loading indicator while attempting biometric login
      try {
        const biometricsEnabled = await AsyncStorage.getItem('BIOMETRICS_ENABLED');
        const biometricsEmail = await AsyncStorage.getItem('BIOMETRICS_EMAIL');

        if (biometricsEnabled === 'true' && biometricsEmail) {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();

          if (hasHardware && isEnrolled) {
            const authResult = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Authenticate to log in',
              cancelLabel: 'Use password',
            });

            if (authResult.success) {
              console.log('Biometric authentication successful on device.');
              // Check if a Supabase session already exists and is valid
              const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

              if (sessionError) {
                console.error('Error getting Supabase session:', sessionError);
                Alert.alert('Biometric Login', 'Could not verify session. Please log in manually.');
              } else if (sessionData.session) {
                console.log('Supabase session found. Navigating to app.');
                if (onAuthSuccess) {
                  onAuthSuccess(sessionData.session, navigation);
                }
              } else {
                console.log('No active Supabase session found. Attempting to restore session with refresh token.');
                const storedRefreshToken = await AsyncStorage.getItem('SUPABASE_REFRESH_TOKEN');
                if (storedRefreshToken) {
                  const { data: refreshData, error: refreshError } = await supabase.auth.setSession({
                    refresh_token: storedRefreshToken,
                  });
                  if (refreshError) {
                    console.error('Error setting session with refresh token:', refreshError);
                    Alert.alert('Biometric Login', 'Could not restore session. Please log in manually.');
                    setEmail(biometricsEmail); // Pre-fill email for manual login
                  } else if (refreshData.session) {
                    console.log('Session restored with refresh token. Navigating to app.');
                    if (onAuthSuccess) {
                      onAuthSuccess(refreshData.session, navigation);
                    }
                  } else {
                    console.log('Failed to restore session with refresh token. Manual login required.');
                    setEmail(biometricsEmail); // Pre-fill email for manual login
                  }
                } else {
                  console.log('No refresh token found. Manual login required.');
                  setEmail(biometricsEmail); // Pre-fill email for manual login
                }
              }
            } else {
              console.log('Biometric authentication failed or cancelled by user.');
            }
          } else {
            console.log('Biometric hardware not available or no biometrics enrolled.');
          }
        } else {
          console.log('Biometrics not enabled or email not stored.');
        }
      } catch (error) {
        console.error('Error during biometric login attempt:', error);
        Alert.alert('Error', 'An unexpected error occurred during biometric login.');
      } finally {
        setLoading(false); // Hide loading indicator
      }
    };

    attemptBiometricLogin();
  }, []); // Empty dependency array means this runs once on mount

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      // First, check if user exists in users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (userError || !userData) {
        Alert.alert('Login Error', 'User not found. Please check your email or sign up.');
        setLoading(false);
        return;
      }

      // Now try to authenticate with Supabase auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert('Login Error', error.message);
      } else if (data.session) {
        console.log('Login successful, session created:', data.session);
        
        // Store refresh token for biometric re-authentication
        await AsyncStorage.setItem('SUPABASE_REFRESH_TOKEN', data.session.refresh_token);

        // Call the auth success callback with the entire session object
        if (onAuthSuccess) {
          onAuthSuccess(data.session, navigation);
        }

        // Register for push notifications and save token
        try {
          const pushToken = await registerForPushNotificationsAsync(data.user); // Pass the user object
          if (pushToken) {
            console.log('Push Token obtained:', pushToken);
          }
        } catch (e) {
          console.error('Error during push notification registration:', e);
        }

        // After successful login, ask to enable biometrics
        await promptForBiometrics(data.user.email);
      } else {
        Alert.alert('Login Error', 'Could not establish a session.');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const promptForBiometrics = async (userEmail) => {
    try {
      // Check if biometrics already enabled or declined
      const biometricsEnabled = await AsyncStorage.getItem('BIOMETRICS_ENABLED');
      const biometricsDeclined = await AsyncStorage.getItem('BIOMETRICS_DECLINED');

      if (biometricsEnabled === 'true' || biometricsDeclined === 'true') {
        console.log('Biometrics preference already set. Skipping prompt.');
        return;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        console.log('Biometric hardware not available.');
        return;
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        Alert.alert(
          'No Biometrics Enrolled',
          'You have not enrolled any fingerprints or Face ID on this device.'
        );
        return;
      }

      Alert.alert(
        'Enable Biometric Login',
        'Would you like to use your fingerprint or Face ID for faster logins?',
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: async () => {
              console.log('Biometrics setup declined');
              await AsyncStorage.setItem('BIOMETRICS_DECLINED', 'true');
            },
          },
          {
            text: 'Yes, Enable',
            onPress: async () => {
              try {
                await AsyncStorage.setItem('BIOMETRICS_ENABLED', 'true');
                await AsyncStorage.setItem('BIOMETRICS_EMAIL', userEmail);
                await AsyncStorage.removeItem('BIOMETRICS_DECLINED'); // Remove declined flag if user enables
                Alert.alert(
                  'Biometrics Enabled',
                  'You can now use your fingerprint or Face ID to log in.'
                );
              } catch (e) {
                console.error('Error saving biometric preference:', e);
                Alert.alert('Error', 'Could not save your biometric preference.');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error with biometrics prompt:', error);
    }
  };

  const handleForgotPassword = () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email first');
      return;
    }

    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'user-tracking-mobile://reset-password',
    }).then(() => {
      Alert.alert('Success', 'Password reset email sent');
    }).catch((error) => {
      Alert.alert('Error', error.message);
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.icon}>📍</Text>
          <Text style={styles.title}>Location Tracker</Text>
          <Text style={styles.subtitle}>Sign in to track your location</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
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
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotPassword}
            onPress={handleForgotPassword}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2025 localwala's. Version 1.0</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#F2F2F7',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 20,
  },
  forgotPasswordText: {
    color: '#007AFF',
    fontSize: 16,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 40,
  },
  signupText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  signupLink: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  footerText: {
    fontSize: 12,
    color: '#8E8E93',
  },
});