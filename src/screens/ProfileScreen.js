import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  FlatList,
  Dimensions,
  ActivityIndicator,
  Button,
  Switch,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import { supabase, uploadQrImage, addQrCode, updateQrCode, deleteQrCode, getAllQrCodes } from '../services/supabase';
import { maskEmail, maskMobileNumber, maskCardNumber } from '../utils/masking';

const { width, height } = Dimensions.get('window');

const ProfileScreen = ({ route }) => {
  const { session, customerId } = route.params;
  const [customerDetails, setCustomerDetails] = useState(null);
  const [selectedImageUrls, setSelectedImageUrls] = useState([]);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState(null);
  const [loadingImages, setLoadingImages] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(true);

  // New states for QR code management
  const [userQrCodes, setUserQrCodes] = useState([]);
  const [loadingQrCodes, setLoadingQrCodes] = useState(true);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [newQrName, setNewQrName] = useState('');

  useEffect(() => {
    const fetchCustomerDetails = async () => {
      if (!customerId) {
        setLoadingDetails(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('email, mobile, book_no') // Assuming these fields exist
          .eq('id', customerId)
          .single();

        if (error) {
          console.error("Error fetching customer details:", error.message);
          Alert.alert("Error", "Failed to fetch customer details.");
        } else {
          setCustomerDetails(data);
        }
      } catch (error) {
        console.error("Error in fetching customer details:", error.message);
        Alert.alert("Error", "An unexpected error occurred while fetching details.");
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchCustomerDetails();
    fetchCustomerDocuments();
  }, [customerId]);

  // New useEffect for fetching QR codes
  useEffect(() => {
    const fetchQrCodes = async () => {
      if (!session?.user?.id) {
        setLoadingQrCodes(false);
        return;
      }
      try {
        const qrCodes = await getAllQrCodes(session.user.id);
        if (qrCodes) {
          setUserQrCodes(qrCodes);
        }
      } catch (error) {
        console.error("Error fetching QR codes:", error.message);
        Alert.alert("Error", "Failed to fetch your QR codes.");
      } finally {
        setLoadingQrCodes(false);
      }
    };
    fetchQrCodes();
  }, [session]); // Depend on session to get user ID

  const handleImagePick = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setUploadingQr(true);
      const imageUrl = await uploadQrImage(session.user.id, result.assets[0].uri);
      if (imageUrl) {
        const newQr = await addQrCode(session.user.id, imageUrl, newQrName || 'My QR Code', false);
        if (newQr) {
          setUserQrCodes((prev) => [...prev, newQr]);
          setNewQrName(''); // Clear input
          Alert.alert('Success', 'QR code uploaded successfully!');
        } else {
          Alert.alert('Error', 'Failed to add QR code to database.');
        }
      } else {
        Alert.alert('Error', 'Failed to upload QR image.');
      }
      setUploadingQr(false);
    }
  };

  const handleToggleActive = async (qrCodeId, currentStatus) => {
    setLoadingQrCodes(true); // Show loading while updating
    try {
      // Deactivate all other QR codes first if this one is being activated
      if (!currentStatus) { // If currentStatus is false, meaning we are activating this one
        const activeQr = userQrCodes.find(qr => qr.is_active);
        if (activeQr && activeQr.id !== qrCodeId) {
          await updateQrCode(activeQr.id, activeQr.name, false);
        }
      }
      const updated = await updateQrCode(qrCodeId, userQrCodes.find(qr => qr.id === qrCodeId).name, !currentStatus);
      if (updated) {
        const qrCodes = await getAllQrCodes(session.user.id); // Re-fetch to get latest state
        if (qrCodes) {
          setUserQrCodes(qrCodes);
        }
        Alert.alert('Success', 'QR code status updated.');
      } else {
        Alert.alert('Error', 'Failed to update QR code status.');
      }
    } catch (error) {
      console.error("Error toggling QR active status:", error.message);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoadingQrCodes(false);
    }
  };

  const handleDeleteQrCode = async (qrCodeId, imageUrl) => {
    Alert.alert(
      'Delete QR Code',
      'Are you sure you want to delete this QR code?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            setLoadingQrCodes(true);
            const success = await deleteQrCode(qrCodeId, imageUrl);
            if (success) {
              setUserQrCodes((prev) => prev.filter((qr) => qr.id !== qrCodeId));
              Alert.alert('Success', 'QR code deleted successfully.');
            } else {
              Alert.alert('Error', 'Failed to delete QR code.');
            }
            setLoadingQrCodes(false);
          },
        },
      ]
    );
  };

  const fetchCustomerDocuments = async () => {
    if (!customerId) {
      setLoadingImages(false);
      return;
    }

    try {
      const { data: documentData, error: documentError } = await supabase
        .from('customer_documents')
        .select('file_data')
        .eq('customer_id', customerId);

      if (documentError) {
        console.error("Error fetching customer documents:", documentError.message);
        Alert.alert("Error", "Failed to fetch your documents.");
      } else if (documentData && documentData.length > 0) {
        const imageUrls = documentData.map(doc => doc.file_data).filter(url => url);
        setSelectedImageUrls(imageUrls);
      } else {
        setSelectedImageUrls([]);
      }
    } catch (error) {
      console.error("Error in fetching customer documents:", error.message);
      Alert.alert("Error", "An unexpected error occurred while fetching documents.");
    } finally {
      setLoadingImages(false);
    }
  };

  const renderImageItem = ({ item }) => (
    <TouchableOpacity onPress={() => { setFullScreenImageUrl(item); setIsFullScreen(true); }}>
      <Image source={{ uri: item }} style={styles.modalImage} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Profile</Text>
      {loadingDetails ? (
        <ActivityIndicator size="small" color="#007AFF" />
      ) : customerDetails ? (
        <>
          <Text style={styles.detailText}>Email: {maskEmail(customerDetails.email)}</Text>
          {customerDetails.mobile && (
            <Text style={styles.detailText}>Mobile: {maskMobileNumber(customerDetails.mobile)}</Text>
          )}
          {customerDetails.book_no && (
            <Text style={styles.detailText}>Book No: {maskCardNumber(customerDetails.book_no)}</Text>
          )}
        </>
      ) : (
        <Text>Could not load customer details.</Text>
      )}

      <Text style={styles.sectionTitle}>Your Documents</Text>
      {loadingImages ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : selectedImageUrls.length > 0 ? (
        <FlatList
          data={selectedImageUrls}
          renderItem={renderImageItem}
          keyExtractor={(item, index) => index.toString()}
          numColumns={2}
          contentContainerStyle={styles.imageGrid}
        />
      ) : (
        <Text>No documents uploaded yet.</Text>
      )}

      {/* New QR Code Management Section */}
      <Text style={styles.sectionTitle}>Your QR Codes</Text>
      <View style={styles.qrUploadContainer}>
        <TextInput
          style={styles.qrNameInput}
          placeholder="Enter QR Code Name (optional)"
          value={newQrName}
          onChangeText={setNewQrName}
        />
        <Button
          title={uploadingQr ? 'Uploading...' : 'Upload QR Code'}
          onPress={handleImagePick}
          disabled={uploadingQr}
        />
      </View>

      {loadingQrCodes ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loadingIndicator} />
      ) : userQrCodes.length > 0 ? (
        <FlatList
          data={userQrCodes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.qrCodeItem}>
              <Image source={{ uri: item.qr_image_url }} style={styles.qrCodeImage} />
              <View style={styles.qrCodeDetails}>
                <Text style={styles.qrCodeName}>{item.name || 'Unnamed QR'}</Text>
                <View style={styles.qrCodeActions}>
                  <Text>Active:</Text>
                  <Switch
                    value={item.is_active}
                    onValueChange={() => handleToggleActive(item.id, item.is_active)}
                  />
                  <TouchableOpacity onPress={() => handleDeleteQrCode(item.id, item.qr_image_url)}>
                    <Icon name="trash" size={20} color="red" style={styles.deleteIcon} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          contentContainerStyle={styles.qrCodesList}
        />
      ) : (
        <Text>No QR codes uploaded yet.</Text>
      )}

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => supabase.auth.signOut()}
      >
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>

      {/* Full Screen Image Modal */}
      <Modal
        visible={isFullScreen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsFullScreen(false)}
      >
        <View style={styles.fullScreenContainer}>
          <TouchableOpacity
            style={styles.fullScreenCloseButton}
            onPress={() => setIsFullScreen(false)}
          >
            <Icon name="times" size={30} color="white" />
          </TouchableOpacity>
          
          {fullScreenImageUrl && (
            <Image
              source={{ uri: fullScreenImageUrl }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <Text style={styles.sectionTitle}>Your QR Codes</Text>
      <View style={styles.qrUploadContainer}>
        <TextInput
          style={styles.qrNameInput}
          placeholder="Enter QR Code Name (optional)"
          value={newQrName}
          onChangeText={setNewQrName}
        />
        <Button
          title={uploadingQr ? 'Uploading...' : 'Upload QR Code'}
          onPress={handleImagePick}
          disabled={uploadingQr}
        />
      </View>

      {loadingQrCodes ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loadingIndicator} />
      ) : userQrCodes.length > 0 ? (
        <FlatList
          data={userQrCodes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.qrCodeItem}>
              <Image source={{ uri: item.qr_image_url }} style={styles.qrCodeImage} />
              <View style={styles.qrCodeDetails}>
                <Text style={styles.qrCodeName}>{item.name || 'Unnamed QR'}</Text>
                <View style={styles.qrCodeActions}>
                  <Text>Active:</Text>
                  <Switch
                    value={item.is_active}
                    onValueChange={() => handleToggleActive(item.id, item.is_active)}
                  />
                  <TouchableOpacity onPress={() => handleDeleteQrCode(item.id, item.qr_image_url)}>
                    <Icon name="trash" size={20} color="red" style={styles.deleteIcon} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          contentContainerStyle={styles.qrCodesList}
        />
      ) : (
        <Text>No QR codes uploaded yet.</Text>
      )}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  detailText: {
    fontSize: 16,
    marginBottom: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 30,
    marginBottom: 15,
  },
  imageGrid: {
    justifyContent: 'center',
    width: '100%',
  },
  modalImage: {
    width: (width / 2) - 30, // Adjust for padding and margin
    height: 150,
    margin: 5,
    borderRadius: 8,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 10,
  },
  fullScreenImage: {
    width: width,
    height: height,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 10,
    marginTop: 30,
    width: '80%',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  qrUploadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
    paddingHorizontal: 20,
  },
  qrNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginRight: 10,
  },
  qrCodesList: {
    width: '100%',
    paddingHorizontal: 20,
  },
  qrCodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  qrCodeImage: {
    width: 80,
    height: 80,
    borderRadius: 5,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  qrCodeDetails: {
    flex: 1,
  },
  qrCodeName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  qrCodeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteIcon: {
    marginLeft: 10,
  },
  loadingIndicator: {
    marginTop: 20,
  },
});

export default ProfileScreen;