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
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { supabase } from '../services/supabase';
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
    </View>
  );
};

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
});

export default ProfileScreen;