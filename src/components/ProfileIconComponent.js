import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

const ProfileIconComponent = ({ navigation }) => {
  return (
    <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.iconContainer}>
      <Icon name="user-circle" size={30} color="#007AFF" />
      <Text style={styles.iconText}>Profile</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  iconText: {
    fontSize: 12,
    color: '#007AFF',
  },
});

export default ProfileIconComponent;