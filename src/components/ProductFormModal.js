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
import { supabase, createProduct, saveProductMedia } from '../services/supabase';

const ProductFormModal = ({ isVisible, onClose, onSubmit, productToEdit, customerId, customerMediaUrl }) => {
  const [productName, setProductName] = useState('');
  const [amount, setAmount] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState([]); // Stores URIs of selected images/videos
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (productToEdit) {
      setProductName(productToEdit.product_name);
      setAmount(productToEdit.amount.toString());
      setSize(productToEdit.size);
      setQuantity(productToEdit.quantity.toString());
      setStartDate(new Date(productToEdit.start_date));
      setEndDate(new Date(productToEdit.end_date));
      setSelectedMedia(productToEdit.product_media.map(media => ({
        uri: media.media_type === 'url' ? media.media_url : `${customerMediaUrl || supabaseUrl}/storage/v1/object/public/productsmedia/${media.media_url}`,
        type: media.media_type,
        id: media.id
      })));
    } else {
      // Reset form for new product
      setProductName('');
      setAmount('');
      setSize('');
      setQuantity('');
      setStartDate(new Date());
      setEndDate(new Date());
      setSelectedMedia([]);
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
      setSelectedMedia((prevMedia) => [
        ...prevMedia,
        ...result.assets.map((asset) => ({ uri: asset.uri, type: mediaType })),
      ]);
    }
  };

  const handleRemoveMedia = (uriToRemove) => {
    setSelectedMedia(prevMedia => prevMedia.filter(media => media.uri !== uriToRemove));
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
      size: size,
      quantity: parseInt(quantity),
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
    };

    let productResult;
    if (productToEdit) {
      // Update existing product
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
    } else {
      // Create new product
      productResult = await createProduct(productData);
    }

    if (productResult) {
      // Otherwise, upload new media files
      for (const media of selectedMedia.filter(m => !m.id)) { // Only upload new media (without existing id)
        await saveProductMedia(productResult.id, media.uri, media.type, customerMediaUrl); // Pass customMediaUrl
      }
      // Handle media deletion (if needed, requires a deleteMedia function in supabase.js)

      onSubmit(); // Notify parent to refresh list
      onClose(); // Close modal
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
        <ScrollView contentContainerStyle={styles.modalContent}>
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
          <Text style={styles.label}>Size</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter size"
            value={size}
            onChangeText={setSize}
          />
          <Text style={styles.label}>Quantity</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter quantity"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
          />

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
            {selectedMedia.map((media, index) => (
              <View key={index} style={styles.mediaThumbnailContainer}>
                {media.type === 'image' ? (
                  <Image source={{ uri: media.uri }} style={styles.thumbnail} />
                ) : (
                  <Text style={styles.thumbnailText}>Video</Text>
                )}
                <TouchableOpacity onPress={() => handleRemoveMedia(media.uri)} style={styles.removeMediaButton}>
                  <Icon name="times-circle" size={20} color="red" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
        <TouchableOpacity
          style={styles.bottomButton} // New style for bottom button
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Save Product'}</Text>
        </TouchableOpacity>
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
    flexGrow: 1,
    maxHeight: '85%',
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
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  mediaThumbnailContainer: {
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
  bottomButton: { // New style
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
});

export default ProductFormModal;