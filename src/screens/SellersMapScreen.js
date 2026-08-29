import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  Modal,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import UniversalWebView from '../components/UniversalWebView';
import { supabase } from '../services/supabase';
import { FontAwesome as Icon } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useCart } from '../context/CartContext';

const { width } = Dimensions.get('window');

function calculateDistance(lat1, lon1, lat2, lon2) {
  try {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
  } catch (e) {
    console.warn('Error calculating distance:', e);
    return null;
  }
}

function getRawDistanceKm(lat1, lon1, lat2, lon2) {
  try {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  } catch (e) {
    return 999999;
  }
}

export default function SellersMapScreen() {
  const navigation = useNavigation();
  const { user, role } = useCart();
  const [sellers, setSellers] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const debounceTimeout = useRef(null);
  const webViewRef = useRef(null);

  // Safe navigation helper with try/catch
  const safeNavigate = useCallback((screenName, params = {}) => {
    try {
      setIsMenuVisible(false);
      navigation.navigate(screenName, params);
    } catch (navErr) {
      console.warn(`Navigation error to ${screenName}:`, navErr.message);
    }
  }, [navigation]);

  // Role-based redirection if delivery manager
  useEffect(() => {
    try {
      if (role === 'delivery_manager') {
        navigation.replace('DeliveryManagerDashboard');
      }
    } catch (e) {
      console.warn('Role redirection notice:', e.message);
    }
  }, [role, navigation]);

  // Send JavaScript command safely to UniversalWebView (Mobile & Web)
  const sendMapCommand = useCallback((command) => {
    try {
      if (!webViewRef.current) return;
      if (Platform.OS === 'web') {
        try {
          if (webViewRef.current.contentWindow) {
            webViewRef.current.contentWindow.eval(command);
          }
        } catch (e) {
          console.warn('Web map command eval warning:', e.message);
        }
      } else {
        try {
          webViewRef.current.injectJavaScript(`
            (function() {
              try {
                ${command}
              } catch (err) {
                console.error('Map command error:', err);
              }
            })();
            true;
          `);
        } catch (e) {
          console.warn('Native injectJavaScript error:', e.message);
        }
      }
    } catch (globalCmdErr) {
      console.warn('sendMapCommand error:', globalCmdErr);
    }
  }, []);

  // Parallelized fetch for sellers data from Supabase
  const fetchSellersData = useCallback(async () => {
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, mobile, role, address_line_1, address_line_2, city, state, zip_code, latitude, longitude, avatar_url')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (profilesError) {
        console.warn('Profiles fetch notice in SellersMapScreen:', profilesError.message);
      } else if (profilesData && Array.isArray(profilesData)) {
        let productsCountMap = {};
        try {
          const { data: prodData } = await supabase
            .from('products')
            .select('id, user_id, customer_id');
          if (prodData && Array.isArray(prodData)) {
            prodData.forEach((p) => {
              const uId = p?.user_id || p?.customer_id;
              if (uId) {
                productsCountMap[uId] = (productsCountMap[uId] || 0) + 1;
              }
            });
          }
        } catch (_) {}

        const formattedSellers = profilesData
          .filter((p) => p && p.latitude && p.longitude)
          .map((p) => ({
            id: p.id,
            full_name: p.full_name || 'Seller Store',
            email: p.email,
            mobile: p.mobile,
            role: p.role,
            city: p.city || '',
            address: [p.address_line_1, p.address_line_2, p.city, p.state].filter(Boolean).join(', '),
            latitude: Number(p.latitude),
            longitude: Number(p.longitude),
            productCount: productsCountMap[p.id] || 0,
            avatar_url: p.avatar_url,
          }));

        setSellers(formattedSellers);
        return formattedSellers;
      }
    } catch (err) {
      console.warn('fetchSellersData exception:', err);
    }
    return [];
  }, []);

  // Safe non-blocking GPS Location lookup
  const fetchLocationData = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 3000,
          });
          if (loc?.coords) {
            setUserLocation(loc.coords);
            return loc.coords;
          }
        } catch (locErr) {
          try {
            const lastKnown = await Location.getLastKnownPositionAsync({});
            if (lastKnown?.coords) {
              setUserLocation(lastKnown.coords);
              return lastKnown.coords;
            }
          } catch (_) {}
        }
      }
    } catch (permErr) {
      console.warn('Location lookup notice:', permErr.message);
    }
    return null;
  }, []);

  // Fetch sellers & user location in parallel
  const initData = useCallback(async () => {
    try {
      setLoading(true);

      const [fetchedSellers, fetchedCoords] = await Promise.all([
        fetchSellersData(),
        fetchLocationData(),
      ]);

      if (fetchedSellers && fetchedSellers.length > 0) {
        if (fetchedCoords) {
          const sorted = [...fetchedSellers].sort((a, b) => {
            return (
              getRawDistanceKm(fetchedCoords.latitude, fetchedCoords.longitude, a.latitude, a.longitude) -
              getRawDistanceKm(fetchedCoords.latitude, fetchedCoords.longitude, b.latitude, b.longitude)
            );
          });
          setSelectedSeller(sorted[0]);
        } else {
          setSelectedSeller(fetchedSellers[0]);
        }

        // Send map update command dynamically
        sendMapCommand(`
          if (window.updateMapData) {
            window.updateMapData(${JSON.stringify(fetchedSellers)}, ${JSON.stringify(fetchedCoords)});
          }
        `);
      }
    } catch (err) {
      console.warn('Data initialization notice:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchSellersData, fetchLocationData, sendMapCommand]);

  useEffect(() => {
    initData();
  }, [initData]);

  // Keep map synchronized whenever sellers or userLocation changes
  useEffect(() => {
    if (sellers.length > 0 || userLocation) {
      sendMapCommand(`
        if (window.updateMapData) {
          window.updateMapData(${JSON.stringify(sellers)}, ${JSON.stringify(userLocation)});
        }
      `);
    }
  }, [sellers, userLocation, sendMapCommand]);

  // Search area and sellers with try/catch
  const fetchSuggestions = async (text) => {
    try {
      if (!text || text.trim().length === 0) {
        setSuggestions([]);
        return;
      }
      const cleanQuery = text.trim().toLowerCase();
      setSearchLoading(true);

      const results = [];

      // 1. Search matching local sellers
      try {
        const matchedSellers = sellers.filter((s) => {
          const name = (s.full_name || '').toLowerCase();
          const city = (s.city || '').toLowerCase();
          const address = (s.address || '').toLowerCase();
          const mobile = (s.mobile || '').toLowerCase();
          return (
            name.includes(cleanQuery) ||
            city.includes(cleanQuery) ||
            address.includes(cleanQuery) ||
            mobile.includes(cleanQuery)
          );
        });

        matchedSellers.forEach((s) => {
          results.push({
            id: `seller-${s.id}`,
            title: s.full_name,
            subtitle: s.address || s.city || `Seller • ${s.productCount} products`,
            type: 'seller',
            latitude: s.latitude,
            longitude: s.longitude,
            data: s,
          });
        });
      } catch (matchErr) {
        console.warn('Local seller match error:', matchErr);
      }

      // 2. Search OpenStreetMap Nominatim for geographic areas / places
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=5`,
          {
            headers: { 'User-Agent': 'NeedsTrackingApp/1.0' },
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach((item, idx) => {
            if (item && item.lat && item.lon) {
              results.push({
                id: `place-${idx}-${item.place_id || item.osm_id || idx}`,
                title: item.display_name ? item.display_name.split(',')[0] : 'Location',
                subtitle: item.display_name || '',
                type: 'area',
                latitude: parseFloat(item.lat),
                longitude: parseFloat(item.lon),
                data: item,
              });
            }
          });
        }
      } catch (nomErr) {
        console.warn('Nominatim search notice:', nomErr.message);
      }

      setSuggestions(results);
    } catch (err) {
      console.warn('Error in fetchSuggestions:', err);
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchChange = (text) => {
    try {
      setSearchQuery(text);
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      debounceTimeout.current = setTimeout(() => fetchSuggestions(text), 350);
    } catch (err) {
      console.warn('handleSearchChange error:', err);
    }
  };

  const handleSelectSuggestion = (item) => {
    try {
      if (!item) return;
      setSearchQuery(item.title || '');
      setSuggestions([]);

      if (item.latitude && item.longitude) {
        sendMapCommand(`
          if (window.map) {
            window.map.setView([${item.latitude}, ${item.longitude}], ${item.type === 'seller' ? 16 : 14}, { animate: true });
            ${
              item.type === 'seller' && item.data
                ? `
              if (window.sellerMarkers && window.sellerMarkers['${item.data.id}']) {
                window.sellerMarkers['${item.data.id}'].openPopup();
              }
            `
                : ''
            }
          }
        `);

        if (item.type === 'seller' && item.data) {
          setSelectedSeller(item.data);
        } else {
          // Find nearest seller to this selected area
          const sorted = [...sellers].sort((a, b) => {
            return (
              getRawDistanceKm(item.latitude, item.longitude, a.latitude, a.longitude) -
              getRawDistanceKm(item.latitude, item.longitude, b.latitude, b.longitude)
            );
          });
          if (sorted.length > 0) {
            setSelectedSeller(sorted[0]);
          }
        }
      }
    } catch (err) {
      console.warn('handleSelectSuggestion error:', err);
    }
  };

  const handleClearSearch = () => {
    try {
      setSearchQuery('');
      setSuggestions([]);
      if (userLocation) {
        sendMapCommand(`
          if (window.map) {
            window.map.setView([${userLocation.latitude}, ${userLocation.longitude}], 13, { animate: true });
          }
        `);
      } else if (sellers.length > 0) {
        sendMapCommand(`
          if (window.map && window.sellerBounds) {
            window.map.fitBounds(window.sellerBounds.pad(0.2));
          }
        `);
      }
    } catch (err) {
      console.warn('handleClearSearch error:', err);
    }
  };

  const handleRecenterLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 3000,
      });
      if (loc?.coords) {
        setUserLocation(loc.coords);
        sendMapCommand(`
          if (window.map) {
            window.map.setView([${loc.coords.latitude}, ${loc.coords.longitude}], 14, { animate: true });
          }
        `);
      }
    } catch (e) {
      if (userLocation) {
        sendMapCommand(`
          if (window.map) {
            window.map.setView([${userLocation.latitude}, ${userLocation.longitude}], 14, { animate: true });
          }
        `);
      } else {
        Alert.alert('Location Notice', 'Could not obtain current GPS position. Please check location permissions and GPS toggle.');
      }
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsMenuVisible(false);
            await supabase.auth.signOut();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Welcome' }],
            });
          } catch (err) {
            console.error('Logout error:', err);
          }
        },
      },
    ]);
  };

  const handleOpenDirections = (lat, lng, label) => {
    try {
      const latLng = `${lat},${lng}`;
      const scheme = Platform.select({
        ios: 'maps:0,0?q=',
        android: 'geo:0,0?q=',
        default: 'https://www.google.com/maps/search/?api=1&query=',
      });
      const url = Platform.select({
        ios: `${scheme}${encodeURIComponent(label || 'Seller Location')}@${latLng}`,
        android: `${scheme}${latLng}(${encodeURIComponent(label || 'Seller Location')})`,
        default: `${scheme}${latLng}`,
      });
      Linking.openURL(url).catch((err) => {
        console.warn('Cannot open map app, trying fallback google maps url:', err);
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latLng}`).catch(() => {});
      });
    } catch (err) {
      console.warn('Error opening directions:', err);
    }
  };

  const onMapMessage = (event) => {
    try {
      let raw = event.nativeEvent?.data || event.data;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch (parseErr) {
          console.warn('Map message JSON parse notice:', parseErr);
          return;
        }
      }
      if (!raw) return;

      if (raw.type === 'mapReady') {
        // Map is initialized inside WebView; immediately push latest data
        if (sellers.length > 0 || userLocation) {
          sendMapCommand(`
            if (window.updateMapData) {
              window.updateMapData(${JSON.stringify(sellers)}, ${JSON.stringify(userLocation)});
            }
          `);
        }
      } else if (raw.type === 'viewProducts') {
        safeNavigate('Catalog', { userId: raw.sellerId, sellerId: raw.sellerId });
      } else if (raw.type === 'sellerClicked') {
        setSelectedSeller(raw.seller);
      } else if (raw.type === 'getDirections') {
        handleOpenDirections(raw.latitude, raw.longitude, raw.name);
      }
    } catch (err) {
      console.error('Error handling map message:', err);
    }
  };

  // Generate interactive Leaflet Map HTML safely
  const initialLat = userLocation?.latitude || (sellers.length > 0 ? sellers[0].latitude : 20.5937);
  const initialLon = userLocation?.longitude || (sellers.length > 0 ? sellers[0].longitude : 78.9629);
  const initialZoom = userLocation ? 13 : (sellers.length > 0 ? 12 : 5);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Sellers Map</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css" />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <style>
            html, body {
                width: 100%;
                height: 100%;
                margin: 0;
                padding: 0;
                background-color: #f8fafc;
            }
            #mapid {
                width: 100%;
                height: 100%;
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
            }
            .seller-pin {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 42px;
                height: 42px;
                background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%);
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                box-shadow: 0 4px 12px rgba(0,122,255,0.4);
                border: 2px solid #FFFFFF;
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .seller-pin:hover {
                transform: rotate(-45deg) scale(1.15);
                box-shadow: 0 6px 16px rgba(0,122,255,0.6);
            }
            .seller-pin i {
                transform: rotate(45deg);
                color: #FFFFFF;
                font-size: 17px;
            }
            .user-pulse {
                width: 18px;
                height: 18px;
                background: #10B981;
                border: 3px solid #FFFFFF;
                border-radius: 50%;
                box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.35);
            }
            .custom-popup .leaflet-popup-content-wrapper {
                border-radius: 16px;
                padding: 6px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.18);
                border: 1px solid #E2E8F0;
            }
            .custom-popup .leaflet-popup-content {
                margin: 10px 12px;
                line-height: 1.4;
            }
            .popup-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 6px;
            }
            .popup-title {
                font-size: 16px;
                font-weight: 700;
                color: #0F172A;
                margin: 0;
            }
            .popup-tag {
                display: inline-block;
                background: #E0F2FE;
                color: #0284C7;
                font-size: 11px;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 6px;
                margin-bottom: 8px;
            }
            .popup-info-row {
                font-size: 12px;
                color: #64748B;
                margin-bottom: 4px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .popup-btn-primary {
                width: 100%;
                background: #007AFF;
                color: #FFFFFF;
                border: none;
                border-radius: 10px;
                padding: 9px 12px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                margin-top: 10px;
                transition: background 0.15s;
            }
            .popup-btn-primary:active {
                background: #0056b3;
            }
            .popup-btn-secondary {
                width: 100%;
                background: #F1F5F9;
                color: #334155;
                border: 1px solid #CBD5E1;
                border-radius: 10px;
                padding: 7px 12px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                margin-top: 6px;
            }
        </style>
    </head>
    <body>
        <div id="mapid"></div>
        <script>
            try {
                var map = L.map('mapid', { zoomControl: false }).setView([${initialLat}, ${initialLon}], ${initialZoom});
                L.control.zoom({ position: 'bottomright' }).addTo(map);

                // Use Voyager basemaps which work very fast and reliably in mobile WebViews
                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
                    maxZoom: 19
                }).addTo(map);

                window.map = map;
                window.sellerMarkers = {};
                window.markerLayerGroup = L.layerGroup().addTo(map);
                window.userMarker = null;

                function postMessage(data) {
                    try {
                        var json = typeof data === 'string' ? data : JSON.stringify(data);
                        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                            window.ReactNativeWebView.postMessage(json);
                        }
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage(json, '*');
                        }
                    } catch (e) {
                        console.error('postMessage error:', e);
                    }
                }

                function viewProducts(sellerId) {
                    postMessage({ type: 'viewProducts', sellerId: sellerId });
                }

                function getDirections(latitude, longitude, name) {
                    postMessage({ type: 'getDirections', latitude: latitude, longitude: longitude, name: name });
                }

                window.updateMapData = function(sellersData, userLoc) {
                    try {
                        if (!window.map) return;
                        if (window.markerLayerGroup) {
                            window.markerLayerGroup.clearLayers();
                        } else {
                            window.markerLayerGroup = L.layerGroup().addTo(window.map);
                        }
                        if (window.userMarker) {
                            window.map.removeLayer(window.userMarker);
                            window.userMarker = null;
                        }

                        var boundsPoints = [];

                        if (userLoc && userLoc.latitude && userLoc.longitude) {
                            boundsPoints.push([userLoc.latitude, userLoc.longitude]);
                            var userIcon = L.divIcon({
                                className: 'user-pulse-container',
                                html: '<div class="user-pulse"></div>',
                                iconSize: [18, 18],
                                iconAnchor: [9, 9]
                            });
                            window.userMarker = L.marker([userLoc.latitude, userLoc.longitude], { icon: userIcon })
                                .addTo(window.map)
                                .bindPopup('<b>You are here</b>');
                        }

                        window.sellerMarkers = {};
                        if (sellersData && sellersData.length > 0) {
                            sellersData.forEach(function(seller) {
                                if (!seller || !seller.latitude || !seller.longitude) return;
                                boundsPoints.push([seller.latitude, seller.longitude]);

                                var sellerIcon = L.divIcon({
                                    className: 'seller-icon-wrapper',
                                    html: '<div class="seller-pin"><i class="fas fa-store"></i></div>',
                                    iconSize: [42, 42],
                                    iconAnchor: [21, 42],
                                    popupAnchor: [0, -42]
                                });

                                var safeName = (seller.full_name || 'Seller Store').replace(/'/g, "\\'");
                                var popupHtml =
                                    '<div class="popup-header">' +
                                        '<i class="fas fa-store" style="color:#007AFF; font-size:18px;"></i>' +
                                        '<h4 class="popup-title">' + (seller.full_name || 'Seller Store') + '</h4>' +
                                    '</div>' +
                                    '<div class="popup-tag">Verified Seller</div>' +
                                    (seller.city ? '<div class="popup-info-row"><i class="fas fa-map-marker-alt" style="color:#64748B;"></i> ' + seller.city + '</div>' : '') +
                                    (seller.mobile ? '<div class="popup-info-row"><i class="fas fa-phone" style="color:#64748B;"></i> ' + seller.mobile + '</div>' : '') +
                                    (seller.productCount > 0 ? '<div class="popup-info-row"><i class="fas fa-box-open" style="color:#10B981;"></i> ' + seller.productCount + ' Products available</div>' : '') +
                                    '<button class="popup-btn-primary" onclick="viewProducts(\'' + seller.id + '\')">' +
                                        '<i class="fas fa-shopping-bag"></i> Browse Store' +
                                    '</button>' +
                                    '<button class="popup-btn-secondary" onclick="getDirections(' + seller.latitude + ', ' + seller.longitude + ', \'' + safeName + '\')">' +
                                        '<i class="fas fa-directions"></i> Get Directions' +
                                    '</button>';

                                var marker = L.marker([seller.latitude, seller.longitude], { icon: sellerIcon })
                                    .bindPopup(popupHtml, { className: 'custom-popup' });

                                marker.on('click', function() {
                                    postMessage({ type: 'sellerClicked', seller: seller });
                                });

                                window.markerLayerGroup.addLayer(marker);
                                window.sellerMarkers[seller.id] = marker;
                            });
                        }

                        if (boundsPoints.length > 0) {
                            window.sellerBounds = L.latLngBounds(boundsPoints);
                            if (userLoc && userLoc.latitude && userLoc.longitude) {
                                window.map.setView([userLoc.latitude, userLoc.longitude], 13);
                            } else if (boundsPoints.length === 1) {
                                window.map.setView(boundsPoints[0], 14);
                            } else {
                                window.map.fitBounds(window.sellerBounds.pad(0.2));
                            }
                        } else if (userLoc && userLoc.latitude && userLoc.longitude) {
                            window.map.setView([userLoc.latitude, userLoc.longitude], 13);
                        }

                        setTimeout(function() {
                            window.map.invalidateSize();
                        }, 250);
                    } catch (e) {
                        console.error('updateMapData error:', e);
                    }
                };

                // Initial render with embedded data if present
                var initialSellers = ${JSON.stringify(sellers)};
                var initialUserLoc = ${JSON.stringify(userLocation)};
                if (initialSellers.length > 0 || initialUserLoc) {
                    window.updateMapData(initialSellers, initialUserLoc);
                }

                // Notify parent that map is ready
                postMessage({ type: 'mapReady' });

                window.onload = function() {
                    setTimeout(function() {
                        map.invalidateSize();
                    }, 350);
                };
            } catch (mapErr) {
                console.error('Leaflet initialization error:', mapErr);
            }
        </script>
    </body>
    </html>
  `;

  const calculatedDistance =
    selectedSeller && userLocation
      ? calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          selectedSeller.latitude,
          selectedSeller.longitude
        )
      : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Header Bar with 3 Horizontal Dots Button */}
      <View style={styles.topHeaderContainer}>
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Icon name="arrow-left" size={18} color="#1E293B" />
        </TouchableOpacity>

        <View style={styles.searchBarWrapper}>
          <Icon name="search" size={16} color="#64748B" style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search area, city or seller..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchLoading && (
            <ActivityIndicator size="small" color="#007AFF" style={styles.searchLoader} />
          )}
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
              <Icon name="times-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* 3 Horizontal Dots Menu Button */}
        <TouchableOpacity
          style={styles.dotsMenuButton}
          onPress={() => setIsMenuVisible(true)}
          activeOpacity={0.8}
          accessibilityLabel="Portals Menu"
        >
          <Icon name="ellipsis-h" size={20} color="#1E293B" />
        </TouchableOpacity>
      </View>

      {/* Non-blocking mini loading indicator */}
      {loading && (
        <View style={styles.topLoadingBadge}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.topLoadingText}>Finding nearby sellers...</Text>
        </View>
      )}

      {/* Auto-suggest Search Dropdown */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionDropdown}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionRow}
                onPress={() => handleSelectSuggestion(item)}
              >
                <View
                  style={[
                    styles.suggestionIconBox,
                    item.type === 'seller' ? styles.sellerIconBox : styles.areaIconBox,
                  ]}
                >
                  <Icon
                    name={item.type === 'seller' ? 'home' : 'map-marker'}
                    size={14}
                    color={item.type === 'seller' ? '#007AFF' : '#10B981'}
                  />
                </View>
                <View style={styles.suggestionTextContainer}>
                  <Text style={styles.suggestionTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>
                <View
                  style={[
                    styles.typeBadge,
                    item.type === 'seller' ? styles.sellerBadge : styles.areaBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBadgeText,
                      item.type === 'seller' ? styles.sellerBadgeText : styles.areaBadgeText,
                    ]}
                  >
                    {item.type === 'seller' ? 'Seller' : 'Area'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Interactive Map View */}
      <UniversalWebView
        key={`sellers-map-${sellers.length > 0 ? 'loaded' : 'init'}`}
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent, baseUrl: '' }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={onMapMessage}
      />

      {/* Re-center GPS Location Button */}
      <TouchableOpacity
        style={styles.recenterButton}
        onPress={handleRecenterLocation}
        activeOpacity={0.8}
        accessibilityLabel="Re-center location"
      >
        <Icon name="crosshairs" size={20} color="#007AFF" />
      </TouchableOpacity>

      {/* Floating Selected Seller Card */}
      {selectedSeller && (
        <View style={styles.sellerCard}>
          <View style={styles.sellerCardHeader}>
            <View style={styles.sellerAvatarBox}>
              <Icon name="home" size={20} color="#007AFF" />
            </View>
            <View style={styles.sellerDetails}>
              <View style={styles.sellerNameRow}>
                <Text style={styles.sellerName} numberOfLines={1}>
                  {selectedSeller.full_name}
                </Text>
                <View style={styles.verifiedTag}>
                  <Text style={styles.verifiedTagText}>Seller</Text>
                </View>
              </View>
              <Text style={styles.sellerLocation} numberOfLines={1}>
                {selectedSeller.city || selectedSeller.address || 'Seller Location'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedSeller(null)}
              style={styles.closeCardButton}
            >
              <Icon name="times" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <View style={styles.sellerMetaRow}>
            {calculatedDistance && (
              <View style={styles.metaBadge}>
                <Icon name="location-arrow" size={12} color="#007AFF" />
                <Text style={styles.metaBadgeText}>{calculatedDistance} away</Text>
              </View>
            )}
            {selectedSeller.productCount > 0 && (
              <View style={styles.metaBadge}>
                <Icon name="cubes" size={12} color="#10B981" />
                <Text style={styles.metaBadgeText}>
                  {selectedSeller.productCount} Products
                </Text>
              </View>
            )}
            {selectedSeller.mobile ? (
              <TouchableOpacity
                style={styles.metaBadge}
                onPress={() => {
                  try {
                    Linking.openURL(`tel:${selectedSeller.mobile}`).catch(() => {});
                  } catch (e) {}
                }}
              >
                <Icon name="phone" size={12} color="#64748B" />
                <Text style={styles.metaBadgeText}>{selectedSeller.mobile}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.sellerActions}>
            <TouchableOpacity
              style={styles.primaryActionButton}
              onPress={() =>
                safeNavigate('Catalog', {
                  userId: selectedSeller.id,
                  sellerId: selectedSeller.id,
                })
              }
            >
              <Icon name="shopping-bag" size={16} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>Browse Store</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryActionButton}
              onPress={() =>
                handleOpenDirections(
                  selectedSeller.latitude,
                  selectedSeller.longitude,
                  selectedSeller.full_name
                )
              }
            >
              <Icon name="compass" size={18} color="#1E293B" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 3 Horizontal Dots Menu Modal (Buyer, Seller, Delivery Portals) */}
      <Modal
        visible={isMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsMenuVisible(false)}
        >
          <View style={styles.menuCard} onStartShouldSetResponder={() => true}>
            <View style={styles.menuHeader}>
              <View>
                <Text style={styles.menuHeaderTitle}>Needs Tracking</Text>
                <Text style={styles.menuHeaderSubtitle}>Access Portals & Services</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsMenuVisible(false)}
                style={styles.menuCloseBtn}
              >
                <Icon name="times" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* If user is logged in, show user profile summary and quick links */}
            {user && (
              <View style={styles.userSection}>
                <View style={styles.userProfileRow}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {(user.email || user.phone || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userEmail} numberOfLines={1}>
                      {user.email || user.phone || 'Signed In User'}
                    </Text>
                    <View style={styles.roleTag}>
                      <Text style={styles.roleTagText}>
                        {role ? role.toUpperCase() : 'USER'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.userQuickLinks}>
                  <TouchableOpacity
                    style={styles.quickLinkItem}
                    onPress={() => safeNavigate('OrderList')}
                  >
                    <Icon name="list-alt" size={16} color="#007AFF" />
                    <Text style={styles.quickLinkText}>My Orders</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickLinkItem}
                    onPress={() => safeNavigate('Cart')}
                  >
                    <Icon name="shopping-cart" size={16} color="#007AFF" />
                    <Text style={styles.quickLinkText}>My Cart</Text>
                  </TouchableOpacity>

                  {(role === 'seller' || role === 'admin') && (
                    <TouchableOpacity
                      style={styles.quickLinkItem}
                      onPress={() => safeNavigate('ProductTabs')}
                    >
                      <Icon name="cubes" size={16} color="#10B981" />
                      <Text style={styles.quickLinkText}>Manage Store</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* Role Portals Options: Buyer, Seller, Delivery */}
            <Text style={styles.portalsHeading}>Portals</Text>

            {/* 1. Buyer Portal */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.7}
              onPress={() => safeNavigate('BuyerLogin')}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Icon name="shopping-cart" size={22} color="#007AFF" />
              </View>
              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>Buyer Portal</Text>
                <Text style={styles.portalDesc}>Browse nearby sellers & place orders</Text>
              </View>
              <Icon name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            {/* 2. Seller Portal */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.7}
              onPress={() => safeNavigate('SellerLogin')}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Icon name="home" size={20} color="#10B981" />
              </View>
              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>Seller Portal</Text>
                <Text style={styles.portalDesc}>Manage products, pricing & inventory</Text>
              </View>
              <Icon name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            {/* 3. Delivery Manager Portal */}
            <TouchableOpacity
              style={styles.portalItem}
              activeOpacity={0.7}
              onPress={() => safeNavigate('DeliveryManagerLogin')}
            >
              <View style={[styles.portalIconBox, { backgroundColor: '#FAF5FF' }]}>
                <Icon name="truck" size={20} color="#8B5CF6" />
              </View>
              <View style={styles.portalDetails}>
                <Text style={styles.portalTitle}>Delivery Portal</Text>
                <Text style={styles.portalDesc}>Real-time delivery management & tracking</Text>
              </View>
              <Icon name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            {/* Logout Button if signed in */}
            {user && (
              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Icon name="sign-out" size={16} color="#EF4444" />
                <Text style={styles.logoutButtonText}>Log Out</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  webview: {
    flex: 1,
  },
  topHeaderContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 24,
    left: 16,
    right: 16,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topLoadingBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 80,
    alignSelf: 'center',
    zIndex: 45,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  topLoadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  searchBarWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 48,
    marginRight: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    color: '#0F172A',
  },
  searchLoader: {
    marginLeft: 6,
  },
  clearButton: {
    padding: 4,
  },
  dotsMenuButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  suggestionDropdown: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 106 : 78,
    left: 70,
    right: 74,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    maxHeight: 250,
    zIndex: 60,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sellerIconBox: {
    backgroundColor: '#EFF6FF',
  },
  areaIconBox: {
    backgroundColor: '#ECFDF5',
  },
  suggestionTextContainer: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  suggestionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  sellerBadge: {
    backgroundColor: '#EFF6FF',
  },
  areaBadge: {
    backgroundColor: '#ECFDF5',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sellerBadgeText: {
    color: '#007AFF',
  },
  areaBadgeText: {
    color: '#10B981',
  },
  recenterButton: {
    position: 'absolute',
    right: 16,
    bottom: 230,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 35,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sellerCard: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 34 : 20,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    zIndex: 40,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sellerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sellerAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sellerDetails: {
    flex: 1,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  verifiedTag: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedTagText: {
    fontSize: 10,
    color: '#0284C7',
    fontWeight: '600',
  },
  sellerLocation: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeCardButton: {
    padding: 6,
  },
  sellerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metaBadgeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  sellerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  primaryActionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryActionButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuCard: {
    width: width > 420 ? 380 : '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  menuHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuHeaderSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  menuCloseBtn: {
    padding: 6,
  },
  userSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  roleTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
  userQuickLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  quickLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickLinkText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  portalsHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  portalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  portalIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  portalDetails: {
    flex: 1,
  },
  portalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  portalDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
