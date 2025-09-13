import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const InvoiceScreen = ({ route, navigation }) => {
  console.log('InvoiceScreen: Minimal component rendered');
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Hello Invoice Screen!</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'lightyellow', // Distinct background
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});

export default InvoiceScreen;