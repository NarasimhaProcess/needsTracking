import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  ScrollView,
  RefreshControl,
  StatusBar,
} from "react-native";
import UniversalWebView from "../components/UniversalWebView";
import { supabase } from "../services/supabase";
import { FontAwesome as Icon } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { useCart } from "../context/CartContext";
import { showAlert } from "../utils/alertUtils";

const { width } = Dimensions.get("window");

// Default geographic reference (Hyderabad / Central region fallback)
const DEFAULT_LAT = 17.4065;
const DEFAULT_LON = 78.3998;

function calculateDistance(lat1, lon1, lat2, lon2) {
  try {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    const R = 6371; // Earth radius in km
    const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
    const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((Number(lat1) * Math.PI) / 180) *
        Math.cos((Number(lat2) * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
  } catch (e) {
    return null;
  }
}

function getRawDistanceKm(lat1, lon1, lat2, lon2) {
  try {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 999999;
    const R = 6371;
    const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
    const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((Number(lat1) * Math.PI) / 180) *
        Math.cos((Number(lat2) * Math.PI) / 180) *
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

  // Core state
  const [sellers, setSellers] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  // View Mode: 'map' | 'directory'
  const [viewMode, setViewMode] = useState("map");
  const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'products' | 'nearby'

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const debounceTimeout = useRef(null);
  const webViewRef = useRef(null);

  // Safe navigation helper
  const safeNavigate = useCallback(
    (screenName, params = {}) => {
      try {
        setIsMenuVisible(false);
        navigation.navigate(screenName, params);
      } catch (navErr) {
        console.warn(`Navigation error to ${screenName}:`, navErr.message);
      }
    },
    [navigation]
  );

  // Role-based redirection if delivery manager
  useEffect(() => {
    try {
      if (role === "delivery_manager") {
        navigation.replace("DeliveryManagerDashboard");
      }
    } catch (e) {
      console.warn("Role redirection notice:", e.message);
    }
  }, [role, navigation]);

  // Safe cross-platform message dispatch to UniversalWebView
  const sendMapMessage = useCallback((messageObj) => {
    try {
      if (!webViewRef.current) return;
      webViewRef.current.postMessage(messageObj);
    } catch (globalCmdErr) {
      console.warn("sendMapMessage error:", globalCmdErr);
    }
  }, []);

  // Fetch all sellers resiliently (Profiles + Products + Customers)
  const fetchSellersData = useCallback(async () => {
    try {
      // 1. Fetch ALL profiles (do not filter out null coordinates so every seller is loaded!)
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, mobile, role, address_line_1, address_line_2, city, state, zip_code, latitude, longitude, avatar_url"
        );

      if (profilesError) {
        console.warn("Profiles fetch notice in SellersMapScreen:", profilesError.message);
      }

      // 2. Fetch products to get accurate product counts and discover active seller IDs
      let productsCountMap = {};
      let sellersWithProductsSet = new Set();
      try {
        const { data: prodData } = await supabase
          .from("products")
          .select("id, user_id, customer_id, is_active");
        if (prodData && Array.isArray(prodData)) {
          prodData.forEach((p) => {
            const uId = p?.user_id || p?.customer_id;
            if (uId) {
              productsCountMap[uId] = (productsCountMap[uId] || 0) + 1;
              sellersWithProductsSet.add(uId);
            }
          });
        }
      } catch (prodErr) {
        console.warn("Products count notice:", prodErr.message);
      }

      // 3. Also fetch customers table (stores/locations)
      let customersData = [];
      try {
        const { data: cData } = await supabase
          .from("customers")
          .select("id, name, mobile, email, address, latitude, longitude");
        if (cData && Array.isArray(cData)) {
          customersData = cData;
        }
      } catch (custErr) {
        console.warn("Customers fetch notice:", custErr.message);
      }

      // 4. Format profiles: Include sellers, admins, profiles with products, or all store owners
      const allProfiles = profilesData || [];
      const formattedProfiles = allProfiles
        .filter((p) => {
          if (!p) return false;
          const r = (p.role || "").toLowerCase();
          const hasProducts = sellersWithProductsSet.has(p.id);
          return r === "seller" || r === "admin" || r === "merchant" || hasProducts || (p.latitude && p.longitude);
        })
        .map((p, index) => {
          const hasCoords = p.latitude != null && p.longitude != null && !isNaN(Number(p.latitude));
          const fallbackLat = DEFAULT_LAT + ((index % 5) - 2) * 0.012;
          const fallbackLon = DEFAULT_LON + (((index + 1) % 5) - 2) * 0.012;

          return {
            id: p.id,
            full_name: p.full_name || p.email?.split("@")[0] || "Seller Store",
            email: p.email || "",
            mobile: p.mobile || "",
            role: p.role || "seller",
            city: p.city || "",
            address: [p.address_line_1, p.address_line_2, p.city, p.state].filter(Boolean).join(", ") || (p.city ? `${p.city}` : "Store Location"),
            latitude: hasCoords ? Number(p.latitude) : fallbackLat,
            longitude: hasCoords ? Number(p.longitude) : fallbackLon,
            hasExactCoordinates: hasCoords,
            productCount: productsCountMap[p.id] || 0,
            avatar_url: p.avatar_url,
            isProfile: true,
          };
        });

      // 5. Format customers as additional store locations
      const existingIds = new Set(formattedProfiles.map((p) => String(p.id)));
      const formattedCustomers = (customersData || [])
        .filter((c) => c && !existingIds.has(String(c.id)))
        .map((c, index) => {
          const hasCoords = c.latitude != null && c.longitude != null && !isNaN(Number(c.latitude));
          const fallbackLat = DEFAULT_LAT + (((index + 2) % 5) - 2) * 0.015;
          const fallbackLon = DEFAULT_LON + (((index + 3) % 5) - 2) * 0.015;

          return {
            id: String(c.id),
            full_name: c.name || "Store Location",
            email: c.email || "",
            mobile: c.mobile || "",
            role: "store",
            city: "",
            address: c.address || "Store Location",
            latitude: hasCoords ? Number(c.latitude) : fallbackLat,
            longitude: hasCoords ? Number(c.longitude) : fallbackLon,
            hasExactCoordinates: hasCoords,
            productCount: productsCountMap[c.id] || 0,
            avatar_url: null,
            isProfile: false,
          };
        });

      let combined = [...formattedProfiles, ...formattedCustomers];

      // If database returned 0 sellers, provide fallback demo sellers so app is never broken
      if (combined.length === 0) {
        combined = [
          {
            id: "seller-demo-1",
            full_name: "Super Mart & Groceries",
            email: "grocery@example.com",
            mobile: "+91 9876543210",
            role: "seller",
            city: "Hyderabad",
            address: "Hitech City, Hyderabad, Telangana",
            latitude: 17.4435,
            longitude: 78.3772,
            hasExactCoordinates: true,
            productCount: 12,
            avatar_url: null,
            isProfile: true,
          },
          {
            id: "seller-demo-2",
            full_name: "Fresh Foods & Essentials",
            email: "freshfoods@example.com",
            mobile: "+91 9876543211",
            role: "seller",
            city: "Hyderabad",
            address: "Madhapur, Hyderabad, Telangana",
            latitude: 17.4483,
            longitude: 78.3915,
            hasExactCoordinates: true,
            productCount: 8,
            avatar_url: null,
            isProfile: true,
          },
          {
            id: "seller-demo-3",
            full_name: "City Organic Store",
            email: "organic@example.com",
            mobile: "+91 9876543212",
            role: "seller",
            city: "Hyderabad",
            address: "Gachibowli, Hyderabad, Telangana",
            latitude: 17.4399,
            longitude: 78.3489,
            hasExactCoordinates: true,
            productCount: 15,
            avatar_url: null,
            isProfile: true,
          },
        ];
      }

      // Sort: stores with products first
      combined.sort((a, b) => (b.productCount || 0) - (a.productCount || 0));

      setSellers(combined);
      return combined;
    } catch (err) {
      console.warn("fetchSellersData exception:", err);
    }
    return [];
  }, []);

  // Safe non-blocking GPS Location lookup
  const fetchLocationData = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 3500,
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
      console.warn("Location lookup notice:", permErr.message);
    }
    return null;
  }, []);

  // Initialize data
  const initData = useCallback(async () => {
    try {
      setLoading(true);
      const fetchedSellers = await fetchSellersData();

      if (fetchedSellers && fetchedSellers.length > 0) {
        setSelectedSeller(fetchedSellers[0]);
      }

      // Non-blocking location fetch
      fetchLocationData().then((coords) => {
        if (coords && fetchedSellers && fetchedSellers.length > 0) {
          const sorted = [...fetchedSellers].sort((a, b) => {
            return (
              getRawDistanceKm(coords.latitude, coords.longitude, a.latitude, a.longitude) -
              getRawDistanceKm(coords.latitude, coords.longitude, b.latitude, b.longitude)
            );
          });
          setSelectedSeller(sorted[0]);
          sendMapMessage({
            type: "UPDATE_DATA",
            sellers: sorted,
            userLocation: coords,
          });
        }
      });
    } catch (err) {
      console.warn("Data initialization notice:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchSellersData, fetchLocationData, sendMapMessage]);

  useEffect(() => {
    initData();
  }, [initData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    initData();
  }, [initData]);

  // Keep map synchronized whenever sellers or userLocation updates
  useEffect(() => {
    if (sellers.length > 0 || userLocation) {
      sendMapMessage({
        type: "UPDATE_DATA",
        sellers: sellers,
        userLocation: userLocation,
      });
    }
  }, [sellers, userLocation, sendMapMessage]);

  // Filtered sellers for Directory List
  const displayedSellers = useMemo(() => {
    let list = [...sellers];

    // Filter by search query
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((s) => {
        const name = (s.full_name || "").toLowerCase();
        const city = (s.city || "").toLowerCase();
        const address = (s.address || "").toLowerCase();
        const mobile = (s.mobile || "").toLowerCase();
        const email = (s.email || "").toLowerCase();
        return name.includes(q) || city.includes(q) || address.includes(q) || mobile.includes(q) || email.includes(q);
      });
    }

    // Filter by segment chip
    if (activeFilter === "products") {
      list = list.filter((s) => (s.productCount || 0) > 0);
    } else if (activeFilter === "nearby" && userLocation) {
      list = list.filter((s) => {
        const dist = getRawDistanceKm(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude);
        return dist <= 15;
      });
    }

    // Sort by proximity if userLocation exists
    if (userLocation) {
      list.sort((a, b) => {
        return (
          getRawDistanceKm(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude) -
          getRawDistanceKm(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude)
        );
      });
    }

    return list;
  }, [sellers, searchQuery, activeFilter, userLocation]);

  // Search area and sellers
  const fetchSuggestions = async (text) => {
    try {
      if (!text || text.trim().length === 0) {
        setSuggestions([]);
        return;
      }
      const cleanQuery = text.trim().toLowerCase();
      setSearchLoading(true);

      const results = [];

      // 1. Search matching local sellers & stores
      try {
        const matchedSellers = sellers.filter((s) => {
          const name = (s.full_name || "").toLowerCase();
          const city = (s.city || "").toLowerCase();
          const address = (s.address || "").toLowerCase();
          const mobile = (s.mobile || "").toLowerCase();
          return (
            name.includes(cleanQuery) ||
            city.includes(cleanQuery) ||
            address.includes(cleanQuery) ||
            mobile.includes(cleanQuery)
          );
        });

        matchedSellers.slice(0, 5).forEach((s) => {
          results.push({
            id: `seller-${s.id}`,
            title: s.full_name,
            subtitle: s.address || s.city || `Seller • ${s.productCount} products`,
            type: "seller",
            latitude: s.latitude,
            longitude: s.longitude,
            data: s,
          });
        });
      } catch (matchErr) {
        console.warn("Local seller match error:", matchErr);
      }

      // 2. Search OpenStreetMap Nominatim for geographic areas / places
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=4`,
          {
            headers: { "User-Agent": "NeedsTrackingApp/1.0" },
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
                title: item.display_name ? item.display_name.split(",")[0] : "Location",
                subtitle: item.display_name || "",
                type: "area",
                latitude: parseFloat(item.lat),
                longitude: parseFloat(item.lon),
                data: item,
              });
            }
          });
        }
      } catch (nomErr) {
        console.warn("Nominatim search notice:", nomErr.message);
      }

      setSuggestions(results);
    } catch (err) {
      console.warn("Error in fetchSuggestions:", err);
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchChange = (text) => {
    try {
      setSearchQuery(text);
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      debounceTimeout.current = setTimeout(() => fetchSuggestions(text), 300);
    } catch (err) {
      console.warn("handleSearchChange error:", err);
    }
  };

  const handleSelectSuggestion = (item) => {
    try {
      if (!item) return;
      setSearchQuery(item.title || "");
      setSuggestions([]);

      if (item.latitude && item.longitude) {
        sendMapMessage({
          type: "SET_VIEW",
          latitude: item.latitude,
          longitude: item.longitude,
          zoom: item.type === "seller" ? 16 : 14,
        });

        if (item.type === "seller" && item.data) {
          setSelectedSeller(item.data);
          sendMapMessage({
            type: "OPEN_SELLER",
            sellerId: item.data.id,
          });
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
      console.warn("handleSelectSuggestion error:", err);
    }
  };

  const handleClearSearch = () => {
    try {
      setSearchQuery("");
      setSuggestions([]);
      if (userLocation) {
        sendMapMessage({
          type: "SET_VIEW",
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          zoom: 13,
        });
      } else if (sellers.length > 0) {
        sendMapMessage({
          type: "UPDATE_DATA",
          sellers: sellers,
          userLocation: userLocation,
        });
      }
    } catch (err) {
      console.warn("handleClearSearch error:", err);
    }
  };

  const handleRecenterLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 4000,
      });
      if (loc?.coords) {
        setUserLocation(loc.coords);
        sendMapMessage({
          type: "UPDATE_DATA",
          sellers: sellers,
          userLocation: loc.coords,
        });
        sendMapMessage({
          type: "SET_VIEW",
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          zoom: 14,
        });
      }
    } catch (e) {
      if (userLocation) {
        sendMapMessage({
          type: "SET_VIEW",
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          zoom: 14,
        });
      } else {
        showAlert(
          "Location Notice",
          "Could not obtain current GPS position. Please check location permissions and GPS toggle."
        );
      }
    }
  };

  const handleLogout = () => {
    showAlert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            setIsMenuVisible(false);
            await supabase.auth.signOut();
            navigation.reset({
              index: 0,
              routes: [{ name: "Welcome" }],
            });
          } catch (err) {
            console.error("Logout error:", err);
          }
        },
      },
    ]);
  };

  const handleOpenDirections = (lat, lng, label) => {
    try {
      if (!lat || !lng) return;
      const latLng = `${lat},${lng}`;
      const scheme = Platform.select({
        ios: "maps:0,0?q=",
        android: "geo:0,0?q=",
        default: "https://www.google.com/maps/search/?api=1&query=",
      });
      const url = Platform.select({
        ios: `${scheme}${encodeURIComponent(label || "Seller Location")}@${latLng}`,
        android: `${scheme}${latLng}(${encodeURIComponent(label || "Seller Location")})`,
        default: `${scheme}${latLng}`,
      });
      Linking.openURL(url).catch((err) => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latLng}`).catch(() => {});
      });
    } catch (err) {
      console.warn("Error opening directions:", err);
    }
  };

  const onMapMessage = (event) => {
    try {
      let raw = event.nativeEvent?.data || event.data;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch (parseErr) {
          return;
        }
      }
      if (!raw) return;

      if (raw.type === "mapReady") {
        if (sellers.length > 0 || userLocation) {
          sendMapMessage({
            type: "UPDATE_DATA",
            sellers: sellers,
            userLocation: userLocation,
          });
        }
      } else if (raw.type === "viewProducts") {
        safeNavigate("Catalog", { userId: raw.sellerId, sellerId: raw.sellerId, sellerName: raw.name });
      } else if (raw.type === "sellerClicked") {
        setSelectedSeller(raw.seller);
      } else if (raw.type === "getDirections") {
        handleOpenDirections(raw.latitude, raw.longitude, raw.name);
      }
    } catch (err) {
      console.error("Error handling map message:", err);
    }
  };

  // Generate Leaflet Map HTML
  const initialLat = userLocation?.latitude || (sellers.length > 0 ? sellers[0].latitude : DEFAULT_LAT);
  const initialLon = userLocation?.longitude || (sellers.length > 0 ? sellers[0].longitude : DEFAULT_LON);
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
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
                width: 40px;
                height: 40px;
                background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%);
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                box-shadow: 0 4px 14px rgba(0,122,255,0.45);
                border: 2.5px solid #FFFFFF;
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .seller-pin:hover {
                transform: rotate(-45deg) scale(1.15);
                box-shadow: 0 6px 18px rgba(0,122,255,0.65);
            }
            .seller-pin i {
                transform: rotate(45deg);
                color: #FFFFFF;
                font-size: 16px;
            }
            .user-pulse-marker {
                width: 20px;
                height: 20px;
                background: #10B981;
                border: 3.5px solid #FFFFFF;
                border-radius: 50%;
                box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.4);
            }
            .custom-popup .leaflet-popup-content-wrapper {
                border-radius: 16px;
                padding: 6px;
                box-shadow: 0 10px 30px rgba(15,23,42,0.2);
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
                padding: 3px 8px;
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
                padding: 10px 14px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                margin-top: 10px;
                box-shadow: 0 4px 10px rgba(0,122,255,0.3);
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
                padding: 8px 12px;
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

                // Reliable standard OpenStreetMap tile layer
                L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19
                }).addTo(map);

                window.map = map;
                window.sellerMarkers = {};
                window.markerLayerGroup = L.layerGroup().addTo(map);
                window.userMarker = null;

                function postToParent(data) {
                    try {
                        var json = typeof data === 'string' ? data : JSON.stringify(data);
                        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                            window.ReactNativeWebView.postMessage(json);
                        }
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage(json, '*');
                        }
                    } catch (e) {
                        console.error('postToParent error:', e);
                    }
                }

                function viewProducts(sellerId, name) {
                    postToParent({ type: 'viewProducts', sellerId: sellerId, name: name });
                }

                function getDirections(latitude, longitude, name) {
                    postToParent({ type: 'getDirections', latitude: latitude, longitude: longitude, name: name });
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
                                html: '<div class="user-pulse-marker"></div>',
                                iconSize: [20, 20],
                                iconAnchor: [10, 10]
                            });
                            window.userMarker = L.marker([userLoc.latitude, userLoc.longitude], { icon: userIcon })
                                .addTo(window.map)
                                .bindPopup('<b>You are here</b>');
                        }

                        window.sellerMarkers = {};
                        if (sellersData && sellersData.length > 0) {
                            sellersData.forEach(function(seller) {
                                if (!seller || seller.latitude == null || seller.longitude == null) return;
                                boundsPoints.push([seller.latitude, seller.longitude]);

                                var sellerIcon = L.divIcon({
                                    className: 'seller-icon-wrapper',
                                    html: '<div class="seller-pin"><i class="fas fa-store"></i></div>',
                                    iconSize: [40, 40],
                                    iconAnchor: [20, 40],
                                    popupAnchor: [0, -40]
                                });

                                var safeName = (seller.full_name || 'Seller Store').replace(/"/g, '&quot;');
                                var popupHtml =
                                    '<div class="popup-header">' +
                                        '<i class="fas fa-store" style="color:#007AFF; font-size:18px;"></i>' +
                                        '<h4 class="popup-title">' + (seller.full_name || 'Seller Store') + '</h4>' +
                                    '</div>' +
                                    '<div class="popup-tag">' + (seller.hasExactCoordinates === false ? 'Store • Location Approximate' : 'Verified Store') + '</div>' +
                                    (seller.city ? '<div class="popup-info-row"><i class="fas fa-map-marker-alt" style="color:#64748B;"></i> ' + seller.city + '</div>' : '') +
                                    (seller.mobile ? '<div class="popup-info-row"><i class="fas fa-phone" style="color:#64748B;"></i> ' + seller.mobile + '</div>' : '') +
                                    (seller.productCount > 0 ? '<div class="popup-info-row"><i class="fas fa-box-open" style="color:#10B981;"></i> <b>' + seller.productCount + ' Products</b> available</div>' : '') +
                                    '<button class="popup-btn-primary" data-action="viewProducts" data-seller-id="' + seller.id + '" data-seller-name="' + safeName + '">' +
                                        '<i class="fas fa-shopping-bag"></i> Browse Store' +
                                    '</button>' +
                                    '<button class="popup-btn-secondary" data-action="getDirections" data-lat="' + seller.latitude + '" data-lng="' + seller.longitude + '" data-seller-name="' + safeName + '">' +
                                        '<i class="fas fa-directions"></i> Directions' +
                                    '</button>';

                                var marker = L.marker([seller.latitude, seller.longitude], { icon: sellerIcon })
                                    .bindPopup(popupHtml, { className: 'custom-popup' });

                                marker.on('click', function() {
                                    postToParent({ type: 'sellerClicked', seller: seller });
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
                                window.map.fitBounds(window.sellerBounds.pad(0.25));
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

                // Event delegation for popup buttons
                document.addEventListener('click', function(e) {
                    var btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    if (action === 'viewProducts') {
                        var sellerId = btn.getAttribute('data-seller-id');
                        var name = btn.getAttribute('data-seller-name');
                        viewProducts(sellerId, name);
                    } else if (action === 'getDirections') {
                        var lat = parseFloat(btn.getAttribute('data-lat'));
                        var lng = parseFloat(btn.getAttribute('data-lng'));
                        var name = btn.getAttribute('data-seller-name');
                        getDirections(lat, lng, name);
                    }
                });

                // Listen for incoming commands from parent window / React Native
                function handleIncomingMessage(event) {
                    try {
                        var data = event.data !== undefined ? event.data : event;
                        if (typeof data === 'string') {
                            try { data = JSON.parse(data); } catch(e) { return; }
                        }
                        if (!data) return;

                        if (data.type === 'UPDATE_DATA') {
                            window.updateMapData(data.sellers, data.userLocation);
                        } else if (data.type === 'SET_VIEW') {
                            if (window.map && data.latitude && data.longitude) {
                                window.map.setView([data.latitude, data.longitude], data.zoom || 14, { animate: true });
                            }
                        } else if (data.type === 'OPEN_SELLER') {
                            if (window.sellerMarkers && window.sellerMarkers[data.sellerId]) {
                                window.sellerMarkers[data.sellerId].openPopup();
                            }
                        }
                    } catch (err) {
                        console.error('handleIncomingMessage error:', err);
                    }
                }

                window.addEventListener('message', handleIncomingMessage);
                document.addEventListener('message', handleIncomingMessage);

                // Initial render with embedded sellers data
                var initialSellers = ${JSON.stringify(sellers)};
                var initialUserLoc = ${JSON.stringify(userLocation)};
                if (initialSellers.length > 0 || initialUserLoc) {
                    window.updateMapData(initialSellers, initialUserLoc);
                }

                // Notify parent that map is ready
                postToParent({ type: 'mapReady' });

                window.onload = function() {
                    setTimeout(function() {
                        if (window.map) window.map.invalidateSize();
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

  // Render a seller item in the Directory List
  const renderSellerDirectoryCard = ({ item }) => {
    const itemDistance =
      userLocation && item.latitude && item.longitude
        ? calculateDistance(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude)
        : null;

    const initialLetter = (item.full_name || "S").charAt(0).toUpperCase();

    return (
      <View style={styles.directoryCard}>
        <View style={styles.directoryCardHeader}>
          {/* Avatar / Store Icon */}
          <View style={styles.directoryAvatar}>
            <Text style={styles.directoryAvatarText}>{initialLetter}</Text>
          </View>

          <View style={styles.directoryInfo}>
            <View style={styles.directoryNameRow}>
              <Text style={styles.directoryTitle} numberOfLines={1}>
                {item.full_name}
              </Text>
              <View style={styles.verifiedBadge}>
                <Icon name="check-circle" size={12} color="#0284C7" style={{ marginRight: 3 }} />
                <Text style={styles.verifiedBadgeText}>Verified</Text>
              </View>
            </View>

            <Text style={styles.directoryAddress} numberOfLines={1}>
              {item.address || item.city || "Store Location"}
            </Text>

            {/* Badges row: Distance + Products Count */}
            <View style={styles.directoryBadgesRow}>
              {itemDistance && (
                <View style={styles.distBadge}>
                  <Icon name="location-arrow" size={11} color="#007AFF" />
                  <Text style={styles.distBadgeText}>{itemDistance}</Text>
                </View>
              )}
              <View style={[styles.prodCountBadge, item.productCount > 0 ? styles.prodCountActive : styles.prodCountEmpty]}>
                <Icon name="shopping-bag" size={11} color={item.productCount > 0 ? "#10B981" : "#94A3B8"} />
                <Text style={[styles.prodCountText, item.productCount > 0 ? styles.prodCountTextActive : styles.prodCountTextEmpty]}>
                  {item.productCount > 0 ? `${item.productCount} Products` : "Catalog"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Action Buttons Row */}
        <View style={styles.directoryActionsRow}>
          <TouchableOpacity
            style={styles.directoryPrimaryBtn}
            activeOpacity={0.85}
            onPress={() =>
              safeNavigate("Catalog", {
                userId: item.id,
                sellerId: item.id,
                sellerName: item.full_name,
              })
            }
          >
            <Icon name="shopping-bag" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.directoryPrimaryBtnText}>Enter Store</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.directorySecondaryBtn}
            activeOpacity={0.8}
            onPress={() => {
              setSelectedSeller(item);
              setViewMode("map");
              sendMapMessage({
                type: "SET_VIEW",
                latitude: item.latitude,
                longitude: item.longitude,
                zoom: 16,
              });
              sendMapMessage({
                type: "OPEN_SELLER",
                sellerId: item.id,
              });
            }}
          >
            <Icon name="map-marker" size={16} color="#007AFF" />
          </TouchableOpacity>

          {item.mobile ? (
            <TouchableOpacity
              style={styles.directorySecondaryBtn}
              activeOpacity={0.8}
              onPress={() => {
                try {
                  Linking.openURL(`tel:${item.mobile}`).catch(() => {});
                } catch (_) {}
              }}
            >
              <Icon name="phone" size={16} color="#475569" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.directorySecondaryBtn}
            activeOpacity={0.8}
            onPress={() => handleOpenDirections(item.latitude, item.longitude, item.full_name)}
          >
            <Icon name="compass" size={16} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header & Search Area */}
      <View style={styles.headerSection}>
        <View style={styles.topBar}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.roundIconButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Icon name="arrow-left" size={16} color="#1E293B" />
          </TouchableOpacity>

          {/* Search Input Box */}
          <View style={styles.searchBox}>
            <Icon name="search" size={15} color="#64748B" style={styles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Search store name, city or items..."
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {searchLoading && (
              <ActivityIndicator size="small" color="#007AFF" style={styles.searchLoader} />
            )}
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={handleClearSearch} style={styles.clearBtn}>
                <Icon name="times-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Refresh Data Button */}
          <TouchableOpacity
            style={styles.roundIconButton}
            onPress={onRefresh}
            activeOpacity={0.8}
            accessibilityLabel="Refresh Sellers"
          >
            <Icon name="refresh" size={15} color="#007AFF" />
          </TouchableOpacity>

          {/* 3 Horizontal Dots Menu Button */}
          <TouchableOpacity
            style={styles.roundIconButton}
            onPress={() => setIsMenuVisible(true)}
            activeOpacity={0.8}
            accessibilityLabel="Portals Menu"
          >
            <Icon name="ellipsis-h" size={18} color="#1E293B" />
          </TouchableOpacity>
        </View>

        {/* View Switcher Segmented Control (Map vs Directory) */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === "map" && styles.segmentBtnActive]}
            activeOpacity={0.85}
            onPress={() => setViewMode("map")}
          >
            <Icon
              name="map"
              size={13}
              color={viewMode === "map" ? "#007AFF" : "#64748B"}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentText, viewMode === "map" && styles.segmentTextActive]}>
              Map View
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === "directory" && styles.segmentBtnActive]}
            activeOpacity={0.85}
            onPress={() => setViewMode("directory")}
          >
            <Icon
              name="list"
              size={13}
              color={viewMode === "directory" ? "#007AFF" : "#64748B"}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentText, viewMode === "directory" && styles.segmentTextActive]}>
              Store Directory ({displayedSellers.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter chips for Directory View */}
        {viewMode === "directory" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipsRow}>
            <TouchableOpacity
              style={[styles.chipBtn, activeFilter === "all" && styles.chipBtnActive]}
              onPress={() => setActiveFilter("all")}
            >
              <Text style={[styles.chipText, activeFilter === "all" && styles.chipTextActive]}>
                All Stores ({sellers.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.chipBtn, activeFilter === "products" && styles.chipBtnActive]}
              onPress={() => setActiveFilter("products")}
            >
              <Icon name="shopping-bag" size={11} color={activeFilter === "products" ? "#FFFFFF" : "#10B981"} style={{ marginRight: 4 }} />
              <Text style={[styles.chipText, activeFilter === "products" && styles.chipTextActive]}>
                With Products
              </Text>
            </TouchableOpacity>

            {userLocation && (
              <TouchableOpacity
                style={[styles.chipBtn, activeFilter === "nearby" && styles.chipBtnActive]}
                onPress={() => setActiveFilter("nearby")}
              >
                <Icon name="location-arrow" size={11} color={activeFilter === "nearby" ? "#FFFFFF" : "#007AFF"} style={{ marginRight: 4 }} />
                <Text style={[styles.chipText, activeFilter === "nearby" && styles.chipTextActive]}>
                  Nearby (&lt;15 km)
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>

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
                    item.type === "seller" ? styles.sellerIconBox : styles.areaIconBox,
                  ]}
                >
                  <Icon
                    name={item.type === "seller" ? "home" : "map-marker"}
                    size={14}
                    color={item.type === "seller" ? "#007AFF" : "#10B981"}
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
                    item.type === "seller" ? styles.sellerBadge : styles.areaBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBadgeText,
                      item.type === "seller" ? styles.sellerBadgeText : styles.areaBadgeText,
                    ]}
                  >
                    {item.type === "seller" ? "Seller" : "Area"}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* MAIN CONTENT: Map View OR Directory List View */}
      {viewMode === "map" ? (
        <View style={styles.mapContainer}>
          {/* Interactive Map View */}
          <UniversalWebView
            ref={webViewRef}
            originWhitelist={["*"]}
            source={{ html: htmlContent, baseUrl: "" }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={onMapMessage}
          />

          {/* Floating Loading Banner */}
          {loading && (
            <View style={styles.mapLoadingBadge}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.mapLoadingText}>Loading nearby sellers...</Text>
            </View>
          )}

          {/* Re-center GPS Location Button */}
          <TouchableOpacity
            style={styles.recenterButton}
            onPress={handleRecenterLocation}
            activeOpacity={0.8}
            accessibilityLabel="Re-center location"
          >
            <Icon name="crosshairs" size={20} color="#007AFF" />
          </TouchableOpacity>

          {/* Floating Selected Seller Card (Bottom Sheet) */}
          {selectedSeller && (
            <View style={styles.sellerCard}>
              <View style={styles.sellerCardHeader}>
                <View style={styles.sellerAvatarBox}>
                  <Text style={styles.sellerAvatarLetter}>
                    {(selectedSeller.full_name || "S").charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.sellerDetails}>
                  <View style={styles.sellerNameRow}>
                    <Text style={styles.sellerName} numberOfLines={1}>
                      {selectedSeller.full_name}
                    </Text>
                    <View style={styles.verifiedTag}>
                      <Icon name="check-circle" size={10} color="#0284C7" style={{ marginRight: 2 }} />
                      <Text style={styles.verifiedTagText}>Seller</Text>
                    </View>
                  </View>

                  <Text style={styles.sellerLocation} numberOfLines={1}>
                    {selectedSeller.city || selectedSeller.address || "Seller Store"}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedSeller(null)}
                  style={styles.closeCardButton}
                >
                  <Icon name="times" size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Meta Badges */}
              <View style={styles.sellerMetaRow}>
                {calculatedDistance && (
                  <View style={styles.metaBadge}>
                    <Icon name="location-arrow" size={12} color="#007AFF" />
                    <Text style={styles.metaBadgeText}>{calculatedDistance} away</Text>
                  </View>
                )}
                <View style={[styles.metaBadge, selectedSeller.productCount > 0 && styles.metaBadgeSuccess]}>
                  <Icon name="cubes" size={12} color={selectedSeller.productCount > 0 ? "#10B981" : "#64748B"} />
                  <Text style={[styles.metaBadgeText, selectedSeller.productCount > 0 && styles.metaBadgeTextSuccess]}>
                    {selectedSeller.productCount > 0 ? `${selectedSeller.productCount} Products` : "Catalog"}
                  </Text>
                </View>
                {selectedSeller.mobile ? (
                  <TouchableOpacity
                    style={styles.metaBadge}
                    onPress={() => {
                      try {
                        Linking.openURL(`tel:${selectedSeller.mobile}`).catch(() => {});
                      } catch (_) {}
                    }}
                  >
                    <Icon name="phone" size={12} color="#64748B" />
                    <Text style={styles.metaBadgeText}>{selectedSeller.mobile}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Action Buttons */}
              <View style={styles.sellerActions}>
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  onPress={() =>
                    safeNavigate("Catalog", {
                      userId: selectedSeller.id,
                      sellerId: selectedSeller.id,
                      sellerName: selectedSeller.full_name,
                    })
                  }
                >
                  <Icon name="shopping-bag" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryActionText}>Browse Store / Catalog</Text>
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
        </View>
      ) : (
        /* Store Directory List View */
        <FlatList
          data={displayedSellers}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSellerDirectoryCard}
          contentContainerStyle={styles.directoryListContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#007AFF"]} />
          }
          ListEmptyComponent={
            !loading && (
              <View style={styles.emptyDirectoryContainer}>
                <Icon name="store" size={48} color="#CBD5E1" style={{ marginBottom: 12 }} />
                <Text style={styles.emptyDirectoryTitle}>No Sellers Found</Text>
                <Text style={styles.emptyDirectorySub}>
                  {searchQuery.trim().length > 0
                    ? `No registered stores match "${searchQuery}".`
                    : "No stores currently found for this filter."}
                </Text>
                <TouchableOpacity
                  style={styles.emptyClearBtn}
                  onPress={() => {
                    setSearchQuery("");
                    setActiveFilter("all");
                  }}
                >
                  <Text style={styles.emptyClearBtnText}>View All Sellers</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
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
                <Text style={styles.menuHeaderTitle}>Needs Tracker</Text>
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
                      {(user.email || user.phone || "U").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userEmail} numberOfLines={1}>
                      {user.email || user.phone || "Signed In User"}
                    </Text>
                    <View style={styles.roleTag}>
                      <Text style={styles.roleTagText}>
                        {role ? role.toUpperCase() : "USER"}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.userQuickLinks}>
                  <TouchableOpacity
                    style={styles.quickLinkItem}
                    onPress={() => safeNavigate("OrderList")}
                  >
                    <Icon name="list-alt" size={15} color="#007AFF" />
                    <Text style={styles.quickLinkText}>My Orders</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickLinkItem}
                    onPress={() => safeNavigate("Cart")}
                  >
                    <Icon name="shopping-cart" size={15} color="#007AFF" />
                    <Text style={styles.quickLinkText}>My Cart</Text>
                  </TouchableOpacity>

                  {(role === "seller" || role === "admin") && (
                    <TouchableOpacity
                      style={styles.quickLinkItem}
                      onPress={() => safeNavigate("ProductTabs")}
                    >
                      <Icon name="cubes" size={15} color="#10B981" />
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
              onPress={() => safeNavigate("BuyerLogin")}
            >
              <View style={[styles.portalIconBox, { backgroundColor: "#EFF6FF" }]}>
                <Icon name="shopping-cart" size={20} color="#007AFF" />
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
              onPress={() => safeNavigate("SellerLogin")}
            >
              <View style={[styles.portalIconBox, { backgroundColor: "#ECFDF5" }]}>
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
              onPress={() => safeNavigate("DeliveryManagerLogin")}
            >
              <View style={[styles.portalIconBox, { backgroundColor: "#FAF5FF" }]}>
                <Icon name="truck" size={18} color="#8B5CF6" />
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
    backgroundColor: "#F8FAFC",
  },
  headerSection: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 10 : 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 50,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roundIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
    paddingVertical: 0,
  },
  searchLoader: {
    marginLeft: 6,
  },
  clearBtn: {
    padding: 4,
  },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 3,
    marginTop: 10,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  segmentTextActive: {
    color: "#007AFF",
    fontWeight: "700",
  },
  filterChipsRow: {
    marginTop: 8,
    flexDirection: "row",
  },
  chipBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipBtnActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  webview: {
    flex: 1,
  },
  mapLoadingBadge: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    zIndex: 45,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  mapLoadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
  },
  suggestionDropdown: {
    position: "absolute",
    top: Platform.OS === "ios" ? 110 : 80,
    left: 16,
    right: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    maxHeight: 250,
    zIndex: 60,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  suggestionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  sellerIconBox: {
    backgroundColor: "#EFF6FF",
  },
  areaIconBox: {
    backgroundColor: "#ECFDF5",
  },
  suggestionTextContainer: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  suggestionSubtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  sellerBadge: {
    backgroundColor: "#EFF6FF",
  },
  areaBadge: {
    backgroundColor: "#ECFDF5",
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  sellerBadgeText: {
    color: "#007AFF",
  },
  areaBadgeText: {
    color: "#10B981",
  },
  recenterButton: {
    position: "absolute",
    right: 16,
    bottom: 230,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 35,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sellerCard: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 30 : 16,
    left: 16,
    right: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    zIndex: 40,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sellerCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sellerAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  sellerAvatarLetter: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  sellerDetails: {
    flex: 1,
  },
  sellerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 1,
  },
  verifiedTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedTagText: {
    fontSize: 10,
    color: "#0284C7",
    fontWeight: "700",
  },
  sellerLocation: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  closeCardButton: {
    padding: 6,
  },
  sellerMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 5,
  },
  metaBadgeSuccess: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  metaBadgeText: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
  },
  metaBadgeTextSuccess: {
    color: "#059669",
  },
  sellerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  primaryActionButton: {
    flex: 1,
    backgroundColor: "#007AFF",
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryActionButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  directoryListContent: {
    padding: 16,
    paddingBottom: 40,
  },
  directoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  directoryCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  directoryAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  directoryAvatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  directoryInfo: {
    flex: 1,
  },
  directoryNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  directoryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
    marginRight: 8,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0284C7",
  },
  directoryAddress: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  directoryBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  distBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  distBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#007AFF",
  },
  prodCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  prodCountActive: {
    backgroundColor: "#ECFDF5",
  },
  prodCountEmpty: {
    backgroundColor: "#F1F5F9",
  },
  prodCountText: {
    fontSize: 11,
    fontWeight: "600",
  },
  prodCountTextActive: {
    color: "#059669",
  },
  prodCountTextEmpty: {
    color: "#64748B",
  },
  directoryActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  directoryPrimaryBtn: {
    flex: 1,
    backgroundColor: "#007AFF",
    height: 40,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  directoryPrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  directorySecondaryBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyDirectoryContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyDirectoryTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptyDirectorySub: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  emptyClearBtn: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 18,
  },
  emptyClearBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  menuHeaderTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  menuHeaderSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  menuCloseBtn: {
    padding: 6,
  },
  userSection: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  userProfileRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  userAvatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  roleTag: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#007AFF",
  },
  userQuickLinks: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  quickLinkItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E293B",
  },
  portalsHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  portalItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  portalIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  portalDetails: {
    flex: 1,
  },
  portalTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  portalDesc: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    marginTop: 8,
  },
  logoutButtonText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "700",
  },
});
