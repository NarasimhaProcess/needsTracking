import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');
const CELL_SIZE = 40;
const NUM_COLUMNS = Math.floor(width / CELL_SIZE);

const DaysToCompleteHeatmapModal = ({ isVisible, onClose, data }) => {
  // data is expected to be an array of { value: number, count: number }
  if (!data || data.length === 0) {
    return (
      <Modal
        visible={isVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>X</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Days to Complete Heatmap</Text>
            <Text style={styles.noDataText}>No 'days to complete' data available for this selection.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  const maxCount = Math.max(...data.map(item => item.count));

  const getColor = (count) => {
    if (maxCount === 0) return 'rgba(0, 122, 255, 0.1)'; // Light blue if no data
    const intensity = count / maxCount;
    // Interpolate between a light color and a darker color
    const r = Math.floor(255 - (255 - 0) * intensity); // From white to blue
    const g = Math.floor(255 - (255 - 122) * intensity);
    const b = Math.floor(255 - (255 - 255) * intensity);
    return `rgba(${r}, ${g}, ${b}, 1)`;
  };

  const renderItem = ({ item }) => (
    <View style={[styles.cell, { backgroundColor: getColor(item.count) }]}>
      <Text style={styles.cellValue}>{item.value}</Text>
      <Text style={styles.cellCount}>{item.count}</Text>
    </View>
  );

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>X</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Days to Complete Heatmap</Text>
          <FlatList
            data={data.sort((a, b) => a.value - b.value)} // Sort by days_to_complete value
            renderItem={renderItem}
            keyExtractor={(item, index) => `days-${item.value}-${index}`}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.gridContainer}
          />
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
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 10,
    zIndex: 1,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#1C1C1E',
  },
  gridContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#E5E5EA',
    margin: 2,
    borderRadius: 5,
  },
  cellValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  cellCount: {
    fontSize: 10,
    color: '#FFFFFF',
  },
  noDataText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 20,
  },
});

export default DaysToCompleteHeatmapModal;