import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Button,
  Alert,
  Modal,
} from 'react-native';
import { Video } from 'expo-av';
import Swiper from 'react-native-swiper';
import ImageViewer from 'react-native-image-zoom-viewer';
import { addToCart, supabase } from '../services/supabase';

const ProductDetailScreen = ({ route }) => {
  const { product } = route.params;
  const [selectedVariants, setSelectedVariants] = useState({});
  const [user, setUser] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [images, setImages] = useState([]);

  useEffect(() => {
    const defaultVariants = {};
    if (product.product_variants) {
      product.product_variants.forEach(variant => {
        if (variant.variant_options && variant.variant_options.length > 0) {
          defaultVariants[variant.name] = variant.variant_options[0].value;
        }
      });
    }
    setSelectedVariants(defaultVariants);
  }, [product]);

  const handleVariantSelect = (variantName, optionValue) => {
    setSelectedVariants({
      ...selectedVariants,
      [variantName]: optionValue,
    });
  };

  const getVariantCombination = () => {
    const sortedKeys = Object.keys(selectedVariants).sort();
    const combinationString = sortedKeys
      .map((key) => `${key}:${selectedVariants[key]}`)
      .join(',');

    const normalizedCombinationString = combinationString.replace(/\s/g, '');

    return product.product_variant_combinations.find(
      (c) => {
        if (c.combination_string) {
          const normalizedDbString = c.combination_string.replace(/\s/g, '');
          return normalizedDbString === normalizedCombinationString;
        }
        return false;
      }
    );
  };

  const handleAddToCart = async () => {
    const combination = getVariantCombination();
    if (!combination) {
      Alert.alert('Please select all variant options.');
      return;
    }

    console.log('handleAddToCart: Before getUser, user state:', user); // Log existing user state
    // Re-check user session directly from Supabase to ensure up-to-date status
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    console.log('handleAddToCart: After getUser, currentUser:', currentUser); // Log fetched user

    if (!currentUser) {
      // Redirect to BuyerAuthScreen for mobile number authentication
      navigation.navigate('BuyerAuthScreen', {
        redirectScreen: 'ProductDetailScreen',
        productId: product.id,
      });
      return;
    }

    const result = await addToCart(currentUser.id, combination.id, 1);
    if (result) {
      Alert.alert('Success', 'Item added to cart.');
    } else {
      Alert.alert('Error', 'Failed to add item to cart.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Swiper style={styles.swiper} showsButtons={true}>
        {product.product_media.map((media) => (
          <View key={media.id} style={styles.slide}>
            <TouchableOpacity onPress={() => {
              const imageUrls = product.product_media
                .filter(m => m.media_type === 'image')
                .map(m => ({ url: m.media_url }));
              setImages(imageUrls);
              setIsModalVisible(true);
            }} style={styles.mediaContainer}>
              {media.media_type === 'image' ? (
                <Image source={{ uri: (typeof media.media_url === 'string' && media.media_url.length > 0) ? media.media_url : 'https://placehold.co/600x400' }} style={styles.media} />
              ) : (
                <Video
                  source={{ uri: media.media_url }}
                  style={styles.media}
                  useNativeControls
                  resizeMode="contain"
                />
              )}
              {media.media_type === 'image' && (
                <TouchableOpacity
                  style={styles.zoomIcon}
                  onPress={() => {
                    const imageUrls = product.product_media
                      .filter(m => m.media_type === 'image')
                      .map(m => ({ url: m.media_url }));
                    setImages(imageUrls);
                    setIsModalVisible(true);
                  }}
                >
                  <MaterialIcons name="zoom-out-map" size={24} color="white" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        ))}
      </Swiper>

      <View style={styles.detailsContainer}>
        <Text style={styles.productName}>{product.product_name}</Text>
        <Text style={styles.productPrice}>₹{product.amount}</Text>

        {product.product_variants.map((variant) => (
          <View key={variant.id} style={styles.variantContainer}>
            <Text style={styles.variantName}>{variant.name}</Text>
            <View style={styles.optionsContainer}>
              {variant.variant_options.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.optionButton,
                    selectedVariants[variant.name] === option.value && styles.selectedOption,
                  ]}
                  onPress={() => handleVariantSelect(variant.name, option.value)}
                >
                  <Text>{option.value}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <Button title="Add to Cart" onPress={handleAddToCart} />
      </View>

      <Modal visible={isModalVisible} transparent={true}>
        <ImageViewer
          imageUrls={images}
          onCancel={() => setIsModalVisible(false)}
          enableSwipeDown
        />
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  swiper: {
    height: 300,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  detailsContainer: {
    padding: 20,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  productPrice: {
    fontSize: 18,
    color: '#888',
    marginBottom: 20,
  },
  variantContainer: {
    marginBottom: 20,
  },
  variantName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginRight: 10,
    marginBottom: 10,
  },
  selectedOption: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomIcon: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 5,
  },
});

export default ProductDetailScreen;
