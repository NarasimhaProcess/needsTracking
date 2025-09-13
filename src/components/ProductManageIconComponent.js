import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

const ProductManageIconComponent = ({ navigation, session, customerId }) => {
  return (
    <TouchableOpacity onPress={() => navigation.navigate('ProductTabs', { session: session, customerId: customerId })} style={styles.iconContainer}>
      <Icon name="shopping-bag" size={30} color="#007AFF" />
      <Text style={styles.iconText}>Products</Text>
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

export default ProductManageIconComponent;