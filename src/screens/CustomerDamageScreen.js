import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Button, Image, Alert, StyleSheet, ScrollView, FlatList, Modal, TouchableOpacity, Dimensions } from 'react-native';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../services/supabase'; // Assuming you have this setup
import { v4 as uuidv4 } from 'uuid'; // For unique filenames
import * as FileSystem from 'expo-file-system';
import Icon from 'react-native-vector-icons/FontAwesome';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard'; // Added for clipboard functionality

const { width, height } = Dimensions.get('window');

const mapHtml = require('../../assets/map.html');

const MAX_VIDEO_SIZE_MB = 50; // 50 MB

const CustomerDamageScreen = ({ navigation, route }) => {
  const { customerId } = route.params;

  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [damageReports, setDamageReports] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [addFileOptionModalVisible, setAddFileOptionModalVisible] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedMapCoords, setSelectedMapCoords] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const webViewRef = useRef(null);

  useEffect(() => {
    const fetchDamageReports = async () => {
      let query = supabase.from('damage_reports').select(`
        *,
        damage_report_files (*)
      `)
      .eq('customer_id', customerId);

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

  }, [customerId]);

  const pickFiles = async () => {
    let result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'video/*'],
      multiple: true,
    });

    if (result.canceled === false) {
      const newFiles = [];
      for (const asset of result.assets) {
        if (asset.mimeType.startsWith('video') && asset.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
          Alert.alert('Video Too Large', `Video file ${asset.name} exceeds the maximum size of ${MAX_VIDEO_SIZE_MB} MB.`);
          continue;
        }
        newFiles.push(asset);
      }
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    }
  };

  const takePhoto = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.5, // Low quality
    });

    if (!result.canceled) {
      const newAsset = {
        uri: result.assets[0].uri,
        name: result.assets[0].uri.split('/').pop(),
        mimeType: 'image/jpeg',
        size: 0,
      };
      setFiles(prevFiles => [...prevFiles, newAsset]);
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
    if (!description || !location || !customerId) {
      Alert.alert('Missing Information', `Please fill all fields, and ensure location and customer info is available. customerId: ${customerId}`);
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
      const { data, error: fetchError } = await supabase
        .from('damage_reports')
        .select(`
          *,
          damage_report_files (*)
        `)
        .eq('customer_id', customerId)
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

  const handleAddNewFiles = () => {
    setAddFileOptionModalVisible(true);
  };

  const pickFilesForExistingReport = async () => {
    setAddFileOptionModalVisible(false);
    try {
      let result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'video/*'],
        multiple: true,
      });

      if (result.canceled === false) {
        for (const asset of result.assets) {
          if (asset.mimeType.startsWith('video') && asset.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
            Alert.alert('Video Too Large', `Video file ${asset.name} exceeds the maximum size of ${MAX_VIDEO_SIZE_MB} MB.`);
            continue;
          }
          const fileUrl = await uploadFile(asset);
          await supabase.from('damage_report_files').insert({
            damage_report_id: selectedReport.id,
            file_url: fileUrl,
            file_type: asset.mimeType,
            file_name: asset.name,
          });
        }

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

  const takePhotoForExistingReport = async () => {
    setAddFileOptionModalVisible(false);
    try {
      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.5,
      });

      if (!result.canceled) {
        const newAsset = {
          uri: result.assets[0].uri,
          name: result.assets[0].uri.split('/').pop(),
          mimeType: 'image/jpeg',
          size: 0,
        };
        const fileUrl = await uploadFile(newAsset);
        await supabase.from('damage_report_files').insert({
          damage_report_id: selectedReport.id,
          file_url: fileUrl,
          file_type: newAsset.mimeType,
          file_name: newAsset.name,
        });

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
      const { error } = await supabase
        .from('damage_report_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;

      const filePath = file.file_url.split('/').pop();
      await supabase.storage.from('damage_photos').remove([`damage_reports/${filePath}`]);

      const { data, error: fetchError } = await supabase
        .from('damage_reports')
        .select(`*, damage_report_files (*)`)
        .eq('id', selectedReport.id)
        .single();

      if (!fetchError) {
        setSelectedReport(data);
        setDamageReports((prev) =>
          prev.map((r) => (r.id === data.id ? data : r))
        );
      }
    } catch (err) {
      console.error("Error deleting file:", err.message);
      Alert.alert("Error", "Could not delete file.");
    }
  };

  const handleShowMap = (latitude, longitude) => {
    if (!latitude || !longitude) {
      Alert.alert('Location Error', 'Invalid coordinates for this report');
      return;
    }
    
    setSelectedMapCoords({ latitude, longitude });
    setMapReady(false);
    setShowMapModal(true);
  };

  const onMapMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'webviewLoaded') {
        setMapReady(true);
        
        if (webViewRef.current && selectedMapCoords) {
          setTimeout(() => {
            const message = {
              type: 'initialLoad',
              initialRegion: {
                latitude: selectedMapCoords.latitude,
                longitude: selectedMapCoords.longitude,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
              },
            };
            webViewRef.current.postMessage(JSON.stringify(message));
          }, 500);
        }
      }
    } catch (error) {
      console.error("Error parsing WebView message:", error);
    }
  };

  const renderFilePreview = ({ item }) => {
    if (item.mimeType && item.mimeType.startsWith('image')) {
      return <Image source={{ uri: item.uri }} style={styles.imagePreview} />;
    } else if (item.mimeType && item.mimeType.startsWith('video')) {
      return (
        <Video
          source={{ uri: item.uri }}
          style={styles.videoPreview}
          useNativeControls
          resizeMode="contain"
          isLooping
        />
      );
    } else {
      return <Icon name="file" size={100} color="#ccc" />;
    }
  };

  const renderReportFile = ({ item }) => {
    if (item.file_type && item.file_type.startsWith('image')) {
      return <Image source={{ uri: item.file_url }} style={styles.imagePreview} />;
    } else if (item.file_type && item.file_type.startsWith('video')) {
      return (
        <Video
          source={{ uri: item.file_url }}
          style={styles.videoPreview}
          useNativeControls
          resizeMode="contain"
          isLooping
        />
      );
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
      <Text style={styles.title}>Damage Reports</Text>
      <FlatList
        data={damageReports}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openPhotoViewer(item)}>
            <View style={styles.reportItem}>
              <Text>Description: {item.description}</Text>
              <Text>Reported At: {new Date(item.reported_at).toLocaleString()}</Text>
              {item.latitude && item.longitude && (
                <TouchableOpacity 
                  onPress={() => handleShowMap(item.latitude, item.longitude)} 
                  style={styles.mapIconContainer}
                  accessibilityLabel="View location on map"
                >
                  <Icon name="map-marker" size={24} color="#007AFF" />
                  <Text>View Location</Text>
                </TouchableOpacity>
              )}
              <FlatList
                data={item.damage_report_files}
                keyExtractor={(file) => file.id.toString()}
                renderItem={renderReportFile}
                horizontal
                showsHorizontalScrollIndicator={false}
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
              <View style={styles.fileSelectionContainer}>
                <TouchableOpacity style={styles.fileSelectionButton} onPress={pickFiles}>
                  <Text style={styles.textStyle}>Select from Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fileSelectionButton} onPress={takePhoto}>
                  <Text style={styles.textStyle}>Take Photo</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={files}
                keyExtractor={(file) => file.uri}
                renderItem={renderFilePreview}
                horizontal
                showsHorizontalScrollIndicator={false}
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
                <Text>{new Date(item.created_at).toLocaleString()}</Text>
                {item.file_type && item.file_type.startsWith('image') ? (
                  <Image source={{ uri: item.file_url }} style={styles.largeImage} />
                ) : item.file_type && item.file_type.startsWith('video') ? (
                  <Video
                    source={{ uri: item.file_url }}
                    style={styles.largeVideo}
                    useNativeControls
                    resizeMode="contain"
                    isLooping
                  />
                ) : (
                  <Icon name="file" size={width * 0.5} color="#ccc" />
                )}
                <TouchableOpacity onPress={() => handleDeleteFile(item)} style={styles.deleteButton}>
                  <Icon name="trash" size={30} color="white" />
                </TouchableOpacity>
              </View>
            )}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
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

      <Modal
        animationType="slide"
        transparent={true}
        visible={addFileOptionModalVisible}
        onRequestClose={() => {
          setAddFileOptionModalVisible(!addFileOptionModalVisible);
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalText}>Add Photo</Text>
            <TouchableOpacity
              style={[styles.button, styles.buttonSubmit]}
              onPress={pickFilesForExistingReport}
            >
              <Text style={styles.textStyle}>Select from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonSubmit]}
              onPress={takePhotoForExistingReport}
            >
              <Text style={styles.textStyle}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonClose]}
              onPress={() => setAddFileOptionModalVisible(!addFileOptionModalVisible)}
            >
              <Text style={styles.textStyle}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={false}
        visible={showMapModal}
        onRequestClose={() => {
          setShowMapModal(!showMapModal);
        }}
      >
        <View style={styles.modalView}>
          {!mapReady && (
            <View style={styles.mapLoadingOverlay}>
              <Text>Loading Map...</Text>
            </View>
          )}
          <WebView
            ref={webViewRef}
            style={[styles.map, !mapReady && { opacity: 0 }]}
            source={{ uri: `${mapHtml}?cachebust=${Date.now()}` }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            mixedContentMode="compatibility"
            onMessage={onMapMessage}
            onLoadEnd={() => console.log("WebView finished loading")}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.warn('WebView error: ', nativeEvent);
              Alert.alert('Map Error', 'Failed to load map. Please check your internet connection or map configuration.');
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.warn('WebView HTTP error: ', nativeEvent);
            }}
            originWhitelist={['*']}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.mapLoadingOverlay}>
                <Text>Loading Map...</Text>
              </View>
            )}
          />
          {selectedMapCoords && (
            <View style={styles.coordsContainer}>
              <Text style={styles.coordsText}>
                Lat: {selectedMapCoords.latitude.toFixed(6)}, Lon: {selectedMapCoords.longitude.toFixed(6)}
              </Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={async () => {
                  const coordsString = `${selectedMapCoords.latitude},${selectedMapCoords.longitude}`;
                  await Clipboard.setStringAsync(coordsString);
                  Alert.alert('Copied!', 'Coordinates copied to clipboard.');
                }}
              >
                <Icon name="copy" size={20} color="white" />
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={[styles.button, styles.buttonClose, styles.mapCloseButton]}
            onPress={() => setShowMapModal(false)}
          >
            <Text style={styles.textStyle}>Close Map</Text>
          </TouchableOpacity>
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  reportItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    backgroundColor: '#fff',
    marginBottom: 5,
    borderRadius: 8,
  },
  mapIconContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  imagePreview: {
    width: 100,
    height: 100,
    resizeMode: 'cover',
    margin: 5,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
  },
  videoPreview: {
    width: 100,
    height: 100,
    margin: 5,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
  },
  largeImage: {
    width: width,
    height: height - 200,
    resizeMode: 'contain',
  },
  largeVideo: {
    width: width,
    height: height - 200,
  },
  map: {
    flex: 1,
    width: '100%',
  },
  mapCloseButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    width: 150,
  },
  mapLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
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
  fileSelectionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 15,
  },
  fileSelectionButton: {
    backgroundColor: '#03A9F4',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    width: '45%',
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
  deleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255,0,0,0.7)',
    borderRadius: 20,
    padding: 5,
  },
  coordsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 5,
    padding: 8,
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    zIndex: 100,
  },
  coordsText: {
    color: 'white',
    fontSize: 14,
    marginRight: 10,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  copyButtonText: {
    color: 'white',
    marginLeft: 5,
    fontSize: 14,
  },
});

export default CustomerDamageScreen;
