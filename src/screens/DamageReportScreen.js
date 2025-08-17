import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Image, Alert, StyleSheet, Modal, FlatList, TouchableOpacity, Pressable, RefreshControl, Dimensions, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase';
import { v4 as uuidv4 } from 'uuid';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';

const { width } = Dimensions.get('window');
const numColumns = 2;
const itemWidth = (width - 15 * (numColumns + 1)) / numColumns;

const DamageReportScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { customerId, areaId } = route.params || {};

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDamageReports();
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDamageReports();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchDamageReports = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Authentication Error', 'User not logged in.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('damage_reports')
      .select('*')
      .eq('manager_id', user.id)
      .order('reported_at', { ascending: false });

    if (error) {
      console.error('Error fetching damage reports:', error.message);
      Alert.alert('Error', 'Failed to load damage reports.');
    } else {
      setReports(data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required.');
      return;
    }
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const pickImageFromGallery = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!description) {
      Alert.alert('Missing Information', 'Please provide a description.');
      return;
    }
    if (!customerId || !areaId) {
        Alert.alert('Missing Context', 'Customer ID or Area ID is missing. Cannot create report.');
        return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      let photoPath = null;
      if (image) {
        console.log('Attempting to upload image...');
        console.log('Image URI:', image);
        
        const fileExt = image.split('.').pop();
        const fileName = `${uuidv4()}.${fileExt}`;
        const filePath = `damage_images/${fileName}`;
        
        console.log('File extension:', fileExt);
        console.log('Content-Type:', `image/${fileExt}`);
        console.log('File path for Supabase:', filePath);

        const response = await fetch(image);
        const blob = await response.blob();
        console.log('Blob created. Size:', blob.size, 'Type:', blob.type);

        if (!blob || blob.size === 0) {
            Alert.alert('Upload Error', 'The selected image could not be processed. Please try a different image.');
            setSubmitting(false);
            return;
        }

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('damage_photos')
          .upload(filePath, blob, { contentType: `image/${fileExt}`, upsert: false });
        
        if (uploadError) {
            console.error("Supabase Upload Error:", JSON.stringify(uploadError, null, 2));
            throw uploadError;
        }
        console.log("Upload successful:", uploadData);
        photoPath = uploadData.path;
      }

      const { error: insertError } = await supabase
        .from('damage_reports')
        .insert([{
          customer_id: customerId,
          area_id: areaId,
          manager_id: user.id,
          description: description,
          photo_url: photoPath,
          reported_at: new Date().toISOString(),
        }]);
      if (insertError) throw insertError;

      Alert.alert('Success', 'Report submitted successfully!');
      setModalVisible(false);
      setDescription('');
      setImage(null);
      fetchDamageReports();
    } catch (error) {
      console.error('Error submitting report:', error.message);
      Alert.alert('Submission Error', `Failed to submit report: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDamageReports();
  };

  const renderReportItem = ({ item }) => (
    <Pressable
      style={styles.reportItem}
      onPress={() => navigation.navigate('DamageReportEdit', { reportId: item.id })}
      android_ripple={{ color: '#ddd' }}
    >
      {item.photo_url ? (
        console.log('Generated Public URL for display:', supabase.storage.from('damage_photos').getPublicUrl(item.photo_url).data.publicUrl),
        <Image source={{ uri: supabase.storage.from('damage_photos').getPublicUrl(item.photo_url).data.publicUrl }} style={styles.reportImage} />
      ) : (
        <View style={styles.noImageIcon}><Text style={styles.noImageText}>No Image</Text></View>
      )}
      <View style={styles.reportDetails}>
        <Text style={styles.reportDescription} numberOfLines={2}>{item.description}</Text>
        <Text style={styles.reportDate}>{new Date(item.reported_at).toLocaleDateString()}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={reports}
        renderItem={renderReportItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={numColumns}
        key={numColumns}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={<Text style={styles.title}>Damage Reports</Text>}
        ListEmptyComponent={!loading && <Text style={styles.loadingText}>No damage reports found.</Text>}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        contentContainerStyle={{ paddingBottom: 80 }}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.title}>Add New Report</Text>
            <ScrollView>
                <Text style={styles.label}>Description:</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Describe the damage..."
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
                <Text style={styles.label}>Photo:</Text>
                {image && <Image source={{ uri: image }} style={styles.imagePreview} />}
                <View style={styles.imageButtonsContainer}>
                  <View style={styles.imageButton}>
                    <Button title="Take Photo" onPress={pickImage} disabled={submitting} />
                  </View>
                  <View style={styles.imageButton}>
                    <Button title="From Gallery" onPress={pickImageFromGallery} disabled={submitting} />
                  </View>
                </View>
                <View style={styles.submitButton}>
                  <Button
                    title={submitting ? "Submitting..." : "Submit Report"}
                    onPress={handleSubmit}
                    disabled={submitting}
                  />
                </View>
                <View style={styles.closeButton}>
                    <Button title="Close" onPress={() => setModalVisible(false)} color="red" />
                </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Icon name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 15,
        backgroundColor: '#f5f5f5',
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        marginTop: 20,
        marginBottom: 15,
        textAlign: 'center',
    },
    loadingText: {
        textAlign: 'center',
        fontSize: 16,
        color: '#888',
        marginVertical: 20,
    },
    reportItem: {
        backgroundColor: '#fff',
        borderRadius: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 2.22,
        width: itemWidth,
        marginBottom: 15,
    },
    reportImage: {
        width: '100%',
        height: 120,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
    },
    noImageIcon: {
        width: '100%',
        height: 120,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        backgroundColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
    },
    noImageText: {
        fontSize: 14,
        color: '#666',
    },
    reportDetails: {
        padding: 10,
    },
    reportDescription: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    reportDate: {
        fontSize: 12,
        color: '#888',
    },
    fab: {
        position: 'absolute',
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        right: 20,
        bottom: 20,
        backgroundColor: '#007AFF',
        borderRadius: 28,
        elevation: 8,
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        width: '90%',
        backgroundColor: 'white',
        borderRadius: 10,
        padding: 20,
        maxHeight: '80%',
    },
    label: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 10,
        marginBottom: 5,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        padding: 10,
        marginBottom: 15,
        backgroundColor: '#fff',
        minHeight: 80,
    },
    imagePreview: {
        width: '100%',
        height: 200,
        resizeMode: 'contain',
        marginVertical: 15,
        backgroundColor: '#e0e0e0',
        borderRadius: 5,
    },
    imageButtonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 15,
    },
    imageButton: {
        flex: 1,
        marginHorizontal: 5,
    },
    submitButton: {
        marginTop: 20,
        marginBottom: 10,
    },
    closeButton: {
        marginTop: 10,
    }
});

export default DamageReportScreen;