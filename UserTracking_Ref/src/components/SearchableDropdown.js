import React, { useState, useEffect } from 'react';
import { View, TextInput, FlatList, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';

const SearchableDropdown = ({
  data,
  onSelect,
  selectedValue,
  placeholder,
  labelField, // Key for the label to display (e.g., 'area_name')
  valueField, // Key for the value to return (e.g., 'id')
}) => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState(data);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');

  useEffect(() => {
    setFilteredData(
      data.filter(item =>
        item[labelField].toLowerCase().includes(searchText.toLowerCase())
      )
    );
  }, [searchText, data, labelField]);

  useEffect(() => {
    // Set the initial selected label when selectedValue changes
    const currentSelectedItem = data.find(item => item[valueField] === selectedValue);
    if (currentSelectedItem) {
      setSelectedLabel(currentSelectedItem[labelField]);
    } else {
      setSelectedLabel('');
    }
  }, [selectedValue, data, labelField, valueField]);

  const handleSelect = (item) => {
    onSelect(item[valueField]);
    setSelectedLabel(item[labelField]);
    setModalVisible(false);
    setSearchText(''); // Clear search text on selection
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.inputButton} onPress={() => setModalVisible(true)}>
        <Text style={selectedValue ? styles.inputButtonText : styles.placeholderText}>
          {selectedLabel || placeholder}
        </Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              value={searchText}
              onChangeText={setSearchText}
            />
            <FlatList
              data={filteredData}
              keyExtractor={(item) => item[valueField].toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => handleSelect(item)}
                >
                  <Text style={styles.itemText}>{item[labelField]}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No results found.</Text>}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  inputButton: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 10,
    minHeight: 45, // Ensure consistent height
    justifyContent: 'center',
  },
  inputButtonText: {
    fontSize: 16,
    color: '#1C1C1E',
  },
  placeholderText: {
    fontSize: 16,
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
  searchInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  item: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  itemText: {
    fontSize: 16,
    color: '#1C1C1E',
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    color: '#8E8E93',
  },
  closeButton: {
    marginTop: 15,
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SearchableDropdown;
