import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, FlatList, TouchableOpacity, RefreshControl, Modal, Clipboard } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../services/supabaseClient';
import BankTransactionFormModal from './BankTransactionFormModal'; // Import the new modal component
import TransactionDetailModal from '../components/TransactionDetailModal'; // Import the details modal
import TransactionTotalsModal from '../components/TransactionTotalsModal'; // Import the totals modal

const BankTransactionScreen = ({ navigation, user, userProfile }) => {
    console.log('BankTransactionScreen: userProfile:', userProfile); // Added log
    console.log('BankTransactionScreen: userProfile.user_type:', userProfile?.user_type); // Added log

    // State for bank transactions list
    const [bankTransactions, setBankTransactions] = useState([]);
    const [transactionTotals, setTransactionTotals] = useState({}); // State for totals
    const [globalTransactionTotals, setGlobalTransactionTotals] = useState({});
    const [loadingTransactions, setLoadingTransactions] = useState(false);

    // State for Area selection on the main screen (to filter transactions)
    const [areaMasterId, setAreaMasterId] = useState(null);
    const [areaMasters, setAreaMasters] = useState([]);
    const [areaSearchQuery, setAreaSearchQuery] = useState('');
    const [filteredAreas, setFilteredAreas] = useState([]);
    const [showAreaSuggestions, setShowAreaSuggestions] = useState(false);

    // State for the transaction detail modal
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);

    // State for the transaction totals modal
    const [selectedTransactionType, setSelectedTransactionType] = useState(null);
    const [transactionsForType, setTransactionsForType] = useState([]);
    const [isTotalsModalVisible, setIsTotalsModalVisible] = useState(false);

    // State to control the visibility of the Add Transaction Modal
    const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);

    // State for customer upload modal
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadedTransactions, setUploadedTransactions] = useState([]);

    useEffect(() => {
        fetchAreaMasters();
        fetchGlobalTransactionTotals().then(totals => {
            setGlobalTransactionTotals(totals);
            setTransactionTotals(totals);
        });
    }, []);

    useEffect(() => {
        if (areaMasterId) {
            fetchBankTransactions(areaMasterId);
        } else {
            setBankTransactions([]); // Clear transactions if no area is selected
            setTransactionTotals(globalTransactionTotals);
        }
    }, [areaMasterId, globalTransactionTotals]);

    const fetchGlobalTransactionTotals = async () => {
        setLoadingTransactions(true);
        const { data, error } = await supabase
            .from('bank_transactions')
            .select('transaction_type, amount');

        setLoadingTransactions(false);
        if (error) {
            console.error('Error fetching global transaction totals:', error);
            Alert.alert('Error', 'Failed to fetch global transaction totals: ' + error.message);
            return {}; // Return empty object on error
        } else {
            const totals = (data || []).reduce((acc, transaction) => {
                const { transaction_type, amount } = transaction;
                if (!acc[transaction_type]) {
                    acc[transaction_type] = 0;
                }
                acc[transaction_type] += amount;
                return acc;
            }, {});
            return totals; // Return the calculated totals
        }
    };

    const fetchAreaMasters = async () => {
        setLoadingTransactions(true); // Use loadingTransactions for this fetch
        const { data, error } = await supabase
            .from('area_master')
            .select('id, area_name');
        if (error) {
            console.error('Error fetching area masters:', error);
            Alert.alert('Error', 'Failed to fetch area masters: ' + error.message);
        } else {
            setAreaMasters(data || []);
        }
        setLoadingTransactions(false);
    };

    const fetchBankTransactions = useCallback(async (areaId) => {
        setLoadingTransactions(true);
        const { data, error } = await supabase
            .from('bank_transactions')
            .select('*, bank_accounts(bank_name, account_number), area_master(area_name)')
            .eq('area_id', areaId)
            .order('transaction_date', { ascending: false });

        if (error) {
            console.error('Error fetching bank transactions:', error);
            Alert.alert('Error', 'Failed to fetch bank transactions: ' + error.message);
            setBankTransactions([]);
            setTransactionTotals({}); // Clear totals on error
        } else {
            const transactions = data || [];
            setBankTransactions(transactions);

            // Calculate totals
            const totals = transactions.reduce((acc, transaction) => {
                const { transaction_type, amount } = transaction;
                if (!acc[transaction_type]) {
                    acc[transaction_type] = 0;
                }
                acc[transaction_type] += amount;
                return acc;
            }, {});
            setTransactionTotals(totals);
        }
        setLoadingTransactions(false);
    }, []);

    const handleAreaSelect = (area) => {
        setAreaMasterId(area.id);
        setAreaSearchQuery(area.area_name);
        setShowAreaSuggestions(false);
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

    const handleTransactionPress = (transaction) => {
        setSelectedTransaction(transaction);
        setIsDetailModalVisible(true);
    };

    const handleRefreshTransactions = () => {
        if (areaMasterId) {
            fetchBankTransactions(areaMasterId);
        }
    };

    const handlePickTransactionCsvFile = async () => {
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
            const requiredHeaders = ['transaction_date', 'description', 'amount', 'transaction_type', 'bank_account_id'];
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
    
            setUploadedTransactions(parsedData);
            Alert.alert('File Selected', `${parsedData.length} transactions parsed from CSV.`);
          } else {
            Alert.alert('File Selection Cancelled', 'No file was selected.');
          }
        } catch (err) {
          console.error('Error picking document:', err);
          Alert.alert('Error', 'Failed to pick document.');
        }
    };

    const handleUploadTransactions = async () => {
        if (!areaMasterId) {
            Alert.alert('Error', 'Please select an Area before uploading transactions.');
            return;
        }
        if (uploadedTransactions.length === 0) {
            Alert.alert('Error', 'No transactions to upload. Please select a CSV file.');
            return;
        }
    
        Alert.alert(
            'Confirm Upload',
            `Are you sure you want to upload ${uploadedTransactions.length} transactions to the selected Area?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Upload',
                    onPress: async () => {
                        try {
                            const transactionsToInsert = uploadedTransactions.map(tx => ({
                                ...tx,
                                area_id: areaMasterId,
                                user_id: user.id, 
                                amount: parseFloat(tx.amount),
                                bank_account_id: parseInt(tx.bank_account_id, 10),
                            }));

                            const { error } = await supabase
                                .from('bank_transactions')
                                .insert(transactionsToInsert);
    
                            if (error) {
                                throw error;
                            }
    
                            Alert.alert('Success', `${uploadedTransactions.length} transactions uploaded successfully!`);
                            setShowUploadModal(false);
                            setUploadedTransactions([]);
                            handleRefreshTransactions(); // Refresh the list
                        } catch (error) {
                            console.error('Error uploading transactions:', error);
                            Alert.alert('Upload Error', `Failed to upload transactions: ${error.message}`);
                        }
                    },
                },
            ]
        );
    };

    const renderTransactionUploadModal = () => {
        const csvColumns = "transaction_date (YYYY-MM-DD),description,amount,transaction_type,bank_account_id";
        const copyToClipboard = () => {
          Clipboard.setString(csvColumns);
          Alert.alert('Copied', 'CSV columns copied to clipboard.');
        };
    
        return (
          <Modal
            visible={showUploadModal}
            animationType="slide"
            onRequestClose={() => setShowUploadModal(false)}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Upload Transactions</Text>
                
                <View style={{ marginVertical: 10 }}>
                  <Text style={styles.csvInstructionText}>
                    Please select a CSV file with the following columns:
                  </Text>
                  <Text style={styles.columnText}>{csvColumns}</Text>
                  <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
                    <Text style={styles.copyButtonText}>Copy Columns</Text>
                  </TouchableOpacity>
                </View>
    
                <TouchableOpacity style={styles.locationButton} onPress={handlePickTransactionCsvFile}>
                  <Text style={styles.locationButtonText}>Select CSV File</Text>
                </TouchableOpacity>
    
                {uploadedTransactions.length > 0 && (
                  <View style={styles.csvPreviewContainer}>
                    <Text style={styles.formLabel}>CSV Preview ({uploadedTransactions.length} rows):</Text>
                    <ScrollView horizontal>
                      <View>
                        <View style={styles.csvHeaderRow}>
                          {Object.keys(uploadedTransactions[0]).map((header, index) => (
                            <Text key={index} style={styles.csvHeaderCell}>{header}</Text>
                          ))}
                        </View>
                        {uploadedTransactions.slice(0, 5).map((row, rowIndex) => (
                          <View key={rowIndex} style={styles.csvDataRow}>
                            {Object.values(row).map((value, colIndex) => (
                              <Text key={colIndex} style={styles.csvDataCell}>{String(value)}</Text>
                            ))}
                          </View>
                        ))}
                        {uploadedTransactions.length > 5 && (
                          <Text style={styles.csvMoreText}>... {uploadedTransactions.length - 5} more rows</Text>
                        )}
                      </View>
                    </ScrollView>
                  </View>
                )}
    
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setShowUploadModal(false)}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={handleUploadTransactions}>
                    <Text style={styles.saveButtonText}>Upload</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
    };

    const renderTransactionItem = useCallback(({ item }) => (
        <TouchableOpacity onPress={() => handleTransactionPress(item)}>
            <View style={styles.transactionItem}>
                <Text style={styles.transactionText}>Amount: {item.amount}</Text>
                <Text style={styles.transactionText}>Description: {item.description}</Text>
                <Text style={styles.transactionText}>Type: {item.transaction_type}</Text>
                <Text style={styles.transactionText}>Date: {new Date(item.transaction_date).toLocaleDateString()}</Text>
                {item.bank_accounts && (
                    <Text style={styles.transactionText}>Bank: {item.bank_accounts.bank_name} ({item.bank_accounts.account_number})</Text>
                )}
            </View>
        </TouchableOpacity>
    ), []);

    

    return (
        <View style={styles.container}>
            {/* Area Selection for filtering transactions */}
            <View style={styles.areaFilterContainer}>
                <Text style={styles.label}>Select Area to View Transactions:</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Search Area"
                    value={areaSearchQuery}
                    onChangeText={handleAreaSearchChange}
                    onFocus={() => setShowAreaSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowAreaSuggestions(false), 300)}
                />
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => setShowAddTransactionModal(true)}
                >
                    <Text style={styles.addButtonText}>+ Add New</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.addButton, styles.uploadButton]}
                    onPress={() => setShowUploadModal(true)}
                >
                    <Text style={styles.addButtonText}>Upload</Text>
                </TouchableOpacity>
            </View>

            {/* Totals Display */}
            {Object.keys(transactionTotals).length > 0 && (
                <View style={styles.totalsContainer}>
                    <Text style={styles.totalsTitle}>Transaction Totals</Text>
                    {Object.entries(transactionTotals).map(([type, total]) => (
                        <View key={type} style={styles.totalRow}>
                            <Text style={styles.totalType}>{type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
                            <Text style={styles.totalAmount}>{total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* List of Bank Transactions */}
            <FlatList
                data={bankTransactions}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderTransactionItem}
                ListEmptyComponent={() => (
                    !areaMasterId ?
                    <Text style={styles.noResultsText}>Please select an area to view transactions.</Text> :
                    <Text style={styles.noResultsText}>No transactions found for this area.</Text>
                )}
                refreshControl={
                    <RefreshControl
                        refreshing={loadingTransactions}
                        onRefresh={handleRefreshTransactions}
                    />
                }
                style={styles.transactionsListContainer}
            />

            {/* Suggestions list is now rendered here, outside of its old container, to prevent clipping */}
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

            {/* Add Transaction Modal */}
            <BankTransactionFormModal
                isVisible={showAddTransactionModal}
                onClose={() => setShowAddTransactionModal(false)}
                onSaveSuccess={handleRefreshTransactions}
                initialAreaId={areaMasterId} // Pass the currently selected area to the modal
            />

            <TransactionDetailModal
                isVisible={isDetailModalVisible}
                onClose={() => setIsDetailModalVisible(false)}
                transaction={selectedTransaction}
            />
            {renderTransactionUploadModal()}
        </View>
    );
};


const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 20, // Adjusted padding top
        backgroundColor: '#f5f5f5',
    },
    areaFilterContainer: {
        marginBottom: 20,
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    label: {
        fontSize: 16,
        marginBottom: 5,
        fontWeight: 'bold',
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
    suggestionsList: {
        maxHeight: 150,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 5,
        backgroundColor: '#fff',
        position: 'absolute',
        // Positioned relative to the screen container now
        top: 85, // Precise top position
        left: 35,  // Adjusted to align with the TextInput
        right: 35, // Adjusted to align with the TextInput
        zIndex: 1000, // Ensure it's on top of everything
        elevation: 10,
    },
    suggestionItem: {
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    actionButtonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20,
    },
    addButton: {
        backgroundColor: '#007AFF',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 10,
        alignItems: 'center',
        flex: 1,
        marginHorizontal: 10,
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    uploadButton: {
        backgroundColor: '#4CAF50', // Green color for upload
    },
    addButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    totalsContainer: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 15,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    totalsTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    totalType: {
        fontSize: 16,
        color: '#333',
    },
    totalAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#007AFF',
    },
    transactionsListContainer: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    noResultsText: {
        padding: 20,
        textAlign: 'center',
        color: '#888',
        fontSize: 16,
    },
    transactionItem: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fff',
        borderRadius: 8,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    transactionText: {
        fontSize: 15,
        marginBottom: 3,
        color: '#333',
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
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 15,
    },
    csvInstructionText: {
        textAlign: 'center',
        marginBottom: 10,
    },
    columnText: {
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 10,
    },
    copyButton: {
        backgroundColor: '#ddd',
        padding: 10,
        borderRadius: 5,
        marginBottom: 20,
    },
    copyButtonText: {
        textAlign: 'center',
    },
    locationButton: {
        backgroundColor: '#007AFF',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 20,
        width: '100%',
    },
    locationButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    csvPreviewContainer: {
        width: '100%',
        maxHeight: 200,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 5,
        padding: 10,
        marginBottom: 20,
    },
    formLabel: {
        fontSize: 16,
        marginBottom: 5,
        fontWeight: 'bold',
    },
    csvHeaderRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        paddingBottom: 5,
        marginBottom: 5,
    },
    csvHeaderCell: {
        fontWeight: 'bold',
        padding: 5,
        minWidth: 100,
    },
    csvDataRow: {
        flexDirection: 'row',
    },
    csvDataCell: {
        padding: 5,
        minWidth: 100,
    },
    csvMoreText: {
        fontStyle: 'italic',
        marginTop: 5,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    cancelButton: {
        backgroundColor: '#ccc',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        flex: 1,
        marginRight: 10,
    },
    cancelButtonText: {
        color: '#333',
        fontWeight: 'bold',
    },
    saveButton: {
        backgroundColor: '#4CAF50',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        flex: 1,
    },
    saveButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
});

export default BankTransactionScreen;