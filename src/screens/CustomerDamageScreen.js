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

const CustomerDamageScreen = ({ navigation, route }) => {
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

      let query = supabase
        .from('damage_reports')
        .select(`
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

        let currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation(currentLocation);
      } catch (locErr) {
        console.warn('Location initialization error:', locErr);
      }
    })();
  }, []);

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
      console.error('Error picking document:', err);
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
        for (const asset of result.assets) {
          if (asset.mimeType && asset.mimeType.startsWith('video') && asset.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
            showAlert('Video Too Large', `Video file ${asset.name} exceeds the maximum size of ${MAX_VIDEO_SIZE_MB} MB.`);
            continue;
          }
          const fileUrl = await uploadFile(asset);
          const fileType = asset.mimeType || (asset.uri?.match(/\.(mp4|mov|webm)$/i) ? 'video/mp4' : 'image/jpeg');
          await supabase.from('damage_report_files').insert({
            damage_report_id: selectedReport.id,
            file_url: fileUrl,
            file_type: fileType,
            file_name: asset.name || asset.uri?.split('/').pop() || 'media_file',
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

  const renderFilePreview = ({ item, index }) => {
    const isVid = item.mimeType ? item.mimeType.startsWith('video') : item.uri?.match(/\.(mp4|mov|webm)$/i);
    return (
      <View style={styles.previewContainer}>
        {isVid ? (
          <Video
            source={{ uri: item.uri }}
            style={styles.videoPreview}
            useNativeControls
            resizeMode="contain"
            isLooping
          />
        ) : (
          <Image source={{ uri: item.uri }} style={styles.imagePreview} />
        )}
        <TouchableOpacity
          style={styles.removePreviewBtn}
          onPress={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
        >
          <Icon name="times" size={14} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderReportFile = ({ item }) => {
    const isVid = item.file_type ? item.file_type.startsWith('video') : item.file_url?.match(/\.(mp4|mov|webm)$/i);
    if (isVid) {
      return (
        <Video
          source={{ uri: item.file_url }}
          style={styles.videoPreview}
          useNativeControls
          resizeMode="contain"
          isLooping
        />
      );
    }
    return <Image source={{ uri: item.file_url }} style={styles.imagePreview} />;
  };

  const openPhotoViewer = (report) => {
    setSelectedReport(report);
    setPhotoModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.title}>Damage Reports</Text>
        <TouchableOpacity style={styles.headerAddBtn} onPress={() => setModalVisible(true)}>
          <Icon name="plus" size={16} color="#fff" />
          <Text style={styles.headerAddBtnText}>New Report</Text>
        </TouchableOpacity>
      </View>

      {fetching ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      ) : (
        <FlatList
          data={damageReports}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="check-circle" size={48} color="#4CAF50" />
              <Text style={styles.emptyTitle}>No Damage Reports</Text>
              <Text style={styles.emptySubtitle}>All clear! Tap "New Report" or the + button below to submit a new damage report.</Text>
              <TouchableOpacity style={styles.emptyActionBtn} onPress={() => setModalVisible(true)}>
                <Text style={styles.emptyActionBtnText}>+ Create Report</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const lat = Number(item.latitude);
            const lon = Number(item.longitude);
            const hasLocation =
              item.latitude != null &&
              item.longitude != null &&
              !isNaN(lat) &&
              !isNaN(lon) &&
              (lat !== 0 || lon !== 0);

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => openPhotoViewer(item)}
                style={styles.reportItem}
              >
                <View style={styles.reportHeader}>
                  <Text style={styles.reportDescription}>{item.description}</Text>
                  <TouchableOpacity
                    style={styles.deleteReportBtn}
                    onPress={() => handleDeleteReport(item.id)}
                    accessibilityLabel="Delete report"
                  >
                    <Icon name="trash-o" size={18} color="#f44336" />
                  </TouchableOpacity>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.reportDateText}>
                    <Icon name="clock-o" size={12} color="#888" /> {new Date(item.reported_at).toLocaleString()}
                  </Text>
                  {hasLocation ? (
                    <TouchableOpacity
                      onPress={() => handleShowMap(item.latitude, item.longitude)}
                      style={styles.mapIconContainer}
                      accessibilityLabel="View location on map"
                    >
                      <Icon name="map-marker" size={14} color="#007AFF" />
                      <Text style={styles.mapIconText}>View Map</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.noLocationContainer}>
                      <Icon name="map-marker" size={12} color="#999" />
                      <Text style={styles.noLocationText}>No Location</Text>
                    </View>
                  )}
                </View>

                {item.damage_report_files && item.damage_report_files.length > 0 && (
                  <FlatList
                    data={item.damage_report_files}
                    keyExtractor={(file) => file.id.toString()}
                    renderItem={renderReportFile}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filesList}
                  />
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Icon name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* New Damage Report Modal - NO SCROLLING REQUIRED */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Header - Fixed */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>New Damage Report</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setModalVisible(false)}
              >
                <Icon name="times" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Content Area - Auto-Expanding */}
            <ScrollView
              style={styles.modalContent}
              contentContainerStyle={styles.scrollViewContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={true}
            >
              <Text style={styles.fieldLabel}>Damage Description</Text>
              <TextInput
                style={styles.input}
                placeholder="Describe the damage in detail..."
                placeholderTextColor="#999"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
              />

              <Text style={styles.fieldLabel}>Attach Photos or Videos</Text>
              <View style={styles.fileSelectionContainer}>
                <TouchableOpacity style={styles.fileSelectionButton} onPress={pickFiles}>
                  <Icon name="folder-open" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.textStyle}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fileSelectionButton} onPress={takePhoto}>
                  <Icon name="camera" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.textStyle}>Take Photo</Text>
                </TouchableOpacity>
              </View>

              {files.length > 0 && (
                <View>
                  <Text style={styles.fieldLabel}>Selected Files ({files.length})</Text>
                  <FlatList
                    data={files}
                    keyExtractor={(file, index) => `${file.uri}-${index}`}
                    renderItem={renderFilePreview}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    scrollEnabled={true}
                    style={styles.filePreviewList}
                    nestedScrollEnabled={true}
                  />
                </View>
              )}
            </ScrollView>

            {/* Footer - Fixed */}
            <View style={styles.stickyFooterContainer}>
              <TouchableOpacity
                style={[styles.button, styles.buttonClose]}
                onPress={() => setModalVisible(false)}
                disabled={loading}
              >
                <Text style={styles.buttonCloseText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonSubmit]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.textStyle}>Submit Report</Text>
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
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View style={styles.photoModalContainer}>
          <View style={styles.photoViewerHeader}>
            <Text style={styles.photoViewerTitle}>
              {selectedReport ? `Report Media (${selectedReport.damage_report_files?.length || 0})` : 'Media'}
            </Text>
            <TouchableOpacity onPress={() => setPhotoModalVisible(false)} style={styles.closeHeaderBtn}>
              <Icon name="times" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={selectedReport ? selectedReport.damage_report_files : []}
            keyExtractor={(file) => file.id.toString()}
            ListEmptyComponent={
              <View style={styles.emptyPhotoContainer}>
                <Icon name="picture-o" size={60} color="#666" />
                <Text style={styles.emptyPhotoText}>No media attached to this report.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isVid = item.file_type ? item.file_type.startsWith('video') : item.file_url?.match(/\.(mp4|mov|webm)$/i);
              return (
                <View style={styles.photoViewerItem}>
                  <Text style={styles.mediaDateText}>{new Date(item.created_at).toLocaleString()}</Text>
                  {isVid ? (
                    <Video
                      source={{ uri: item.file_url }}
                      style={styles.largeVideo}
                      useNativeControls
                      resizeMode="contain"
                      isLooping
                    />
                  ) : (
                    <Image source={{ uri: item.file_url }} style={styles.largeImage} />
                  )}
                  <TouchableOpacity onPress={() => handleDeleteFile(item)} style={styles.deleteButton}>
                    <Icon name="trash" size={22} color="white" />
                  </TouchableOpacity>
                </View>
              );
            }}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
          />

          <View style={styles.photoViewerButtonContainer}>
            <TouchableOpacity onPress={handleAddNewFiles} style={styles.photoViewerButton}>
              <Icon name="plus" size={18} color="white" style={{ marginRight: 6 }} />
              <Text style={styles.textStyle}>Add Media</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPhotoModalVisible(false)} style={[styles.photoViewerButton, { backgroundColor: '#555' }]}>
              <Text style={styles.textStyle}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Media Option Dialog */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={addFileOptionModalVisible}
        onRequestClose={() => setAddFileOptionModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.optionModalCard}>
            <Text style={styles.optionModalTitle}>Add Photo or Video</Text>
            <TouchableOpacity
              style={[styles.button, styles.buttonSubmit, styles.modalFullBtn]}
              onPress={pickFilesForExistingReport}
            >
              <Icon name="folder-open" size={16} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.textStyle}>Choose from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonSubmit, styles.modalFullBtn, { backgroundColor: '#0288D1' }]}
              onPress={takePhotoForExistingReport}
            >
              <Icon name="camera" size={16} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.textStyle}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonClose, styles.modalFullBtn]}
              onPress={() => setAddFileOptionModalVisible(false)}
            >
              <Text style={styles.textStyle}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Map View Modal */}
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
                <Icon name="copy" size={14} color="white" />
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
    backgroundColor: '#f8f9fa',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  headerAddBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyActionBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  emptyActionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  reportItem: {
    padding: 16,
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reportDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    flex: 1,
    marginRight: 10,
    lineHeight: 22,
  },
  deleteReportBtn: {
    padding: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportDateText: {
    fontSize: 12,
    color: '#888',
  },
  mapIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F1FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
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
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  noLocationText: {
    color: '#999',
    fontSize: 11,
    marginLeft: 4,
  },
  filesList: {
    marginTop: 6,
  },
  imagePreview: {
    width: 90,
    height: 90,
    resizeMode: 'cover',
    marginRight: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
  },
  videoPreview: {
    width: 90,
    height: 90,
    marginRight: 8,
    backgroundColor: '#222',
    borderRadius: 8,
  },
  previewContainer: {
    position: 'relative',
    marginRight: 8,
  },
  removePreviewBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 24,
    backgroundColor: '#007AFF',
    borderRadius: 28,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },

  /* ====== OPTIMIZED MODAL STYLES - NO SCROLL ====== */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Platform.OS === 'web' ? 20 : 16,
    paddingHorizontal: Platform.OS === 'web' ? 20 : 16,
  },

  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 620 : '95%',
    maxHeight: Platform.OS === 'web' ? '85vh' : '85%',
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

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
    flexShrink: 0,
  },

  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },

  modalCloseBtn: {
    padding: 6,
  },

  /* Content Area - Auto-Expanding with Internal Scroll */
  modalContent: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },

  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginTop: 6,
  },

  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
    backgroundColor: '#fafafa',
    width: '100%',
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 15,
    color: '#333',
  },

  fileSelectionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
    gap: 8,
  },

  fileSelectionButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },

  filePreviewList: {
    maxHeight: 140,
    marginVertical: 10,
  },

  /* Footer - Fixed at Bottom */
  stickyFooterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    flexShrink: 0,
    gap: 12,
  },

  buttonCloseText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 15,
  },

  /* Buttons */
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flex: 1,
  },

  buttonSubmit: {
    backgroundColor: '#4CAF50',
  },

  buttonClose: {
    backgroundColor: '#888',
  },

  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
    textAlign: 'center',
  },

  modalView: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
  },

  modalText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#1a1a1a',
  },

  photoModalContainer: {
    flex: 1,
    backgroundColor: '#111',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
  },

  photoViewerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  photoViewerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  closeHeaderBtn: {
    padding: 8,
  },

  emptyPhotoContainer: {
    width: width,
    height: height - 250,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyPhotoText: {
    color: '#aaa',
    fontSize: 16,
    marginTop: 12,
  },

  photoViewerItem: {
    width: width,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },

  mediaDateText: {
    color: '#ccc',
    fontSize: 13,
    marginBottom: 10,
  },

  largeImage: {
    width: width - 20,
    height: height - 260,
    resizeMode: 'contain',
  },

  largeVideo: {
    width: width - 20,
    height: height - 260,
  },

  deleteButton: {
    position: 'absolute',
    top: 16,
    right: 24,
    backgroundColor: 'rgba(244, 67, 54, 0.85)',
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  photoViewerButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 10,
  },

  photoViewerButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
  },

  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    padding: Platform.OS === 'web' ? 20 : 16,
  },

  optionModalCard: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 440 : 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    maxHeight: '85%',
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

  optionModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#222',
  },

  modalFullBtn: {
    width: '100%',
    marginBottom: 12,
  },

  mapModalContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },

  map: {
    flex: 1,
    width: '100%',
  },

  mapCloseButton: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: 160,
    backgroundColor: '#333',
    borderRadius: 25,
  },

  coordsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    alignSelf: 'center',
    zIndex: 100,
  },

  coordsText: {
    color: 'white',
    fontSize: 13,
    marginRight: 10,
  },

  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },

  copyButtonText: {
    color: 'white',
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
  },
});

export default CustomerDamageScreen;
