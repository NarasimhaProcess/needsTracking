import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { Modal, View, Text, Button, StyleSheet, Platform, Alert, TouchableOpacity } from 'react-native';
// Assuming @rneui/base is available for Dialog, if not, we'll use basic Modal
// import { Dialog, Button as RNEButton } from '@rneui/base'; 

let alertRef;

const CustomAlert = forwardRef((props, ref) => {
  const [isVisible, setIsVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState([]);

  useImperativeHandle(ref, () => ({
    show: (alertTitle, alertMessage, alertButtons) => {
      setTitle(alertTitle);
      setMessage(alertMessage);
      setButtons(alertButtons || [{ text: 'OK' }]);
      setIsVisible(true);
    },
  }));

  const handlePress = (onPress) => {
    setIsVisible(false);
    if (onPress) {
      onPress();
    }
  };

  if (Platform.OS !== 'web') {
    // On native, this component will not render anything, 
    // actual Alert.alert will be triggered by direct call to showAlert
    return null;
  }

  return (
    <Modal
      transparent={true}
      visible={isVisible}
      animationType="fade"
      onRequestClose={() => setIsVisible(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.alertContainer}>
          <Text style={styles.alertTitle}>{title}</Text>
          <Text style={styles.alertMessage}>{message}</Text>
          <View style={styles.buttonContainer}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.button,
                  button.style === 'cancel' && styles.cancelButton,
                  button.style === 'destructive' && styles.destructiveButton,
                ]}
                onPress={() => handlePress(button.onPress)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === 'cancel' && styles.cancelButtonText,
                    button.style === 'destructive' && styles.destructiveButtonText,
                  ]}
                >
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    width: 300,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    backgroundColor: '#007AFF',
    marginHorizontal: 5,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#E5E5EA',
  },
  cancelButtonText: {
    color: '#333',
  },
  destructiveButton: {
    backgroundColor: '#FF3B30',
  },
  destructiveButtonText: {
    color: 'white',
  },
});

export function setAlertRef(ref) {
  alertRef = ref;
}

export function showAlert(title, message, buttons) {
  if (Platform.OS === 'web') {
    if (alertRef) {
      alertRef.show(title, message, buttons);
    } else {
      // Fallback to browser alert if CustomAlert component is not mounted
      window.alert(`${title}\n${message}`);
    }
  } else {
    Alert.alert(title, message, buttons);
  }
}

export default CustomAlert;
