import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';
import { NetInfoService } from '../services/NetInfoService';

export default function BankAccountsScreen({ navigation, user, userProfile, showAddFormInitially = false }) {
  console.log('BankAccountsScreen: userProfile:', userProfile); // Added log
  console.log('BankAccountsScreen: userProfile.user_type:', userProfile?.user_type); // Added log
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(showAddFormInitially); // State to control form visibility

  useEffect(() => {
    fetchBankAccounts();
  }, []);

  const fetchBankAccounts = async () => {
    setLoading(true);
    const isConnected = await NetInfoService.isNetworkAvailable();
    if (!isConnected) {
      Alert.alert('Offline', 'Cannot fetch bank accounts while offline.');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }
      setBankAccounts(data || []);
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
      Alert.alert('Error', 'Failed to load bank accounts.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBankAccount = async () => {
    if (!bankName || !accountNumber || !accountHolderName) {
      Alert.alert('Error', 'Bank Name, Account Number, and Account Holder Name are required.');
      return;
    }

    setLoading(true);
    const isConnected = await NetInfoService.isNetworkAvailable();
    if (!isConnected) {
      Alert.alert('Offline', 'Cannot add bank account while offline.');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .insert([
          {
            bank_name: bankName,
            account_number: accountNumber,
            account_holder_name: accountHolderName,
            branch_name: branchName,
            ifsc_code: ifscCode,
          },
        ])
        .select(); // Use .select() to return the inserted data

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        Alert.alert('Success', 'Bank account added successfully!');
        setBankName('');
        setAccountNumber('');
        setAccountHolderName('');
        setBranchName('');
        setIfscCode('');
        setIsAddingAccount(false); // Hide the form after successful addition
        fetchBankAccounts(); // Refresh the list
      }
    } catch (error) {
      console.error('Error adding bank account:', error);
      Alert.alert('Error', `Failed to add bank account: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderBankAccountItem = ({ item }) => (
    <View style={styles.bankAccountItem}>
      <Text style={styles.itemTextBold}>{item.bank_name}</Text>
      <Text style={styles.itemText}>Account No: {item.account_number}</Text>
      <Text style={styles.itemText}>Holder: {item.account_holder_name}</Text>
      {item.branch_name && <Text style={styles.itemText}>Branch: {item.branch_name}</Text>}
      {item.ifsc_code && <Text style={styles.itemText}>IFSC: {item.ifsc_code}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Removed closeButton as it's now part of a tab view */}
      

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        

        

        {isAddingAccount && (
          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="Bank Name"
              value={bankName}
              onChangeText={setBankName}
            />
            <TextInput
              style={styles.input}
              placeholder="Account Number"
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Account Holder Name"
              value={accountHolderName}
              onChangeText={setAccountHolderName}
            />
            <TextInput
              style={styles.input}
              placeholder="Branch Name (Optional)"
              value={branchName}
              onChangeText={setBranchName}
            />
            <TextInput
              style={styles.input}
              placeholder="IFSC Code (Optional)"
              value={ifscCode}
              onChangeText={setIfscCode}
            />
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddBankAccount}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.addButtonText}>Add Account</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionHeader}>Existing Bank Accounts</Text>
        {loading && !isAddingAccount ? (
          <ActivityIndicator size="large" color="#0000ff" />
        ) : bankAccounts.length === 0 ? (
          <Text style={styles.emptyListText}>No bank accounts added yet.</Text>
        ) : (
          <FlatList
            data={bankAccounts}
            keyExtractor={(item) => item.id}
            renderItem={renderBankAccountItem}
            scrollEnabled={false} // Parent ScrollView will handle scrolling
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f0f2f5',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
  toggleFormButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  toggleFormButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  formContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  addButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  bankAccountItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  itemText: {
    fontSize: 16,
    color: '#555',
    marginBottom: 3,
  },
  itemTextBold: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  emptyListText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#888',
  },
  accessDeniedText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 50,
    color: '#FF3B30', // Red color for denial
  },
  accessDeniedSubText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
    color: '#8E8E93',
  },
});