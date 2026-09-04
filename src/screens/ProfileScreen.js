import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Switch,
} from 'react-native';
import {
  supabase,
  uploadQrImage,
  addQrCode,
  updateQrCode,
  getActiveQrCode,
  uploadProfileMedia,
  setSellerProductsActiveStatus,
  setAllProductsActiveStatus,
  setSellerStoreActiveStatus,
  setAllStoresActiveStatus,
  extractStoreSettings,
  embedStoreSettings,
} from '../services/supabase';
import { schedulePushNotification, registerForPushNotificationsAsync } from '../services/notificationService';
import * as Location from 'expo-location';
import LeafletMap from '../components/LeafletMap';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import PrinterSettingsModal from '../components/PrinterSettingsModal';
import { showAlert } from '../utils/alertUtils';
import { FontAwesome as Icon } from '@expo/vector-icons';
import {
  getVoiceSettings,
  saveVoiceSettings,
  testVoiceAnnouncement,
} from '../services/speechService';

const MAX_IMAGES = 3;
const MAX_VIDEOS = 1;
const MAX_VIDEO_SIZE_MB = 50;

const ProfileScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
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
  const [upiId, setUpiId] = useState('');
  const [savingUpiId, setSavingUpiId] = useState(false);

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

  // Store & Product Active Visibility Controls (Seller & AppAdmin)
  // By default, sellers are inactive (false) until explicitly activated
  const [isStoreActive, setIsStoreActive] = useState(false);
  const [isMapActive, setIsMapActive] = useState(false);
  const [isProductViewActive, setIsProductViewActive] = useState(false);
  const [sellerProducts, setSellerProducts] = useState([]);
  const [productStats, setProductStats] = useState({ total: 0, active: 0 });
  const [togglingStatus, setTogglingStatus] = useState(false);

  // AppAdmin / Superadmin Multi-User Controls State
  const [adminSellersList, setAdminSellersList] = useState([]);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminGlobalStoreActive, setAdminGlobalStoreActive] = useState(false);
  const [adminGlobalProductsActive, setAdminGlobalProductsActive] = useState(false);

  // Voice Announcement Settings State (Male / Female)
  const [voiceGender, setVoiceGender] = useState('female');
  const [testingVoice, setTestingVoice] = useState(false);

  useEffect(() => {
    fetchProfile();
    loadVoicePreference();
  }, []);

  const loadVoicePreference = async () => {
    try {
      const v = await getVoiceSettings();
      if (v?.gender) {
        setVoiceGender(v.gender);
      }
    } catch (_) {}
  };

  const handleSelectVoiceGender = async (gender) => {
    try {
      setVoiceGender(gender);
      await saveVoiceSettings({ gender });
      showAlert('Voice Updated', `${gender === 'male' ? 'Male' : 'Female'} voice set for order announcements.`);
    } catch (err) {
      console.warn('Error saving voice preference:', err);
    }
  };

  const handleTestVoice = async () => {
    setTestingVoice(true);
    try {
      await testVoiceAnnouncement(voiceGender);
    } catch (err) {
      console.warn('Test voice error:', err);
    } finally {
      setTimeout(() => setTestingVoice(false), 1400);
    }
  };

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

  const fetchAdminSellersList = async () => {
    setAdminLoading(true);
    try {
      const { data: profs, error: profsErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, mobile, role, city, address_line_1, media_urls');

      if (profsErr) {
        console.warn('Admin profs error:', profsErr.message);
      }

      let allProds = [];
      try {
        const { data: pData } = await supabase
          .from('products')
          .select('id, user_id, customer_id, product_name, is_active');
        if (pData && Array.isArray(pData)) {
          allProds = pData;
        }
      } catch (pErr) {
        console.warn('Admin prods error:', pErr.message);
      }

      const prodMap = {};
      allProds.forEach((p) => {
        const uId = p.user_id || p.customer_id;
        if (uId) {
          if (!prodMap[uId]) prodMap[uId] = { total: 0, active: 0 };
          prodMap[uId].total += 1;
          if (p.is_active === true) prodMap[uId].active += 1;
        }
      });

      const sellers = (profs || [])
        .filter((p) => {
          const r = (p.role || '').toLowerCase();
          return r === 'seller' || r === 'admin' || r === 'superadmin' || r === 'appadmin' || r === 'app_admin' || (prodMap[p.id] && prodMap[p.id].total > 0);
        })
        .map((p) => {
          const st = extractStoreSettings(p.media_urls);
          const pStat = prodMap[p.id] || { total: 0, active: 0 };
          return {
            id: p.id,
            full_name: p.full_name || p.email?.split('@')[0] || 'Store',
            email: p.email || '',
            mobile: p.mobile || '',
            role: p.role || 'seller',
            city: p.city || p.address_line_1 || 'Local Store',
            media_urls: p.media_urls,
            is_store_active: st.is_store_active === true,
            is_map_active: st.is_map_active === true,
            is_product_active: pStat.total > 0 ? pStat.active > 0 : st.is_product_active === true,
            productCount: pStat.total,
            activeProductCount: pStat.active,
          };
        });

      setAdminSellersList(sellers);
    } catch (err) {
      console.error('Error fetching admin sellers list:', err);
    } finally {
      setAdminLoading(false);
    }
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user || null);

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

          // Extract Store & Product Active Settings
          let storeSettings = extractStoreSettings(data.media_urls);
          const hasSettingsInMedia = Array.isArray(data.media_urls)
            ? data.media_urls.some((m) => m && m.type === 'store_settings')
            : (typeof data.media_urls === 'string' && data.media_urls.includes('store_settings'));
          if (!hasSettingsInMedia && user.user_metadata?.store_settings) {
            storeSettings = extractStoreSettings(user.user_metadata.store_settings);
          }
          setIsStoreActive(storeSettings.is_store_active);
          setIsMapActive(storeSettings.is_map_active);
          setIsProductViewActive(storeSettings.is_product_active);

          // Load profile media from user metadata or profile table (filtering out internal settings objects)
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
            const cleanMedia = loadedMedia.filter(
              (m) => m && m.type !== 'store_settings' && m.uri && typeof m.uri === 'string' && m.uri.trim().length > 0
            );
            setMediaList(cleanMedia);
          }
        } else {
          setName(user.user_metadata?.full_name || user.user_metadata?.name || '');
          setEmail(user.email || '');
          setMobile(user.user_metadata?.mobile || '');
          if (user.user_metadata?.store_settings) {
            const storeSettings = extractStoreSettings(user.user_metadata.store_settings);
            setIsStoreActive(storeSettings.is_store_active);
            setIsMapActive(storeSettings.is_map_active);
            setIsProductViewActive(storeSettings.is_product_active);
          }
          if (user.user_metadata?.profile_media && Array.isArray(user.user_metadata.profile_media)) {
            const cleanMedia = user.user_metadata.profile_media.filter(
              (m) => m && m.type !== 'store_settings' && m.uri && typeof m.uri === 'string' && m.uri.trim().length > 0
            );
            setMediaList(cleanMedia);
          }
        }

        // Fetch seller products and calculate active/total counts
        try {
          const { data: prods } = await supabase
            .from('products')
            .select('id, product_name, is_active, amount, product_type')
            .eq('user_id', user.id);
          if (prods && Array.isArray(prods)) {
            setSellerProducts(prods);
            const activeCount = prods.filter((p) => p.is_active === true).length;
            setProductStats({ total: prods.length, active: activeCount });
            if (prods.length > 0) {
              setIsProductViewActive(activeCount > 0);
            }
          }
        } catch (prodErr) {
          console.warn('Error loading seller products in profile:', prodErr.message);
        }

        // If user is Admin or Superadmin, fetch all sellers list
        const currentRole = (data?.role || data?.user_type || user.user_metadata?.role || user.user_metadata?.user_type || '').toLowerCase();
        if (currentRole === 'admin' || currentRole === 'superadmin' || currentRole === 'appadmin' || currentRole === 'app_admin') {
          fetchAdminSellersList();
        }

        const activeQr = await getActiveQrCode(user.id);
        if (activeQr) {
          setUpiQrCodeUrl(activeQr.qr_image_url);
          if (activeQr.name && activeQr.name.includes('@')) {
            setUpiId(activeQr.name);
          }
        }
        if (user.user_metadata?.upi_id) {
          setUpiId(user.user_metadata.upi_id);
        } else if (data?.upi_id) {
          setUpiId(data.upi_id);
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

  // Seller toggle: Store Active (Open / Closed)
  const handleToggleMyStore = async (newVal) => {
    setIsStoreActive(newVal);
    setTogglingStatus(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await setSellerStoreActiveStatus(user.id, {
          is_store_active: newVal,
          is_map_active: isMapActive,
          is_product_active: isProductViewActive,
          existingMedia: mediaList,
        });

        setMediaList((prev) => (prev || []).filter((m) => m && m.type !== 'store_settings'));

        try {
          await supabase.auth.updateUser({
            data: {
              store_settings: {
                is_store_active: newVal,
                is_map_active: isMapActive,
                is_product_active: isProductViewActive,
              },
            },
          });
        } catch (_) {}
      }
      showAlert(
        'Store Status Updated',
        newVal
          ? '🟢 Your store is now ACTIVE and visible on the map and directory.'
          : '🔴 Your store is now INACTIVE / CLOSED. Buyers will see your store is closed.'
      );
    } catch (e) {
      console.error('Error toggling store status:', e);
      setIsStoreActive(!newVal);
      showAlert('Error', 'Failed to update store status: ' + (e.message || ''));
    } finally {
      setTogglingStatus(false);
    }
  };

  // Seller toggle: Product View Active (Activate / Deactivate All Products)
  const handleToggleMyProducts = async (newVal) => {
    setIsProductViewActive(newVal);
    setTogglingStatus(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await setSellerProductsActiveStatus(user.id, newVal);
        setSellerProducts((prev) => prev.map((p) => ({ ...p, is_active: newVal })));
        setProductStats((prev) => ({ ...prev, active: newVal ? prev.total : 0 }));

        await setSellerStoreActiveStatus(user.id, {
          is_store_active: isStoreActive,
          is_map_active: isMapActive,
          is_product_active: newVal,
          existingMedia: mediaList,
        });

        setMediaList((prev) => (prev || []).filter((m) => m && m.type !== 'store_settings'));

        try {
          await supabase.auth.updateUser({
            data: {
              store_settings: {
                is_store_active: isStoreActive,
                is_map_active: isMapActive,
                is_product_active: newVal,
              },
            },
          });
        } catch (_) {}

        showAlert(
          'Product View Updated',
          newVal
            ? `🟢 All ${productStats.total} products are now ACTIVE and visible in catalog.`
            : `🔴 All ${productStats.total} products are now INACTIVE (hidden from buyers).`
        );
      }
    } catch (e) {
      console.error('Error toggling products:', e);
      setIsProductViewActive(!newVal);
      showAlert('Error', 'Failed to update product visibility.');
    } finally {
      setTogglingStatus(false);
    }
  };

  // Seller toggle: Map Pin Visibility
  const handleToggleMyMap = async (newVal) => {
    setIsMapActive(newVal);
    setTogglingStatus(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await setSellerStoreActiveStatus(user.id, {
          is_store_active: isStoreActive,
          is_map_active: newVal,
          is_product_active: isProductViewActive,
          existingMedia: mediaList,
        });

        setMediaList((prev) => (prev || []).filter((m) => m && m.type !== 'store_settings'));

        try {
          await supabase.auth.updateUser({
            data: {
              store_settings: {
                is_store_active: isStoreActive,
                is_map_active: newVal,
                is_product_active: isProductViewActive,
              },
            },
          });
        } catch (_) {}
      }
      showAlert(
        'Map Visibility Updated',
        newVal
          ? '📍 Your store pin is now SHOWN on the interactive sellers map.'
          : '🚫 Your store pin is now HIDDEN from the interactive sellers map.'
      );
    } catch (e) {
      console.error('Error toggling map visibility:', e);
      setIsMapActive(!newVal);
    } finally {
      setTogglingStatus(false);
    }
  };

  // AppAdmin / Superadmin: Toggle single seller's store active status
  const handleAdminToggleSellerStore = async (sellerId, newVal) => {
    setAdminSellersList((prev) =>
      prev.map((s) => (s.id === sellerId ? { ...s, is_store_active: newVal === true } : s))
    );
    try {
      const targetSeller = adminSellersList.find((s) => s.id === sellerId);
      await setSellerStoreActiveStatus(sellerId, {
        is_store_active: newVal === true,
        is_map_active: targetSeller?.is_map_active === true,
        is_product_active: targetSeller?.is_product_active === true,
        existingMedia: targetSeller?.media_urls,
      });
      showAlert(
        'Admin Action',
        `Store status for "${targetSeller?.full_name || 'Seller'}" set to ${newVal ? 'Active (Open)' : 'Inactive (Closed)'}.`
      );
    } catch (err) {
      console.error('Error updating seller store by admin:', err);
    }
  };

  // AppAdmin / Superadmin: Toggle single seller's products active status
  const handleAdminToggleSellerProducts = async (sellerId, newVal) => {
    setAdminSellersList((prev) =>
      prev.map((s) =>
        s.id === sellerId
          ? { ...s, is_product_active: newVal === true, activeProductCount: newVal ? s.productCount : 0 }
          : s
      )
    );
    try {
      await setSellerProductsActiveStatus(sellerId, newVal);
      const targetSeller = adminSellersList.find((s) => s.id === sellerId);
      await setSellerStoreActiveStatus(sellerId, {
        is_store_active: targetSeller?.is_store_active === true,
        is_map_active: targetSeller?.is_map_active === true,
        is_product_active: newVal === true,
        existingMedia: targetSeller?.media_urls,
      });
      showAlert(
        'Admin Action',
        `All products for "${targetSeller?.full_name || 'Seller'}" set to ${newVal ? 'Active' : 'Inactive'}.`
      );
    } catch (err) {
      console.error('Error updating seller products by admin:', err);
    }
  };

  // AppAdmin / Superadmin: Toggle single seller's map visibility
  const handleAdminToggleSellerMap = async (sellerId, newVal) => {
    setAdminSellersList((prev) =>
      prev.map((s) => (s.id === sellerId ? { ...s, is_map_active: newVal === true } : s))
    );
    try {
      const targetSeller = adminSellersList.find((s) => s.id === sellerId);
      await setSellerStoreActiveStatus(sellerId, {
        is_store_active: targetSeller?.is_store_active === true,
        is_map_active: newVal === true,
        is_product_active: targetSeller?.is_product_active === true,
        existingMedia: targetSeller?.media_urls,
      });
      showAlert(
        'Admin Action',
        `Map visibility for "${targetSeller?.full_name || 'Seller'}" set to ${newVal ? 'Shown on Map' : 'Hidden from Map'}.`
      );
    } catch (err) {
      console.error('Error updating seller map by admin:', err);
    }
  };

  // AppAdmin / Superadmin: Global Activate / Deactivate All Stores
  const handleAdminGlobalToggleStores = async (newVal) => {
    setAdminGlobalStoreActive(newVal === true);
    setAdminSellersList((prev) =>
      prev.map((s) => ({ ...s, is_store_active: newVal === true, is_map_active: newVal === true }))
    );
    try {
      await setAllStoresActiveStatus(newVal === true, adminSellersList);
      showAlert(
        'Admin Action',
        `All stores across the platform set to ${newVal ? 'ACTIVE (Visible on Map & Directory)' : 'INACTIVE (Hidden)'}.`
      );
    } catch (e) {
      console.error('Error in global store toggle:', e);
    }
  };

  // AppAdmin / Superadmin: Global Activate / Deactivate All Products
  const handleAdminGlobalToggleProducts = async (newVal) => {
    setAdminGlobalProductsActive(newVal === true);
    setAdminSellersList((prev) =>
      prev.map((s) => ({
        ...s,
        is_product_active: newVal === true,
        activeProductCount: newVal ? s.productCount : 0,
      }))
    );
    try {
      await setAllProductsActiveStatus(newVal === true);
      showAlert(
        'Admin Action',
        `All products across all sellers set to ${newVal ? 'ACTIVE' : 'INACTIVE'}.`
      );
    } catch (e) {
      console.error('Error in global products toggle:', e);
    }
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
        if (item.type === 'store_settings') continue;
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

      // Embed store settings into final media array for profiles
      const finalMediaWithSettings = embedStoreSettings(finalMediaList, {
        is_store_active: isStoreActive,
        is_map_active: isMapActive,
        is_product_active: isProductViewActive,
      });

      // Try updating media_urls column if present in table
      try {
        await supabase
          .from('profiles')
          .update({ media_urls: finalMediaWithSettings })
          .eq('id', user.id);
      } catch (colErr) {
        console.warn('Notice: media_urls column update:', colErr);
      }

      // Also call setSellerStoreActiveStatus to ensure RPC is invoked
      try {
        await setSellerStoreActiveStatus(user.id, {
          is_store_active: isStoreActive,
          is_map_active: isMapActive,
          is_product_active: isProductViewActive,
          existingMedia: finalMediaList,
        });
      } catch (stErr) {
        console.warn('Notice: setSellerStoreActiveStatus:', stErr);
      }

      // 2. Update auth user metadata (name/full_name/profile_media/store_settings/upi_id) and email if changed
      const authUpdates = {
        data: {
          name: trimmedName,
          full_name: trimmedName,
          avatar_url: avatarUrl,
          profile_media: finalMediaList,
          upi_id: (upiId || '').trim(),
          store_settings: {
            is_store_active: isStoreActive,
            is_map_active: isMapActive,
            is_product_active: isProductViewActive,
          },
        },
      };

      if (upiId && upiId.trim().includes('@')) {
        try {
          const activeQr = await getActiveQrCode(user.id);
          if (activeQr) {
            await updateQrCode(activeQr.id, upiId.trim(), true);
          }
        } catch (qrSyncErr) {
          console.warn('Notice syncing QR code name:', qrSyncErr);
        }
      }

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
            const qrName = upiId.trim() || 'My UPI QR';
            await addQrCode(user.id, uploadedUrl, qrName, true);
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

  const handleSaveUpiId = async () => {
    const trimmed = upiId.trim();
    if (!trimmed) {
      showAlert('Invalid UPI ID', 'Please enter a valid UPI ID (e.g., yourname@okaxis or 9876543210@upi)');
      return;
    }
    if (!trimmed.includes('@')) {
      showAlert('Invalid UPI ID', 'A valid UPI ID must include "@" (e.g. mobile@upi or username@okhdfcbank)');
      return;
    }
    try {
      setSavingUpiId(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showAlert('Error', 'User not authenticated.');
        return;
      }

      // Update user metadata with UPI ID
      await supabase.auth.updateUser({
        data: { upi_id: trimmed },
      });

      // Try updating profiles table if column exists
      try {
        await supabase
          .from('profiles')
          .update({ upi_id: trimmed })
          .eq('id', user.id);
      } catch (err) {
        // column may not exist in profiles table
      }

      // Sync with active QR code in user_qr_codes
      const activeQr = await getActiveQrCode(user.id);
      if (activeQr) {
        await updateQrCode(activeQr.id, trimmed, true);
      } else {
        // Generate dynamic QR code URL for this UPI ID
        const dynamicQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
          `upi://pay?pa=${trimmed}&pn=${encodeURIComponent(name.trim() || 'Store')}&cu=INR`
        )}`;
        await addQrCode(user.id, dynamicQrUrl, trimmed, true);
        setUpiQrCodeUrl(dynamicQrUrl);
      }

      showAlert('Success', 'UPI ID saved successfully! Customers will now see dynamic UPI QR code with their exact order bill amount at checkout.');
    } catch (err) {
      console.error('Error saving UPI ID:', err);
      showAlert('Error', err.message || 'Failed to save UPI ID.');
    } finally {
      setSavingUpiId(false);
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

  const userRole = (
    profile?.role ||
    profile?.user_type ||
    currentUser?.user_metadata?.role ||
    currentUser?.user_metadata?.user_type ||
    ''
  ).toLowerCase().trim();
  const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRole === 'appadmin' || userRole === 'app_admin';
  const isSeller = userRole === 'seller' || isAdmin || (sellerProducts && sellerProducts.length > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.profileHeaderBox}>
        <Text style={styles.title}>Profile</Text>
        {(profile?.role || profile?.user_type || isAdmin) && (
          <View style={[
            styles.profileRoleBadge,
            isAdmin ? styles.roleBadgeAdmin :
            userRole === 'seller' ? styles.roleBadgeSeller :
            userRole === 'delivery_manager' ? styles.roleBadgeDelivery :
            styles.roleBadgeCustomer
          ]}>
            <Icon
              name={isAdmin ? 'shield' : userRole === 'seller' ? 'home' : userRole === 'delivery_manager' ? 'truck' : 'user'}
              size={12}
              color={isAdmin ? '#D97706' : userRole === 'seller' ? '#059669' : userRole === 'delivery_manager' ? '#7C3AED' : '#0284C7'}
              style={{ marginRight: 5 }}
            />
            <Text style={[
              styles.profileRoleBadgeText,
              isAdmin ? styles.roleBadgeTextAdmin :
              userRole === 'seller' ? styles.roleBadgeTextSeller :
              userRole === 'delivery_manager' ? styles.roleBadgeTextDelivery :
              styles.roleBadgeTextCustomer
            ]}>
              {isAdmin ? (userRole === 'superadmin' ? 'Superadmin' : 'App Admin') : userRole === 'seller' ? 'Seller Account' : userRole === 'delivery_manager' ? 'Delivery Partner' : 'Customer / Buyer'}
            </Text>
          </View>
        )}
      </View>

      {/* SELLER: Store & Product Active Visibility Controls */}
      {isSeller && (
        <View style={styles.storeControlCard}>
          <View style={styles.storeControlHeader}>
            <View style={styles.storeControlTitleRow}>
              <View style={[styles.storeIconCircle, { backgroundColor: isStoreActive ? '#ECFDF5' : '#FEF2F2' }]}>
                <Icon
                  name={isStoreActive ? 'shopping-bag' : 'pause-circle'}
                  size={18}
                  color={isStoreActive ? '#10B981' : '#EF4444'}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.storeControlTitle}>Store & Product Visibility</Text>
                <Text style={styles.storeControlSub}>
                  Control whether your store & catalog are active on the map for buyers
                </Text>
              </View>
            </View>

            {/* Quick Status Pill */}
            <View style={[styles.statusPill, isStoreActive ? styles.statusPillActive : styles.statusPillInactive]}>
              <View style={[styles.statusDot, { backgroundColor: isStoreActive ? '#10B981' : '#EF4444' }]} />
              <Text style={[styles.statusPillText, { color: isStoreActive ? '#065F46' : '#991B1B' }]}>
                {isStoreActive ? 'STORE OPEN / ACTIVE' : 'STORE CLOSED / INACTIVE'}
              </Text>
            </View>
          </View>

          {/* Toggle 1: Store Active / Inactive */}
          <TouchableOpacity
            style={styles.toggleRow}
            activeOpacity={0.7}
            onPress={() => !togglingStatus && handleToggleMyStore(!isStoreActive)}
          >
            <View style={styles.toggleLabelCol}>
              <View style={styles.toggleTitleInline}>
                <Icon name="home" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                <Text style={styles.toggleTitle}>Store Active Status</Text>
              </View>
              <Text style={styles.toggleDesc}>
                {isStoreActive
                  ? 'Your store is live. Buyers can discover your store on the map and view your catalog.'
                  : 'Your store is closed/inactive. Buyers cannot place orders or view inactive listings.'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {togglingStatus && (
                <ActivityIndicator size="small" color="#10B981" style={{ marginRight: 8 }} />
              )}
              <Switch
                value={isStoreActive}
                onValueChange={handleToggleMyStore}
                trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                thumbColor={isStoreActive ? '#10B981' : '#F1F5F9'}
                disabled={togglingStatus}
              />
            </View>
          </TouchableOpacity>

          {/* Toggle 2: Product View (Activate/Deactivate All Products) */}
          <TouchableOpacity
            style={styles.toggleRow}
            activeOpacity={0.7}
            onPress={() => !togglingStatus && handleToggleMyProducts(!isProductViewActive)}
          >
            <View style={styles.toggleLabelCol}>
              <View style={styles.toggleTitleInline}>
                <Icon name="cubes" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                <Text style={styles.toggleTitle}>
                  Product Catalog View ({productStats.active}/{productStats.total} Active)
                </Text>
              </View>
              <Text style={styles.toggleDesc}>
                {isProductViewActive
                  ? 'Products are active and visible in the buyer catalog.'
                  : 'All products are currently paused/inactive.'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {togglingStatus && (
                <ActivityIndicator size="small" color="#007AFF" style={{ marginRight: 8 }} />
              )}
              <Switch
                value={isProductViewActive}
                onValueChange={handleToggleMyProducts}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={isProductViewActive ? '#007AFF' : '#F1F5F9'}
                disabled={togglingStatus}
              />
            </View>
          </TouchableOpacity>

          {/* Toggle 3: Map Visibility */}
          <TouchableOpacity
            style={[styles.toggleRow, { borderBottomWidth: 0 }]}
            activeOpacity={0.7}
            onPress={() => !togglingStatus && handleToggleMyMap(!isMapActive)}
          >
            <View style={styles.toggleLabelCol}>
              <View style={styles.toggleTitleInline}>
                <Icon name="map-marker" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                <Text style={styles.toggleTitle}>Show Pin on Map</Text>
              </View>
              <Text style={styles.toggleDesc}>
                {isMapActive
                  ? 'Store location pin is shown on the interactive map.'
                  : 'Store location pin is hidden from the interactive map.'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {togglingStatus && (
                <ActivityIndicator size="small" color="#8B5CF6" style={{ marginRight: 8 }} />
              )}
              <Switch
                value={isMapActive}
                onValueChange={handleToggleMyMap}
                trackColor={{ false: '#CBD5E1', true: '#C084FC' }}
                thumbColor={isMapActive ? '#8B5CF6' : '#F1F5F9'}
                disabled={togglingStatus}
              />
            </View>
          </TouchableOpacity>

          {/* Quick Action Buttons */}
          <View style={styles.storeQuickActionsRow}>
            <TouchableOpacity
              style={[styles.storeQuickBtn, styles.storeQuickBtnActive, togglingStatus && { opacity: 0.6 }]}
              disabled={togglingStatus}
              onPress={async () => {
                setTogglingStatus(true);
                try {
                  setIsStoreActive(true);
                  setIsMapActive(true);
                  setIsProductViewActive(true);
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    await setSellerProductsActiveStatus(user.id, true);
                    setSellerProducts((prev) => (prev || []).map((p) => ({ ...p, is_active: true })));
                    setProductStats((prev) => ({ ...prev, active: prev.total }));
                    await setSellerStoreActiveStatus(user.id, {
                      is_store_active: true,
                      is_map_active: true,
                      is_product_active: true,
                      existingMedia: mediaList,
                    });
                    setMediaList((prev) => (prev || []).filter((m) => m && m.type !== 'store_settings'));
                    try {
                      await supabase.auth.updateUser({
                        data: {
                          store_settings: {
                            is_store_active: true,
                            is_map_active: true,
                            is_product_active: true,
                          },
                        },
                      });
                    } catch (_) {}
                  }
                  showAlert('Store Activated', '🟢 Store, catalog, and map pin are now ACTIVE!');
                } catch (e) {
                  console.error('Error activating all:', e);
                  showAlert('Error', 'Failed to activate store and products.');
                } finally {
                  setTogglingStatus(false);
                }
              }}
            >
              <Icon name="check-circle" size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={styles.storeQuickBtnTextActive}>Activate All</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.storeQuickBtn, styles.storeQuickBtnInactive, togglingStatus && { opacity: 0.6 }]}
              disabled={togglingStatus}
              onPress={async () => {
                setTogglingStatus(true);
                try {
                  setIsStoreActive(false);
                  setIsProductViewActive(false);
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    await setSellerProductsActiveStatus(user.id, false);
                    setSellerProducts((prev) => (prev || []).map((p) => ({ ...p, is_active: false })));
                    setProductStats((prev) => ({ ...prev, active: 0 }));
                    await setSellerStoreActiveStatus(user.id, {
                      is_store_active: false,
                      is_map_active: isMapActive,
                      is_product_active: false,
                      existingMedia: mediaList,
                    });
                    setMediaList((prev) => (prev || []).filter((m) => m && m.type !== 'store_settings'));
                    try {
                      await supabase.auth.updateUser({
                        data: {
                          store_settings: {
                            is_store_active: false,
                            is_map_active: isMapActive,
                            is_product_active: false,
                          },
                        },
                      });
                    } catch (_) {}
                  }
                  showAlert('Store Deactivated', '🔴 Store and catalog are now INACTIVE / CLOSED.');
                } catch (e) {
                  console.error('Error deactivating all:', e);
                  showAlert('Error', 'Failed to deactivate store and products.');
                } finally {
                  setTogglingStatus(false);
                }
              }}
            >
              <Icon name="pause-circle" size={13} color="#EF4444" style={{ marginRight: 5 }} />
              <Text style={styles.storeQuickBtnTextInactive}>Deactivate All</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* APP ADMIN / SUPERADMIN: Global Master Controls & Multi-Seller Store Management */}
      {isAdmin && (
        <View style={styles.adminMasterCard}>
          <View style={styles.adminHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={styles.adminCrownBox}>
                <Icon name="shield" size={18} color="#D97706" />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.adminCardTitle}>Superadmin & Admin: Seller Controls</Text>
                <Text style={styles.adminCardSub}>
                  Only Superadmin or Admin can activate/deactivate sellers for Map & Directory (Default Inactive)
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.adminRefreshBtn}
              onPress={fetchAdminSellersList}
              accessibilityLabel="Refresh Sellers"
            >
              <Icon name="refresh" size={14} color="#007AFF" />
            </TouchableOpacity>
          </View>

          {/* Global Master Bulk Actions */}
          <View style={styles.adminGlobalActionsBox}>
            <Text style={styles.adminGlobalTitle}>Global Platform Actions (All Stores)</Text>
            <View style={styles.adminGlobalBtnsRow}>
              <TouchableOpacity
                style={[styles.adminGlobalBtn, styles.adminGlobalBtnActive]}
                onPress={() => {
                  handleAdminGlobalToggleStores(true);
                  handleAdminGlobalToggleProducts(true);
                }}
              >
                <Icon name="check-circle" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.adminGlobalBtnText}>Activate All Stores & Products</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.adminGlobalBtn, styles.adminGlobalBtnInactive]}
                onPress={() => {
                  handleAdminGlobalToggleStores(false);
                  handleAdminGlobalToggleProducts(false);
                }}
              >
                <Icon name="ban" size={13} color="#DC2626" style={{ marginRight: 6 }} />
                <Text style={[styles.adminGlobalBtnText, { color: '#DC2626' }]}>
                  Deactivate All Stores & Products
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Sellers */}
          <View style={styles.adminSearchRow}>
            <Icon name="search" size={13} color="#64748B" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.adminSearchInput}
              placeholder="Filter sellers by store name, email or city..."
              placeholderTextColor="#94A3B8"
              value={adminSearchQuery}
              onChangeText={setAdminSearchQuery}
            />
            {adminSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setAdminSearchQuery('')}>
                <Icon name="times-circle" size={14} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Sellers List Table/Cards */}
          {adminLoading ? (
            <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.adminSellersList}>
              {adminSellersList
                .filter((s) => {
                  if (!adminSearchQuery.trim()) return true;
                  const q = adminSearchQuery.toLowerCase();
                  return (
                    (s.full_name || '').toLowerCase().includes(q) ||
                    (s.email || '').toLowerCase().includes(q) ||
                    (s.city || '').toLowerCase().includes(q)
                  );
                })
                .map((seller) => (
                  <View key={`admin-seller-${seller.id}`} style={styles.adminSellerRow}>
                    <View style={styles.adminSellerInfoCol}>
                      <View style={styles.adminSellerNameRow}>
                        <Text style={styles.adminSellerName} numberOfLines={1}>
                          {seller.full_name}
                        </Text>
                        <View
                          style={[
                            styles.miniStatusTag,
                            seller.is_store_active === true
                              ? styles.miniStatusTagActive
                              : styles.miniStatusTagInactive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.miniStatusTagText,
                              {
                                color:
                                  seller.is_store_active === true
                                    ? '#059669'
                                    : '#DC2626',
                              },
                            ]}
                          >
                            {seller.is_store_active === true ? 'Active' : 'Inactive'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.adminSellerMeta} numberOfLines={1}>
                        ✉️ {seller.email || 'No email'}  •  📍 {seller.city || 'Location'}
                      </Text>
                      <Text style={styles.adminSellerMeta}>
                        📦 Products: {seller.activeProductCount}/{seller.productCount} Active
                      </Text>
                    </View>

                    {/* Admin Per-Seller Controls */}
                    <View style={styles.adminSellerControlsCol}>
                      <View style={styles.adminToggleMiniRow}>
                        <Text style={styles.adminToggleMiniLabel}>Store:</Text>
                        <Switch
                          value={seller.is_store_active === true}
                          onValueChange={(val) => handleAdminToggleSellerStore(seller.id, val)}
                          trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                          thumbColor={seller.is_store_active === true ? '#10B981' : '#F1F5F9'}
                          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                        />
                      </View>

                      <View style={styles.adminToggleMiniRow}>
                        <Text style={styles.adminToggleMiniLabel}>Products:</Text>
                        <Switch
                          value={seller.is_product_active === true}
                          onValueChange={(val) => handleAdminToggleSellerProducts(seller.id, val)}
                          trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                          thumbColor={seller.is_product_active === true ? '#007AFF' : '#F1F5F9'}
                          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                        />
                      </View>

                      <View style={styles.adminToggleMiniRow}>
                        <Text style={styles.adminToggleMiniLabel}>Map Pin:</Text>
                        <Switch
                          value={seller.is_map_active === true}
                          onValueChange={(val) => handleAdminToggleSellerMap(seller.id, val)}
                          trackColor={{ false: '#CBD5E1', true: '#C084FC' }}
                          thumbColor={seller.is_map_active === true ? '#8B5CF6' : '#F1F5F9'}
                          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                        />
                      </View>
                    </View>
                  </View>
                ))}
            </View>
          )}
        </View>
      )}

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

      {/* UPI QR Code & Payment Settings Section */}
      <View style={styles.upiSectionCard}>
        <View style={styles.upiHeaderRow}>
          <Text style={styles.sectionTitle}>💳 UPI Payments & QR Code</Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          Set your UPI ID (VPA) so customers can pay directly with their exact order bill amount at Checkout.
        </Text>

        <Text style={styles.inputLabel}>UPI ID / VPA (e.g. mobile@upi, store@okaxis)</Text>
        <View style={styles.upiInputRow}>
          <TextInput
            style={[styles.input, styles.upiInputFlex]}
            placeholder="e.g. 9876543210@upi or store@okaxis"
            value={upiId}
            onChangeText={setUpiId}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.saveUpiBtn, savingUpiId && styles.buttonDisabled]}
            onPress={handleSaveUpiId}
            disabled={savingUpiId}
          >
            {savingUpiId ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveUpiBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        {upiId.trim() ? (
          <View style={styles.dynamicPreviewContainer}>
            <View style={styles.badgeRow}>
              <View style={styles.dynamicBadge}>
                <Text style={styles.dynamicBadgeText}>✓ Dynamic Amount QR Active</Text>
              </View>
              <Text style={styles.previewHint}>Generates QR with buyer's bill amount</Text>
            </View>

            <View style={styles.previewCard}>
              <Image
                source={{
                  uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                    `upi://pay?pa=${upiId.trim()}&pn=${encodeURIComponent(name.trim() || 'Store')}&am=100&cu=INR&tn=Order%20Payment`
                  )}`,
                }}
                style={styles.previewQrImage}
              />
              <View style={styles.previewInfo}>
                <Text style={styles.previewPayee}>{name.trim() || 'Your Store'}</Text>
                <Text style={styles.previewUpiId}>{upiId.trim()}</Text>
                <Text style={styles.previewDesc}>
                  At checkout, QR code automatically fills customer's exact bill total.
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Custom Uploaded QR Code (Optional) */}
        <View style={styles.customQrSection}>
          <Text style={styles.customQrTitle}>Custom Uploaded QR Code (Optional)</Text>
          {upiQrCodeUrl && (
            <View style={styles.qrCodeContainer}>
              <Image source={{ uri: upiQrCodeUrl }} style={styles.upiQrImage} />
            </View>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleUpiQrUpload}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Text style={styles.secondaryButtonText}>
                {upiQrCodeUrl ? '📷 Update Uploaded QR Code' : '📷 Upload Custom QR Code'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

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

      {/* Voice Announcement Settings Card (Male / Female) */}
      <View style={styles.voiceSectionCard}>
        <View style={styles.voiceHeaderRow}>
          <Icon name="volume-up" size={18} color="#007AFF" style={{ marginRight: 8 }} />
          <Text style={styles.voiceSectionTitle}>Voice Announcement Settings</Text>
        </View>
        <Text style={styles.voiceSectionSub}>
          Select your preferred voice type (Male or Female) for order printout speech and incoming order voice alerts.
        </Text>

        <View style={styles.voiceGenderRow}>
          <TouchableOpacity
            style={[
              styles.voiceGenderOption,
              voiceGender === 'female' && styles.voiceGenderOptionActive,
            ]}
            onPress={() => handleSelectVoiceGender('female')}
            activeOpacity={0.8}
            accessibilityLabel="Select Female Voice"
          >
            <View style={styles.voiceOptionHeader}>
              <Text style={styles.voiceOptionEmoji}>👩</Text>
              <Text
                style={[
                  styles.voiceOptionText,
                  voiceGender === 'female' && styles.voiceOptionTextActive,
                ]}
              >
                Female Voice
              </Text>
              {voiceGender === 'female' && (
                <Icon name="check-circle" size={16} color="#007AFF" style={{ marginLeft: 6 }} />
              )}
            </View>
            <Text style={styles.voiceOptionSub}>Clear & Natural</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.voiceGenderOption,
              voiceGender === 'male' && styles.voiceGenderOptionActive,
            ]}
            onPress={() => handleSelectVoiceGender('male')}
            activeOpacity={0.8}
            accessibilityLabel="Select Male Voice"
          >
            <View style={styles.voiceOptionHeader}>
              <Text style={styles.voiceOptionEmoji}>👨</Text>
              <Text
                style={[
                  styles.voiceOptionText,
                  voiceGender === 'male' && styles.voiceOptionTextActive,
                ]}
              >
                Male Voice
              </Text>
              {voiceGender === 'male' && (
                <Icon name="check-circle" size={16} color="#007AFF" style={{ marginLeft: 6 }} />
              )}
            </View>
            <Text style={styles.voiceOptionSub}>Deep & Professional</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.voiceTestButton}
          onPress={handleTestVoice}
          disabled={testingVoice}
          activeOpacity={0.8}
        >
          {testingVoice ? (
            <ActivityIndicator size="small" color="#007AFF" style={{ marginRight: 8 }} />
          ) : (
            <Icon name="play" size={13} color="#007AFF" style={{ marginRight: 8 }} />
          )}
          <Text style={styles.voiceTestButtonText}>
            {testingVoice ? 'Speaking Sample...' : `Test ${voiceGender === 'male' ? 'Male' : 'Female'} Voice`}
          </Text>
        </TouchableOpacity>
      </View>

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
  roleBadgeAdmin: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
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
  roleBadgeTextAdmin: {
    color: '#B45309',
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
  upiSectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  upiHeaderRow: {
    marginBottom: 4,
  },
  upiInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  upiInputFlex: {
    flex: 1,
    marginBottom: 0,
  },
  saveUpiBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveUpiBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  dynamicPreviewContainer: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 12,
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  dynamicBadge: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dynamicBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  previewHint: {
    fontSize: 11,
    color: '#15803d',
    fontWeight: '500',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 10,
    gap: 12,
  },
  previewQrImage: {
    width: 90,
    height: 90,
    borderRadius: 6,
  },
  previewInfo: {
    flex: 1,
  },
  previewPayee: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  previewUpiId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    marginTop: 2,
  },
  previewDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 15,
  },
  customQrSection: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  customQrTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
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

  // Store & Product Control Card Styles
  storeControlCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  storeControlHeader: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  storeControlTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  storeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeControlTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  storeControlSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusPillActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusPillInactive: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  toggleLabelCol: {
    flex: 1,
  },
  toggleTitleInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  toggleDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  storeQuickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  storeQuickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  storeQuickBtnActive: {
    backgroundColor: '#10B981',
  },
  storeQuickBtnInactive: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  storeQuickBtnTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  storeQuickBtnTextInactive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },

  // AppAdmin Master Card Styles
  adminMasterCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  adminHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  adminCrownBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
  },
  adminCardSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  adminRefreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  adminGlobalActionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  adminGlobalTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78350F',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  adminGlobalBtnsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  adminGlobalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  adminGlobalBtnActive: {
    backgroundColor: '#059669',
  },
  adminGlobalBtnInactive: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  adminGlobalBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  adminSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  adminSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
  },
  adminSellersList: {
    gap: 8,
  },
  adminSellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  adminSellerInfoCol: {
    flex: 1,
  },
  adminSellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  adminSellerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  miniStatusTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  miniStatusTagActive: {
    backgroundColor: '#ECFDF5',
  },
  miniStatusTagInactive: {
    backgroundColor: '#FEF2F2',
  },
  miniStatusTagText: {
    fontSize: 9,
    fontWeight: '700',
  },
  adminSellerMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  adminSellerControlsCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  adminToggleMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminToggleMiniLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginRight: 2,
  },
  voiceSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  voiceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  voiceSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  voiceSectionSub: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
    lineHeight: 18,
  },
  voiceGenderRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  voiceGenderOption: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  voiceGenderOptionActive: {
    borderColor: '#007AFF',
    backgroundColor: '#EFF6FF',
  },
  voiceOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  voiceOptionEmoji: {
    fontSize: 20,
    marginRight: 6,
  },
  voiceOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  voiceOptionTextActive: {
    color: '#007AFF',
    fontWeight: '700',
  },
  voiceOptionSub: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  voiceTestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 4,
  },
  voiceTestButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#007AFF',
  },
});

export default ProfileScreen;