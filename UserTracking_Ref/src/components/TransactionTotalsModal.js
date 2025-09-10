import React from 'react';
import { View, Text, StyleSheet, Modal, FlatList, TouchableOpacity } from 'react-native';

const TransactionTotalsModal = ({ isVisible, onClose, transactions, type }) => {
    return (
        <Modal
            visible={isVisible}
            onRequestClose={onClose}
            animationType="slide"
            transparent={true}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>
                        Transactions for {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Text>
                    
                    <FlatList
                        data={transactions}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <View style={styles.transactionItem}>
                                <Text style={styles.transactionText}>Amount: {item.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</Text>
                                <Text style={styles.transactionText}>Description: {item.description}</Text>
                                <Text style={styles.transactionText}>Date: {new Date(item.transaction_date).toLocaleDateString()}</Text>
                                {item.area_master && (
                                    <Text style={styles.transactionText}>Area: {item.area_master.area_name}</Text>
                                )}
                            </View>
                        )}
                        ListEmptyComponent={<Text style={styles.noResultsText}>No transactions found for this type.</Text>}
                    />

                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={onClose}
                    >
                        <Text style={styles.closeButtonText}>Close</Text>
                    </TouchableOpacity>
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
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modalContent: {
        width: '90%',
        height: '80%',
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 10,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
        color: '#333',
    },
    transactionItem: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fff',
        borderRadius: 8,
        marginBottom: 10,
    },
    transactionText: {
        fontSize: 15,
        marginBottom: 3,
        color: '#333',
    },
    noResultsText: {
        padding: 20,
        textAlign: 'center',
        color: '#888',
        fontSize: 16,
    },
    closeButton: {
        backgroundColor: '#007AFF',
        borderRadius: 10,
        paddingVertical: 15,
        marginTop: 25,
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default TransactionTotalsModal;
