import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Button, Image, Alert, StyleSheet, ScrollView, FlatList, Modal, TouchableOpacity, Dimensions, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { supabase, extractFileDetails } from '../services/supabase'; // Assuming you have this setup
import { v4 as uuidv4 } from 'uuid'; // For unique filenames
import * as FileSystem from 'expo-file-system';
import Icon from 'react-native-vector-icons/FontAwesome';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import UniversalWebView from '../components/UniversalWebView';
import * as Clipboard from 'expo-clipboard'; // Added for clipboard functionality

const { width, height } = Dimensions.get('window');

const MAX_VIDEO_SIZE_MB = 50; // 50 MB

const generateMapHtml = (coords) => {
  const lat = coords?.latitude ? Number(coords.latitude) : 20.5937;
  const lon = coords?.longitude ? Number(coords.longitude) : 78.9629;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Damage Location</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #f0f0f0; }
        .leaflet-popup-content { font-family: sans-serif; font-size: 13px; line-height: 1.4; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        try {
          var map = L.map('map').setView([${lat}, ${lon}], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(map);

          var marker = L.marker([${lat}, ${lon}]).addTo(map);
          marker.bindPopup('<b>Damage Location</b><br/>Lat: ${lat.toFixed(5)}<br/>Lon: ${lon.toFixed(5)}').openPopup();

          setTimeout(function() {
            map.invalidateSize();
          }, 300);
        } catch (e) {
          console.error("Leaflet error:", e);
        }
      </script>
    </body>
    </html>
  `;
};

const FieldManagerScreen = ({ navigation, route }) => {
  const { customerId, areaId } = route?.params || {};

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

  const fetchDamageReports = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let query = supabase.from('damage_reports').select(`
        *,
        damage_report_files (*)
      `);

      if (areaId) {
        query = query.eq('area_id', areaId);
      } else if (user) {
        query = query.or(`manager_id.eq.${user.id},user_id.eq.${user.id}`);
      } else {
        setDamageReports([]);
        return;
      }

      const { data, error } = await query.order('reported_at', { ascending: false });

      if (error) {
        console.error('Error fetching damage reports:', error.message);
        setDamageReports([]);
        return;
      }

      setDamageReports(data || []);
    } catch (err) {
      console.error('Error fetching damage reports:', err);
      setDamageReports([]);
    }
  };

  useEffect(() => {
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

    // Optional: Network monitoring
    /*
    const unsubscribe = NetInfo.addEventListener(state => {
      if (!state.isConnected) {
        Alert.alert('No Internet', 'Map tiles may not load without internet connection');
      }
    });

    return () => unsubscribe();
    */

  }, [areaId]);

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
      // ImagePicker returns a single asset, DocumentPicker returns an array of assets
      // Normalize it to an array for consistency with `files` state
      const newAsset = {
        uri: result.assets[0].uri,
        name: result.assets[0].uri.split('/').pop(), // Extract filename from URI
        mimeType: 'image/jpeg', // Assuming JPEG for camera photos
        size: 0, // Placeholder, actual size might not be available directly
      };
      setFiles(prevFiles => [...prevFiles, newAsset]);
    }
  };

  const uploadFile = async (file) => {
    let manipulatedFile = file;
    const isImage = file.mimeType && file.mimeType.startsWith('image');
    if (isImage) {
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          file.uri,
          [],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
        );
        if (manipResult && manipResult.uri) {
          manipulatedFile = { ...file, uri: manipResult.uri };
        }
      } catch (manipErr) {
        console.warn('Image manipulation skipped:', manipErr.message);
      }
    }

    const { extension, contentType, fileName } = extractFileDetails(
      manipulatedFile.uri || file.name,
      file.mimeType?.startsWith('video') ? 'video' : 'image'
    );
    const uniqueFileName = `${uuidv4()}.${extension}`;
    const filePath = `damage_reports/${uniqueFileName}`;

    let fileData = null;
    if (Platform.OS === 'web' || (typeof window !== 'undefined' && typeof fetch === 'function')) {
      try {
        const fileResponse = await fetch(manipulatedFile.uri);
        fileData = await fileResponse.blob();
      } catch (blobErr) {
        console.warn('Web fetch blob failed:', blobErr.message);
      }
    }

    if (!fileData) {
      try {
        const base64 = await FileSystem.readAsStringAsync(manipulatedFile.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        fileData = new Uint8Array(
          atob(base64).split("").map((c) => c.charCodeAt(0))
        );
      } catch (fsErr) {
        console.error('FileSystem read failed:', fsErr.message);
      }
    }

    if (!fileData) {
      throw new Error('Unable to read image file data.');
    }

    let publicUrl = null;
    const bucketsToTry = ['damage_photos', 'productsmedia', 'locationtracker'];
    for (const bucketName of bucketsToTry) {
      try {
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, fileData, {
            contentType: file.mimeType || contentType,
            upsert: true,
          });

        if (!uploadError) {
          const { data } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filePath);
          if (data?.publicUrl) {
            publicUrl = data.publicUrl;
            break;
          }
        }
      } catch (bErr) {
        console.warn(`Bucket ${bucketName} upload error:`, bErr.message);
      }
    }

    if (!publicUrl) {
      throw new Error('Failed to upload damage photo to storage.');
    }

    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!description) {
      Alert.alert('Missing Information', 'Please provide a description of the damage.');
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

      let currentLoc = location;
      if (!currentLoc) {
        try {
          currentLoc = await Location.getCurrentPositionAsync({});
          if (currentLoc) setLocation(currentLoc);
        } catch (locErr) {
          console.warn('Could not fetch location:', locErr);
        }
      }

      const locCoords = currentLoc?.coords || { latitude: 0, longitude: 0 };

      const insertPayload = {
        user_id: user.id,
        manager_id: user.id,
        latitude: locCoords.latitude,
        longitude: locCoords.longitude,
        description: description,
      };

      if (areaId) {
        insertPayload.area_id = areaId;
      }
      if (customerId) {
        insertPayload.customer_id = customerId;
      }

      const { data: reportData, error: reportError } = await supabase.from('damage_reports').insert(insertPayload).select();

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
      await fetchDamageReports();
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
        for (const file of result.assets) {
          if (file.mimeType.startsWith('video') && file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
            Alert.alert('Video Too Large', `Video file ${file.name} exceeds the maximum size of ${MAX_VIDEO_SIZE_MB} MB.`);
            continue;
          }
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

  const takePhotoForExistingReport = async () => {
    setAddFileOptionModalVisible(false);
    try {
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
        const fileUrl = await uploadFile(newAsset);
        await supabase.from('damage_report_files').insert({
          damage_report_id: selectedReport.id,
          file_url: fileUrl,
          file_type: newAsset.mimeType,
          file_name: newAsset.name,
        });

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

  const handleShowMap = (latitude, longitude) => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (isNaN(lat) || isNaN(lon)) {
      Alert.alert('Location Error', 'Invalid coordinates for this report');
      return;
    }
    
    setSelectedMapCoords({ latitude: lat, longitude: lon });
    setShowMapModal(true);
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
      <Text style={styles.dateTimeText}>Current Date and Time: {new Date().toLocaleString()}</Text>
      <FlatList
        data={damageReports}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const lat = Number(item.latitude);
          const lon = Number(item.longitude);
          const hasLocation = item.latitude != null && item.longitude != null && !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0);

          return (
            <TouchableOpacity onPress={() => openPhotoViewer(item)}>
              <View style={styles.reportItem}>
                <View style={styles.reportHeader}>
                  <Text style={styles.label}>Description: {item.description}</Text>
                  {hasLocation ? (
                    <TouchableOpacity 
                      onPress={() => handleShowMap(item.latitude, item.longitude)} 
                      style={styles.mapIconContainer}
                      accessibilityLabel="View location on map"
                    >
                      <Icon name="map-marker" size={18} color="#007AFF" />
                      <Text style={styles.mapIconText}>View on Map</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.noLocationContainer}>
                      <Icon name="map-marker" size={14} color="#999" />
                      <Text style={styles.noLocationText}>No Location</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.reportDateText}>Reported At: {new Date(item.reported_at).toLocaleString()}</Text>
                <FlatList
                  data={item.damage_report_files}
                  keyExtractor={(file) => file.id.toString()}
                  renderItem={renderReportFile}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                />
              </View>
            </TouchableOpacity>
          );
        }}
      />
      
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
      
      {/* New Report Modal */}
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
      
      {/* Photo Viewer Modal */}
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

      {/* Add File Options Modal */}
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

      {/* Map Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={showMapModal}
        onRequestClose={() => {
          setShowMapModal(false);
        }}
      >
        <View style={styles.mapModalContainer}>
          {selectedMapCoords && (
            <UniversalWebView
              ref={webViewRef}
              style={styles.map}
              source={{ html: generateMapHtml(selectedMapCoords) }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              originWhitelist={['*']}
            />
          )}
          {selectedMapCoords && (
            <View style={styles.coordsContainer}>
              <Text style={styles.coordsText}>
                Lat: {Number(selectedMapCoords.latitude).toFixed(5)}, Lon: {Number(selectedMapCoords.longitude).toFixed(5)}
              </Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={async () => {
                  const coordsString = `${selectedMapCoords.latitude},${selectedMapCoords.longitude}`;
                  await Clipboard.setStringAsync(coordsString);
                  Alert.alert('Copied!', 'Coordinates copied to clipboard.');
                }}
              >
                <Icon name="copy" size={16} color="white" />
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
  reportItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    backgroundColor: '#fff',
    marginBottom: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  reportDateText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  mapIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F1FF',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#B8D5FF',
  },
  mapIconText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  noLocationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 5,
  },
  noLocationText: {
    color: '#999',
    fontSize: 11,
    marginLeft: 3,
  },
  mapModalContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
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
  videoPreview: {
    width: 100,
    height: 100,
    margin: 5,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
  },
  largeImage: {
    width: width,
    height: height - 200, // Adjust height to leave space for buttons and date
    resizeMode: 'contain',
  },
  largeVideo: {
    width: width,
    height: height - 200, // Adjust height to leave space for buttons and date
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
  mapLoadingText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
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
  },
  coordsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 5,
    padding: 8,
    position: 'absolute',
    top: 20, // Adjust as needed
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

export default FieldManagerScreen;