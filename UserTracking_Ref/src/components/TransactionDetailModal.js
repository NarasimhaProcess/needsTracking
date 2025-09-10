import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';

const TransactionDetailModal = ({ isVisible, onClose, transaction }) => {
    if (!transaction) {
        return null;
    }

    return (
        <Modal
            visible={isVisible}
            onRequestClose={onClose}
            animationType="slide"
            transparent={true}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Transaction Details</Text>
                    
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Amount:</Text>
                        <Text style={styles.detailValue}>{transaction.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Description:</Text>
                        <Text style={styles.detailValue}>{transaction.description}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Type:</Text>
                        <Text style={styles.detailValue}>{transaction.transaction_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Date:</Text>
                        <Text style={styles.detailValue}>{new Date(transaction.transaction_date).toLocaleDateString()}</Text>
                    </View>

                    {transaction.bank_accounts && (
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Bank:</Text>
                            <Text style={styles.detailValue}>{transaction.bank_accounts.bank_name} ({transaction.bank_accounts.account_number})</Text>
                        </View>
                    )}

                    {transaction.area_master && (
                         <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Area:</Text>
                            <Text style={styles.detailValue}>{transaction.area_master.area_name}</Text>
                        </View>
                    )}

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
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    detailLabel: {
        fontSize: 16,
        fontWeight: '500',
        color: '#555',
    },
    detailValue: {
        fontSize: 16,
        color: '#333',
        textAlign: 'right',
        flexShrink: 1,
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

export default TransactionDetailModal;
