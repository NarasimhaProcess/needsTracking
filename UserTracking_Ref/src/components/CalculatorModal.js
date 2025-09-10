import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';

const CalculatorModal = ({ isVisible, onClose }) => {
  console.log('CalculatorModal isVisible:', isVisible);
  const [display, setDisplay] = useState('0');
  const [currentValue, setCurrentValue] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  const handlePress = (buttonValue) => {
    if (typeof buttonValue === 'number') {
      if (waitingForOperand) {
        setDisplay(String(buttonValue));
        setWaitingForOperand(false);
      } else {
        setDisplay((prev) => (prev === '0' ? String(buttonValue) : prev + buttonValue));
      }
    } else if (buttonValue === '.') {
      if (waitingForOperand) {
        setDisplay('0.');
        setWaitingForOperand(false);
      } else if (!display.includes('.')) {
        setDisplay((prev) => prev + '.');
      }
    } else if (buttonValue === 'AC') {
      setDisplay('0');
      setCurrentValue(null);
      setOperator(null);
      setWaitingForOperand(false);
    } else if (buttonValue === '+/-') {
      setDisplay((prev) => String(parseFloat(prev) * -1));
    } else if (['+', '-', 'X', '/'].includes(buttonValue)) {
      const inputValue = parseFloat(display);

      if (currentValue === null) {
        setCurrentValue(inputValue);
      } else if (operator) {
        const result = performCalculation[operator](currentValue, inputValue);
        setCurrentValue(result);
        setDisplay(String(result));
      }

      setWaitingForOperand(true);
      setOperator(buttonValue);
    } else if (buttonValue === '=') {
      const inputValue = parseFloat(display);

      if (currentValue !== null && operator) {
        const result = performCalculation[operator](currentValue, inputValue);
        setDisplay(String(result));
        setCurrentValue(null);
        setOperator(null);
        setWaitingForOperand(false);
      }
    }
  };

  const performCalculation = {
    '+': (firstOperand, secondOperand) => firstOperand + secondOperand,
    '-': (firstOperand, secondOperand) => firstOperand - secondOperand,
    'X': (firstOperand, secondOperand) => firstOperand * secondOperand,
    '/': (firstOperand, secondOperand) => firstOperand / secondOperand,
  };

  const buttons = [
    ['AC', '+/-', '/', 'X'],
    [7, 8, 9, '-'],
    [4, 5, 6, '+'],
    [1, 2, 3, '='],
    [0, '.'],
  ];

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.calculatorContainer}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>X</Text>
          </TouchableOpacity>
          <View style={styles.displayContainer}>
            <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>{display}</Text>
          </View>
          <View style={styles.buttonsContainer}>
            {buttons.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.buttonRow}>
                {row.map((buttonValue, buttonIndex) => (
                  <TouchableOpacity
                    key={buttonIndex}
                    style={[
                      styles.button,
                      typeof buttonValue !== 'number' && buttonValue !== '.' && styles.operatorButton,
                      buttonValue === '=' && styles.equalsButton,
                      buttonValue === 0 && styles.zeroButton,
                    ]}
                    onPress={() => handlePress(buttonValue)}
                  >
                    <Text style={styles.buttonText}>{buttonValue}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)', // Semi-transparent background
  },
  calculatorContainer: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 15,
    width: Dimensions.get('window').width * 0.8,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 5,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  displayContainer: {
    backgroundColor: '#444',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    alignItems: 'flex-end',
  },
  displayText: {
    color: '#fff',
    fontSize: 40,
  },
  buttonsContainer: {
    flexDirection: 'column',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#e0e0e0',
    borderRadius: 50,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 5,
  },
  buttonText: {
    fontSize: 24,
    color: '#333',
  },
  operatorButton: {
    backgroundColor: '#ff9500',
  },
  equalsButton: {
    backgroundColor: '#ff9500',
    flexGrow: 1,
  },
  zeroButton: {
    flexGrow: 2,
    width: 'auto', // Override fixed width for 0 button
  },
});

export default CalculatorModal;