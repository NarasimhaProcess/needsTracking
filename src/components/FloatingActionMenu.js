import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import ActionIconComponent from './ActionIconComponent';
import CartIconComponent from './CartIconComponent';
import OrderIconComponent from './OrderIconComponent';
import { useCart } from '../context/CartContext';

const FloatingActionMenu = ({ navigation }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { role } = useCart(); // Get the user's role

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <View style={styles.fabContainer}>
      {menuOpen && (
        <View style={styles.menuItems}>
          {role === 'customer' ? (
            <>
              <CartIconComponent navigation={navigation} />
              <OrderIconComponent navigation={navigation} />
            </>
          ) : (
            <>
              <ActionIconComponent iconName="dropbox" onPress={() => navigation.navigate('Inventory')} />
              <ActionIconComponent iconName="th-large" onPress={() => navigation.navigate('Product')} />
            </>
          )}
          <ActionIconComponent iconName="user" onPress={() => navigation.navigate('Profile')} />
        </View>
      )}
      <ActionIconComponent
        iconName={menuOpen ? 'close' : 'gear'}
        onPress={toggleMenu}
        style={styles.gearIcon}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    alignItems: 'center',
  },
  menuItems: {
    alignItems: 'center',
  },
  gearIcon: {
    backgroundColor: '#FF9500',
  },
});

export default FloatingActionMenu;
