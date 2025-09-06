import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Button,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

const VariantManager = ({ product, onVariantsChange }) => {
  const [variants, setVariants] = useState([]);

  useEffect(() => {
    setVariants(product?.product_variants || []);
  }, [product]);

  const handleVariantChange = (newVariants) => {
    setVariants(newVariants);
    onVariantsChange(newVariants);
  };

  const handleAddVariant = () => {
    const newVariant = {
      name: 'New Variant',
      variant_options: [],
    };
    handleVariantChange([...variants, newVariant]);
  };

  const handleDeleteVariant = (index) => {
    const newVariants = [...variants];
    newVariants.splice(index, 1);
    handleVariantChange(newVariants);
  };

  const handleAddOption = (variantIndex) => {
    const newVariants = [...variants];
    newVariants[variantIndex].variant_options.push({ value: 'New Option' });
    handleVariantChange(newVariants);
  };

  const handleDeleteOption = (variantIndex, optionIndex) => {
    const newVariants = [...variants];
    newVariants[variantIndex].variant_options.splice(optionIndex, 1);
    handleVariantChange(newVariants);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Product Variants</Text>
      {variants.map((variant, vIndex) => (
        <View key={vIndex} style={styles.variantContainer}>
          <View style={styles.variantHeader}>
            <TextInput
              style={styles.variantName}
              value={variant.name}
              onChangeText={(text) => {
                const newVariants = [...variants];
                newVariants[vIndex].name = text;
                handleVariantChange(newVariants);
              }}
            />
            <TouchableOpacity onPress={() => handleDeleteVariant(vIndex)}>
              <Icon name="trash" size={20} color="red" />
            </TouchableOpacity>
          </View>
          {variant.variant_options.map((option, oIndex) => (
            <View key={oIndex} style={styles.optionContainer}>
              <TextInput
                style={styles.optionValue}
                value={option.value}
                onChangeText={(text) => {
                  const newVariants = [...variants];
                  newVariants[vIndex].variant_options[oIndex].value = text;
                  handleVariantChange(newVariants);
                }}
              />
              <TouchableOpacity onPress={() => handleDeleteOption(vIndex, oIndex)}>
                <Icon name="trash-o" size={20} color="#555" />
              </TouchableOpacity>
            </View>
          ))}
          <Button title="Add Option" onPress={() => handleAddOption(vIndex)} />
        </View>
      ))}
      <Button title="Add Variant" onPress={handleAddVariant} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  variantContainer: {
    marginBottom: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
  },
  variantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  variantName: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  optionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: 20,
    marginBottom: 5,
  },
  optionValue: {
    flex: 1,
  },
});

export default VariantManager;
