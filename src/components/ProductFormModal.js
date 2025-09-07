import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  FlatList,
  Modal,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import Icon from 'react-native-vector-icons/FontAwesome';
import { supabase, createProduct, saveProductMedia, createProductVariant, createVariantOption, deleteProductVariants, createProductVariantCombination } from '../services/supabase';
import { Video } from 'expo-av';
import VariantManager from './VariantManager';

const MAX_VIDEO_SIZE_MB = 50; // Define max video size

const generateVariantCombinations = (variants) => {
  if (!variants || variants.length === 0) {
    return [{ combination_string: '', sku: '' }];
  }

  let combinations = [];

  const generate = (index, currentCombination, currentSku) => {
    if (index === variants.length) {
      combinations.push({
        combination_string: currentCombination.join(', '),
        sku: currentSku,
      });
      return;
    }

    const variant = variants[index];
    for (const option of variant.variant_options) {
      generate(
        index + 1,
        [...currentCombination, `${variant.name}:${option.value}`],
        currentSku ? `${currentSku}-${option.value}` : option.value // Simple SKU generation
      );
    }
  };

  generate(0, [], '');
  return combinations;
};

const ProductFormModal = ({ isVisible, onClose, onSubmit, productToEdit, customerId, customerMediaUrl, onDeleteMedia, onDeleteProduct, session }) => {
  const [productName, setProductName] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [productVariants, setProductVariants] = useState([]);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState([]); // Stores URIs of selected images/videos
  const [loading, setLoading] = useState(false);
  const [showModalMediaViewer, setShowModalMediaViewer] = useState(false);
  const [currentModalMediaIndex, setCurrentModalMediaIndex] = useState(0);
  const [allModalMediaForViewer, setAllModalMediaForViewer] = useState([]);

  useEffect(() => {
    if (productToEdit) {
      setProductName(productToEdit.product_name);
      setAmount(productToEdit.amount.toString());
      setQuantity(productToEdit.quantity.toString());
      setStartDate(new Date(productToEdit.start_date));
      setEndDate(new Date(productToEdit.end_date));
      setSelectedMedia(productToEdit.product_media.map(media => ({
        uri: media.media_url,
        type: media.media_type,
        id: media.id
      })));
      setProductVariants(productToEdit.product_variants || []);
    } else {
      setProductName('');
      setAmount('');
      setQuantity('');
      setStartDate(new Date());
      setEndDate(new Date());
      setSelectedMedia([]);
      setProductVariants([]);
    }
  }, [productToEdit]);

  const handleMediaPick = async (mediaType) => {
    let result;
    if (mediaType === 'image') {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });
    } else if (mediaType === 'video') {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: true,
        quality: 1,
      });
    }

    if (!result.canceled) {
      const newMedia = [];
      for (const asset of result.assets) {
        if (mediaType === 'video' && asset.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
          Alert.alert('Video Too Large', `Video file ${asset.name} exceeds the maximum size of ${MAX_VIDEO_SIZE_MB} MB.`);
          continue;
        }
        newMedia.push({ uri: asset.uri, type: mediaType });
      }
      setSelectedMedia((prevMedia) => [
        ...prevMedia,
        ...newMedia,
      ]);
    }
  };

  const handleRemoveMedia = async (mediaToRemove) => {
    if (mediaToRemove.id) {
      if (onDeleteMedia) {
        const success = await onDeleteMedia(mediaToRemove.id, mediaToRemove.uri);
        if (success) {
          setSelectedMedia(prevMedia => prevMedia.filter(media => media.id !== mediaToRemove.id));
        }
      }
    } else {
      setSelectedMedia(prevMedia => prevMedia.filter(media => media.uri !== mediaToRemove.uri));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    if (!customerId) {
      Alert.alert("Error", "Customer ID is missing. Cannot create/edit product.");
      setLoading(false);
      return;
    }

    const productData = {
      customer_id: customerId,
      product_name: productName,
      amount: parseFloat(amount),
      quantity: parseInt(quantity),
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
    };

    let productResult;
    if (productToEdit) {
      const { data, error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', productToEdit.id)
        .select();
      if (error) {
        console.error("Error updating product:", error.message);
        Alert.alert("Error", "Failed to update product.");
        setLoading(false);
        return;
      }
      productResult = data ? data[0] : null;
      await deleteProductVariants(productResult.id);
    } else {
      productResult = await createProduct(productData);
    }

    if (productResult) {
      try {
        for (const variant of productVariants) {
          const variantResult = await createProductVariant({
            product_id: productResult.id,
            name: variant.name,
          });
          if (variantResult) {
            for (const option of variant.variant_options) {
              await createVariantOption({
                variant_id: variantResult.id,
                value: option.value,
              });
            }
          }
        }

        // Generate and save product variant combinations
        const combinations = generateVariantCombinations(productVariants);
        for (const combo of combinations) {
          await createProductVariantCombination({
            product_id: productResult.id,
            combination_string: combo.combination_string,
            price: parseFloat(amount), // Default price from product
            quantity: parseInt(quantity), // Default quantity from product
            sku: combo.sku, // SKU will be generated or can be added later
          });
        }

        for (const media of selectedMedia.filter(m => !m.id)) {
          const mediaUrl = await saveProductMedia(productResult.id, media.uri, media.type, customerId, session.access_token);
          if (!mediaUrl) {
            throw new Error("Failed to upload media.");
          }
        }

        onSubmit();
        onClose();
      } catch (e) {
        console.error("Error saving product details:", e.message);
        Alert.alert("Error", `Failed to save product details: ${e.message}`);
      }
    } else {
      Alert.alert("Error", "Failed to save product.");
    }
    setLoading(false);
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Icon name="times-circle" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{productToEdit ? 'Edit Product' : 'Add New Product'}</Text>

            <Text style={styles.label}>Product Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter product name"
              value={productName}
              onChangeText={setProductName}
            />
            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
            <Text style={styles.label}>Quantity</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter quantity"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
            />

            <VariantManager product={productToEdit} onVariantsChange={setProductVariants} />

            <TouchableOpacity onPress={() => setShowStartDatePicker(true)} style={styles.datePickerButton}>
              <Text>Start Date: {startDate.toLocaleDateString()}</Text>
            </TouchableOpacity>
            {showStartDatePicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowStartDatePicker(false);
                  if (selectedDate) setStartDate(selectedDate);
                }}
              />
            )}

            <TouchableOpacity onPress={() => setShowEndDatePicker(true)} style={styles.datePickerButton}>
              <Text>End Date: {endDate.toLocaleDateString()}</Text>
            </TouchableOpacity>
            {showEndDatePicker && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowEndDatePicker(false);
                  if (selectedDate) setEndDate(selectedDate);
                }}
              />
            )}

            <View style={styles.mediaPickerContainer}>
              <TouchableOpacity onPress={() => handleMediaPick('image')} style={styles.mediaButton}>
                <Text style={styles.mediaButtonText}>Pick Image</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleMediaPick('video')} style={styles.mediaButton}>
                <Text style={styles.mediaButtonText}>Pick Video</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.selectedMediaContainer}>
              <FlatList
                data={selectedMedia}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(media, index) => media.id ? media.id.toString() : `new-${index}`}
                renderItem={({ item: media, index }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setAllModalMediaForViewer(selectedMedia);
                      setCurrentModalMediaIndex(index);
                      setShowModalMediaViewer(true);
                    }}
                    style={styles.thumbnailContainer}
                  >
                    {media.type === 'image' ? (
                      <Image source={{ uri: media.uri }} style={styles.thumbnail} />
                    ) : (
                      <Text style={styles.thumbnailText}>Video</Text>
                    )}
                    <TouchableOpacity onPress={() => handleRemoveMedia(media)} style={styles.removeMediaButton}>
                      <Icon name="times-circle" size={20} color="red" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            </View>
          </ScrollView>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.bottomButton}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Save Product'}</Text>
            </TouchableOpacity>

            {productToEdit && (
              <TouchableOpacity
                style={[styles.bottomButton, styles.deleteButton]}
                onPress={() => {
                  onDeleteProduct(productToEdit.id);
                  onClose();
                }}
                disabled={loading}
              >
                <Text style={styles.buttonText}>Delete Product</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Modal
          animationType="fade"
          transparent={true}
          visible={showModalMediaViewer}
          onRequestClose={() => setShowModalMediaViewer(false)}
        >
          <View style={styles.modalMediaViewerContainer}>
            <TouchableOpacity style={styles.modalMediaViewerCloseButton} onPress={() => setShowModalMediaViewer(false)}>
              <Icon name="times-circle" size={30} color="white" />
            </TouchableOpacity>

            {allModalMediaForViewer.length > 0 && (
              <>
                <TouchableOpacity
                  style={[styles.modalMediaNavButton, styles.modalMediaNavButtonLeft]}
                  onPress={() => setCurrentModalMediaIndex(prevIndex => Math.max(0, prevIndex - 1))}
                  disabled={currentModalMediaIndex === 0}
                >
                  <Icon name="chevron-left" size={30} color="white" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalMediaNavButton, styles.modalMediaNavButtonRight]}
                  onPress={() => setCurrentModalMediaIndex(prevIndex => Math.min(allModalMediaForViewer.length - 1, prevIndex + 1))}
                  disabled={currentModalMediaIndex === allModalMediaForViewer.length - 1}
                >
                  <Icon name="chevron-right" size={30} color="white" />
                </TouchableOpacity>

                {allModalMediaForViewer[currentModalMediaIndex].type === 'image' ? (
                  <Image
                    source={{ uri: allModalMediaForViewer[currentModalMediaIndex].uri }}
                    style={styles.modalFullScreenMedia}
                    resizeMode="contain"
                  />
                ) : allModalMediaForViewer[currentModalMediaIndex].type === 'video' ? (
                  <Video
                    source={{ uri: allModalMediaForViewer[currentModalMediaIndex].uri }}
                    style={styles.modalFullScreenMedia}
                    useNativeControls
                    resizeMode="contain"
                    isLooping
                  />
                ) : (
                  <Text style={styles.modalNoMediaText}>No media to display</Text>
                )}
              </>
            )}
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    width: '100%',
    height: '85%',
  },
  scrollContent: {
    flexGrow: 1,
  },
  buttonContainer: {
    paddingBottom: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    fontSize: 16,
  },
  datePickerButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    alignItems: 'center',
  },
  mediaPickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  mediaButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  mediaButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  selectedMediaContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    width: '100%',
  },
  thumbnailContainer: {
    position: 'relative',
    margin: 5,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 5,
  },
  thumbnailText: {
    width: 80,
    height: 80,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 10,
    backgroundColor: '#f0f0f0',
  },
  removeMediaButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 2,
  },
  button: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  bottomButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    marginTop: 0,
  },
  modalMediaViewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalMediaViewerCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 1,
  },
  modalFullScreenMedia: {
    width: '100%',
    height: '80%',
  },
  modalNoMediaText: {
    color: 'white',
    fontSize: 18,
  },
  modalMediaNavButton: {
    position: 'absolute',
    top: '50%',
    zIndex: 1,
    padding: 10,
  },
  modalMediaNavButtonLeft: {
    left: 10,
  },
  modalMediaNavButtonRight: {
    right: 10,
  },
});

export default ProductFormModal;
