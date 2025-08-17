import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Image, Alert, StyleSheet, ScrollView, FlatList, Modal, TouchableOpacity, Dimensions } from 'react-native';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../services/supabase'; // Assuming you have this setup
import { v4 as uuidv4 } from 'uuid'; // For unique filenames
import * as FileSystem from 'expo-file-system';
import Icon from 'react-native-vector-icons/FontAwesome';
import * as ImageManipulator from 'expo-image-manipulator';

const { width, height } = Dimensions.get('window');

const FieldManagerScreen = ({ navigation, route }) => {
  const { customerId, areaId } = route.params;

  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [damageReports, setDamageReports] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    const fetchDamageReports = async () => {
      let query = supabase.from('damage_reports').select(`
        *,
        damage_report_files (*)
      `);

      if (areaId) {
        query = query.eq('area_id', areaId);
      }

      const { data, error } = await query.order('reported_at', { ascending: false });

      if (error) {
        console.error('Error fetching damage reports:', error);
        return;
      }

      setDamageReports(data);
    };

    fetchDamageReports();

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);
    })();

  }, [areaId]);

  const pickFiles = async () => {
    let result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'video/*'],
      multiple: true,
    });

    if (result.canceled === false) {
      setFiles(result.assets);
    }
  };

  const uploadFile = async (file) => {
    let manipulatedFile = file;
    if (file.mimeType.startsWith('image')) {
      const manipResult = await ImageManipulator.manipulateAsync(
        file.uri,
        [],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );
      manipulatedFile = { ...file, uri: manipResult.uri };
    }

    const fileExt = manipulatedFile.uri.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `damage_reports/${fileName}`;

    const base64 = await FileSystem.readAsStringAsync(manipulatedFile.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileData = new Uint8Array(
      atob(base64).split("").map((c) => c.charCodeAt(0))
    );

    const { error: uploadError } = await supabase.storage
      .from('damage_photos')
      .upload(filePath, fileData, {
        contentType: file.mimeType,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('damage_photos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async () => {
    Alert.alert('handleSubmit called!');
    if (!description || !location || !customerId || !areaId) {
      Alert.alert('Missing Information', `Please fill all fields, and ensure location, customer, and area info is available. customerId: ${customerId}, areaId: ${areaId}`);
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Authentication Error', 'User not logged in.');
        setLoading(false);
        return;
      }

      const { data: reportData, error: reportError } = await supabase.from('damage_reports').insert({
        manager_id: user.id,
        area_id: areaId,
        customer_id: customerId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        description: description,
      }).select();

      if (reportError) {
        throw reportError;
      }

      const newReport = reportData[0];

      if (files.length > 0) {
        for (const file of files) {
          const fileUrl = await uploadFile(file);
          const { data, error } = await supabase.from('damage_report_files').insert({
            damage_report_id: newReport.id,
            file_url: fileUrl,
            file_type: file.mimeType,
            file_name: file.name,
          });
          console.log('insert result', { data, error });
        }
      }

      Alert.alert('Success', 'Damage report submitted successfully!');
      setDescription('');
      setFiles([]);
      setModalVisible(false);
      // Refresh the list of reports
      const { data, error: fetchError } = await supabase
        .from('damage_reports')
        .select(`
          *,
          damage_report_files (*)
        `)
        .eq('area_id', areaId)
        .order('reported_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching damage reports:', fetchError);
      } else {
        setDamageReports(data);
      }
    } catch (error) {
      console.error('Error submitting report:', error.message);
      Alert.alert('Submission Error', `Failed to submit report: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Move these functions inside the component
  const handleAddNewFiles = async () => {
    try {
      let result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'video/*'],
        multiple: true,
      });

      if (result.canceled === false) {
        for (const file of result.assets) {
          const fileUrl = await uploadFile(file);
          await supabase.from('damage_report_files').insert({
            damage_report_id: selectedReport.id,
            file_url: fileUrl,
            file_type: file.mimeType,
            file_name: file.name,
          });
        }

        // Refresh selected report
        const { data, error } = await supabase
          .from('damage_reports')
          .select(`*, damage_report_files (*)`)
          .eq('id', selectedReport.id)
          .single();

        if (!error) {
          setSelectedReport(data);
        }
      }
    } catch (err) {
      console.error("Error adding new files:", err.message);
      Alert.alert("Error", "Could not add new files.");
    }
  };

  const handleDeleteFile = async (file) => {
    try {
      // Delete from DB
      const { error } = await supabase
        .from('damage_report_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;

      // Optionally: also delete from storage bucket
      const filePath = file.file_url.split('/').pop(); // crude extraction
      await supabase.storage.from('damage_photos').remove([`damage_reports/${filePath}`]);

      // Refresh selected report
      const { data, error: fetchError } = await supabase
        .from('damage_reports')
        .select(`*, damage_report_files (*)`)
        .eq('id', selectedReport.id)
        .single();

      if (!fetchError) {
        setSelectedReport(data);
        // Also update global reports list
        setDamageReports((prev) =>
          prev.map((r) => (r.id === data.id ? data : r))
        );
      }
    } catch (err) {
      console.error("Error deleting file:", err.message);
      Alert.alert("Error", "Could not delete file.");
    }
  };

  const renderFilePreview = ({ item }) => {
    if (item.mimeType && item.mimeType.startsWith('image')) {
      return <Image source={{ uri: item.uri }} style={styles.imagePreview} />;
    } else if (item.mimeType && item.mimeType.startsWith('video')) {
      return <Icon name="video-camera" size={100} color="#ccc" />;
    } else {
      return <Icon name="file" size={100} color="#ccc" />;
    }
  };

  const renderReportFile = ({ item }) => {
    if (item.file_type && item.file_type.startsWith('image')) {
      return <Image source={{ uri: item.file_url }} style={styles.imagePreview} />;
    } else if (item.file_type && item.file_type.startsWith('video')) {
      return <Icon name="video-camera" size={100} color="#ccc" />;
    } else {
      return <Icon name="file" size={100} color="#ccc" />;
    }
  };

  const openPhotoViewer = (report) => {
    setSelectedReport(report);
    setPhotoModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.dateTimeText}>Current Date and Time: {new Date().toLocaleString()}</Text>
      <FlatList
        data={damageReports}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openPhotoViewer(item)}>
            <View style={styles.reportItem}>
              <Text style={styles.label}>Description: {item.description}</Text>
              <Text style={styles.reportDateText}>Reported At: {new Date(item.reported_at).toLocaleString()}</Text>
              <FlatList
                data={item.damage_report_files}
                keyExtractor={(file) => file.id.toString()}
                renderItem={renderReportFile}
                horizontal
              />
            </View>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(!modalVisible);
        }}
      >
        <View style={styles.modalView}>
            <ScrollView contentContainerStyle={styles.scrollViewContent}>
              <Text style={styles.modalText}>New Damage Report</Text>
              <TextInput
                style={styles.input}
                placeholder="Describe the damage..."
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <Button title="Select Files" onPress={pickFiles} />
              <FlatList
                data={files}
                keyExtractor={(file) => file.uri}
                renderItem={renderFilePreview}
                horizontal
              />
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSubmit]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  <Text style={styles.textStyle}>{loading ? "Submitting..." : "Submit Report"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.buttonClose]}
                  onPress={() => setModalVisible(!modalVisible)}
                >
                  <Text style={styles.textStyle}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
      </Modal>
      <Modal
        animationType="slide"
        transparent={false}
        visible={photoModalVisible}
        onRequestClose={() => {
          setPhotoModalVisible(!photoModalVisible);
        }}
      >
        <View style={styles.modalView}>
          <FlatList
            data={selectedReport ? selectedReport.damage_report_files : []}
            keyExtractor={(file) => file.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.photoViewerItem}>
                <Text style={styles.photoViewerDate}>{new Date(item.created_at).toLocaleString()}</Text>
                {item.file_type && item.file_type.startsWith('image') ? (
                  <Image source={{ uri: item.file_url }} style={styles.largeImage} />
                ) : (
                  <Icon name="video-camera" size={width * 0.5} color="#ccc" />
                )}
                <TouchableOpacity onPress={() => handleDeleteFile(item)} style={styles.deleteButton}>
                  <Icon name="trash" size={30} color="white" />
                </TouchableOpacity>
              </View>
            )}
            horizontal
            pagingEnabled
          />
          <View style={styles.photoViewerButtonContainer}>
            <TouchableOpacity onPress={handleAddNewFiles} style={styles.photoViewerButton}>
              <Icon name="plus" size={30} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPhotoModalVisible(false)} style={styles.photoViewerButton}>
              <Text style={styles.textStyle}>Close</Text>
            </TouchableOpacity>
          </View>
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
  },
  reportItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  reportDateText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
  },
  imagePreview: {
    width: 100,
    height: 100,
    resizeMode: 'cover',
    margin: 5,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
  },
  largeImage: {
    width: width,
    height: height - 200, // Adjust height to leave space for buttons and date
    resizeMode: 'contain',
  },
  modalView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  scrollViewContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  button: {
    borderRadius: 20,
    padding: 10,
    elevation: 2,
    width: 120,
    alignItems: 'center',
  },
  buttonSubmit: {
    backgroundColor: "#4CAF50",
  },
  buttonClose: {
    backgroundColor: "#f44336",
  },
  textStyle: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center"
  },
  modalText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
    width: width * 0.8,
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 20,
    backgroundColor: '#03A9F4',
    borderRadius: 30,
    elevation: 8
  },
  fabIcon: {
    fontSize: 24,
    color: 'white'
  },
  photoViewerButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    position: 'absolute',
    bottom: 20,
  },
  photoViewerButton: {
    backgroundColor: '#03A9F4',
    padding: 10,
    borderRadius: 5,
  },
  photoViewerItem: {
    width: width,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerDate: {
    color: 'black',
    fontSize: 16,
    marginBottom: 10,
  },
  deleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255,0,0,0.7)',
    borderRadius: 20,
    padding: 5,
  },
  dateTimeText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  }
});

export default FieldManagerScreen;