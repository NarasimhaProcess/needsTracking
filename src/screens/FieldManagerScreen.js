import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Alert,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { supabase, extractFileDetails } from '../services/supabase';
import { v4 as uuidv4 } from 'uuid';
import * as FileSystem from 'expo-file-system';
import Icon from 'react-native-vector-icons/FontAwesome';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import UniversalWebView from '../components/UniversalWebView';
import * as Clipboard from 'expo-clipboard';
import { Buffer } from 'buffer';
import { showAlert } from '../utils/alertUtils';

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
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      if (!user) {
        setDamageReports([]);
        return;
      }

      let isRoleAdmin = false;
      try {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (profile?.role === 'admin') {
          isRoleAdmin = true;
        }
      } catch (_) {}

      let query = supabase.from('damage_reports').select(`
        *,
        damage_report_files (*)
      `);

      if (areaId) {
        query = query.eq('area_id', areaId);
      } else if (customerId) {
        query = query.eq('customer_id', customerId);
      } else if (!isRoleAdmin) {
        query = query.eq('manager_id', user.id);
      }

      const { data, error } = await query.order('reported_at', { ascending: false });

      if (error) {
        console.error('Error fetching damage reports:', error.message);
        const { data: fallbackData } = await supabase
          .from('damage_reports')
          .select(`*, damage_report_files (*)`)
          .order('reported_at', { ascending: false });
        setDamageReports(fallbackData || []);
        return;
      }

      setDamageReports(data || []);
    } catch (err) {
      console.error('Error fetching damage reports:', err);
      setDamageReports([]);
    } finally {
      setFetching(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDamageReports();

    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }

        let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation(loc);
      } catch (locErr) {
        console.warn('Location initialization error:', locErr);
      }
    })();
  }, [areaId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDamageReports();
  };

  const pickFiles = async () => {
    try {
      let result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'video/*'],
        multiple: true,
      });

      if (result.canceled === false && result.assets) {
        const newFiles = [];
        for (const asset of result.assets) {
          if (asset.mimeType && asset.mimeType.startsWith('video') && asset.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
            showAlert('Video Too Large', `Video file ${asset.name} exceeds the maximum size of ${MAX_VIDEO_SIZE_MB} MB.`);
            continue;
          }
          newFiles.push(asset);
        }
        setFiles((prevFiles) => [...prevFiles, ...newFiles]);
      }
    } catch (err) {
      console.error('Error picking files:', err);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Required', 'Camera permission is required to take photos.');
        return;
      }

      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const newAsset = {
          uri: asset.uri,
          name: asset.uri.split('/').pop() || `photo_${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          size: asset.fileSize || 0,
        };
        setFiles((prevFiles) => [...prevFiles, newAsset]);
      }
    } catch (err) {
      console.error('Error taking photo:', err);
    }
  };

  const uploadFile = async (file) => {
    let manipulatedFile = file;
    const isImage = file.mimeType ? file.mimeType.startsWith('image') : !file.uri?.match(/\.(mp4|mov|webm)$/i);
    if (isImage && ImageManipulator?.manipulateAsync) {
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          file.uri,
          [],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );
        if (manipResult && manipResult.uri) {
          manipulatedFile = { ...file, uri: manipResult.uri };
        }
      } catch (manipErr) {
        console.warn('Image manipulation skipped:', manipErr.message);
      }
    }

    const { extension, contentType } = extractFileDetails(
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
        if (typeof Buffer !== 'undefined') {
          const buf = Buffer.from(base64, 'base64');
          fileData = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } else {
          fileData = new Uint8Array(
            atob(base64).split('').map((c) => c.charCodeAt(0))
          ).buffer;
        }
      } catch (fsErr) {
        console.error('FileSystem read failed:', fsErr.message);
      }
    }

    if (!fileData) {
      throw new Error('Unable to read media file data.');
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
      throw new Error('Failed to upload media file to storage.');
    }

    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      showAlert('Missing Information', 'Please provide a description of the damage.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        showAlert('Authentication Error', 'User not logged in. Please sign in to submit a damage report.');
        setLoading(false);
        return;
      }

      let currentLoc = location;
      if (!currentLoc) {
        try {
          currentLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (currentLoc) setLocation(currentLoc);
        } catch (locErr) {
          console.warn('Could not fetch location:', locErr);
        }
      }

      const locCoords = currentLoc?.coords || { latitude: 0, longitude: 0 };

      const insertPayload = {
        manager_id: user.id,
        latitude: locCoords.latitude || 0,
        longitude: locCoords.longitude || 0,
        description: description.trim(),
        status: 'reported',
      };

      if (areaId) {
        insertPayload.area_id = areaId;
      }
      if (customerId) {
        insertPayload.customer_id = customerId;
      }

      const { data: reportData, error: reportError } = await supabase
        .from('damage_reports')
        .insert(insertPayload)
        .select();

      if (reportError) {
        throw reportError;
      }

      const newReport = reportData?.[0];

      if (newReport && files.length > 0) {
        for (const file of files) {
          try {
            const fileUrl = await uploadFile(file);
            const fileType = file.mimeType || (file.uri?.match(/\.(mp4|mov|webm)$/i) ? 'video/mp4' : 'image/jpeg');
            const fileName = file.name || file.uri?.split('/').pop() || 'damage_media';
            await supabase.from('damage_report_files').insert({
              damage_report_id: newReport.id,
              file_url: fileUrl,
              file_type: fileType,
              file_name: fileName,
            });
          } catch (uploadErr) {
            console.error('Error uploading file for report:', uploadErr);
          }
        }
      }

      showAlert('Success', 'Damage report submitted successfully!');
      setDescription('');
      setFiles([]);
      setModalVisible(false);
      await fetchDamageReports();
    } catch (error) {
      console.error('Error submitting report:', error.message || error);
      showAlert('Submission Error', `Failed to submit report: ${error.message || 'Unknown error'}`);
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

      if (result.canceled === false && result.assets) {
        for (const file of result.assets) {
          if (file.mimeType && file.mimeType.startsWith('video') && file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
            showAlert('Video Too Large', `Video file ${file.name} exceeds the maximum size of ${MAX_VIDEO_SIZE_MB} MB.`);
            continue;
          }
          const fileUrl = await uploadFile(file);
          const fileType = file.mimeType || (file.uri?.match(/\.(mp4|mov|webm)$/i) ? 'video/mp4' : 'image/jpeg');
          await supabase.from('damage_report_files').insert({
            damage_report_id: selectedReport.id,
            file_url: fileUrl,
            file_type: fileType,
            file_name: file.name || file.uri?.split('/').pop() || 'media_file',
          });
        }

        const { data, error } = await supabase
          .from('damage_reports')
          .select(`*, damage_report_files (*)`)
          .eq('id', selectedReport.id)
          .single();

        if (!error && data) {
          setSelectedReport(data);
          setDamageReports((prev) =>
            prev.map((r) => (r.id === data.id ? data : r))
          );
        }
      }
    } catch (err) {
      console.error('Error adding new files:', err.message);
      showAlert('Error', 'Could not add new files.');
    }
  };

  const takePhotoForExistingReport = async () => {
    setAddFileOptionModalVisible(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Required', 'Camera permission is required to take photos.');
        return;
      }

      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const newAsset = {
          uri: asset.uri,
          name: asset.uri.split('/').pop() || `photo_${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          size: asset.fileSize || 0,
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

        if (!error && data) {
          setSelectedReport(data);
          setDamageReports((prev) =>
            prev.map((r) => (r.id === data.id ? data : r))
          );
        }
      }
    } catch (err) {
      console.error('Error adding photo:', err.message);
      showAlert('Error', 'Could not add new photo.');
    }
  };

  const handleDeleteFile = async (file) => {
    try {
      const { error } = await supabase
        .from('damage_report_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;

      try {
        const filePath = file.file_url.split('/').pop();
        await supabase.storage.from('damage_photos').remove([`damage_reports/${filePath}`]);
      } catch (storageErr) {
        console.warn('Storage delete notice:', storageErr);
      }

      const { data, error: fetchError } = await supabase
        .from('damage_reports')
        .select(`*, damage_report_files (*)`)
        .eq('id', selectedReport.id)
        .single();

      if (!fetchError && data) {
        setSelectedReport(data);
        setDamageReports((prev) =>
          prev.map((r) => (r.id === data.id ? data : r))
        );
      }
    } catch (err) {
      console.error('Error deleting file:', err.message);
      showAlert('Error', 'Could not delete file.');
    }
  };

  const handleDeleteReport = (reportId) => {
    showAlert(
      'Delete Damage Report',
      'Are you sure you want to delete this damage report and its attached media?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('damage_report_files').delete().eq('damage_report_id', reportId);
              const { error } = await supabase.from('damage_reports').delete().eq('id', reportId);
              if (error) throw error;
              setDamageReports((prev) => prev.filter((r) => r.id !== reportId));
              if (selectedReport?.id === reportId) {
                setPhotoModalVisible(false);
                setSelectedReport(null);
              }
              showAlert('Success', 'Damage report deleted.');
            } catch (err) {
              console.error('Error deleting report:', err.message);
              showAlert('Error', 'Could not delete report.');
            }
          },
        },
      ]
    );
  };

  const handleShowMap = (latitude, longitude) => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (isNaN(lat) || isNaN(lon)) {
      showAlert('Location Error', 'Invalid coordinates for this report');
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
      
      {/* New Report Modal - PORTAL STYLE (NO SCROLLING) */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(!modalVisible)}
      >
        <View style={styles.centeredView}>
          <View style={styles.portalModalCard}>
            {/* Header */}
            <View style={styles.portalModalHeader}>
              <Text style={styles.portalModalTitle}>New Damage Report</Text>
              <TouchableOpacity
                style={styles.closeButtonCircle}
                onPress={() => setModalVisible(!modalVisible)}
              >
                <Icon name="times" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Content - Scrollable */}
            <ScrollView
              style={styles.portalModalContent}
              contentContainerStyle={styles.portalScrollContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.fieldLabel}>Damage Description</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Describe the damage in detail..."
                placeholderTextColor="#999"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <Text style={styles.fieldLabel}>Add Photos or Videos</Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.actionButton, styles.galleryButton]} onPress={pickFiles}>
                  <Icon name="folder-open" size={16} color="#fff" />
                  <Text style={styles.buttonText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.cameraButton]} onPress={takePhoto}>
                  <Icon name="camera" size={16} color="#fff" />
                  <Text style={styles.buttonText}>Camera</Text>
                </TouchableOpacity>
              </View>

              {files.length > 0 && (
                <View>
                  <Text style={styles.fieldLabel}>Selected ({files.length})</Text>
                  <FlatList
                    data={files}
                    keyExtractor={(file) => file.uri}
                    renderItem={renderFilePreview}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    scrollEnabled={true}
                    nestedScrollEnabled={true}
                    style={styles.fileList}
                  />
                </View>
              )}
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.portalModalFooter}>
              <TouchableOpacity
                style={[styles.footerButton, styles.cancelButton]}
                onPress={() => setModalVisible(!modalVisible)}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerButton, styles.submitButton]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Photo Viewer Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={photoModalVisible}
        onRequestClose={() => setPhotoModalVisible(!photoModalVisible)}
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
        animationType="fade"
        transparent={true}
        visible={addFileOptionModalVisible}
        onRequestClose={() => setAddFileOptionModalVisible(!addFileOptionModalVisible)}
      >
        <TouchableOpacity
          style={styles.centeredView}
          activeOpacity={1}
          onPress={() => setAddFileOptionModalVisible(false)}
        >
          <View style={styles.optionCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.optionTitle}>Add Media</Text>
            <TouchableOpacity
              style={[styles.actionButton, styles.galleryButton, { marginBottom: 12 }]}
              onPress={pickFilesForExistingReport}
            >
              <Icon name="folder-open" size={16} color="#fff" />
              <Text style={styles.buttonText}>Select from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.cameraButton, { marginBottom: 12 }]}
              onPress={takePhotoForExistingReport}
            >
              <Icon name="camera" size={16} color="#fff" />
              <Text style={styles.buttonText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => setAddFileOptionModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Map Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={showMapModal}
        onRequestClose={() => setShowMapModal(false)}
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
                  showAlert('Copied!', 'Coordinates copied to clipboard.');
                }}
              >
                <Icon name="copy" size={16} color="white" />
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={styles.mapCloseButton}
            onPress={() => setShowMapModal(false)}
          >
            <Text style={styles.buttonText}>Close Map</Text>
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
  mapModalContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
  mapCloseButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: '#64748B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },

  /* ====== PORTAL-STYLE MODAL (NO SCROLLING) ====== */
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    padding: Platform.OS === 'web' ? 20 : 16,
  },
  portalModalCard: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 520 : '90%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.22)',
      },
    }),
  },
  portalModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  portalModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeButtonCircle: {
    padding: 6,
  },
  portalModalContent: {
    flex: 1,
    width: '100%',
  },
  portalScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  portalModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    flexShrink: 0,
    gap: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginTop: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    fontSize: 14,
    color: '#333',
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
    flex: 1,
  },
  galleryButton: {
    backgroundColor: '#0288D1',
  },
  cameraButton: {
    backgroundColor: '#00796B',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  fileList: {
    marginBottom: 8,
  },
  footerButton: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  cancelButton: {
    backgroundColor: '#E2E8F0',
  },
  cancelButtonText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
  submitButton: {
    backgroundColor: '#10B981',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  optionCard: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 400 : 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.22)',
      },
    }),
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    color: '#0f172a',
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
  modalView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  textStyle: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center"
  },
});

export default FieldManagerScreen;
