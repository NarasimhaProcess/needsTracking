import React, { useState, useEffect } from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Icon from 'react-native-vector-icons/FontAwesome';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { Video } from 'expo-av';
import Swiper from 'react-native-swiper';
import ImageViewer from 'react-native-image-zoom-viewer';
import { addToCart, supabase } from '../services/supabase';

const isImageMedia = (media) => {
  if (!media) return false;
  const type = (media.media_type || media.type || '').toLowerCase();
  const url = media.media_url || media.uri || '';
  if (type === 'video') return false;
  if (type === 'image' || type === 'url' || !type) return true;
  if (type.startsWith('image/')) return true;
  if (typeof url === 'string' && /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url)) return true;
  return true;
};

const ProductDetailScreen = ({ navigation, route }) => {
  const { product: initialProduct, productId } = route?.params || {};
  const [product, setProduct] = useState(initialProduct || null);
  const [loadingProduct, setLoadingProduct] = useState(!initialProduct && !!productId);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [user, setUser] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [images, setImages] = useState([]);

  useEffect(() => {
    if (!product && productId) {
      const fetchProduct = async () => {
        setLoadingProduct(true);
        try {
          const { data, error } = await supabase
            .from('products')
            .select(`
              *,
              product_media (id, media_url, media_type),
              product_variants (
                id,
                name,
                variant_options (id, value)
              ),
              product_variant_combinations (id, combination_string, price, quantity, sku)
            `)
            .eq('id', productId)
            .single();
          if (data) {
            setProduct(data);
          }
        } catch (err) {
          console.error('Error fetching product by ID:', err);
        } finally {
          setLoadingProduct(false);
        }
      };
      fetchProduct();
    }
  }, [productId, product]);

  useEffect(() => {
    const defaultVariants = {};
    if (product?.product_variants) {
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
    if (!product) return null;
    const combos = product.product_variant_combinations || [];
    if (combos.length === 0) {
      return { id: product.id, combination_string: 'Default', price: product.amount || 0, quantity: 100 };
    }
    if (combos.length === 1) {
      return combos[0];
    }
    const sortedKeys = Object.keys(selectedVariants).sort();
    const combinationString = sortedKeys
      .map((key) => `${key}:${selectedVariants[key]}`)
      .join(',');

    const normalizedCombinationString = combinationString.replace(/\s/g, '');

    const found = combos.find(
      (c) => {
        if (c.combination_string) {
          const normalizedDbString = c.combination_string.replace(/\s/g, '');
          return normalizedDbString === normalizedCombinationString;
        }
        return false;
      }
    );
    return found || combos[0];
  };

  const handleAddToCart = async () => {
    const combination = getVariantCombination();
    if (!combination) {
      Alert.alert('Error', 'Product information is incomplete.');
      return;
    }

    const { data: { user: currentUser } } = await supabase.auth.getUser();

    if (!currentUser) {
      navigation.navigate('BuyerLogin', {
        redirectTo: 'ProductDetailScreen',
        redirectParams: { productId: product.id },
      });
      return;
    }

    const result = await addToCart(currentUser.id, combination.id, quantity);
    if (result) {
      Alert.alert('Success', `${quantity} item(s) added to cart.`);
    } else {
      Alert.alert('Error', 'Failed to add item to cart.');
    }
  };

  if (loadingProduct) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Text style={{ fontSize: 16, color: '#666' }}>Product not found.</Text>
      </View>
    );
  }

  const mediaList = (product.product_media || []).filter(m => m && (m.media_url || m.uri));

  return (
    <ScrollView style={styles.container}>
      {mediaList.length > 0 ? (
        <Swiper style={styles.swiper} showsButtons={mediaList.length > 1} loop={mediaList.length > 1}>
          {mediaList.map((media, index) => {
            const mediaUrl = media.media_url || media.uri;
            const isImage = isImageMedia(media);
            return (
              <View key={media.id || `media-${index}`} style={styles.slide}>
                <TouchableOpacity
                  onPress={() => {
                    const imageUrls = mediaList
                      .filter(m => isImageMedia(m) && (m.media_url || m.uri))
                      .map(m => ({ url: m.media_url || m.uri }));
                    if (imageUrls.length > 0) {
                      setImages(imageUrls);
                      setIsModalVisible(true);
                    }
                  }}
                  style={styles.mediaContainer}
                  activeOpacity={0.9}
                >
                  {isImage ? (
                    <Image
                      source={{ uri: mediaUrl }}
                      style={styles.media}
                      resizeMode="contain"
                    />
                  ) : (
                    <Video
                      source={{ uri: mediaUrl }}
                      style={styles.media}
                      useNativeControls
                      resizeMode="contain"
                    />
                  )}
                  {isImage && (
                    <TouchableOpacity
                      style={styles.zoomIcon}
                      onPress={() => {
                        const imageUrls = mediaList
                          .filter(m => isImageMedia(m) && (m.media_url || m.uri))
                          .map(m => ({ url: m.media_url || m.uri }));
                        if (imageUrls.length > 0) {
                          setImages(imageUrls);
                          setIsModalVisible(true);
                        }
                      }}
                    >
                      <MaterialIcons name="zoom-out-map" size={24} color="white" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </Swiper>
      ) : (
        <View style={styles.placeholderBanner}>
          <Icon name="shopping-bag" size={64} color="#94a3b8" />
          <Text style={styles.placeholderText}>{product.product_name}</Text>
        </View>
      )}

      <View style={styles.detailsContainer}>
        <Text style={styles.productName}>{product.product_name}</Text>
        <Text style={styles.productPrice}>₹{product.amount}</Text>

        {(product.product_variants || []).map((variant) => (
          <View key={variant.id} style={styles.variantContainer}>
            <Text style={styles.variantName}>{variant.name}</Text>
            <View style={styles.optionsContainer}>
              {(variant.variant_options || []).map((option) => (
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

        {/* Quantity selector */}
        <View style={styles.quantitySelector}>
          <Text style={styles.quantityLabel}>Quantity:</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity 
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              style={{ padding: 4 }}
            >
              <Icon name="minus-circle" size={30} color={quantity <= 1 ? '#ccc' : '#E53935'} />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity 
              onPress={() => setQuantity(quantity + 1)}
              style={{ padding: 4 }}
            >
              <Icon name="plus-circle" size={30} color="#43A047" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.addToCartButton} onPress={handleAddToCart}>
          <Icon name="shopping-cart" size={20} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.addToCartButtonText}>Add to Cart</Text>
        </TouchableOpacity>
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
  placeholderBanner: {
    height: 250,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  placeholderText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
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
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityText: {
    marginHorizontal: 15,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  addToCartButton: {
    backgroundColor: '#43A047',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
    elevation: 3,
  },
  addToCartButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default ProductDetailScreen;
