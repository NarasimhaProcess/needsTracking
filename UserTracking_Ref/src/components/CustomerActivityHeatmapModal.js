import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { ContributionGraph } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

const CustomerActivityHeatmapModal = ({ isVisible, onClose, customer }) => {
  if (!customer || !customer.start_date || !customer.end_date) {
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
            <Text style={styles.modalTitle}>Customer Activity Heatmap</Text>
            <Text style={styles.noDataText}>No start or end date data available for this customer.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  const startDate = new Date(customer.start_date);
  const endDate = new Date(customer.end_date);

  const data = [];
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    data.push({
      date: currentDate.toISOString().split('T')[0],
      count: 1, // Customer is active on this day
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const chartConfig = {
    backgroundColor: '#e26a00',
    backgroundGradientFrom: '#fb8c00',
    backgroundGradientTo: '#ffa726',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: '#ffa726',
    },
  };

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
          <Text style={styles.modalTitle}>Activity for {customer.name}</Text>
          <ContributionGraph
            values={data}
            endDate={endDate}
            numDays={data.length > 0 ? data.length : 1} // Ensure at least 1 day for graph to render
            width={screenWidth - 40} // Adjust width for modal padding
            height={220}
            chartConfig={chartConfig}
            accessor="count"
            horizontal={false} // Display vertically
          />
          <Text style={styles.dateRangeText}>From: {customer.start_date} To: {customer.end_date}</Text>
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
    marginBottom: 10,
    color: '#1C1C1E',
  },
  noDataText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 20,
  },
  dateRangeText: {
    marginTop: 10,
    fontSize: 14,
    color: '#8E8E93',
  },
});

export default CustomerActivityHeatmapModal;