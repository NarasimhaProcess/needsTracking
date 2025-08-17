import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Image, Alert, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase';
import { v4 as uuidv4 } from 'uuid'; // For unique filenames
import { useNavigation } from '@react-navigation/native'; // To navigate back

const DamageReportEditScreen = ({ route }) => {
  const { reportId } = route.params; // Get the ID of the report to edit
  const navigation = useNavigation();

  const [report, setReport] = useState(null);
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null); // Current image URI (local or public URL)
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchReportDetails();
  }, [reportId]);

  const fetchReportDetails = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('damage_reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (error) {
      console.error('Error fetching report details:', error.message);
      Alert.alert('Error', 'Failed to load report details.');
      setLoading(false);
      return;
    }

    setReport(data);
    setDescription(data.description);
    // If there's a photo_url, set it as the initial image state (public URL)
    if (data.photo_url) {
      const { data: publicUrlData } = supabase.storage.from('damage_photos').getPublicUrl(data.photo_url);
      setImage(publicUrlData.publicUrl);
    } else {
      setImage(null);
    }
    setLoading(false);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri); // Set local URI for preview
    }
  };

  const removeImage = async () => {
    if (!report || !report.photo_url) return; // No image to remove

    setSubmitting(true);
    try {
      // Delete from Supabase Storage
      const { error: deleteError } = await supabase.storage
        .from('damage_photos')
        .remove([report.photo_url]); // photo_url is the path in the bucket

      if (deleteError) {
        throw deleteError;
      }

      // Update database record to clear photo_url
      const { error: updateError } = await supabase
        .from('damage_reports')
        .update({ photo_url: '' }) // Set to empty string as it's NOT NULL
        .eq('id', reportId);

      if (updateError) {
        throw updateError;
      }

      setImage(null); // Clear local image state
      setReport(prev => ({ ...prev, photo_url: '' })); // Update local report state
      Alert.alert('Success', 'Image removed successfully!');
    } catch (error) {
      console.error('Error removing image:', error.message);
      Alert.alert('Error', `Failed to remove image: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const uploadImage = async (uri) => {
    const fileExt = uri.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `damage_images/${fileName}`;

    console.log('Attempting to upload image...');
    console.log('Image URI:', uri);
    console.log('File extension:', fileExt);
    console.log('Content-Type:', `image/${fileExt}`);
    console.log('File path for Supabase:', filePath);

    const response = await fetch(uri);
    const blob = await response.blob();
    console.log('Blob created. Size:', blob.size, 'Type:', blob.type);

    if (!blob || blob.size === 0) {
        Alert.alert('Upload Error', 'The selected image could not be processed. Please try a different image.');
        throw new Error('Blob is empty');
    }

    const { data, error } = await supabase.storage
      .from('damage_photos')
      .upload(filePath, blob, { contentType: `image/${fileExt}`, upsert: false });

    if (error) {
      console.error("Supabase Upload Error:", JSON.stringify(error, null, 2));
      throw error;
    }

    console.log("Upload successful:", data);
    return data.path;
  };

  const handleUpdate = async () => {
    if (!report) return; // No report loaded

    setSubmitting(true);
    try {
      let newPhotoUrl = report.photo_url; // Start with existing photo_url

      // If a new image is selected (local URI)
      if (image && !image.startsWith('http')) { // Check if it's a new local URI, not a public URL
        // If there was an old image, delete it first
        if (report.photo_url) {
          const { error: deleteOldError } = await supabase.storage
            .from('damage_photos')
            .remove([report.photo_url]);
          if (deleteOldError) {
            console.warn('Warning: Failed to delete old image:', deleteOldError.message);
            // Don't throw, continue with new upload
          }
        }
        newPhotoUrl = await uploadImage(image); // Upload new image
      } else if (!image && report.photo_url) {
        // Image was removed but not replaced, ensure photo_url is empty
        newPhotoUrl = '';
      } else if (image && image.startsWith('http') && !report.photo_url) {
        // This case should not happen if logic is correct, but for safety
        // If image is a public URL but report.photo_url was empty, means it's a new image
        // This implies a bug in logic or initial state. For now, treat as no new image.
        newPhotoUrl = ''; // Or handle as an error
      }


      const { error } = await supabase
        .from('damage_reports')
        .update({
          description: description,
          photo_url: newPhotoUrl,
          // updated_at will be handled by DB trigger
        })
        .eq('id', reportId);

      if (error) {
        throw error;
      }

      Alert.alert('Success', 'Report updated successfully!');
      navigation.goBack(); // Go back to the list
    } catch (error) {
      console.error('Error updating report:', error.message);
      Alert.alert('Update Error', `Failed to update report: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Report...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Report not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Edit Damage Report</Text>

      <Text style={styles.label}>Description:</Text>
      <TextInput
        style={styles.input}
        placeholder="Describe the damage..."
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>Current Image:</Text>
      {image ? (
        <View>
          <Image source={{ uri: image }} style={styles.imagePreview} />
          <Button title="Remove Image" onPress={removeImage} disabled={submitting} />
        </View>
      ) : (
        <Text style={styles.noImageText}>No image uploaded.</Text>
      )}

      <Button title="Take New Photo" onPress={pickImage} disabled={submitting} />

      <Button
        title={submitting ? "Updating..." : "Update Report"}
        onPress={handleUpdate}
        disabled={submitting}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#007AFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
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
  },
  imagePreview: {
    width: '100%',
    height: 200,
    resizeMode: 'contain',
    marginVertical: 15,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
  },
  noImageText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 15,
  },
});

export default DamageReportEditScreen;
