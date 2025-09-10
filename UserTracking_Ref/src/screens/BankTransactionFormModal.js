import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, FlatList, TouchableOpacity, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../services/supabaseClient';

const BankTransactionFormModal = ({ isVisible, onClose, onSaveSuccess, initialAreaId, initialBankAccountId }) => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [transactionDate, setTransactionDate] = useState(new Date());
    const [areaMasterId, setAreaMasterId] = useState(initialAreaId || null);
    const [areaMasters, setAreaMasters] = useState([]);
    const [transactionType, setTransactionType] = useState(null);
    const [loading, setLoading] = useState(false);
    const [areaSearchQuery, setAreaSearchQuery] = useState('');
    const [filteredAreas, setFilteredAreas] = useState([]);
    const [showAreaSuggestions, setShowAreaSuggestions] = useState(false);

    const [bankAccountId, setBankAccountId] = useState(initialBankAccountId || null);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [bankAccountSearchQuery, setBankAccountSearchQuery] = useState('');
    const [filteredBankAccounts, setFilteredBankAccounts] = useState([]);
    const [showBankAccountSuggestions, setShowBankAccountSuggestions] = useState(false);

    const transactionTypes = [
        'deposit_own_funds',
        'withdrawal_own_funds',
        'borrow_from_bank',
        'repay_to_bank',
        'customer_loan_disbursement',
        'customer_loan_repayment',
    ];

    useEffect(() => {
        if (isVisible) {
            fetchAreaMasters();
            fetchBankAccounts();
            // Reset form when modal becomes visible
            setAmount('');
            setDescription('');
            setTransactionDate(new Date());
            setTransactionType(null);
            setAreaMasterId(initialAreaId || null);
            setBankAccountId(initialBankAccountId || null);
            setAreaSearchQuery('');
            setBankAccountSearchQuery('');
        }
    }, [isVisible, initialAreaId, initialBankAccountId]);

    const fetchAreaMasters = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('area_master')
            .select('id, area_name');
        if (error) {
            console.error('Error fetching area masters:', error);
            Alert.alert('Error', 'Failed to fetch area masters: ' + error.message);
        } else {
            setAreaMasters(data || []);
            if (initialAreaId) {
                const initialArea = (data || []).find(area => area.id === initialAreaId);
                if (initialArea) setAreaSearchQuery(initialArea.area_name);
            }
        }
        setLoading(false);
    };

    const fetchBankAccounts = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('bank_accounts')
            .select('id, bank_name, account_number');
        if (error) {
            console.error('Error fetching bank accounts:', error);
            Alert.alert('Error', 'Failed to fetch bank accounts: ' + error.message);
        } else {
            setBankAccounts(data || []);
            if (initialBankAccountId) {
                const initialAccount = (data || []).find(acc => acc.id === initialBankAccountId);
                if (initialAccount) setBankAccountSearchQuery(`${initialAccount.bank_name} - ${initialAccount.account_number}`);
            }
        }
        setLoading(false);
    }, [initialBankAccountId]);

    const handleAddTransaction = useCallback(async () => {
        if (!amount || !description || !areaMasterId || !bankAccountId || !transactionType) {
            Alert.alert('Error', 'Please fill all fields.');
            return;
        }

        setLoading(true);

        const { data, error } = await supabase
            .from('bank_transactions')
            .insert([
                {
                    amount: parseFloat(amount),
                    description: description,
                    transaction_date: transactionDate.toISOString(),
                    area_id: areaMasterId,
                    bank_account_id: bankAccountId,
                    transaction_type: transactionType,
                },
            ]);

        if (error) {
            console.error('Supabase insert error:', error);
            Alert.alert('Error', 'Failed to add transaction: ' + error.message);
        } else {
            Alert.alert('Success', 'Transaction added successfully!');
            onSaveSuccess(); // Notify parent to refresh list
            onClose(); // Close modal
        }
        setLoading(false);
    }, [amount, description, transactionDate, areaMasterId, bankAccountId, transactionType, onClose, onSaveSuccess]);

    const handleAreaSelect = (area) => {
        setAreaMasterId(area.id);
        setAreaSearchQuery(area.area_name);
        setShowAreaSuggestions(false);
    };

    const handleBankAccountSelect = (account) => {
        setBankAccountId(account.id);
        setBankAccountSearchQuery(`${account.bank_name} - ${account.account_number}`);
        setShowBankAccountSuggestions(false);
    };

    const handleAreaSearchChange = (text) => {
        setAreaSearchQuery(text);
        setShowAreaSuggestions(true);
        if (areaMasterId && areaMasters.length > 0) {
            const currentArea = areaMasters.find(area => area.id === areaMasterId);
            if (currentArea && currentArea.area_name !== text) {
                setAreaMasterId(null);
            }
        }
        const filtered = areaMasters.filter(area =>
            area.area_name.toLowerCase().includes(text.toLowerCase())
        );
        setFilteredAreas(filtered);
    };

    const handleBankAccountSearchChange = (text) => {
        setBankAccountSearchQuery(text);
        setShowBankAccountSuggestions(true);
        if (bankAccountId && bankAccounts.length > 0) {
            const currentAccount = bankAccounts.find(account => account.id === bankAccountId);
            if (currentAccount && `${currentAccount.bank_name} - ${currentAccount.account_number}` !== text) {
                setBankAccountId(null);
            }
        }
        const filtered = bankAccounts.filter(account =>
            account.bank_name.toLowerCase().includes(text.toLowerCase()) ||
            account.account_number.toLowerCase().includes(text.toLowerCase())
        );
        setFilteredBankAccounts(filtered);
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={isVisible}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Add New Transaction</Text>

                    <Text style={styles.label}>Select Area:</Text>
                    <View style={{ position: 'relative', zIndex: 2 }}>
                        <TextInput
                            style={styles.input}
                            placeholder="Search Area"
                            value={areaSearchQuery}
                            onChangeText={handleAreaSearchChange}
                            onFocus={() => setShowAreaSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowAreaSuggestions(false), 300)}
                        />
                        {showAreaSuggestions && filteredAreas.length > 0 && (
                            <FlatList
                                data={filteredAreas}
                                keyExtractor={(item) => item.id.toString()}
                                style={styles.suggestionsList}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.suggestionItem}
                                        onPress={() => handleAreaSelect(item)}
                                    >
                                        <Text>{item.area_name}</Text>
                                    </TouchableOpacity>
                                )}
                                keyboardShouldPersistTaps="always"
                            />
                        )}
                    </View>

                    <Text style={styles.label}>Select Bank Account:</Text>
                    <View style={{ position: 'relative', zIndex: 1 }}>
                        <TextInput
                            style={styles.input}
                            placeholder="Search Bank Account"
                            value={bankAccountSearchQuery}
                            onChangeText={handleBankAccountSearchChange}
                            onFocus={() => setShowBankAccountSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowBankAccountSuggestions(false), 300)}
                        />
                        {showBankAccountSuggestions && filteredBankAccounts.length > 0 && (
                            <FlatList
                                data={filteredBankAccounts}
                                keyExtractor={(item) => item.id.toString()}
                                style={styles.suggestionsList}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.suggestionItem}
                                        onPress={() => handleBankAccountSelect(item)}
                                    >
                                        <Text>{item.bank_name} ({item.account_number})</Text>
                                    </TouchableOpacity>
                                )}
                                keyboardShouldPersistTaps="always"
                            />
                        )}
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder="Amount"
                        keyboardType="numeric"
                        value={amount}
                        onChangeText={setAmount}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Description"
                        value={description}
                        onChangeText={setDescription}
                    />

                    <Text style={styles.label}>Transaction Type:</Text>
                    <Picker
                        selectedValue={transactionType}
                        style={styles.picker}
                        onValueChange={(itemValue) => setTransactionType(itemValue)}
                    >
                        <Picker.Item label="-- Select Transaction Type --" value={null} />
                        {transactionTypes.map((type) => (
                            <Picker.Item
                                key={type}
                                label={type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                value={type}
                            />
                        ))}
                    </Picker>

                    <View style={styles.modalActions}>
                        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.saveButton} onPress={handleAddTransaction} disabled={loading}>
                            <Text style={styles.saveButtonText}>{loading ? "Saving..." : "Save Transaction"}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 20,
        width: '90%',
        maxHeight: '80%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 15,
        textAlign: 'center',
    },
    label: {
        fontSize: 16,
        marginTop: 10,
        marginBottom: 5,
    },
    input: {
        height: 40,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 5,
        marginBottom: 10,
        paddingHorizontal: 10,
        backgroundColor: '#fff',
    },
    picker: {
        height: 50,
        width: '100%',
        marginBottom: 10,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 5,
        backgroundColor: '#fff',
    },
    suggestionsList: {
        maxHeight: 120, // Adjusted for modal context
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 5,
        backgroundColor: '#fff',
        position: 'absolute',
        width: '100%',
        top: 40, // Position right below the input
        // zIndex is handled by the wrapper
        elevation: 5, // Ensure it pops out in Android
    },
    suggestionItem: {
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 20,
    },
    cancelButton: {
        backgroundColor: '#ccc',
        padding: 10,
        borderRadius: 5,
        flex: 1,
        marginRight: 10,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#333',
        fontWeight: 'bold',
    },
    saveButton: {
        backgroundColor: '#007AFF',
        padding: 10,
        borderRadius: 5,
        flex: 1,
        marginLeft: 10,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
});

export default BankTransactionFormModal;
