import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { supabase, getTransactionsByCustomerId } from '../services/supabase';

const AccountScreen = ({ route }) => {
  const { session, customerId } = route.params;
  {console.log('AccountScreen - customerId:', customerId)}
  const [customerTransactions, setCustomerTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!customerId) {
        setLoadingTransactions(false);
        return;
      }

      try {
        const transactions = await getTransactionsByCustomerId(customerId);
        if (transactions) {
          setCustomerTransactions(transactions);
        } else {
          Alert.alert("No Transactions", "You do not have any transactions.");
        }
      } catch (error) {
        console.error("Error in fetching transactions:", error.message);
        Alert.alert("Error", "An unexpected error occurred while fetching data.");
      } finally {
        setLoadingTransactions(false);
      }
    };

    fetchTransactions();
  }, [customerId]);

  const renderTransactionItem = ({ item }) => (
    <View style={styles.transactionItem}>
      <Text style={styles.transactionText}>Type: {item.transaction_type}</Text>
      <Text style={styles.transactionText}>Amount: {item.amount}</Text>
      <Text style={styles.transactionText}>Date: {new Date(item.transaction_date).toLocaleDateString()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      

      <Text style={styles.transactionsTitle}>Your Transactions</Text>
      {loadingTransactions ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : customerTransactions.length > 0 ? (
        <FlatList
          data={customerTransactions}
          renderItem={renderTransactionItem}
          keyExtractor={(item) => item.id.toString()}
          style={styles.transactionList}
        />
      ) : (
        <Text>No transactions found.</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  transactionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 30,
    marginBottom: 10,
    color: '#555',
  },
  transactionList: {
    width: '100%',
  },
  transactionItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  transactionText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
});

export default AccountScreen;
