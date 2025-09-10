import React from 'react';
import { View, Text, TextInput, Button, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';

const BankTransactionForm = React.memo(({
    amount, setAmount,
    description, setDescription,
    transactionType, setTransactionType,
    areaMasterId, setAreaMasterId,
    areaMasters,
    areaSearchQuery, setAreaSearchQuery,
    filteredAreas, setShowAreaSuggestions, showAreaSuggestions,
    bankAccountId, setBankAccountId,
    bankAccounts,
    bankAccountSearchQuery, setBankAccountSearchQuery,
    filteredBankAccounts, setShowBankAccountSuggestions, showBankAccountSuggestions,
    loading,
    handleAddTransaction,
    transactionTypes,
    styles, // Pass styles from parent
}) => {
    return (
        <View style={styles.scrollViewContent}>
            <Text style={styles.label}>Select Area:</Text>
            <TextInput
                style={styles.input}
                placeholder="Search Area"
                value={areaSearchQuery}
                onChangeText={(text) => {
                    setAreaSearchQuery(text);
                    setShowAreaSuggestions(true);
                    setAreaMasterId(null); // Clear selected area when typing
                    const filtered = areaMasters.filter(area =>
                        area.area_name.toLowerCase().includes(text.toLowerCase())
                    );
                    setFilteredAreas(filtered); // This should be setFilteredAreas
                }}
                onFocus={() => setShowAreaSuggestions(true)}
                onBlur={() => setTimeout(() => setShowAreaSuggestions(false), 100)}
            />
            {showAreaSuggestions && filteredAreas.length > 0 && (
                <FlatList
                    data={filteredAreas}
                    keyExtractor={(item) => item.id.toString()}
                    style={styles.suggestionsList}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.suggestionItem}
                            onPress={() => {
                                setAreaMasterId(item.id);
                                setAreaSearchQuery(item.area_name);
                                setShowAreaSuggestions(false);
                            }}
                        >
                            <Text>{item.area_name}</Text>
                        </TouchableOpacity>
                    )}
                />
            )}

            <Text style={styles.label}>Select Bank Account:</Text>
            <TextInput
                style={styles.input}
                placeholder="Search Bank Account"
                value={bankAccountSearchQuery}
                onChangeText={(text) => {
                    setBankAccountSearchQuery(text);
                    setShowBankAccountSuggestions(true);
                    setBankAccountId(null); // Clear selected bank account when typing
                    const filtered = bankAccounts.filter(account =>
                        account.bank_name.toLowerCase().includes(text.toLowerCase()) ||
                        account.account_number.toLowerCase().includes(text.toLowerCase())
                    );
                    setFilteredBankAccounts(filtered); // This should be setFilteredBankAccounts
                }}
                onFocus={() => setShowBankAccountSuggestions(true)}
                onBlur={() => setTimeout(() => setShowBankAccountSuggestions(false), 100)}
            />
            {showBankAccountSuggestions && filteredBankAccounts.length > 0 && (
                <FlatList
                    data={filteredBankAccounts}
                    keyExtractor={(item) => item.id.toString()}
                    style={styles.suggestionsList}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.suggestionItem}
                            onPress={() => {
                                setBankAccountId(item.id);
                                setBankAccountSearchQuery(`${item.bank_name} - ${item.account_number}`);
                                setShowBankAccountSuggestions(false);
                            }}
                        >
                            <Text>{item.bank_name} ({item.account_number})</Text>
                        </TouchableOpacity>
                    )}
                />
            )}

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
                    <Picker.Item key={type} label={type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} value={type} />
                ))}
            </Picker>

            <Button
                title={loading ? "Adding..." : "Add Transaction"}
                onPress={handleAddTransaction}
                disabled={loading}
            />

            {areaMasterId && (
                <View style={styles.transactionsSection}>
                    <Text style={styles.sectionTitle}>Transactions for Selected Area</Text>
                </View>
            )}
        </View>
    );
});

export default BankTransactionForm;
