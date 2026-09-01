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
import Icon from 'react-native-vector-icons/FontAwesome';
import { supabase, getAuthRedirectUrl } from '../services/supabase';
import { StackActions } from '@react-navigation/native';
import { showAlert } from '../utils/alertUtils';
import PreLoginFooter from '../components/PreLoginFooter';
import PortalsMenuModal from '../components/PortalsMenuModal';

export default function AuthScreen({ navigation, route }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [userType, setUserType] = useState('buyer'); // 'buyer' | 'seller' | 'delivery_partner'
  const [loading, setLoading] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const onAuthSuccess = route.params?.onAuthSuccess;

  const redirectUserByRole = (role, user) => {
    if (onAuthSuccess) {
      onAuthSuccess(user);
    }

    const r = (role || '').toLowerCase();
    if (r === 'seller' || r === 'admin' || r === 'superadmin' || r === 'appadmin' || r === 'app_admin') {
      navigation.dispatch(StackActions.replace('ProductTabs', { session: { user } }));
    } else if (r === 'delivery_partner' || r === 'delivery_manager') {
      navigation.dispatch(StackActions.replace('DeliveryManagerDashboard'));
    } else {
      // Buyer / Customer default
      navigation.dispatch(StackActions.replace('Welcome', { session: { user } }));
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Required Fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        showAlert('Login Failed', error.message);
        setLoading(false);
        return;
      }

      const user = data.user;

      // Fetch user role from profiles table (source of truth)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const role = profile?.role || user?.user_metadata?.role || 'buyer';

      // Ensure user metadata is updated with role
      try {
        await supabase.auth.updateUser({
          data: { role }
        });
      } catch (_) {}

      showAlert('Welcome Back', `Logged in successfully as ${role.toUpperCase().replace('_', ' ')}`);
      redirectUserByRole(role, user);
    } catch (err) {
      console.error('Login error:', err);
      showAlert('Error', 'An unexpected error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password || !fullName) {
      showAlert('Required Fields', 'Please fill in Full Name, Email, and Password.');
      return;
    }

    if (password.length < 6) {
      showAlert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim();

      // 1. Sign up user with metadata
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
          data: {
            role: userType,
            full_name: fullName.trim(),
            mobile: mobile.trim(),
          },
        },
      });

      if (error) {
        showAlert('Sign Up Failed', error.message);
        setLoading(false);
        return;
      }

      let user = data.user;
      let session = data.session;

      // If email confirmation is disabled on Supabase, but session wasn't returned, sign in immediately
      if (!session && user) {
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (!loginError && loginData.user) {
          user = loginData.user;
          session = loginData.session;
        }
      }

      if (user) {
        // 2. Create profile in `profiles` table with role and user details
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            role: userType,
            full_name: fullName.trim(),
            mobile: mobile.trim(),
          });

        if (profileError) {
          console.error('Error creating profile entry:', profileError.message);
        }

        showAlert('Account Created', `Registration successful! Welcome as ${userType.toUpperCase().replace('_', ' ')}.`);
        redirectUserByRole(userType, user);
      }
    } catch (err) {
      console.error('SignUp error:', err);
      showAlert('Error', 'An unexpected error occurred during sign up.');
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
          <Icon name="ellipsis-h" size={20} color="#1E293B" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionIconButton} 
          onPress={() => navigation.goBack()}
        >
          <Icon name="times" size={20} color="#1E293B" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Unified Portal</Text>
          <Text style={styles.subtitle}>
            {isSignUp ? 'Create your new account' : 'Log in to continue'}
          </Text>

          {/* Mode Switcher Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, !isSignUp && styles.activeTab]}
              onPress={() => setIsSignUp(false)}
            >
              <Text style={[styles.tabText, !isSignUp && styles.activeTabText]}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, isSignUp && styles.activeTab]}
              onPress={() => setIsSignUp(true)}
            >
              <Text style={[styles.tabText, isSignUp && styles.activeTabText]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {/* Sign Up Specific Fields */}
          {isSignUp && (
            <>
              {/* User Type Selector */}
              <Text style={styles.label}>Select User Type</Text>
              <View style={styles.userTypeContainer}>
                <TouchableOpacity
                  style={[styles.userTypeButton, userType === 'buyer' && styles.userTypeSelected]}
                  onPress={() => setUserType('buyer')}
                >
                  <Icon name="shopping-bag" size={16} color={userType === 'buyer' ? '#FFF' : '#64748B'} />
                  <Text style={[styles.userTypeText, userType === 'buyer' && styles.userTypeTextSelected]}>
                    Buyer
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.userTypeButton, userType === 'seller' && styles.userTypeSelected]}
                  onPress={() => setUserType('seller')}
                >
                  <Icon name="home" size={16} color={userType === 'seller' ? '#FFF' : '#64748B'} />
                  <Text style={[styles.userTypeText, userType === 'seller' && styles.userTypeTextSelected]}>
                    Seller
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.userTypeButton, userType === 'delivery_partner' && styles.userTypeSelected]}
                  onPress={() => setUserType('delivery_partner')}
                >
                  <Icon name="truck" size={16} color={userType === 'delivery_partner' ? '#FFF' : '#64748B'} />
                  <Text style={[styles.userTypeText, userType === 'delivery_partner' && styles.userTypeTextSelected]}>
                    Delivery
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor="#94A3B8"
                value={fullName}
                onChangeText={setFullName}
              />

              <Text style={styles.label}>Mobile Number (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter mobile number"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={mobile}
                onChangeText={setMobile}
              />
            </>
          )}

          {/* Common Fields */}
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="name@example.com"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={isSignUp ? handleSignUp : handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isSignUp ? `Sign Up as ${userType.toUpperCase().replace('_', ' ')}` : 'Log In'}
              </Text>
            )}
          </TouchableOpacity>

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
    padding: Platform.OS === 'web' ? 24 : 16,
    paddingTop: Platform.OS === 'ios' ? 80 : 64,
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
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
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  activeTabText: {
    color: '#0F172A',
    fontWeight: '700',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
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
  userTypeContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  userTypeButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 4,
  },
  userTypeSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  userTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  userTypeTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    elevation: 2,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
