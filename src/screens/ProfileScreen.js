import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Image,
  Platform,
  Dimensions,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { supabase, uploadQrImage, addQrCode, getActiveQrCode, uploadProfileMedia } from '../services/supabase';
import { schedulePushNotification, registerForPushNotificationsAsync } from '../services/notificationService';
import * as Location from 'expo-location';
import LeafletMap from '../components/LeafletMap';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import PrinterSettingsModal from '../components/PrinterSettingsModal';
import { showAlert } from '../utils/alertUtils';
import { FontAwesome as Icon } from '@expo/vector-icons';

const MAX_IMAGES = 3;
const MAX_VIDEOS = 1;
const MAX_VIDEO_SIZE_MB = 50;

const ProfileScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [markerLocation, setMarkerLocation] = useState(null);
  const [mapInitialRegion, setMapInitialRegion] = useState(null);
  const [upiQrCodeUrl, setUpiQrCodeUrl] = useState(null);

  // Map Area Search & Location Picker State
  const mapRef = useRef(null);
  const debounceSearchTimer = useRef(null);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSearchSuggestions, setMapSearchSuggestions] = useState([]);
  const [selectedAreaInfo, setSelectedAreaInfo] = useState(null);
  const [autoFillAddress, setAutoFillAddress] = useState(true);

  // Profile media state: array of { uri: string, type: 'image' | 'video', isNew?: boolean }
  const [mediaList, setMediaList] = useState([]);
  const [selectedPreviewMedia, setSelectedPreviewMedia] = useState(null);

  const imageCount = mediaList.filter((m) => m.type === 'image').length;
  const videoCount = mediaList.filter((m) => m.type === 'video').length;

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    const handleNotifications = async () => {
      if (profile) {
        const token = await registerForPushNotificationsAsync();
        if (token && token !== profile.push_token) {
          const { error } = await supabase
            .from('profiles')
            .update({ push_token: token })
            .eq('id', profile.id);
          if (error) {
            console.error('Error updating push token:', error.message);
          }
        }
      }
    };
    handleNotifications();
  }, [profile]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching profile:', error.message);
          showAlert('Error', 'Failed to fetch profile.');
        } else if (data) {
          setProfile(data);
          setName(data.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '');
          setEmail(data.email || user.email || '');
          setMobile(data.mobile || '');
          setAddressLine1(data.address_line_1 || '');
          setAddressLine2(data.address_line_2 || '');
          setCity(data.city || '');
          setState(data.state || '');
          setZipCode(data.zip_code || '');
          const lat = data.latitude != null && !isNaN(Number(data.latitude)) ? Number(data.latitude) : null;
          const lon = data.longitude != null && !isNaN(Number(data.longitude)) ? Number(data.longitude) : null;
          setLatitude(lat);
          setLongitude(lon);
          if (lat != null && lon != null) {
            setMapInitialRegion({ latitude: lat, longitude: lon });
            setMarkerLocation({ latitude: lat, longitude: lon });
          }

          // Load profile media from user metadata or profile table
          let loadedMedia = [];
          if (user.user_metadata?.profile_media && Array.isArray(user.user_metadata.profile_media)) {
            loadedMedia = user.user_metadata.profile_media;
          } else if (data.media_urls) {
            try {
              loadedMedia = typeof data.media_urls === 'string' ? JSON.parse(data.media_urls) : data.media_urls;
            } catch (e) {
              loadedMedia = [];
            }
          } else if (data.avatar_url) {
            loadedMedia = [{ uri: data.avatar_url, type: 'image' }];
          }
          if (Array.isArray(loadedMedia)) {
            setMediaList(loadedMedia);
          }
        } else {
          setName(user.user_metadata?.full_name || user.user_metadata?.name || '');
          setEmail(user.email || '');
          setMobile(user.user_metadata?.mobile || '');
          if (user.user_metadata?.profile_media && Array.isArray(user.user_metadata.profile_media)) {
            setMediaList(user.user_metadata.profile_media);
          }
        }

        const activeQr = await getActiveQrCode(user.id);
        if (activeQr) {
          setUpiQrCodeUrl(activeQr.qr_image_url);
        }
      }
    } catch (err) {
      console.error('Error in fetchProfile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddImage = async () => {
    if (imageCount >= MAX_IMAGES) {
      showAlert(
        'Limit Reached',
        `You can only upload up to ${MAX_IMAGES} images. Remove an existing image to add a new one.`
      );
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showAlert('Permission Denied', 'Camera roll permissions are required to select photos.');
          return;
        }
      }

      const remainingSlots = MAX_IMAGES - imageCount;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const assetsToAdd = result.assets.slice(0, remainingSlots);
        const newImages = assetsToAdd.map((asset) => ({
          uri: asset.uri,
          type: 'image',
          isNew: true,
        }));

        setMediaList((prev) => [...prev, ...newImages]);

        if (result.assets.length > remainingSlots) {
          showAlert(
            'Limit Notice',
            `Only ${remainingSlots} image(s) added as the maximum limit is ${MAX_IMAGES} images.`
          );
        }
      }
    } catch (err) {
      console.error('Error picking images:', err);
      showAlert('Error', 'Failed to pick image.');
    }
  };

  const handleAddVideo = async () => {
    if (videoCount >= MAX_VIDEOS) {
      showAlert(
        'Limit Reached',
        `You can only upload up to ${MAX_VIDEOS} video. Remove the existing video to add a new one.`
      );
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showAlert('Permission Denied', 'Camera roll permissions are required to select videos.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
          showAlert('Video Too Large', `Video exceeds maximum size of ${MAX_VIDEO_SIZE_MB}MB.`);
          return;
        }

        setMediaList((prev) => [
          ...prev,
          {
            uri: asset.uri,
            type: 'video',
            isNew: true,
          },
        ]);
      }
    } catch (err) {
      console.error('Error picking video:', err);
      showAlert('Error', 'Failed to pick video.');
    }
  };

  const handleRemoveMedia = (indexToRemove) => {
    setMediaList((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleUpdateProfile = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        showAlert('Error', 'No authenticated user found. Please log in again.');
        setSaving(false);
        return;
      }

      // 1. Upload any newly added media to Supabase Storage
      const finalMediaList = [];
      for (const item of mediaList) {
        if (item.isNew || item.uri.startsWith('file:') || item.uri.startsWith('blob:') || item.uri.startsWith('data:')) {
          const publicUrl = await uploadProfileMedia(user.id, item.uri, item.type);
          if (publicUrl) {
            finalMediaList.push({ uri: publicUrl, type: item.type });
          } else {
            console.warn('Could not upload media item to storage:', item.uri);
            finalMediaList.push({ uri: item.uri, type: item.type });
          }
        } else {
          finalMediaList.push({ uri: item.uri, type: item.type });
        }
      }

      const firstImage = finalMediaList.find((m) => m.type === 'image');
      const avatarUrl = firstImage ? firstImage.uri : (profile?.avatar_url || null);

      const trimmedName = (name || '').trim();
      const trimmedEmail = (email || '').trim();
      const trimmedMobile = (mobile || '').trim() || null;
      const parsedLat = latitude != null && !isNaN(Number(latitude)) ? Number(latitude) : null;
      const parsedLon = longitude != null && !isNaN(Number(longitude)) ? Number(longitude) : null;

      const updates = {
        id: user.id,
        full_name: trimmedName,
        email: trimmedEmail || user.email || null,
        mobile: trimmedMobile,
        avatar_url: avatarUrl,
        address_line_1: (addressLine1 || '').trim(),
        address_line_2: (addressLine2 || '').trim(),
        city: (city || '').trim(),
        state: (state || '').trim(),
        zip_code: (zipCode || '').trim(),
        latitude: parsedLat,
        longitude: parsedLon,
        updated_at: new Date().toISOString(),
      };

      if (profile?.role) {
        updates.role = profile.role;
      }

      // Try upserting to profiles table
      const { data: updatedData, error: profileError } = await supabase
        .from('profiles')
        .upsert(updates, { onConflict: 'id' })
        .select()
        .maybeSingle();

      if (profileError) {
        console.error('Error updating profile:', profileError.message);
        showAlert('Error', `Failed to update profile: ${profileError.message}`);
        setSaving(false);
        return;
      }

      // Try updating media_urls column if present in table
      try {
        await supabase
          .from('profiles')
          .update({ media_urls: finalMediaList })
          .eq('id', user.id);
      } catch (colErr) {
        console.warn('Notice: media_urls column update:', colErr);
      }

      // 2. Update auth user metadata (name/full_name/profile_media) and email if changed
      const authUpdates = {
        data: {
          name: trimmedName,
          full_name: trimmedName,
          avatar_url: avatarUrl,
          profile_media: finalMediaList,
        },
      };

      if (trimmedEmail && trimmedEmail.toLowerCase() !== (user.email || '').toLowerCase()) {
        authUpdates.email = trimmedEmail;
      }

      try {
        const { error: userUpdateError } = await supabase.auth.updateUser(authUpdates);
        if (userUpdateError) {
          console.warn('Notice updating auth user metadata/email:', userUpdateError.message);
          if (authUpdates.email) {
            showAlert(
              'Notice',
              `Profile updated! Note: Email change to "${trimmedEmail}" requires confirmation or could not be updated (${userUpdateError.message}).`
            );
          } else {
            showAlert('Success', 'Profile updated successfully!');
          }
        } else {
          showAlert('Success', 'Profile updated successfully!');
        }
      } catch (authErr) {
        console.warn('Notice calling auth.updateUser:', authErr);
        showAlert('Success', 'Profile updated successfully!');
      }

      setMediaList(finalMediaList);
      await fetchProfile();
    } catch (err) {
      console.error('Unexpected error in handleUpdateProfile:', err);
      showAlert('Error', err.message || 'An unexpected error occurred while updating profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    showAlert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            const { error } = await supabase.auth.signOut();
            setLoading(false);
            if (error) {
              showAlert('Error', 'Failed to log out: ' + error.message);
            } else {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
              });
            }
          } catch (err) {
            setLoading(false);
            console.error('Logout error in ProfileScreen:', err);
          }
        },
      },
    ]);
  };

  const reverseGeocodeCoords = async (coords) => {
    if (!coords || coords.latitude == null || coords.longitude == null) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'NeedsTrackingApp/1.0',
            'Accept-Language': 'en',
          },
        }
      );
      const data = await res.json();
      if (data && data.display_name) {
        setSelectedAreaInfo({
          name: data.display_name.split(',')[0] || 'Selected Location',
          fullAddress: data.display_name,
          address: data.address || {},
        });
      }
    } catch (err) {
      console.warn('Reverse geocode notice:', err.message);
    }
  };

  const fetchAreaSuggestions = async (queryText) => {
    if (!queryText || queryText.trim().length === 0) {
      setMapSearchSuggestions([]);
      return;
    }
    setMapSearchLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryText.trim())}&limit=6&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'NeedsTrackingApp/1.0',
            'Accept-Language': 'en',
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      const data = await res.json();
      if (Array.isArray(data)) {
        const formatted = data
          .filter((item) => item && item.lat && item.lon)
          .map((item, idx) => ({
            id: `osm-${idx}-${item.place_id || idx}`,
            title: item.display_name ? item.display_name.split(',')[0] : 'Location Area',
            subtitle: item.display_name || '',
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
            rawAddress: item.address || {},
          }));
        setMapSearchSuggestions(formatted);
      } else {
        setMapSearchSuggestions([]);
      }
    } catch (err) {
      console.warn('Area search notice:', err.message);
      setMapSearchSuggestions([]);
    } finally {
      setMapSearchLoading(false);
    }
  };

  const handleAreaSearchChange = (text) => {
    setMapSearchQuery(text);
    if (debounceSearchTimer.current) clearTimeout(debounceSearchTimer.current);
    debounceSearchTimer.current = setTimeout(() => fetchAreaSuggestions(text), 350);
  };

  const handleSelectAreaSuggestion = (item) => {
    if (!item || !item.latitude || !item.longitude) return;
    setMapSearchQuery(item.title);
    setMapSearchSuggestions([]);
    const newCoords = { latitude: item.latitude, longitude: item.longitude };
    setMarkerLocation(newCoords);
    setSelectedAreaInfo({
      name: item.title,
      fullAddress: item.subtitle,
      address: item.rawAddress,
    });
    if (mapRef.current) {
      mapRef.current.centerOnLocation(newCoords, 16);
    }
  };

  const handleMapLocationChange = (coords) => {
    if (!coords) return;
    setMarkerLocation(coords);
    reverseGeocodeCoords(coords);
  };

  const handleUseCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeout: 4500,
        });
        if (loc?.coords) {
          const newCoords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setMarkerLocation(newCoords);
          if (mapRef.current) {
            mapRef.current.centerOnLocation(newCoords, 16);
          }
          reverseGeocodeCoords(newCoords);
        }
      } else {
        showAlert('Permission Denied', 'GPS location permission is required to detect current position.');
      }
    } catch (err) {
      console.warn('GPS location error:', err.message);
      showAlert('Notice', 'Could not obtain current GPS position.');
    }
  };

  const openLocationPicker = async () => {
    try {
      setMapSearchQuery('');
      setMapSearchSuggestions([]);
      let initLat = latitude != null && !isNaN(Number(latitude)) ? Number(latitude) : null;
      let initLon = longitude != null && !isNaN(Number(longitude)) ? Number(longitude) : null;

      if (initLat == null || initLon == null) {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          try {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
              timeout: 4000,
            });
            if (loc?.coords) {
              initLat = loc.coords.latitude;
              initLon = loc.coords.longitude;
            }
          } catch (e) {
            console.warn('GPS query fallback in ProfileScreen:', e.message);
          }
        }
      }

      const finalLat = initLat || 17.4065;
      const finalLon = initLon || 78.3998;

      setMapInitialRegion({ latitude: finalLat, longitude: finalLon });
      setMarkerLocation({ latitude: finalLat, longitude: finalLon });
      setShowLocationPicker(true);
      reverseGeocodeCoords({ latitude: finalLat, longitude: finalLon });
    } catch (error) {
      console.error('Error in openLocationPicker:', error);
      setShowLocationPicker(true);
    }
  };

  const confirmLocationSelection = () => {
    if (markerLocation && markerLocation.latitude != null && markerLocation.longitude != null) {
      setLatitude(markerLocation.latitude);
      setLongitude(markerLocation.longitude);

      if (autoFillAddress && selectedAreaInfo?.address) {
        const addr = selectedAreaInfo.address;
        const cityName = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
        const stateName = addr.state || '';
        const postcode = addr.postcode || '';
        const streetName = [addr.road, addr.neighbourhood || addr.suburb].filter(Boolean).join(', ');

        if (cityName) setCity(cityName);
        if (stateName) setState(stateName);
        if (postcode) setZipCode(postcode);
        if (streetName && (!addressLine1 || addressLine1.trim() === '')) {
          setAddressLine1(streetName);
        }
      }

      setShowLocationPicker(false);
      setMapSearchQuery('');
      setMapSearchSuggestions([]);
      showAlert(
        'Location Set',
        `Coordinates set to (${markerLocation.latitude.toFixed(4)}, ${markerLocation.longitude.toFixed(4)}). Tap "Update Profile" below to save your changes.`
      );
    } else {
      showAlert('No Location Selected', 'Please select a location on the map.');
    }
  };

  const handleUpiQrUpload = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showAlert('Permission Denied', 'Camera roll permissions are required to upload QR code.');
          return;
        }
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSaving(true);
        const imageUrl = result.assets[0].uri;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const uploadedUrl = await uploadQrImage(user.id, imageUrl);
          if (uploadedUrl) {
            await addQrCode(user.id, uploadedUrl, 'My UPI QR', true);
            setUpiQrCodeUrl(uploadedUrl);
            showAlert('Success', 'UPI QR Code uploaded successfully.');
          } else {
            showAlert('Error', 'Failed to upload QR code. Please try again.');
          }
        }
        setSaving(false);
      }
    } catch (err) {
      console.error('Error during UPI QR upload:', err);
      showAlert('Upload Failed', err.message || 'Could not pick or upload image.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  let photoIndexCounter = 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.profileHeaderBox}>
        <Text style={styles.title}>Profile</Text>
        {profile?.role && (
          <View style={[
            styles.profileRoleBadge,
            profile.role === 'seller' ? styles.roleBadgeSeller :
            profile.role === 'delivery_manager' ? styles.roleBadgeDelivery :
            styles.roleBadgeCustomer
          ]}>
            <Icon
              name={profile.role === 'seller' ? 'home' : profile.role === 'delivery_manager' ? 'truck' : 'user'}
              size={12}
              color={profile.role === 'seller' ? '#059669' : profile.role === 'delivery_manager' ? '#7C3AED' : '#0284C7'}
              style={{ marginRight: 5 }}
            />
            <Text style={[
              styles.profileRoleBadgeText,
              profile.role === 'seller' ? styles.roleBadgeTextSeller :
              profile.role === 'delivery_manager' ? styles.roleBadgeTextDelivery :
              styles.roleBadgeTextCustomer
            ]}>
              {profile.role === 'seller' ? 'Seller Account' : profile.role === 'delivery_manager' ? 'Delivery Partner' : 'Customer / Buyer'}
            </Text>
          </View>
        )}
      </View>

      {/* Media Upload Section (Max 3 Images, 1 Video) */}
      <View style={styles.mediaSectionCard}>
        <View style={styles.mediaHeaderRow}>
          <Text style={styles.sectionTitle}>Profile Photos & Video</Text>
          <Text style={styles.mediaCounterText}>
            📷 {imageCount}/{MAX_IMAGES}  •  🎥 {videoCount}/{MAX_VIDEOS}
          </Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          Upload up to {MAX_IMAGES} photos and {MAX_VIDEOS} video. Tap ✕ on any item to remove and add again.
        </Text>

        {/* Media Add Buttons */}
        <View style={styles.mediaButtonsRow}>
          <TouchableOpacity
            style={[
              styles.mediaActionBtn,
              styles.photoActionBtn,
              imageCount >= MAX_IMAGES && styles.mediaActionBtnDisabled,
            ]}
            onPress={handleAddImage}
            disabled={imageCount >= MAX_IMAGES}
          >
            <Text style={styles.mediaActionBtnText}>
              📷 Add Photo ({imageCount}/{MAX_IMAGES})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.mediaActionBtn,
              styles.videoActionBtn,
              videoCount >= MAX_VIDEOS && styles.mediaActionBtnDisabled,
            ]}
            onPress={handleAddVideo}
            disabled={videoCount >= MAX_VIDEOS}
          >
            <Text style={styles.mediaActionBtnText}>
              🎥 Add Video ({videoCount}/{MAX_VIDEOS})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Media Preview Grid / Carousel */}
        {mediaList.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mediaListContainer}
          >
            {mediaList.map((media, index) => {
              const isVideo = media.type === 'video';
              if (!isVideo) {
                photoIndexCounter += 1;
              }
              const currentPhotoNumber = photoIndexCounter;

              return (
                <View key={`media-${index}-${media.uri}`} style={styles.mediaItemWrapper}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setSelectedPreviewMedia(media)}
                    style={styles.mediaThumbnailContainer}
                  >
                    {isVideo ? (
                      <View style={styles.videoThumbnailContainer}>
                        <Video
                          source={{ uri: media.uri }}
                          style={styles.mediaThumbnail}
                          resizeMode={ResizeMode.COVER}
                          useNativeControls={false}
                          isMuted={true}
                          shouldPlay={false}
                        />
                        <View style={styles.videoPlayOverlay}>
                          <Text style={styles.videoPlayIcon}>▶</Text>
                        </View>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: media.uri }}
                        style={styles.mediaThumbnail}
                        resizeMode="cover"
                      />
                    )}

                    {/* Media Type Badge */}
                    <View style={isVideo ? styles.videoBadge : styles.photoBadge}>
                      <Text style={styles.badgeText}>
                        {isVideo ? '🎥 Video' : `📷 Photo ${currentPhotoNumber}`}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Remove Button (✕) to remove and add again */}
                  <TouchableOpacity
                    style={styles.removeMediaBtn}
                    onPress={() => handleRemoveMedia(index)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.removeMediaBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.emptyMediaBox}>
            <Text style={styles.emptyMediaIcon}>🖼️</Text>
            <Text style={styles.emptyMediaText}>No photos or video uploaded yet.</Text>
            <Text style={styles.emptyMediaSubtext}>Use the buttons above to add photos or a video.</Text>
          </View>
        )}
      </View>

      {/* UPI QR Code Section */}
      {upiQrCodeUrl && (
        <View style={styles.qrCodeContainer}>
          <Text style={styles.qrLabel}>Your UPI QR Code:</Text>
          <Image source={{ uri: upiQrCodeUrl }} style={styles.upiQrImage} />
        </View>
      )}

      <TouchableOpacity style={styles.secondaryButton} onPress={handleUpiQrUpload}>
        <Text style={styles.secondaryButtonText}>
          {upiQrCodeUrl ? 'Update UPI QR Code' : 'Upload UPI QR Code'}
        </Text>
      </TouchableOpacity>

      {/* Input Fields */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Name"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.inputLabel}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.inputLabel}>Mobile Number</Text>
        <TextInput
          style={styles.input}
          placeholder="Mobile"
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
        />

        <Text style={styles.inputLabel}>Address Line 1</Text>
        <TextInput
          style={styles.input}
          placeholder="Address Line 1"
          value={addressLine1}
          onChangeText={setAddressLine1}
        />

        <Text style={styles.inputLabel}>Address Line 2</Text>
        <TextInput
          style={styles.input}
          placeholder="Address Line 2"
          value={addressLine2}
          onChangeText={setAddressLine2}
        />

        <View style={styles.rowInputs}>
          <View style={styles.flex1}>
            <Text style={styles.inputLabel}>City</Text>
            <TextInput
              style={styles.input}
              placeholder="City"
              value={city}
              onChangeText={setCity}
            />
          </View>
          <View style={[styles.flex1, { marginLeft: 10 }]}>
            <Text style={styles.inputLabel}>State</Text>
            <TextInput
              style={styles.input}
              placeholder="State"
              value={state}
              onChangeText={setState}
            />
          </View>
        </View>

        <Text style={styles.inputLabel}>Zip / Postal Code</Text>
        <TextInput
          style={styles.input}
          placeholder="Zip Code"
          value={zipCode}
          onChangeText={setZipCode}
          keyboardType="numeric"
        />
      </View>

      <TouchableOpacity style={styles.locationButton} onPress={openLocationPicker}>
        <Text style={styles.locationButtonText}>📍 Select Location on Map</Text>
      </TouchableOpacity>
      {latitude != null && longitude != null && (
        <Text style={styles.locationText}>
          Latitude: {Number(latitude).toFixed(6)}, Longitude: {Number(longitude).toFixed(6)}
        </Text>
      )}

      {/* Update Profile Button */}
      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleUpdateProfile}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Update Profile</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.printerButton]}
        onPress={() => setShowPrinterSettings(true)}
      >
        <Text style={styles.buttonText}>Thermal Printer Settings</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => schedulePushNotification('Test Title', 'This is a test notification')}
      >
        <Text style={styles.buttonText}>Send Test Notification</Text>
      </TouchableOpacity>

      {profile && profile.role === 'admin' && (
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('AdminMap')}
        >
          <Text style={styles.buttonText}>View Delivery Managers Map</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>

      {/* Media Fullscreen Preview Modal */}
      <Modal
        visible={!!selectedPreviewMedia}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedPreviewMedia(null)}
      >
        <View style={styles.previewModalContainer}>
          <TouchableOpacity
            style={styles.previewCloseBtn}
            onPress={() => setSelectedPreviewMedia(null)}
          >
            <Text style={styles.previewCloseBtnText}>✕ Close</Text>
          </TouchableOpacity>
          {selectedPreviewMedia && (
            <View style={styles.previewMediaBox}>
              {selectedPreviewMedia.type === 'video' ? (
                <Video
                  source={{ uri: selectedPreviewMedia.uri }}
                  style={styles.fullVideo}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={true}
                />
              ) : (
                <Image
                  source={{ uri: selectedPreviewMedia.uri }}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* Printer Settings Modal */}
      <PrinterSettingsModal
        visible={showPrinterSettings}
        onClose={() => setShowPrinterSettings(false)}
      />

      {/* Interactive Map Area Search & Location Picker Modal */}
      <Modal
        visible={showLocationPicker}
        animationType="slide"
        onRequestClose={() => setShowLocationPicker(false)}
      >
        <SafeAreaView style={styles.mapModalSafeArea}>
          <View style={styles.mapModalContainer}>
            {/* Modal Header */}
            <View style={styles.mapModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mapModalTitle}>📍 Set Location on Map</Text>
                <Text style={styles.mapModalSubtitle}>
                  Search any area or drag / tap marker on the map
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowLocationPicker(false)}
                style={styles.mapModalCloseBtn}
              >
                <Icon name="times" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Map Area Search Bar */}
            <View style={styles.mapSearchContainer}>
              <View style={styles.mapSearchInputWrap}>
                <Icon name="search" size={15} color="#007AFF" style={styles.mapSearchIcon} />
                <TextInput
                  value={mapSearchQuery}
                  onChangeText={handleAreaSearchChange}
                  placeholder="Search any area, city or landmark (e.g. Madhapur)..."
                  placeholderTextColor="#94A3B8"
                  style={styles.mapSearchInput}
                  returnKeyType="search"
                />
                {mapSearchLoading && (
                  <ActivityIndicator size="small" color="#007AFF" style={{ marginRight: 8 }} />
                )}
                {mapSearchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setMapSearchQuery('');
                      setMapSearchSuggestions([]);
                    }}
                    style={styles.mapSearchClearBtn}
                  >
                    <Icon name="times-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Suggestions Dropdown */}
              {mapSearchSuggestions.length > 0 && (
                <View style={styles.mapSuggestionsListWrap}>
                  <FlatList
                    data={mapSearchSuggestions}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.mapSuggestionRow}
                        onPress={() => handleSelectAreaSuggestion(item)}
                      >
                        <View style={styles.mapSuggestionIconBox}>
                          <Icon name="map-marker" size={14} color="#007AFF" />
                        </View>
                        <View style={styles.mapSuggestionTextBox}>
                          <Text style={styles.mapSuggestionTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.mapSuggestionSubtitle} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}
            </View>

            {/* Map Container */}
            <View style={styles.mapViewBox}>
              {mapInitialRegion && (
                <LeafletMap
                  ref={mapRef}
                  initialRegion={mapInitialRegion}
                  markerCoordinate={markerLocation}
                  onMarkerDragEnd={handleMapLocationChange}
                  onMapPress={handleMapLocationChange}
                />
              )}

              {/* Floating GPS Current Location Button */}
              <TouchableOpacity
                style={styles.mapGpsButton}
                onPress={handleUseCurrentLocation}
                activeOpacity={0.85}
              >
                <Icon name="crosshairs" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>

            {/* Bottom Info & Confirmation Sheet */}
            <View style={styles.mapBottomCard}>
              <View style={styles.selectedLocationInfoRow}>
                <Icon name="map-pin" size={16} color="#007AFF" style={{ marginTop: 2, marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedLocationName} numberOfLines={1}>
                    {selectedAreaInfo?.name || "Selected Location"}
                  </Text>
                  {selectedAreaInfo?.fullAddress ? (
                    <Text style={styles.selectedLocationAddress} numberOfLines={2}>
                      {selectedAreaInfo.fullAddress}
                    </Text>
                  ) : null}
                  {markerLocation && (
                    <Text style={styles.selectedCoordsText}>
                      Coordinates: {markerLocation.latitude.toFixed(6)}, {markerLocation.longitude.toFixed(6)}
                    </Text>
                  )}
                </View>
              </View>

              {/* Auto-fill address toggle */}
              <TouchableOpacity
                style={styles.autoFillRow}
                onPress={() => setAutoFillAddress(!autoFillAddress)}
                activeOpacity={0.8}
              >
                <Icon
                  name={autoFillAddress ? "check-square" : "square-o"}
                  size={18}
                  color={autoFillAddress ? "#007AFF" : "#94A3B8"}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.autoFillText}>
                  Auto-fill City, State & Zip from this area
                </Text>
              </TouchableOpacity>

              {/* Action Buttons */}
              <View style={styles.mapModalActionRow}>
                <TouchableOpacity
                  style={styles.mapCancelBtn}
                  onPress={() => setShowLocationPicker(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.mapCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.mapConfirmBtn}
                  onPress={confirmLocationSelection}
                  activeOpacity={0.85}
                >
                  <Icon name="check" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.mapConfirmBtnText}>Set This Location</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
    color: '#1e293b',
  },
  profileHeaderBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  profileRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
    borderWidth: 1,
  },
  roleBadgeSeller: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  roleBadgeDelivery: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  roleBadgeCustomer: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  profileRoleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  roleBadgeTextSeller: {
    color: '#059669',
  },
  roleBadgeTextDelivery: {
    color: '#7C3AED',
  },
  roleBadgeTextCustomer: {
    color: '#0284C7',
  },
  mediaSectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  mediaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
  },
  mediaCounterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284c7',
  },
  mediaButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  mediaActionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionBtn: {
    backgroundColor: '#0284c7',
  },
  videoActionBtn: {
    backgroundColor: '#7c3aed',
  },
  mediaActionBtnDisabled: {
    backgroundColor: '#cbd5e1',
    opacity: 0.6,
  },
  mediaActionBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  mediaListContainer: {
    flexDirection: 'row',
    paddingVertical: 6,
    gap: 12,
  },
  mediaItemWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  mediaThumbnailContainer: {
    width: 110,
    height: 110,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  mediaThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoThumbnailContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayOverlay: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayIcon: {
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 3,
  },
  photoBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(2, 132, 199, 0.85)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(124, 58, 237, 0.85)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  removeMediaBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    zIndex: 10,
  },
  removeMediaBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  emptyMediaBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  emptyMediaIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyMediaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  emptyMediaSubtext: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  qrLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  upiQrImage: {
    width: 140,
    height: 140,
    resizeMode: 'contain',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryButtonText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  formGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14,
    color: '#1e293b',
  },
  rowInputs: {
    flexDirection: 'row',
  },
  flex1: {
    flex: 1,
  },
  locationButton: {
    backgroundColor: '#0284c7',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  locationButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  locationText: {
    fontSize: 13,
    marginBottom: 14,
    textAlign: 'center',
    color: '#475569',
  },
  button: {
    backgroundColor: '#16a34a',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  printerButton: {
    backgroundColor: '#0ea5e9',
  },
  logoutButton: {
    backgroundColor: '#dc2626',
    marginTop: 10,
  },
  previewModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 10,
  },
  previewCloseBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  previewMediaBox: {
    width: '100%',
    height: '75%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  fullVideo: {
    width: '100%',
    height: '100%',
  },
  mapModalSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mapModalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mapModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  mapModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  mapModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  mapModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  mapSearchContainer: {
    position: 'relative',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    zIndex: 50,
  },
  mapSearchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapSearchIcon: {
    marginRight: 8,
  },
  mapSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  mapSearchClearBtn: {
    padding: 4,
  },
  mapSuggestionsListWrap: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    maxHeight: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 100,
    overflow: 'hidden',
  },
  mapSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  mapSuggestionIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  mapSuggestionTextBox: {
    flex: 1,
  },
  mapSuggestionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  mapSuggestionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  mapViewBox: {
    flex: 1,
    position: 'relative',
  },
  mapGpsButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 20,
  },
  mapBottomCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 6,
  },
  selectedLocationInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  selectedLocationName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  selectedLocationAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  selectedCoordsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284C7',
    marginTop: 3,
  },
  autoFillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 10,
  },
  autoFillText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  mapModalActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mapCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  mapConfirmBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  mapConfirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default ProfileScreen;