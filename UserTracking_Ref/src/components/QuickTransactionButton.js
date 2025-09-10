import React from 'react';
import { TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const QuickTransactionButton = ({ onPress }) => {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress || (() => Alert.alert('Quick Transaction', 'Quick transaction logic not implemented yet.'))}>
      <MaterialIcons name="flash-on" size={24} color="black" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 5,
  },
});

export default QuickTransactionButton;