import React, { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  FlatList,
  RefreshControl,
  TextInput,
  Modal,
  Switch,
  Share,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../services/supabaseClient';
import BankTransactionScreen from './BankTransactionScreen';
import BankAccountsScreen from './BankAccountsScreen';
import LocationSearchBar from '../components/AreaSearchBar';
import SearchableDropdown from '../components/SearchableDropdown';
import LeafletMap from '../components/LeafletMap';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import { Clipboard, Linking } from 'react-native'; // Added Linking
import { MaterialIcons } from '@expo/vector-icons'; // Added MaterialIcons import
import Icon from 'react-native-vector-icons/FontAwesome'; // Added FontAwesome Icon import


const getDayName = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d = new Date();
  return days[d.getDay()];
};

const getCurrentTime = () => {
  const d = new Date();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Helper functions for direct communication
const makeCall = (phoneNumber) => {
  Linking.openURL(`tel:${phoneNumber}`);
};

const sendSMS = (phoneNumber) => {
  Linking.openURL(`sms:${phoneNumber}?body=${encodeURIComponent(defaultMessageHeader)}`);
};

const sendWhatsApp = (phoneNumber) => {
  // WhatsApp URL scheme. Requires phone number with country code.
  // Example: +919876543210
  Linking.openURL(`whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(defaultMessageHeader)}`);
};

const sendEmail = (emailAddress) => {
  Linking.openURL(`mailto:${emailAddress}`);
};

const defaultMessageHeader = "Hello from LocalWala App:\n\n"; // Define a default header message

const handleGetDirections = (latitude, longitude) => {
  if (!latitude || !longitude) {
    Alert.alert('Error', 'Location data missing for directions.');
    return;
  }
  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  Linking.openURL(url).catch(err => console.error('Failed to open Google Maps:', err));
};

const AdminModal = ({ visible, onClose, title, children, onSave, saveButtonText = 'Save' }) => (
  <Modal
    animationType="slide"
    transparent={true}
    visible={visible}
    onRequestClose={onClose}
  >

    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        {children}
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={onSave}>
            <Text style={styles.saveButtonText}>{saveButtonText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const convert12HourTo24Hour = (time12h) => {
  if (!time12h) return null;
  const [time, ampm] = time12h.split(' ');
  let [hours, minutes] = time.split(':');
  hours = parseInt(hours);
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
};

const convert24HourTo12Hour = (time24h) => {
  if (!time24h) return '';
  const [hours, minutes] = time24h.split(':');
  let h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h === 0 ? 12 : h; // The hour '0' should be '12 AM'
  return `${h}:${minutes} ${ampm}`;
};

const generateTimeOptions = () => {
  const times = [];
  for (let i = 0; i < 24; i++) {
    for (let j = 0; j < 60; j += 30) {
      const hour = i === 0 ? 12 : (i > 12 ? i - 12 : i);
      const ampm = i < 12 ? 'AM' : 'PM';
      const minute = j === 0 ? '00' : '30';
      times.push(`${hour}:${minute} ${ampm}`);
    }
  }
  return times;
};

export default function AdminScreen({ navigation, user, userProfile }) {
  // Tab state
  const [activeTab, setActiveTab] = useState('users');
  const [activeConfigTab, setActiveConfigTab] = useState('repaymentPlans');

  // User management state (existing)
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]); // New state for customers
  const [loading, setLoading] = useState(false);
  const [intervals, setIntervals] = useState({});
  const [userSearchQuery, setUserSearchQuery] = useState(''); // New state for user search

  // Customer tab search states
  const [selectedCustomerAreaId, setSelectedCustomerAreaId] = useState(null);
  const [customerAreaSearchText, setCustomerAreaSearchText] = useState('');
  const [filteredCustomerAreas, setFilteredCustomerAreas] = useState([]);
  const [showCustomerAreaDropdown, setShowCustomerAreaDropdown] = useState(false);
  const [customerDetailSearchQuery, setCustomerDetailSearchQuery] = useState('');

  // New states for Customer DB Setup
  const [showCustomerDbSetupModal, setShowCustomerDbSetupModal] = useState(false);
  const [editingCustomerDb, setEditingCustomerDb] = useState(null); // To hold the customer being edited
  const [dbUrl, setDbUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [serviceRoleKey, setServiceRoleKey] = useState('');

  // Area management state
  const [areas, setAreas] = useState([]);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [areaName, setAreaName] = useState('');
  const [areaSearchQuery, setAreaSearchQuery] = useState(''); // New state for area search
  const [areaType, setAreaType] = useState('city');
  const [pinCode, setPinCode] = useState('');
  const [state, setState] = useState('');
  const [description, setDescription] = useState('');
  const [enableDay, setEnableDay] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState('');
  const [startTimeFilter, setStartTimeFilter] = useState('');
  const [endTimeFilter, setEndTimeFilter] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 20.5937,
    longitude: 78.9629,
    latitudeDelta: 10,
    longitudeDelta: 10,
  });
  const mapRef = useRef(null);

  // Group management state
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false); // New loading state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [selectedAreaIds, setSelectedAreaIds] = useState([]);
  const [groupDescription, setGroupDescription] = useState('');
  const [groupAreaSearchQuery, setGroupAreaSearchQuery] = useState(''); // New state for group area search
  const [userSearch, setUserSearch] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState(''); // New state for group search
  const [groupAreaFilterQuery, setGroupAreaFilterQuery] = useState(''); // New state for filtering groups by area
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [groupUsers, setGroupUsers] = useState([]);

  // All users and areas for selection in group modal
  const [allUsers, setAllUsers] = useState([]);
  const [allAreas, setAllAreas] = useState([]);

  // Repayment plan management state
  const [repaymentPlans, setRepaymentPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    frequency: 'weekly',
    periods: '',
    base_amount: '',
    repayment_per_period: '',
    advance_amount: '',
    late_fee_per_period: '',
    description: '',
  });

  // Customer Type management state
  const [customerTypes, setCustomerTypes] = useState([]);
  const [loadingCustomerTypes, setLoadingCustomerTypes] = useState(false);
  const [showCustomerTypeModal, setShowCustomerTypeModal] = useState(false);
  const [editingCustomerType, setEditingCustomerType] = useState(null);
  const [customerTypeDescription, setCustomerTypeDescription] = useState('');

  

  // Customer Upload state
  const [showCustomerUploadModal, setShowCustomerUploadModal] = useState(false);
  const [selectedUploadAreaId, setSelectedUploadAreaId] = useState('');
  const [uploadedCustomers, setUploadedCustomers] = useState([]); // New state for parsed CSV data

  // Customer Transaction Upload state
  const [showCustomerTransactionUploadModal, setShowCustomerTransactionUploadModal] = useState(false);
  const [uploadedCustomerTransactions, setUploadedCustomerTransactions] = useState([]);

  // Expense Upload state
  const [showExpenseUploadModal, setShowExpenseUploadModal] = useState(false);
  const [uploadedExpenses, setUploadedExpenses] = useState([]);

  // State for expanding customer transactions
  const [expandedCustomers, setExpandedCustomers] = useState({});
  const [customerTransactions, setCustomerTransactions] = useState({});

  useEffect(() => {
    // Update the navigation header title based on the active tab
    navigation.setOptions({
      title: `Admin - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`,
      headerRight: () => (
        activeTab === 'customers' && userProfile?.user_type === 'superadmin' && (
          <TouchableOpacity
            onPress={shareAllTransactionsAsCsv}
            style={{ marginRight: 15 }}
          >
            <Icon name="share-alt-square" size={24} color="#007AFF" />
          </TouchableOpacity>
        )
      ),
    });

    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'areas') {
      loadAreas();
    } else if (activeTab === 'customers') {
      loadCustomers();
      loadAreas(); // Load areas for the customer area search filter
    } else if (activeTab === 'groups') {
      loadGroups();
      loadGroupUsers();
    } else if (activeTab === 'bankTransactions') {
      // No specific load function for bank transactions yet, will be handled in its own screen
    } else if (activeTab === 'configuration') {
      if (activeConfigTab === 'repaymentPlans') {
        loadRepaymentPlans();
      } else if (activeConfigTab === 'customerTypes') {
        loadCustomerTypes();
      }
    } else if (activeTab === 'upload') {
      loadAreas(); // Load all areas for selection
      loadRepaymentPlans(); // Load all repayment plans for selection
    
    }
  }, [userProfile, activeTab, activeConfigTab, navigation]); // Add navigation to dependency array

  

  const loadCustomerTypes = async () => {
    setLoadingCustomerTypes(true);
    try {
      const { data, error } = await supabase
        .from('customer_types')
        .select('*')
        .order('status_name', { ascending: true });

      if (error) {
        throw error;
      }
      setCustomerTypes(data || []);
    } catch (error) {
      console.error('Error loading customer types:', error);
      Alert.alert('Error', 'Failed to load customer types');
    } finally {
      setLoadingCustomerTypes(false);
    }
  };

  useEffect(() => {
    // Initialize intervals state when users are loaded
    const initialIntervals = {};
    users.forEach(user => {
      initialIntervals[user.id] = user.location_update_interval?.toString() || '30';
    });
    setIntervals(initialIntervals);
  }, [users]);

  const handleIntervalChange = (userId, value) => {
    setIntervals(prev => ({ ...prev, [userId]: value }));
  };

  const handleIntervalEndEditing = (userId) => {
    const value = parseInt(intervals[userId]) || 30;
    handleUpdateInterval(userId, value);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Access control for viewing the users tab itself
      if (userProfile?.user_type !== 'admin' && userProfile?.user_type !== 'superadmin' && userProfile?.user_type !== 'app_admin') {
        Alert.alert('Access Denied', 'You do not have permission to view this page');
        navigation.goBack();
        return;
      }

      let query = supabase
        .from('users')
        .select('*, mobile, latitude, longitude'); // Added latitude and longitude

      // Admins can only see users with user_type 'user'
      if (userProfile?.user_type === 'admin') {
        query = query.eq('user_type', 'user');
      }
      // Superadmins see all users (no additional filter needed)

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('*, repayment_plans(name, frequency), area_master(area_name), latitude, longitude, db_url, anon_key, service_role_key') // Added latitude and longitude, and DB config fields
        .order('created_at', { ascending: false });

      // Filter by selected area if an area is selected
      if (selectedCustomerAreaId) {
        query = query.eq('area_id', selectedCustomerAreaId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }
      setCustomers(data || []);
    } catch (error) {
      console.error('Error loading customers:', error);
      Alert.alert('Error', 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const loadGroupUsers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('user_type', 'user');
    if (!error) setGroupUsers(data || []);
  };

  const handleUserAction = async (userId, action) => {
    // Only superadmin can delete or change roles
    if (action === 'delete' || action === 'change_role') {
      if (userProfile?.user_type !== 'superadmin') {
        Alert.alert('Permission Denied', 'Only superadmins can perform this action.');
        return;
      }
    }
    try {
      switch (action) {
        case 'delete':
          Alert.alert(
            'Delete User',
            'Are you sure you want to delete this user?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  const { error } = await supabase
                    .from('users')
                    .delete()
                    .eq('id', userId);

                  if (error) {
                    Alert.alert('Error', 'Failed to delete user');
                    return;
                  }

                  Alert.alert('Success', 'User deleted successfully');
                  loadUsers();
                },
              },
            ]
          );
          break;

        case 'change_role':
          Alert.alert(
            'Change User Role',
            'Select new role:',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'User',
                onPress: async () => {
                  await updateUserRole(userId, 'user');
                },
              },
              {
                text: 'Admin',
                onPress: async () => {
                  await updateUserRole(userId, 'admin');
                },
              },
              {
                text: 'Super Admin',
                onPress: async () => {
                  await updateUserRole(userId, 'superadmin');
                },
              },
              {
                text: 'Customer',
                onPress: async () => {
                  await updateUserRole(userId, 'customer');
                },
              },
              {
                text: 'App Admin',
                onPress: async () => {
                  await updateUserRole(userId, 'app_admin');
                },
              },
            ]
          );
          break;

        default:
          break;
      }
    } catch (error) {
      console.error('Error handling user action:', error);
      Alert.alert('Error', 'Failed to perform action');
    }
  };

  const updateUserRole = async (userId, newRole) => {
    // Ensure only superadmin can update user roles
    if (userProfile?.user_type !== 'superadmin') {
      Alert.alert('Permission Denied', 'Only superadmins can change user roles.');
      return;
    }
    try {
      const { error } = await supabase
        .from('users')
        .update({ user_type: newRole })
        .eq('id', userId);

      if (error) {
        Alert.alert('Error', 'Failed to update user role');
        return;
      }

      Alert.alert('Success', 'User role updated successfully');
      loadUsers();
    } catch (error) {
      console.error('Error updating user role:', error);
      Alert.alert('Error', 'Failed to update user role');
    }
  };

  const handleToggleLocationStatus = async (userId, currentStatus) => {
    try {
      const newStatus = currentStatus === 1 ? 0 : 1;
      const { error } = await supabase
        .from('users')
        .update({ location_status: newStatus })
        .eq('id', userId);
      if (error) {
        Alert.alert('Error', 'Failed to update location status');
        return;
      }
      Alert.alert('Success', `Location status set to ${newStatus === 1 ? 'Active' : 'Inactive'}`);
      loadUsers();
    } catch (error) {
      Alert.alert('Error', 'Failed to update location status');
    }
  };

  const handleUpdateInterval = async (userId, interval) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ location_update_interval: interval })
        .eq('id', userId);
      if (error) {
        Alert.alert('Error', 'Failed to update location interval');
        return;
      }
      Alert.alert('Success', 'Location update interval set');
      loadUsers();
    } catch (error) {
      Alert.alert('Error', 'Failed to update location interval');
    }
  };

  const fetchTransactionsForCustomer = async (customerId) => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('transaction_date', { ascending: false });

    if (error) {
      Alert.alert('Error', 'Failed to fetch transactions.');
    } else {
      setCustomerTransactions(prev => ({ ...prev, [customerId]: data }));
    }
  };

  const toggleCustomerTransactions = (customerId) => {
    const isExpanded = !!expandedCustomers[customerId];
    setExpandedCustomers(prev => ({ ...prev, [customerId]: !isExpanded }));

    if (!isExpanded && !customerTransactions[customerId]) {
      fetchTransactionsForCustomer(customerId);
    }
  };

  const shareCustomerDetails = async (customer) => {
    try {
      const result = await Share.share({
        message:
          `Customer Details:\n` +
          `Name: ${customer.name}\n` +
          `Card No: ${customer.book_no}\n` +
          `Mobile: ${customer.mobile}\n` +
          `Email: ${customer.email}\n`,
      });
      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // shared with activity type of result.activityType
        } else {
          // shared
        }
      } else if (result.action === Share.dismissedAction) {
        // dismissed
      }
    } catch (error) {
      Alert.alert(error.message);
    } 
  };

  const shareTransactionDetails = async (transaction) => {
    try {
      const result = await Share.share({
        message:
          `Transaction Details:\n` +
          `Date: ${new Date(transaction.transaction_date).toLocaleDateString()}\n` +
          `Type: ${transaction.transaction_type}\n` +
          `Amount: ₹${transaction.amount}\n` +
          `Payment Mode: ${transaction.payment_mode}\n` +
          `Remarks: ${transaction.remarks}\n`,
      });
    } catch (error) {
      Alert.alert(error.message);
    } 
  };

  const shareTransactionsAsCsv = async (transactions, customer) => {
    if (!transactions || transactions.length === 0) {
      Alert.alert('No Transactions', 'There are no transactions to share.');
      return;
    }

    const header = 'Date,Customer Name,Mobile,Area,Card No,Type,Amount,Payment Mode,Remarks\n';
    const rows = transactions.map(tx =>
      [
        new Date(tx.transaction_date).toLocaleDateString(),
        customer.name,
        customer.mobile,
        customer.area_master.area_name,
        customer.book_no,
        tx.transaction_type,
        tx.amount,
        tx.payment_mode,
        `"${tx.remarks ? tx.remarks.replace(/"/g, '""') : ''}"`
      ].join(',')
    ).join('\n');

    const csvContent = header + rows;
    const fileName = `${customer.area_master.area_name}_${customer.name}_transactions.csv`;
    const filePath = FileSystem.documentDirectory + fileName;

    try {
      await FileSystem.writeAsStringAsync(filePath, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'Share Transactions CSV',
      });
    } catch (error) {
      console.error('Error sharing CSV:', error);
      Alert.alert('Error', 'Failed to share transactions as CSV.');
    }
  };

  const shareAreaTransactionsAsCsv = async (customersInArea) => {
    if (!customersInArea || customersInArea.length === 0) {
      Alert.alert('No Customers', 'There are no customers in the selected area to share transactions for.');
      return;
    }

    const customerIds = customersInArea.map(c => c.id);
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*, customers(*, area_master(area_name))')
      .in('customer_id', customerIds)
      .order('transaction_date', { ascending: false });

    if (error) {
      return Alert.alert('Error', 'Failed to fetch transactions for the area.');
    }

    if (!transactions || transactions.length === 0) {
      return Alert.alert('No Transactions', 'No transactions found for customers in this area.');
    }

    const header = 'Date,Customer Name,Mobile,Area,Card No,Type,Amount,Payment Mode,Remarks\n';
    const rows = transactions.map(tx =>
      [
        new Date(tx.transaction_date).toLocaleDateString(),
        tx.customers.name,
        tx.customers.mobile,
        tx.customers.area_master.area_name,
        tx.customers.book_no,
        tx.transaction_type,
        tx.amount,
        tx.payment_mode,
        `"${tx.remarks ? tx.remarks.replace(/:"/g, '""') : ''}"`
      ].join(',')
    ).join('\n');

    const csvContent = header + rows;
    const areaName = customersInArea[0]?.area_master?.area_name || 'Area';
    const fileName = `${areaName}_all_transactions.csv`;
    const filePath = FileSystem.documentDirectory + fileName;

    try {
      await FileSystem.writeAsStringAsync(filePath, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'Share Area Transactions CSV',
      });
    } catch (error) {
      console.error('Error sharing area CSV:', error);
      Alert.alert('Error', 'Failed to share area transactions as CSV.');
    }
  };

  const shareAllTransactionsAsCsv = async () => {
    Alert.alert(
      "Export All Transactions",
      "This will export all transactions for all customers in the system. This could be a large file and may take some time. Are you sure you want to continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: async () => {
            const { data: transactions, error } = await supabase
              .from('transactions')
              .select('*, customers(*, area_master(area_name))')
              .order('transaction_date', { ascending: false });

            if (error) {
              return Alert.alert('Error', 'Failed to fetch all transactions.');
            }

            if (!transactions || transactions.length === 0) {
              return Alert.alert('No Transactions', 'No transactions found in the system.');
            }

            const header = 'Date,Customer Name,Mobile,Area,Card No,Type,Amount,Payment Mode,Remarks\n';
            const rows = transactions.map(tx =>
              [
                new Date(tx.transaction_date).toLocaleDateString(),
                tx.customers?.name || 'N/A',
                tx.customers?.mobile || 'N/A',
                tx.customers?.area_master?.area_name || 'N/A',
                tx.customers?.book_no || 'N/A',
                tx.transaction_type,
                tx.amount,
                tx.payment_mode,
                `"${tx.remarks ? tx.remarks.replace(/:"/g, '""') : ''}"`
              ].join(',')
            ).join('\n');

            const csvContent = header + rows;
            const fileName = 'All_Transactions.csv';
            const filePath = FileSystem.documentDirectory + fileName;

            try {
              await FileSystem.writeAsStringAsync(filePath, csvContent, {
                encoding: FileSystem.EncodingType.UTF8,
              });

              await Sharing.shareAsync(filePath, {
                mimeType: 'text/csv',
                dialogTitle: 'Share All Transactions CSV',
              });
            } catch (shareError) {
              console.error('Error sharing all transactions CSV:', shareError);
              Alert.alert('Error', 'Failed to share all transactions as CSV.');
            }
          }
        }
      ]
    );
  };

  const handleActivateCustomer = async (customerId) => {
    Alert.alert(
      'Activate Customer',
      'Are you sure you want to activate this customer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('customers')
                .update({ status: 'Active' })
                .eq('id', customerId);

              if (error) {
                throw error;
              }
              Alert.alert('Success', 'Customer activated successfully!');
              loadCustomers(); // Refresh the list
            } catch (error) {
              console.error('Error activating customer:', error);
              Alert.alert('Error', 'Failed to activate customer.');
            }
          },
        },
      ]
    );
  };

  const renderUserItem = ({ item }) => {
    return (
      <View style={styles.userItemCard}>
        <View style={styles.userItemInfo}>
          <Text style={styles.userName}>{item.name || 'No Name'}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          {item.mobile && (
            <View style={styles.mobileContainer}>
              <Text style={[styles.userMobile, { color: '#1C1C1E' }]}>Mobile: {item.mobile}</Text>
              <View style={styles.mobileActions}>
                <TouchableOpacity onPress={() => makeCall(item.mobile)} style={styles.mobileActionButton}>
                  <Icon name="phone" size={20} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => sendEmail(item.email)} style={styles.mobileActionButton}>
                  <Icon name="envelope" size={20} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => sendWhatsApp(item.mobile)} style={styles.mobileActionButton}>
                  <Icon name="whatsapp" size={20} color="#25D366" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          <Text style={[styles.userRole, { color: getRoleColor(item.user_type) }]}> {item.user_type || 'user'} </Text>
          <Text style={[styles.userStatus, { color: item.location_status === 1 ? '#34C759' : '#FF3B30' }]}> Location: {item.location_status === 1 ? 'Active' : 'Inactive'} </Text>
          {item.latitude && item.longitude && ( // Only show if lat/lon exist
            <TouchableOpacity
              style={styles.directionsButton} // You'll need to define this style
              onPress={() => handleGetDirections(item.latitude, item.longitude)}
            >
              <Text style={styles.directionsButtonText}>Get Directions</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.userDate}> Created: {new Date(item.created_at).toLocaleDateString()} </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ fontSize: 14, marginRight: 8 }}>Interval (sec):</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 4, width: 60, textAlign: 'center' }}
              value={intervals[item.id]}
              keyboardType="numeric"
              onChangeText={value => handleIntervalChange(item.id, value)}
              onEndEditing={() => handleIntervalEndEditing(item.id)}
            />
          </View>
        </View>
        <View style={styles.itemActions}>
          {userProfile?.user_type === 'superadmin' && (
            <>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => handleUserAction(item.id, 'change_role')}
              >
                <Text style={styles.editButtonText}>Change Role</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleUserAction(item.id, 'delete')}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.editButton, { backgroundColor: item.location_status === 1 ? '#FF3B30' : '#34C759' }]}
            onPress={() => handleToggleLocationStatus(item.id, item.location_status)}
          >
            <Text style={styles.editButtonText}>
              {item.location_status === 1 ? 'Set Inactive' : 'Set Active'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCustomerItem = ({ item }) => {
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          {item.mobile && (
            <View style={styles.mobileContainer}>
              <Text style={[styles.itemDetail, { color: '#1C1C1E' }]}>Mobile: {item.mobile}</Text>
              <View style={styles.mobileActions}>
                <TouchableOpacity onPress={() => makeCall(item.mobile)} style={styles.mobileActionButton}>
                  <Icon name="phone" size={20} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => sendEmail(item.email)} style={styles.mobileActionButton}>
                  <Icon name="envelope" size={20} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => sendWhatsApp(item.mobile)} style={styles.mobileActionButton}>
                  <Icon name="whatsapp" size={20} color="#25D366" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          <Text style={styles.itemDetail}>Email: {item.email}</Text>
          <Text style={styles.itemDetail}>Card No: {item.book_no}</Text>
          <Text style={styles.itemDetail}>Type: {item.customer_type}</Text>
          <Text style={styles.itemDetail}>Status: {item.status}</Text>
          {item.repayment_plans && (
            <Text style={styles.itemDetail}>Plan: {item.repayment_plans.name} ({item.repayment_plans.frequency})</Text>
          )}
          {item.start_date && <Text style={styles.itemDetail}>Start Date: {new Date(item.start_date).toLocaleDateString()}</Text>}
          {item.end_date && <Text style={styles.itemDetail}>End Date: {new Date(item.end_date).toLocaleDateString()}</Text>}
          {item.repayment_amount && <Text style={styles.itemDetail}>Repayment Amount: ₹{item.repayment_amount}</Text>}
          {item.latitude && item.longitude && ( // Only show if lat/lon exist
            <TouchableOpacity
              style={styles.directionsButton} // Reusing the same style as for users
              onPress={() => handleGetDirections(item.latitude, item.longitude)}
            >
              <Text style={styles.directionsButtonText}>Get Directions</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.itemActions}>
          <TouchableOpacity
            style={styles.viewTransactionsButton}
            onPress={() => toggleCustomerTransactions(item.id)}
          >
            <Text style={styles.viewTransactionsButtonText}>
              {expandedCustomers[item.id] ? 'Hide Transactions' : 'View Transactions'}
            </Text>
          </TouchableOpacity>
          {item.status === 'bulkupload' && (
            <TouchableOpacity
              style={[styles.editButton, { backgroundColor: '#007AFF' }]}
              onPress={() => handleActivateCustomer(item.id)} // Call activate function
            >
              <Text style={styles.editButtonText}>Activate</Text>
            </TouchableOpacity>
          )}
          {/* Add Close Account button here */}
          {item.status === 'Active' && (
            <TouchableOpacity
              style={[styles.editButton, { backgroundColor: '#FF3B30' }]} // Red color for close
              onPress={() => handleCloseCustomerAccount(item.id)}
            >
              <Text style={styles.editButtonText}>Close Account</Text>
            </TouchableOpacity>
          )}
          {userProfile?.user_type === 'superadmin' && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteItem(item, 'customers', 'Customer', loadCustomers)}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => shareCustomerDetails(item)}
          >
            <Icon name="share-alt" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          {(userProfile?.user_type === 'superadmin' || userProfile?.user_type === 'app_admin') && (
            <TouchableOpacity
              style={[styles.shareButton, { backgroundColor: '#5856D6' }]}
              onPress={() => handleOpenCustomerDbSetup(item)}
            >
              <Icon name="database" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
        {expandedCustomers[item.id] && (
          <View style={styles.transactionsContainer}>
            {customerTransactions[item.id] ? (
              <>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                  <Text style={styles.transactionsTitle}>Transactions</Text>
                  <TouchableOpacity onPress={() => shareTransactionsAsCsv(customerTransactions[item.id], item)}>
                    <Icon name="share-square-o" size={24} color="#007AFF" />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={customerTransactions[item.id]}
                  keyExtractor={(tx) => tx.id.toString()}
                  renderItem={({ item: tx }) => (
                    <View style={styles.transactionItem}>
                      <Text>{new Date(tx.transaction_date).toLocaleDateString()}</Text>
                      <Text>{tx.transaction_type}</Text>
                      <Text>₹{tx.amount}</Text>
                      <Text>{tx.payment_mode}</Text>
                      <Text>{tx.remarks}</Text>
                      <TouchableOpacity onPress={() => shareTransactionDetails(tx)} style={{padding: 5}}>
                        <Icon name="share-alt" size={20} color="#5BC0DE" />
                      </TouchableOpacity>
                    </View>
                  )}
                />
                <Text style={styles.totalAmount}>
                  Total: ₹{customerTransactions[item.id].reduce((acc, tx) => acc + tx.amount, 0)}
                </Text>
              </>
            ) : (
              <Text>Loading transactions...</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const handleAddCustomerType = () => {
    setEditingCustomerType(null);
    setCustomerTypeName('');
    setCustomerTypeDescription('');
    setShowCustomerTypeModal(true);
  };

  const handleEditCustomerType = (type) => {
    setEditingCustomerType(type);
    setCustomerTypeName(type.status_name);
    setCustomerTypeDescription(type.description);
    setShowCustomerTypeModal(true);
  };

  const handleDeleteCustomerType = (item) => {
    handleDeleteItem(item, 'customer_types', 'Customer Type', loadCustomerTypes);
  };

  const handleSaveItem = async (itemData, tableName, itemName, editingItem, loadFunction, setShowModal) => {
    try {
      if (editingItem) {
        const { error } = await supabase
          .from(tableName)
          .update(itemData)
          .eq('id', editingItem.id);
        if (error) throw error;
        Alert.alert('Success', `${itemName} updated.`);
      } else {
        const { error } = await supabase
          .from(tableName)
          .insert(itemData);
        if (error) throw error;
        Alert.alert('Success', `${itemName} added.`);
      }
      setShowModal(false);
      loadFunction();
    } catch (error) {
      Alert.alert('Error', `Failed to save ${itemName}.`);
      console.error(`Save ${itemName} error:`, error);
    }
  };

  const handleSaveCustomerType = async () => {
    if (!customerTypeName) {
      Alert.alert('Error', 'Status Name is required.');
      return;
    }
    const newCustomerType = {
      status_name: customerTypeName,
      description: customerTypeDescription,
    };
    handleSaveItem(newCustomerType, 'customer_types', 'Customer type', editingCustomerType, loadCustomerTypes, setShowCustomerTypeModal);
  };

  const handleCancelCustomerTypeEdit = () => {
    setShowCustomerTypeModal(false);
    setEditingCustomerType(null);
    setCustomerTypeName('');
    setCustomerTypeDescription('');
  };

  const loadAreas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('area_master')
        .select('id, area_name, area_type, enable_day, day_of_week, start_time_filter, end_time_filter') // Select all necessary columns, including area_type
        .order('area_name', { ascending: true });

      if (error) {
        console.error('Supabase error loading areas:', error);
        throw error;
      }

      console.log('Areas loaded from Supabase:', data); // Add this line for debugging

      let filteredAreas = data || [];

      // Apply filtering logic only if user is of type 'user'
      if (userProfile?.user_type === 'user') {
        const currentDayName = getDayName();
        const currentTime = getCurrentTime();

        filteredAreas = filteredAreas.filter(area => {
          const areaStartTime = area.start_time_filter ? area.start_time_filter.substring(0, 5) : '';
          const areaEndTime = area.end_time_filter ? area.end_time_filter.substring(0, 5) : '';

          // Logic: if enable_day is false, always include.
          // If enable_day is true, include only if day and time match.
          return !area.enable_day || (
            area.enable_day &&
            area.day_of_week === currentDayName &&
            currentTime >= areaStartTime &&
            currentTime <= areaEndTime
          );
        });
      }

      setAreas(filteredAreas);
      setAllAreas(data || []); // Populate allAreas for group selection
    } catch (error) {
      console.error('Error loading areas:', error);
      Alert.alert('Error', 'Failed to load areas');
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select(`*, group_areas (area_id, area_master (id, area_name, area_type, pin_code)), user_groups (user_id)`)
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      setGroups(data || []);
    } catch (error) {
      console.error('Error loading groups:', error);
      Alert.alert('Error', 'Failed to load groups');
    }
  };

  const loadRepaymentPlans = async () => {
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase
        .from('repayment_plans')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      setRepaymentPlans(data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load repayment plans');
    } finally {
      setLoadingPlans(false);
    }
  };

  const loadTenants = async () => {
    setLoadingTenants(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*, tenant_config(*)')
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }
      setTenants(data || []);
    } catch (error) {
      console.error('Error loading tenants:', error);
      Alert.alert('Error', 'Failed to load tenants');
    } finally {
      setLoadingTenants(false);
    }
  };

  const handleAddArea = () => {
    setEditingArea(null);
    setAreaName('');
    setAreaType('city');
    setPinCode('');
    setState('');
    setDescription('');
    setEnableDay(false);
    setDayOfWeek('');
    setStartTimeFilter('');
    setEndTimeFilter('');
    setSelectedLocation(null); // Reset location
    setShowAreaModal(true);
  };

  const handleEditArea = (area) => {
    setEditingArea(area);
    setAreaName(area.area_name);
    setAreaType(area.area_type);
    setPinCode(area.pin_code || '');
    setState(area.state || '');
    setDescription(area.description || '');
    setEnableDay(area.enable_day || false);
    setDayOfWeek(area.day_of_week || '');
    setStartTimeFilter(convert24HourTo12Hour(area.start_time_filter) || '');
    setEndTimeFilter(convert24HourTo12Hour(area.end_time_filter) || '');
    if (area.latitude && area.longitude) {
      setSelectedLocation({ latitude: area.latitude, longitude: area.longitude });
      setMapRegion({
        latitude: area.latitude,
        longitude: area.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } else {
      setSelectedLocation(null);
    }
    setShowAreaModal(true);
  };

  const handleSaveArea = async () => {
    if (!areaName.trim()) {
      Alert.alert('Error', 'Area name is required');
      return;
    }

    const areaData = {
      area_name: areaName.trim(),
      area_type: areaType,
      pin_code: pinCode.trim() || null,
      state: state.trim() || null,
      description: description.trim() || null,
      enable_day: enableDay,
      day_of_week: dayOfWeek || null,
      start_time_filter: convert12HourTo24Hour(startTimeFilter),
      end_time_filter: convert12HourTo24Hour(endTimeFilter),
      latitude: selectedLocation ? selectedLocation.latitude : null,
      longitude: selectedLocation ? selectedLocation.longitude : null,
    };

    handleSaveItem(areaData, 'area_master', 'Area', editingArea, loadAreas, setShowAreaModal);
  };

  const handleDeleteArea = (area) => {
    handleDeleteItem(area, 'area_master', 'Area', loadAreas);
  };

  const handleAddGroup = () => {
    setEditingGroup(null);
    setGroupName('');
    setSelectedAreaIds([]);
    setGroupDescription('');
    setSelectedUserIds([]);
    setShowGroupModal(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setSelectedAreaIds((group.group_areas || []).map(ga => ga.area_id));
    setGroupDescription(group.description || '');
    // Pre-select users already assigned to this group
    setSelectedUserIds((group.user_groups || []).map(ug => ug.user_id));
    setShowGroupModal(true);
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }
    if (!selectedAreaIds.length) {
      Alert.alert('Error', 'Please select at least one area');
      return;
    }
    try {
      let groupId;
      if (editingGroup) {
        // Update group
        const { error } = await supabase
          .from('groups')
          .update({
            name: groupName.trim(),
            description: groupDescription.trim() || null,
          })
          .eq('id', editingGroup.id);
        if (error) throw error;
        groupId = editingGroup.id;
      } else {
        // Create group
        const { data, error } = await supabase
          .from('groups')
          .insert({
            name: groupName.trim(),
            description: groupDescription.trim() || null,
          })
          .select()
          .single();
        if (error) throw error;
        groupId = data.id;
      }
      
      await updateGroupAreas(groupId, selectedAreaIds);
      await updateUserGroups(groupId, selectedUserIds);

      Alert.alert('Success', editingGroup ? 'Group updated successfully' : 'Group created successfully');
      setShowGroupModal(false);
      loadGroups();
    } catch (error) {
      console.error('Error saving group:', error);
      Alert.alert('Error', 'Failed to save group');
    }
  };

  

  const updateGroupAreas = async (groupId, selectedAreaIds) => {
    // Remove old group_areas
    const { error: deleteAreaError } = await supabase.from('group_areas').delete().eq('group_id', groupId);
    if (deleteAreaError) throw deleteAreaError;

    // Insert new group_areas
    const groupAreaRows = selectedAreaIds.map(areaId => ({ group_id: groupId, area_id: areaId }));
    if (groupAreaRows.length) {
      const { error: insertAreaError } = await supabase.from('group_areas').insert(groupAreaRows);
      if (insertAreaError) throw insertAreaError;
    }
  };

  const updateUserGroups = async (groupId, selectedUserIds) => {
    // Remove old user_groups
    const { error: deleteUserGroupError } = await supabase.from('user_groups').delete().eq('group_id', groupId);
    if (deleteUserGroupError) throw deleteUserGroupError;

    // Insert new user_groups
    const userGroupRows = selectedUserIds.map(userId => ({ user_id: userId, group_id: groupId }));
    if (userGroupRows.length) {
      const { error: insertUserGroupError } = await supabase.from('user_groups').insert(userGroupRows);
      if (insertUserGroupError) throw insertUserGroupError;
    }
  };

  const handleAddPlan = () => {
    setEditingPlan(null);
    setPlanForm({
      name: '',
      frequency: 'weekly',
      periods: '',
      base_amount: '',
      repayment_per_period: '',
      advance_amount: '',
      late_fee_per_period: '',
      description: '',
    });
    setShowPlanModal(true);
  };

  const handleUploadCustomers = async () => {
    if (!selectedUploadAreaId) {
      Alert.alert('Error', 'Please select an Area.');
      return;
    }
    if (uploadedCustomers.length === 0) {
      Alert.alert('Error', 'No customer data to upload. Please select a CSV file.');
      return;
    }

    // Fetch all repayment plans for lookup
    const { data: allRepaymentPlans, error: plansError } = await supabase
      .from('repayment_plans')
      .select('id, name, frequency, periods');

    if (plansError) {
      Alert.alert('Error', 'Failed to fetch repayment plans for lookup.');
      console.error('Plans fetch error:', plansError);
      return;
    }

    Alert.alert(
      'Confirm Upload',
      `Are you sure you want to upload ${uploadedCustomers.length} customers to the selected Area?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            try {
              const customersToInsert = uploadedCustomers.map(customer => {
                const matchedPlan = allRepaymentPlans.find(plan => {
                  console.log(`Attempting to match: CSV Frequency=${customer.repayment_frequency}, CSV Periods=${customer.periods}, Plan Frequency=${plan.frequency}, Plan Periods=${plan.periods}`);
                  return plan.frequency === customer.repayment_frequency.toLowerCase() &&
                  plan.periods === parseInt(customer.periods.trim());
                });

                if (!matchedPlan) {
                  throw new Error(`Repayment plan not found for: ${customer.repayment_frequency} with ${customer.periods} periods`);
                }

                // Calculate end_date in the app
                const startDate = new Date(customer.start_date);
                let endDate = new Date(startDate);
                const periods = parseInt(customer.periods);

                if (isNaN(periods)) {
                  throw new Error(`Invalid periods value for ${customer.name}: ${customer.periods}`);
                }

                switch (customer.repayment_frequency.toLowerCase()) {
                  case 'daily':
                    endDate.setDate(startDate.getDate() + periods);
                    break;
                  case 'weekly':
                    endDate.setDate(startDate.getDate() + (periods * 7));
                    break;
                  case 'monthly':
                    endDate.setMonth(startDate.getMonth() + periods);
                    break;
                  case 'yearly':
                    endDate.setFullYear(startDate.getFullYear() + periods);
                    break;
                  default:
                    throw new Error(`Unknown repayment frequency for ${customer.name}: ${customer.repayment_frequency}`);
                }

                // Format end_date to YYYY-MM-DD string
                const formattedEndDate = endDate.toISOString().split('T')[0];

                return {
                  name: customer.name,
                  mobile: customer.mobile,
                  email: customer.email,
                  book_no: customer.cardno, // Map cardno from CSV to book_no in DB
                  customer_type: customer.customer_type,
                  start_date: customer.start_date,
                  amount_given: parseFloat(customer.amount_given),
                  repayment_amount: parseFloat(customer.repayment_amount),
                  end_date: formattedEndDate, // Calculated in app
                  area_id: selectedUploadAreaId,
                  repayment_plan_id: matchedPlan.id,
                  days_to_complete: parseInt(customer.periods),
                  user_id: user.id,
                  repayment_frequency: customer.repayment_frequency,
                  remarks: "bulkupload",
                };
              });

              const { error } = await supabase
                .from('customers') // Assuming your customer table is named 'customers'
                .insert(customersToInsert);

              if (error) {
                throw error;
              }

              Alert.alert('Success', `${uploadedCustomers.length} customers uploaded successfully!`);
              setShowCustomerUploadModal(false);
              setSelectedUploadAreaId('');
            } catch (error) {
              console.error('Error uploading customers:', error);
              Alert.alert('Upload Error', `Failed to upload customers: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const handlePickCsvFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        const fileContent = await fetch(uri);
        const text = await fileContent.text();

        // Simple CSV parsing (assumes no commas within fields and first row is header)
        const lines = text.trim().split('\n');
        if (lines.length === 0) {
          Alert.alert('Error', 'CSV file is empty.');
          return;
        }

        const headers = lines[0].split(',').map(header => header.trim());
        const parsedData = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(value => value.trim());
          if (values.length !== headers.length) {
            console.warn(`Skipping row ${i + 1} due to column mismatch.`);
            continue;
          }
          const rowData = {};
          for (let j = 0; j < headers.length; j++) {
            rowData[headers[j]] = values[j];
          }
          parsedData.push(rowData);
        }

        setUploadedCustomers(parsedData);
        Alert.alert('File Selected', `${parsedData.length} rows parsed from CSV.`);
      } else {
        Alert.alert('File Selection Cancelled', 'No file was selected.');
      }
    } catch (err) {
      console.error('Error picking document:', err);
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  const renderCustomerUploadModal = () => {
    const csvColumnsDisplay = "name, mobile, email, cardno, customer_type, start_date (YYYY-MM-DD), amount_given, repayment_amount, repayment_frequency, periods";
    const csvColumnsCopy = "name,mobile,email,cardno,customer_type,start_date,amount_given,repayment_amount,repayment_frequency,periods";
    const copyToClipboard = () => {
      Clipboard.setString(csvColumnsCopy);
      Alert.alert('Copied', 'CSV columns copied to clipboard.');
    };

    return (
      <AdminModal
        visible={showCustomerUploadModal}
        onClose={() => setShowCustomerUploadModal(false)}
        title="Upload Customers"
        onSave={handleUploadCustomers}
        saveButtonText="Upload"
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.formLabel}>Select Area:</Text>
          <SearchableDropdown
            data={areas}
            onSelect={setSelectedUploadAreaId}
            selectedValue={selectedUploadAreaId}
            placeholder="Select Area"
            labelField="area_name"
            valueField="id"
          />

          <View style={{ marginVertical: 10 }}>
            <Text style={styles.csvInstructionText}>
              Please select a CSV file with the following columns:
            </Text>
            <Text style={styles.columnText}>{csvColumnsDisplay}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
              <Text style={styles.copyButtonText}>Copy Columns</Text>
            </TouchableOpacity>
          </View>

          {/* Placeholder for file picker */}
          <TouchableOpacity style={styles.locationButton} onPress={handlePickCsvFile}>
            <Text style={styles.locationButtonText}>Select CSV File</Text>
          </TouchableOpacity>

          {uploadedCustomers.length > 0 && (
            <View style={styles.csvPreviewContainer}>
              <Text style={styles.formLabel}>CSV Preview ({uploadedCustomers.length} rows):</Text>
              <ScrollView horizontal>
                <View>
                  <View style={styles.csvHeaderRow}>
                    {Object.keys(uploadedCustomers[0]).map((header, index) => (
                      <Text key={index} style={styles.csvHeaderCell}>{header}</Text>
                    ))}
                  </View>
                  {uploadedCustomers.slice(0, 5).map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.csvDataRow}>
                      {Object.values(row).map((value, colIndex) => (
                        <Text key={colIndex} style={styles.csvDataCell}>{value}</Text>
                      ))}
                    </View>
                  ))}
                  {uploadedCustomers.length > 5 && (
                    <Text style={styles.csvMoreText}>... {uploadedCustomers.length - 5} more rows</Text>
                  )}
                </View>
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </AdminModal>
    );
  };

  const handlePickCustomerTransactionCsvFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Or 'text/csv'
        copyToCacheDirectory: true,
      });

      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        const fileContent = await fetch(uri).then(res => res.text());

        // Simple CSV parsing
        const lines = fileContent.trim().split('\n');
        if (lines.length === 0) {
          Alert.alert('Error', 'CSV file is empty.');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const requiredHeaders = ['card_no', 'amount', 'transaction_date', 'payment_mode', 'remarks'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

        if (missingHeaders.length > 0) {
            Alert.alert('Invalid CSV Format', `The following required columns are missing: ${missingHeaders.join(', ')}`);
            return;
        }

        const parsedData = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = values[index];
          });
          return rowData;
        });

        setUploadedCustomerTransactions(parsedData);
        Alert.alert('File Selected', `${parsedData.length} transactions parsed from CSV.`);
      } else {
        Alert.alert('File Selection Cancelled', 'No file was selected.');
      }
    } catch (err) {
      console.error('Error picking document:', err);
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  const handlePickExpenseCsvFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Or 'text/csv'
        copyToCacheDirectory: true,
      });

      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        const fileContent = await fetch(uri).then(res => res.text());

        // Simple CSV parsing
        const lines = fileContent.trim().split('\n');
        if (lines.length === 0) {
          Alert.alert('Error', 'CSV file is empty.');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const requiredHeaders = ['amount', 'remarks', 'date', 'expense_type'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

        if (missingHeaders.length > 0) {
            Alert.alert('Invalid CSV Format', `The following required columns are missing: ${missingHeaders.join(', ')}`);
            return;
        }

        const parsedData = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = values[index];
          });
          return rowData;
        });

        setUploadedExpenses(parsedData);
        Alert.alert('File Selected', `${parsedData.length} expenses parsed from CSV.`);
      } else {
        Alert.alert('File Selection Cancelled', 'No file was selected.');
      }
    } catch (err) {
      console.error('Error picking document:', err);
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  const handleUploadCustomerTransactions = async () => {
    if (uploadedCustomerTransactions.length === 0) {
      Alert.alert('Error', 'No transactions to upload. Please select a CSV file.');
      return;
    }

    // Fetch all customers to map book_no to customer_id
    const { data: allCustomers, error: customersError } = await supabase
      .from('customers')
      .select('id, book_no');

    if (customersError) {
      Alert.alert('Error', 'Failed to fetch customers for lookup.');
      console.error('Customers fetch error:', customersError);
      return;
    }

    const customerMap = allCustomers.reduce((acc, customer) => {
      acc[customer.book_no] = customer.id;
      return acc;
    }, {});

    Alert.alert(
      'Confirm Upload',
      `Are you sure you want to upload ${uploadedCustomerTransactions.length} transactions?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            try {
              const transactionsToInsert = uploadedCustomerTransactions.map(tx => {
                const customer_id = customerMap[tx.card_no];
                if (!customer_id) {
                  throw new Error(`Customer with card_no ${tx.card_no} not found.`);
                }
                return {
                  customer_id,
                  user_id: user.id,
                  amount: parseFloat(tx.amount),
                  transaction_type: 'repayment',
                  payment_mode: tx.payment_mode,
                  remarks: tx.remarks,
                  transaction_date: tx.transaction_date,
                };
              });

              const { error } = await supabase
                .from('transactions')
                .insert(transactionsToInsert);

              if (error) {
                throw error;
              }

              Alert.alert('Success', `${uploadedCustomerTransactions.length} transactions uploaded successfully!`);
              setShowCustomerTransactionUploadModal(false);
              setUploadedCustomerTransactions([]);
            } catch (error) {
              console.error('Error uploading transactions:', error);
              Alert.alert('Upload Error', `Failed to upload transactions: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const handleUploadExpenses = async () => {
    if (!selectedUploadAreaId) {
      Alert.alert('Error', 'Please select an Area.');
      return;
    }
    if (uploadedExpenses.length === 0) {
      Alert.alert('Error', 'No expense data to upload. Please select a CSV file.');
      return;
    }

    Alert.alert(
      'Confirm Upload',
      `Are you sure you want to upload ${uploadedExpenses.length} expenses to the selected Area?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            try {
              const expensesToInsert = uploadedExpenses.map(expense => {
                // Basic validation and type conversion
                const amount = parseFloat(expense.amount);
                if (isNaN(amount)) {
                  throw new Error(`Invalid amount for expense: ${expense.amount}`);
                }
                // Ensure date is in YYYY-MM-DD format
                const date = new Date(expense.date);
                if (isNaN(date.getTime())) {
                    throw new Error(`Invalid date for expense: ${expense.date}`);
                }
                const formattedDate = date.toISOString().split('T')[0];

                // New validation for mandatory description and category
                if (!expense.remarks || expense.remarks.trim() === '') {
                    throw new Error(`Remarks is mandatory for expense: ${JSON.stringify(expense)}`);
                }
                if (!expense.expense_type || expense.expense_type.trim() === '') {
                    throw new Error(`Expense Type is mandatory for expense: ${JSON.stringify(expense)}`);
                }

                return {
                  user_id: user.id, // Admin's user ID
                  area_id: selectedUploadAreaId,
                  amount: amount,
                  remarks: expense.remarks.trim(), // Trim whitespace
                  created_at: formattedDate, // Map CSV date to created_at
                  expense_type: expense.expense_type.trim(), // Trim whitespace
                };
              });

              const { error } = await supabase
                .from('user_expenses')
                .insert(expensesToInsert);

              if (error) {
                throw error;
              }

              Alert.alert('Success', `${uploadedExpenses.length} expenses uploaded successfully!`);
              setShowExpenseUploadModal(false);
              setUploadedExpenses([]); // Clear uploaded data
              setSelectedUploadAreaId(''); // Clear selected area
            } catch (error) {
              console.error('Error uploading expenses:', error);
              Alert.alert('Upload Error', `Failed to upload expenses: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const handleOpenCustomerDbSetup = (customer) => {
    setEditingCustomerDb(customer);
    setDbUrl(customer.db_url || '');
    setAnonKey(customer.anon_key || '');
    setServiceRoleKey(customer.service_role_key || '');
    setShowCustomerDbSetupModal(true);
  };

  const handleSaveCustomerDbDetails = async () => {
    if (!editingCustomerDb) {
      Alert.alert('Error', 'No customer selected for database setup.');
      return;
    }
    if (!dbUrl.trim() || !anonKey.trim() || !serviceRoleKey.trim()) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }

    // IMPORTANT: This should call a Supabase Edge Function for security.
    // The Edge Function would receive the customer ID, dbUrl, anonKey, serviceRoleKey,
    // and then securely update the customer record using the service_role key.
    // For now, I'll simulate a direct update, but this MUST be replaced with an Edge Function call.
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          db_url: dbUrl.trim(),
          anon_key: anonKey.trim(),
          service_role_key: serviceRoleKey.trim(),
        })
        .eq('id', editingCustomerDb.id);

      if (error) {
        throw error;
      }

      Alert.alert('Success', 'Customer database details updated successfully!');
      setShowCustomerDbSetupModal(false);
      setEditingCustomerDb(null);
      setDbUrl('');
      setAnonKey('');
      setServiceRoleKey('');
      loadCustomers(); // Refresh customer list to reflect changes
    } catch (error) {
      console.error('Error saving customer DB details:', error);
      Alert.alert('Error', `Failed to save customer database details: ${error.message}`);
    }
  };

  const renderCustomerTransactionUploadModal = () => {
    const csvColumnsDisplay = "card_no\tamount\ttransaction_date (YYYY-MM-DD)\tpayment_mode\tremarks";
    const csvColumnsCopy = "card_no\tamount\ttransaction_date\tpayment_mode\tremarks"; // Use tab as separator for TSV
    const copyToClipboard = () => {
      Clipboard.setString(csvColumnsCopy);
      Alert.alert('Copied', 'CSV columns copied to clipboard.');
    };

    return (
      <AdminModal
        visible={showCustomerTransactionUploadModal}
        onClose={() => setShowCustomerTransactionUploadModal(false)}
        title="Upload Customer Transactions"
        onSave={handleUploadCustomerTransactions}
        saveButtonText="Upload"
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={{ marginVertical: 10 }}>
            <Text style={styles.csvInstructionText}>
              Please select a CSV file with the following columns:
            </Text>
            <Text style={styles.columnText}>{csvColumnsDisplay}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
              <Text style={styles.copyButtonText}>Copy Columns</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.locationButton} onPress={handlePickCustomerTransactionCsvFile}>
            <Text style={styles.locationButtonText}>Select CSV File</Text>
          </TouchableOpacity>

          {uploadedCustomerTransactions.length > 0 && (
            <View style={styles.csvPreviewContainer}>
              <Text style={styles.formLabel}>CSV Preview ({uploadedCustomerTransactions.length} rows):</Text>
              <ScrollView horizontal>
                <View>
                  <View style={styles.csvHeaderRow}>
                    {Object.keys(uploadedCustomerTransactions[0]).map((header, index) => (
                      <Text key={index} style={styles.csvHeaderCell}>{header}</Text>
                    ))}
                  </View>
                  {uploadedCustomerTransactions.slice(0, 5).map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.csvDataRow}>
                      {Object.values(row).map((value, colIndex) => (
                        <Text key={colIndex} style={styles.csvDataCell}>{value}</Text>
                      ))}
                    </View>
                  ))}
                  {uploadedCustomerTransactions.length > 5 && (
                    <Text style={styles.csvMoreText}>... {uploadedCustomerTransactions.length - 5} more rows</Text>
                  )}
                </View>
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </AdminModal>
    );
  };

  const renderExpenseUploadModal = () => {
    const csvColumnsDisplay = "amount, remarks, date (YYYY-MM-DD), expense_type";
    const csvColumnsCopy = "amount\tremarks\tdate\texpense_type"; // Use tab as separator for TSV
    const copyToClipboard = () => {
      Clipboard.setString(csvColumnsCopy); // Use the new variable for copying
      Alert.alert('Copied', 'CSV columns copied to clipboard.');
    };

    return (
      <AdminModal
        visible={showExpenseUploadModal}
        onClose={() => setShowExpenseUploadModal(false)}
        title="Upload Expenses"
        onSave={handleUploadExpenses}
        saveButtonText="Upload"
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.formLabel}>Select Area:</Text>
          <SearchableDropdown
            data={allAreas}
            onSelect={setSelectedUploadAreaId}
            selectedValue={selectedUploadAreaId}
            placeholder="Select Area"
            labelField="area_name"
            valueField="id"
          />

          <View style={{ marginVertical: 10 }}>
            <Text style={styles.csvInstructionText}>
              Please select a CSV file with the following columns:
            </Text>
            <Text style={styles.columnText}>{csvColumnsDisplay}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
              <Text style={styles.copyButtonText}>Copy Columns</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.locationButton} onPress={handlePickExpenseCsvFile}>
            <Text style={styles.locationButtonText}>Select CSV File</Text>
          </TouchableOpacity>

          {uploadedExpenses.length > 0 && (
            <View style={styles.csvPreviewContainer}>
              <Text style={styles.formLabel}>CSV Preview ({uploadedExpenses.length} rows):</Text>
              <ScrollView horizontal>
                <View>
                  <View style={styles.csvHeaderRow}>
                    {Object.keys(uploadedExpenses[0]).map((header, index) => (
                      <Text key={index} style={styles.csvHeaderCell}>{header}</Text>
                    ))}
                  </View>
                  {uploadedExpenses.slice(0, 5).map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.csvDataRow}>
                      {Object.values(row).map((value, colIndex) => (
                        <Text key={colIndex} style={styles.csvDataCell}>{value}</Text>
                      ))}
                    </View>
                  ))}
                  {uploadedExpenses.length > 5 && (
                    <Text style={styles.csvMoreText}>... {uploadedExpenses.length - 5} more rows</Text>
                  )}
                </View>
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </AdminModal>
    );
  };

  const handleEditPlan = (plan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      frequency: plan.frequency,
      periods: plan.periods.toString(),
      base_amount: plan.base_amount.toString(),
      repayment_per_period: plan.repayment_per_period.toString(),
      advance_amount: plan.advance_amount?.toString() || '',
      late_fee_per_period: plan.late_fee_per_period?.toString() || '',
      description: plan.description || '',
    });
    setShowPlanModal(true);
  };
  const handleSavePlan = async () => {
    if (!planForm.name.trim() || !planForm.frequency || !planForm.periods || !planForm.base_amount || !planForm.repayment_per_period) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    const planData = {
      name: planForm.name.trim(),
      frequency: planForm.frequency,
      periods: parseInt(planForm.periods),
      base_amount: parseFloat(planForm.base_amount),
      repayment_per_period: parseFloat(planForm.repayment_per_period),
      advance_amount: planForm.advance_amount ? parseFloat(planForm.advance_amount) : 0,
      late_fee_per_period: planForm.late_fee_per_period ? parseFloat(planForm.late_fee_per_period) : 0,
      description: planForm.description?.trim() || null,
    };
    handleSaveItem(planData, 'repayment_plans', 'Repayment plan', editingPlan, loadRepaymentPlans, setShowPlanModal);
  };

  
  const handleDeletePlan = (plan) => {
    handleDeleteItem(plan, 'repayment_plans', 'Repayment Plan', loadRepaymentPlans);
  };

   

  const handleCancelGroupEdit = () => {
    setShowGroupModal(false);
    setEditingGroup(null);
    setGroupName('');
    setSelectedAreaIds([]);
    setGroupDescription('');
    setSelectedUserIds([]);
    setGroupUsers([]);
  };

  const renderCustomerTypeItem = ({ item }) => (
    <View style={styles.itemCard}>
      <Text style={styles.itemName}>{item.status_name}</Text>
      <Text style={styles.itemDetail}>{item.description || 'No description'}</Text>
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => handleEditCustomerType(item)} style={styles.editButton}>
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteCustomerType(item)} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAreaItem = ({ item }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.area_name}</Text>
        <Text style={styles.itemType}>{item.area_type}</Text>
        {item.pin_code && <Text style={styles.itemDetail}>PIN: {item.pin_code}</Text>}
        {item.state && <Text style={styles.itemDetail}>State: {item.state}</Text>}
        {item.description && <Text style={styles.itemDetail}>{item.description}</Text>}
        {item.latitude && item.longitude && <Text style={styles.itemDetail}>Location: {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}</Text>}
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditArea(item)}
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteArea(item)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderGroupItem = ({ item }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemType}>
          Areas: {(item.group_areas || []).map(ga => ga.area_master?.area_name).filter(Boolean).join(', ') || 'None'}
        </Text>
        {item.description && <Text style={styles.itemDetail}>{item.description}</Text>}
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditGroup(item)}
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteGroup(item)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const openLocationPicker = async () => {
    let initialLat = 20.5937; // Default to India center
    let initialLon = 78.9629;

    // Try to get current mobile location
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let location = await Location.getCurrentPositionAsync({});
        initialLat = location.coords.latitude;
        initialLon = location.coords.longitude;
      } else {
        Alert.alert('Permission denied', 'Location permission not granted. Using default or area location.');
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      Alert.alert('Error', 'Could not get current location. Using default or area location.');
    }

    // If editing an area and it has lat/lon, prioritize that
    if (editingArea && editingArea.latitude && editingArea.longitude) {
      initialLat = editingArea.latitude;
      initialLon = editingArea.longitude;
    }

    setSelectedLocation({ latitude: initialLat, longitude: initialLon });
    setMapRegion({
      latitude: initialLat,
      longitude: initialLon,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    if (mapRef.current) {
      mapRef.current.centerOnLocation({ latitude: initialLat, longitude: initialLon });
    }
    setShowLocationPicker(true);
  };

  const handleMapPress = ({ latitude, longitude }) => {
    setSelectedLocation({ latitude, longitude });
  };

  const confirmLocationSelection = () => {
      setShowLocationPicker(false);
  };

  const renderLocationPickerModal = () => (
    <Modal
        visible={showLocationPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLocationPicker(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ width: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>Select Location</Text>
            <LocationSearchBar onLocationFound={(coords) => {
              setSelectedLocation(coords);
              setMapRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 });
              if (mapRef.current) {
                mapRef.current.centerOnLocation(coords);
              }
            }} />
            <View style={{ width: '100%', height: 400, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <LeafletMap
                ref={mapRef}
                onMapPress={handleMapPress}
                initialRegion={mapRegion}
                markerCoordinate={selectedLocation}
              />
            </View>
            {selectedLocation && (
              <View style={{ backgroundColor: '#f0f0f0', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Selected Location:</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  Latitude: {selectedLocation.latitude.toFixed(6)}
                </Text>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  Longitude: {selectedLocation.longitude.toFixed(6)}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#ccc', borderRadius: 8, paddingVertical: 12, marginRight: 8, alignItems: 'center' }}
                onPress={() => setShowLocationPicker(false)}
              >
                <Text style={{ color: '#333', fontWeight: 'bold', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 12, marginLeft: 8, alignItems: 'center' }}
                onPress={confirmLocationSelection}
                disabled={!selectedLocation}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
  );

  const renderAreaModal = () => (
    <AdminModal
      visible={showAreaModal}
      onClose={() => setShowAreaModal(false)}
      title={editingArea ? 'Edit Area' : 'Add New Area'}
      onSave={handleSaveArea}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.input}
          placeholder="Area Name"
          value={areaName}
          onChangeText={setAreaName}
        />
        
        <View style={styles.pickerContainer}>
          <Text style={styles.label}>Area Type:</Text>
          <View style={styles.pickerRow}>
            {['village', 'town', 'city', 'district'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.pickerOption,
                  areaType === type && styles.pickerOptionSelected
                ]}
                onPress={() => setAreaType(type)}
              >
                <Text style={[
                  styles.pickerOptionText,
                  areaType === type && styles.pickerOptionTextSelected
                ]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        
        <TextInput
          style={styles.input}
          placeholder="PIN Code (optional)"
          value={pinCode}
          onChangeText={setPinCode}
          keyboardType="numeric"
        />
        
        <TextInput
          style={styles.input}
          placeholder="State (optional)"
          value={state}
          onChangeText={setState}
        />
        
        <TextInput
          style={styles.input}
          placeholder="Description (optional)"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={styles.formLabel}>Enable Day Filter:</Text>
          <Switch
            onValueChange={setEnableDay}
            value={enableDay}
          />
        </View>
        {enableDay && (
          <>
            <Text style={styles.formLabel}>Day of Week:</Text>
            <Picker selectedValue={dayOfWeek} onValueChange={setDayOfWeek} style={styles.input}>
              <Picker.Item label="Select Day" value="" />
              <Picker.Item label="Monday" value="Monday" />
              <Picker.Item label="Tuesday" value="Tuesday" />
              <Picker.Item label="Wednesday" value="Wednesday" />
              <Picker.Item label="Thursday" value="Thursday" />
              <Picker.Item label="Friday" value="Friday" />
              <Picker.Item label="Saturday" value="Saturday" />
              <Picker.Item label="Sunday" value="Sunday" />
            </Picker>
            <Text style={styles.formLabel}>Start Time Filter:</Text>
            <Picker
              selectedValue={startTimeFilter}
              onValueChange={setStartTimeFilter}
              style={styles.input}
            >
              {generateTimeOptions().map((time) => (
                <Picker.Item key={time} label={time} value={time} />
              ))}
            </Picker>
            <Text style={styles.formLabel}>End Time Filter:</Text>
            <Picker
              selectedValue={endTimeFilter}
              onValueChange={setEndTimeFilter}
              style={styles.input}
            >
              {generateTimeOptions().map((time) => (
                <Picker.Item key={time} label={time} value={time} />
              ))}
            </Picker>
          </>
        )}

        <TouchableOpacity style={styles.locationButton} onPress={openLocationPicker}>
          <Text style={styles.locationButtonText}>
              {selectedLocation ? 'Change Location' : 'Select Location'}
          </Text>
        </TouchableOpacity>

          {selectedLocation && (
              <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold' }}>Selected Location:</Text>
              <Text>Latitude: {selectedLocation.latitude.toFixed(6)}</Text>
              <Text>Longitude: {selectedLocation.longitude.toFixed(6)}</Text>
              </View>
          )}
      </ScrollView>
    </AdminModal>
  );

  const renderGroupModal = () => (
    <AdminModal
      visible={showGroupModal}
      onClose={handleCancelGroupEdit}
      title={editingGroup ? 'Edit Group' : 'Add New Group'}
      onSave={handleSaveGroup}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.input}
          placeholder="Group Name"
          value={groupName}
          onChangeText={setGroupName}
        />
        
        <View style={styles.pickerContainer}>
          <Text style={styles.label}>Select Areas:</Text>
          <TextInput
            style={styles.input}
            placeholder="Search Areas"
            value={groupAreaSearchQuery}
            onChangeText={setGroupAreaSearchQuery}
          />
          <FlatList
            data={filteredGroupAreas}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item: area }) => (
              <TouchableOpacity
                key={area.id}
                style={[
                  styles.pickerOption,
                  selectedAreaIds.includes(area.id) && styles.pickerOptionSelected
                ]}
                onPress={() => {
                  setSelectedAreaIds((prev) =>
                    prev.includes(area.id)
                      ? prev.filter((id) => id !== area.id)
                      : [...prev, area.id]
                  );
                }}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    selectedAreaIds.includes(area.id) && styles.pickerOptionTextSelected
                  ]}
                >
                  {area.area_name} ({area.area_type})
                </Text>
              </TouchableOpacity>
            )}
            style={styles.areaPicker}
            scrollEnabled={false} // Disable FlatList's internal scrolling
          />
        </View>
        
        <View style={{ marginBottom: 12 }}>
          <TextInput
            style={styles.input}
            placeholder="Search Users"
            value={userSearch}
            onChangeText={setUserSearch}
          />
        </View>
        <FlatList
          data={users.filter(
            u =>
              u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
              u.email.toLowerCase().includes(userSearch.toLowerCase())
          )}
          keyExtractor={(item) => item.id}
          renderItem={({ item: user }) => (
            <TouchableOpacity
              key={user.id}
              style={[
                styles.pickerOption,
                selectedUserIds.includes(user.id) && styles.pickerOptionSelected
              ]}
              onPress={() => {
                setSelectedUserIds(prev =>
                  prev.includes(user.id)
                    ? prev.filter(id => id !== user.id)
                    : [...prev, user.id]
                );
              }}
            >
              <Text
                style={[
                  styles.pickerOptionText,
                  selectedUserIds.includes(user.id) && styles.pickerOptionTextSelected
                ]}
              >
                {user.name} ({user.email})
              </Text>
            </TouchableOpacity>
          )}
          style={styles.userPicker}
          scrollEnabled={false} // Disable FlatList's internal scrolling
        />
        
        <TextInput
          style={styles.input}
          placeholder="Description (optional)"
          value={groupDescription}
          onChangeText={setGroupDescription}
          multiline
          numberOfLines={3}
        />
      </ScrollView>
    </AdminModal>
  );

  const renderPlanModal = () => (
    <AdminModal
      visible={showPlanModal}
      onClose={() => setShowPlanModal(false)}
      title={editingPlan ? 'Edit Repayment Plan' : 'Add Repayment Plan'}
      onSave={handleSavePlan}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <TextInput style={styles.input} placeholder="Plan Name" value={planForm.name} onChangeText={v => setPlanForm(f => ({ ...f, name: v }))} />
        <View style={styles.pickerContainer}>
          <Text style={styles.label}>Frequency:</Text>
          <View style={styles.pickerRow}>
            {['daily', 'weekly', 'monthly', 'yearly'].map(freq => (
              <TouchableOpacity key={freq} style={[styles.pickerOption, planForm.frequency === freq && styles.pickerOptionSelected]} onPress={() => setPlanForm(f => ({ ...f, frequency: freq }))}>
                <Text style={[styles.pickerOptionText, planForm.frequency === freq && styles.pickerOptionTextSelected]}>{freq.charAt(0).toUpperCase() + freq.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TextInput style={styles.input} placeholder="Number of Periods" value={planForm.periods} onChangeText={v => setPlanForm(f => ({ ...f, periods: v.replace(/[^0-9]/g, '') }))} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="Base Amount" value={planForm.base_amount} onChangeText={v => setPlanForm(f => ({ ...f, base_amount: v.replace(/[^0-9.]/g, '') }))} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="Repayment Per Period" value={planForm.repayment_per_period} onChangeText={v => setPlanForm(f => ({ ...f, repayment_per_period: v.replace(/[^0-9.]/g, '') }))} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="Advance Amount (optional)" value={planForm.advance_amount} onChangeText={v => setPlanForm(f => ({ ...f, advance_amount: v.replace(/[^0-9.]/g, '') }))} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="Late Fee Per Period (optional)" value={planForm.late_fee_per_period} onChangeText={v => setPlanForm(f => ({ ...f, late_fee_per_period: v.replace(/[^0-9.]/g, '') }))} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="Description (optional)" value={planForm.description} onChangeText={v => setPlanForm(f => ({ ...f, description: v }))} multiline numberOfLines={2} />
      </ScrollView>
    </AdminModal>
  );

  const filteredCustomersData = customers.filter(customer => {
    const query = customerDetailSearchQuery.toLowerCase();
    if (!query) return true; // If no search query, return all customers

    return (
      (customer.book_no && customer.book_no.toLowerCase().includes(query)) ||
      (customer.name && customer.name.toLowerCase().includes(query)) ||
      (customer.email && customer.email.toLowerCase().includes(query)) ||
      (customer.mobile && customer.mobile.includes(query))
    );
  });

  const filteredUsers = users.filter(user => {
    const query = userSearchQuery.toLowerCase();
    return (
      (user.name && user.name.toLowerCase().includes(query)) ||
      (user.email && user.email.toLowerCase().includes(query)) ||
      (user.mobile && user.mobile.includes(query)) // Assuming 'mobile' field exists
    );
  });

  const filteredAreasData = areas.filter(area => {
    const query = areaSearchQuery.toLowerCase();
    if (!query) return true; // If no search query, return all areas

    return (
      (area.area_name && area.area_name.toLowerCase().includes(query)) ||
      (area.area_type && area.area_type.toLowerCase().includes(query)) ||
      (area.pin_code && area.pin_code.toLowerCase().includes(query)) ||
      (area.state && area.state.toLowerCase().includes(query))
    );
  });

  const filteredGroupAreas = allAreas.filter(area => {
    const query = groupAreaSearchQuery.toLowerCase();
    if (!query) return true;
    return (
      (area.area_name && area.area_name.toLowerCase().includes(query)) ||
      (area.area_type && area.area_type.toLowerCase().includes(query))
    );
  });

  const filteredGroups = groups.filter(group => {
    const groupQuery = groupSearchQuery.toLowerCase();
    const areaFilterQuery = groupAreaFilterQuery.toLowerCase();

    const matchesGroupSearch = (
      !groupQuery ||
      (group.name && group.name.toLowerCase().includes(groupQuery)) ||
      (group.description && group.description.toLowerCase().includes(groupQuery))
    );

    const matchesAreaFilter = (
      !areaFilterQuery ||
      (group.group_areas && group.group_areas.some(ga => 
        ga.area_master && ga.area_master.area_name.toLowerCase().includes(areaFilterQuery)
      ))
    );

    return matchesGroupSearch && matchesAreaFilter;
  });

  const getRoleColor = (role) => {
    switch (role) {
      case 'superadmin':
        return '#FF3B30';
      case 'admin':
        return '#007AFF';
      default:
        return '#8E8E93';
    }
  };

  return (
    <View style={styles.container}>
      

                        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'users' && styles.activeTabButton]}
            onPress={() => setActiveTab('users')}
            onLongPress={() => Alert.alert('Users', 'Manage user accounts and roles')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'users' && styles.activeTabButtonText]}>👤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'areas' && styles.activeTabButton]}
            onPress={() => setActiveTab('areas')}
            onLongPress={() => Alert.alert('Areas', 'Manage geographical areas')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'areas' && styles.tabButtonText]}>📍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'groups' && styles.activeTabButton]}
            onPress={() => setActiveTab('groups')}
            onLongPress={() => Alert.alert('Groups', 'Manage user groups and their assigned areas')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'groups' && styles.tabButtonText]}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'customers' && styles.activeTabButton]}
            onPress={() => setActiveTab('customers')}
            onLongPress={() => Alert.alert('Customers', 'Manage customer accounts and their status')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'customers' && styles.tabButtonText]}>🧑‍💼</Text>
          </TouchableOpacity>
          {userProfile?.user_type === 'superadmin' && (
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'bankTransactions' && styles.activeTabButton]}
              onPress={() => setActiveTab('bankTransactions')}
              onLongPress={() => Alert.alert('Bank Transactions', 'View and manage bank transactions')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'bankTransactions' && styles.tabButtonText]}>💳</Text>
            </TouchableOpacity>
          )}
          {userProfile?.user_type === 'superadmin' && (
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'bankAccounts' && styles.activeTabButton]}
              onPress={() => setActiveTab('bankAccounts')}
              onLongPress={() => Alert.alert('Bank Accounts', 'Manage linked bank accounts')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'bankAccounts' && styles.tabButtonText]}>🏦</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'upload' && styles.activeTabButton]}
            onPress={() => setActiveTab('upload')}
            onLongPress={() => Alert.alert('Upload Customers', 'Upload customer data via CSV/Excel')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'upload' && styles.tabButtonText]}>☁️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'configuration' && styles.activeTabButton]}
            onPress={() => setActiveTab('configuration')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'configuration' && styles.tabButtonText]}>⚙️</Text>
            {/* Consider using a proper icon library (e.g., react-native-vector-icons) for better visual representation. */}
          </TouchableOpacity>
                    
        </View>

      {activeTab === 'users' && (
        <View style={{ flex: 1, padding: 20 }}>
          <TextInput
            style={styles.input} // Using existing input style
            placeholder="Search users by Name, Email, or Mobile"
            value={userSearchQuery}
            onChangeText={setUserSearchQuery}
          />
          <FlatList
            data={filteredUsers} // Use filteredUsers
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={loadUsers} />
            }
            contentContainerStyle={styles.listContainer}
          />
        </View>
      )}

      {activeTab === 'customers' && (
        <View style={{ flex: 1, padding: 20 }}>
          {/* Area Search Input */}
          <Text style={styles.formLabel}>Filter by Area:</Text>
          <TextInput
            style={styles.input}
            value={customerAreaSearchText}
            onChangeText={(text) => {
              setCustomerAreaSearchText(text);
              setShowCustomerAreaDropdown(true);
              setSelectedCustomerAreaId(null); // Clear selected area when typing
              // Filter areas for dropdown suggestions
              const filtered = areas.filter(area =>
                area.area_name.toLowerCase().includes(text.toLowerCase())
              );
              setFilteredCustomerAreas(filtered);
            }}
            placeholder="Search Area by Name"
            onFocus={() => setShowCustomerAreaDropdown(true)}
          />
          {showCustomerAreaDropdown && filteredCustomerAreas.length > 0 && (
            <View style={styles.dropdownContainer}>
              <FlatList
                data={filteredCustomerAreas}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedCustomerAreaId(item.id);
                      setCustomerAreaSearchText(item.area_name);
                      setShowCustomerAreaDropdown(false);
                      loadCustomers(); // Reload customers based on selected area
                    }}
                  >
                    <Text>{item.area_name}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Customer Detail Search Input */}
          <Text style={styles.formLabel}>Search Customers:</Text>
          <TextInput
            style={styles.input}
            placeholder="Search by Card No, Name, Email, or Mobile"
            value={customerDetailSearchQuery}
            onChangeText={setCustomerDetailSearchQuery}
          />

          <View style={{flexDirection: 'row'}}>
            <TouchableOpacity style={[styles.addButton, {flex: 1}]} onPress={() => {
              if (!selectedCustomerAreaId) {
                Alert.alert('No Area Selected', 'Please select an area first before uploading transactions.');
              } else {
                setShowCustomerTransactionUploadModal(true);
              }
            }}>
              <Text style={styles.addButtonText}>+ Upload Transactions</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addButton, {flex: 1, marginLeft: 10, backgroundColor: '#5BC0DE'}]} onPress={() => shareAreaTransactionsAsCsv(customers)}>
              <Text style={styles.addButtonText}>Share Area Transactions</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={filteredCustomersData} // Will define filteredCustomersData below
            renderItem={renderCustomerItem}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={loadCustomers} />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No customers found.</Text>
            }
            contentContainerStyle={styles.listContainer}
          />
        </View>
      )}

      {activeTab === 'areas' && (
        <View style={{ flex: 1, padding: 20 }}>
          <TextInput
            style={styles.input}
            placeholder="Search areas by name, type, PIN, or state"
            value={areaSearchQuery}
            onChangeText={setAreaSearchQuery}
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddArea}>
            <Text style={styles.addButtonText}>+ Add Area</Text>
          </TouchableOpacity>
          <FlatList
            data={filteredAreasData} // Will define filteredAreasData below
            renderItem={renderAreaItem}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={loadAreas} />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No areas found. Add your first area!</Text>
            }
            contentContainerStyle={styles.listContainer}
          />
          {renderAreaModal()}
          {renderLocationPickerModal()}
        </View>
      )}

      {activeTab === 'groups' && (
        <View style={{ flex: 1, padding: 20 }}>
          <TextInput
            style={styles.input}
            placeholder="Search Groups by Name or Description"
            value={groupSearchQuery}
            onChangeText={setGroupSearchQuery}
          />
          <TextInput
            style={styles.input}
            placeholder="Filter Groups by Area Name"
            value={groupAreaFilterQuery}
            onChangeText={setGroupAreaFilterQuery}
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddGroup}>
            <Text style={styles.addButtonText}>+ Add Group</Text>
          </TouchableOpacity>
          <FlatList
            data={filteredGroups} // Use filteredGroups
            renderItem={renderGroupItem}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={loadGroups} />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No groups found. Add your first group!</Text>
            }
            contentContainerStyle={styles.listContainer}
          />
          {renderGroupModal()}
        </View>
      )}

      {activeTab === 'bankTransactions' && (
        <BankTransactionScreen navigation={navigation} user={user} userProfile={userProfile} />
      )}

      {activeTab === 'bankAccounts' && (
        <BankAccountsScreen navigation={navigation} showAddFormInitially={true} />
      )}

      {activeTab === 'configuration' && (
        <View style={{ flex: 1 }}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeConfigTab === 'repaymentPlans' && styles.activeTabButton]}
              onPress={() => setActiveConfigTab('repaymentPlans')}
            >
              <Text style={[styles.tabButtonText, activeConfigTab === 'repaymentPlans' && styles.activeTabButtonText]}>Repayment Plans</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, activeConfigTab === 'customerTypes' && styles.activeTabButton]}
              onPress={() => setActiveConfigTab('customerTypes')}
            >
              <Text style={[styles.tabButtonText, activeConfigTab === 'customerTypes' && styles.activeTabButtonText]}>Customer Types</Text>
            </TouchableOpacity>
          </View>

          {activeConfigTab === 'repaymentPlans' && (
            <View style={{ flex: 1, padding: 20 }}>
              <TouchableOpacity style={styles.addButton} onPress={handleAddPlan}>
                <Text style={styles.addButtonText}>+ Add Repayment Plan</Text>
              </TouchableOpacity>
              <FlatList
                data={repaymentPlans}
                renderItem={({ item }) => (
                  <View style={styles.itemCard}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemType}>{item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)} - {item.periods} periods</Text>
                      <Text style={styles.itemDetail}>Base Amount: ₹{item.base_amount} | Repayment/Period: ₹{item.repayment_per_period}</Text>
                      {item.advance_amount ? <Text style={styles.itemDetail}>Advance: ₹{item.advance_amount}</Text> : null}
                      {item.late_fee_per_period ? <Text style={styles.itemDetail}>Late Fee/Period: ₹{item.late_fee_per_period}</Text> : null}
                      {item.description ? <Text style={styles.itemDetail}>{item.description}</Text> : null}
                    </View>
                    <View style={styles.itemActions}>
                      <TouchableOpacity style={styles.editButton} onPress={() => handleEditPlan(item)}>
                        <Text style={styles.editButtonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeletePlan(item)}>
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                keyExtractor={item => item.id.toString()}
                refreshControl={<RefreshControl refreshing={loadingPlans} onRefresh={loadRepaymentPlans} />}
                ListEmptyComponent={<Text style={styles.emptyText}>No repayment plans found. Add your first plan!</Text>}
                contentContainerStyle={styles.listContainer}
              />
              {renderPlanModal()}
            </View>
          )}
          
          {activeConfigTab === 'customerTypes' && (
            <View style={{ flex: 1, padding: 20 }}>
              <TouchableOpacity style={styles.addButton} onPress={handleAddCustomerType}>
                  <Text style={styles.addButtonText}>+ Add Customer Type</Text>
                </TouchableOpacity>
              <FlatList
                data={customerTypes}
                renderItem={renderCustomerTypeItem}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl refreshing={loadingCustomerTypes} onRefresh={loadCustomerTypes} />
                }
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={<Text style={styles.emptyListText}>No customer types found.</Text>}
              />

              <AdminModal
                visible={showCustomerTypeModal}
                onClose={handleCancelCustomerTypeEdit}
                title={editingCustomerType ? 'Edit Customer Type' : 'Add Customer Type'}
                onSave={handleSaveCustomerType}
              >
                <ScrollView keyboardShouldPersistTaps="handled">
                  <Text style={styles.formLabel}>Status Name</Text>
                  <TextInput
                    style={styles.input}
                    value={customerTypeName}
                    onChangeText={setCustomerTypeName}
                    placeholder="e.g., VIP, Regular, New"
                  />
                  <Text style={styles.formLabel}>Description</Text>
                  <TextInput
                    style={styles.input}
                    value={customerTypeDescription}
                    onChangeText={setCustomerTypeDescription}
                    placeholder="Optional description"
                    multiline
                    numberOfLines={3}
                  />
                </ScrollView>
              </AdminModal>
            </View>
          )}
        </View>
      )}

      {activeTab === 'upload' && (
        <View style={{ flex: 1, padding: 20 }}>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowCustomerUploadModal(true)}>
            <Text style={styles.addButtonText}>Upload Customers</Text>
          </TouchableOpacity>
          {/* New button for Expense Upload */}
          <TouchableOpacity style={[styles.addButton, { backgroundColor: '#FF9500' }]} onPress={() => setShowExpenseUploadModal(true)}>
            <Text style={styles.addButtonText}>Upload Expenses</Text>
          </TouchableOpacity>
          {renderCustomerUploadModal()}
          {/* New modal for Expense Upload */}
          {renderExpenseUploadModal()}

      
        </View>
      )}

      {activeTab === 'settings' && (
        <View style={{ flex: 1, padding: 20 }}>
          <Text>Settings Screen</Text>
        </View>
      )}

      {activeTab === 'tenants' && (
        <View style={{ flex: 1, padding: 20 }}>
          <TouchableOpacity style={styles.addButton} onPress={handleAddTenant}>
            <Text style={styles.addButtonText}>+ Add Tenant</Text>
          </TouchableOpacity>
          <FlatList
            data={tenants}
            renderItem={({ item }) => (
              <View style={styles.itemCard}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemDetail}>ID: {item.id}</Text>
                  {item.tenant_config[0] ? (
                    <>
                      <Text style={styles.itemDetail}>URL: {item.tenant_config[0].supabase_url}</Text>
                      <Text style={styles.itemDetail}>Key: {item.tenant_config[0].supabase_anon_key}</Text>
                    </>
                  ) : (
                    <Text style={styles.itemDetail}>Not configured</Text>
                  )}
                </View>
                <View style={styles.itemActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleConfigureTenant(item)}
                  >
                    <Text style={styles.editButtonText}>Configure</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEditTenant(item)}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteTenant(item)}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={
              <RefreshControl refreshing={loadingTenants} onRefresh={loadTenants} />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No tenants found. Add your first tenant!</Text>
            }
            contentContainerStyle={styles.listContainer}
          />
          <AdminModal
            visible={showTenantModal}
            onClose={() => setShowTenantModal(false)}
            title={editingTenant ? 'Edit Tenant' : 'Add New Tenant'}
            onSave={handleSaveTenant}
          >
            <TextInput
              style={styles.input}
              placeholder="Tenant Name"
              value={tenantName}
              onChangeText={setTenantName}
            />
          </AdminModal>
          <AdminModal
            visible={showTenantConfigModal}
            onClose={() => setShowTenantConfigModal(false)}
            title={`Configure Tenant: ${editingTenant?.name}`}
            onSave={handleSaveTenantConfig}
          >
            <TextInput
              style={styles.input}
              placeholder="Supabase URL"
              value={tenantConfigForm.supabase_url}
              onChangeText={(text) => setTenantConfigForm({ ...tenantConfigForm, supabase_url: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Supabase Anon Key"
              value={tenantConfigForm.supabase_anon_key}
              onChangeText={(text) => setTenantConfigForm({ ...tenantConfigForm, supabase_anon_key: text })}
            />
          </AdminModal>
        </View>
      )}
      {/* Customer DB Setup Modal */}
      <AdminModal
        visible={showCustomerDbSetupModal}
        onClose={() => setShowCustomerDbSetupModal(false)}
        title="Setup Customer Database"
        onSave={handleSaveCustomerDbDetails}
        saveButtonText="Save DB Details"
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.formLabel}>Database URL:</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., https://your-project.supabase.co"
            value={dbUrl}
            onChangeText={setDbUrl}
            autoCapitalize="none"
          />

          <Text style={styles.formLabel}>Anon Key:</Text>
          <TextInput
            style={styles.input}
            placeholder="Your project's anon key"
            value={anonKey}
            onChangeText={setAnonKey}
            autoCapitalize="none"
            secureTextEntry // Keep this sensitive field secure
          />

          <Text style={styles.formLabel}>Service Role Key:</Text>
          <TextInput
            style={styles.input}
            placeholder="Your project's service role key"
            value={serviceRoleKey}
            onChangeText={setServiceRoleKey}
            autoCapitalize="none"
            secureTextEntry // Keep this sensitive field secure
          />
        </ScrollView>
      </AdminModal>
      {renderCustomerTransactionUploadModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingTop: 0, // Explicitly set to 0
    marginTop: 0,  // Explicitly set to 0
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'left', // Changed to left
    marginVertical: 10,
    color: '#333',
    marginLeft: 20, // Add some left margin for better alignment
  },
  
  
  
  listContainer: {
    padding: 16,
  },
  userItemCard: {
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userItemInfo: {
    marginBottom: 12,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  userMobile: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  mobileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // Distribute space
    marginBottom: 4,
  },
  mobileActions: {
    flexDirection: 'row',
    marginLeft: 10,
  },
  mobileActionButton: {
    padding: 5,
    marginLeft: 5,
  },
  userRole: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  userStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  userDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  
  deleteButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    width: '100%', // Added this
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 10, // Add some spacing between tabs
    flex: 1, // Added this to make tabs take equal space
  },
  activeTabButton: {
    backgroundColor: '#007AFF',
  },
  tabButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
  activeTabButtonText: {
    color: '#FFFFFF',
  },
  
  
  listTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  addButton: {
    backgroundColor: '#28a745',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyListText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#8E8E93',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
    marginTop: 10,
    color: '#1C1C1E',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: '#1C1C1E',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 10,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#E5E5EA',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '600',
  },
  
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemInfo: {
    marginBottom: 12,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  itemType: {
    fontSize: 14,
    color: '#007AFF',
    marginBottom: 4,
  },
  itemDetail: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 2,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 20,
    textAlign: 'center',
  },
  pickerContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  columnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pickerOption: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  pickerOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  pickerOptionText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  pickerOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  areaPicker: {
  },
  userPicker: {
  },
  locationButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  locationButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  csvPreviewContainer: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 10,
    maxHeight: 200,
  },
  csvHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  csvHeaderCell: {
    fontWeight: 'bold',
    paddingHorizontal: 10,
    flex: 1,
    minWidth: 80,
  },
  csvDataRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F2F2F7',
  },
  csvDataCell: {
    paddingHorizontal: 10,
    flex: 1,
    minWidth: 80,
  },
  csvMoreText: {
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 5,
    color: '#8E8E93',
  },
  csvInstructionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
    lineHeight: 20,
  },
  viewTransactionsButton: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  viewTransactionsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  shareButton: {
    backgroundColor: '#5BC0DE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
    justifyContent: 'center',
  },
  transactionsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  transactionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'right',
    marginTop: 8,
  },
});