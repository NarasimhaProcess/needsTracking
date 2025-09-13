import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

const ActionIconComponent = ({ iconName, onPress, style }) => {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.iconContainer, style]}>
      <Icon name={iconName} size={24} color="#000" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    backgroundColor: '#007AFF',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    marginBottom: 10,
  },
});

export default ActionIconComponent;
