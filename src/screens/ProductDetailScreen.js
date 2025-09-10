import React, { useState, useEffect } from 'react';
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
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    fetchUser();
  }, []);

  const handleVariantSelect = (variantName, optionValue) => {
    setSelectedVariants({
      ...selectedVariants,
      [variantName]: optionValue,
    });
  };

  const getVariantCombination = () => {
    const combinationString = Object.entries(selectedVariants)
      .map(([key, value]) => `${key}:${value}`)
      .join(',');
    return product.product_variant_combinations.find(
      (c) => c.combination_string === combinationString
    );
  };

  const handleAddToCart = async () => {
    if (!user) {
      Alert.alert('Please sign in to add items to your cart.');
      return;
    }

    const combination = getVariantCombination();
    if (!combination) {
      Alert.alert('Please select all variant options.');
      return;
    }

    const result = await addToCart(user.id, combination.id, 1);
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
            }}>
              {media.media_type === 'image' ? (
                <Image source={{ uri: media.media_url }} style={styles.media} />
              ) : (
                <Video
                  source={{ uri: media.media_url }}
                  style={styles.media}
                  useNativeControls
                  resizeMode="contain"
                />
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
});

export default ProductDetailScreen;
