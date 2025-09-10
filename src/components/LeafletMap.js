import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { WebView } from 'react-native-webview';
import { StyleSheet, View } from 'react-native';

const SimpleLeafletMap = forwardRef(({ 
  initialRegion, 
  markerCoordinate, 
  userLocations = [],
  onMarkerDragEnd,
  onMapPress 
}, ref) => {
  const webViewRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  
  // Store initial data only - don't update after map is loaded
  const [initialMapData] = useState({
    initialRegion,
    markerCoordinate,
    userLocations
  });

  // Send commands to existing map instead of reloading
  const sendMessageToWebView = useCallback((message) => {
    if (webViewRef.current && isMapReady) {
      const script = `
        try {
          ${message}
        } catch (error) {
          console.error('Error executing command:', error);
        }
        true; // Return true to avoid console warnings
      `;
      webViewRef.current.injectJavaScript(script);
    }
  }, [isMapReady]);

  // Update map when props change, but without reloading WebView
  useEffect(() => {
    if (!isMapReady) return;

    // Update route if userLocations changed
    sendMessageToWebView(`
      if (window.mapFunctions && window.mapFunctions.updateRoute) {
        window.mapFunctions.updateRoute(${JSON.stringify(userLocations)});
      }
    `);
  }, [userLocations, sendMessageToWebView, isMapReady]);

  useEffect(() => {
    if (!isMapReady || !markerCoordinate) return;

    // Update marker position if markerCoordinate changed
    sendMessageToWebView(`
      if (window.mapFunctions && window.mapFunctions.updateMarker) {
        window.mapFunctions.updateMarker(${markerCoordinate.latitude}, ${markerCoordinate.longitude});
      }
    `);
  }, [markerCoordinate, sendMessageToWebView, isMapReady]);

  // Create dynamic HTML with embedded data (only used once on initialization)
  const createMapHtml = (data) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Leaflet Map</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <style>
    html, body, #map {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
    }
    .leaflet-control-attribution {
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    // Embedded data from React Native
    const mapData = ${JSON.stringify(data)};
    
    let map;
    let marker;
    let routePolyline;
    let locationMarkers = [];

    function initializeMap() {
      try {
        map = L.map('map', {
          zoomControl: true,
          attributionControl: true
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Initialize with data
        if (mapData.initialRegion) {
          const { latitude, longitude } = mapData.initialRegion;
          map.setView([latitude, longitude], 13);
          
          // Add marker
          if (mapData.markerCoordinate) {
            const { latitude: markerLat, longitude: markerLng } = mapData.markerCoordinate;
            marker = L.marker([markerLat, markerLng], { 
              draggable: true,
              title: 'Current Location'
            }).addTo(map);
            
            marker.on('dragend', function(e) {
              const message = JSON.stringify({
                type: 'markerDragEnd',
                latitude: e.target.getLatLng().lat,
                longitude: e.target.getLatLng().lng
              });
              
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(message);
              }
            });
          }
        } else {
          map.setView([0, 0], 2);
        }

        // Add route if locations exist
        if (mapData.userLocations && mapData.userLocations.length > 0) {
          updateRoute(mapData.userLocations);
        }

        // Handle map clicks
        map.on('click', function(e) {
          const message = JSON.stringify({
            type: 'mapClick',
            latitude: e.latlng.lat,
            longitude: e.latlng.lng
          });
          
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(message);
          }
        });

        // Notify React Native that map is ready
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapReady'
          }));
        }

        console.log('Map initialized successfully');
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }

    // Function to center map on location without full reload
    function centerOnLocation(latitude, longitude, zoom = 15) {
      if (!map) return; 
      
      map.setView([latitude, longitude], zoom, {
        animate: true,
        duration: 1
      });
      
      // Update marker position
      if (marker) {
        marker.setLatLng([latitude, longitude]);
      } else {
        marker = L.marker([latitude, longitude], { 
          draggable: true,
          title: 'Current Location'
        }).addTo(map);
        
        marker.on('dragend', function(e) {
          const message = JSON.stringify({
            type: 'markerDragEnd',
            latitude: e.target.getLatLng().lat,
            longitude: e.target.getLatLng().lng
          });
          
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(message);
          }
        });
      }
    }

    // Function to update marker position only
    function updateMarker(latitude, longitude) {
      if (!map) return; 
      
      if (marker) {
        marker.setLatLng([latitude, longitude]);
      } else {
        marker = L.marker([latitude, longitude], { 
          draggable: true,
          title: 'Current Location'
        }).addTo(map);
        
        marker.on('dragend', function(e) {
          const message = JSON.stringify({
            type: 'markerDragEnd',
            latitude: e.target.getLatLng().lat,
            longitude: e.target.getLatLng().lng
          });
          
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(message);
          }
        });
      }
    }

    // Function to clear all user locations
    function clearUserLocations() {
      if (!map) return; 
      
      // Remove existing route
      if (routePolyline) {
        map.removeLayer(routePolyline);
        routePolyline = null;
      }
      
      // Remove existing location markers
      locationMarkers.forEach(marker => {
        map.removeLayer(marker);
      });
      locationMarkers = [];
    }

    // Function to update route
    function updateRoute(locations) {
      if (!map || !locations || locations.length === 0) {
        clearUserLocations();
        return;
      }
      
      // Clear existing route first
      clearUserLocations();
      
      // Create route polyline
      const routeCoords = locations.map(loc => [loc.latitude, loc.longitude]);
      routePolyline = L.polyline(routeCoords, {
        color: 'blue',
        weight: 3,
        opacity: 0.7
      }).addTo(map);
      
      // Add small markers for each location
      locations.forEach((location, index) => {
        const locationMarker = L.circleMarker([location.latitude, location.longitude], {
          radius: 4,
          fillColor: index === 0 ? 'green' : (index === locations.length - 1 ? 'red' : 'blue'),
          color: 'white',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(map);
        
        // Add popup with timestamp if available
        if (location.timestamp) {
          locationMarker.bindPopup(
            `
            <div>
              <strong>Location ${index + 1}</strong><br>
              Lat: ${location.latitude.toFixed(6)}<br>
              Lng: ${location.longitude.toFixed(6)}<br>
              Time: ${new Date(location.timestamp).toLocaleString()}
            </div>
          `
          );
        }
        
        locationMarkers.push(locationMarker);
      });
      
      // Don't auto-fit bounds - preserve user's current zoom/pan
      console.log('Route updated with', locations.length, 'points');
    }

    // Function to fit map to route
    function fitToRoute() {
      if (!map || !routePolyline) return; 
      
      const bounds = routePolyline.getBounds();
      map.fitBounds(bounds.pad(0.1), {
        animate: true,
        duration: 1
      });
    }

    // Make functions available globally for injection
    window.mapFunctions = {
      centerOnLocation,
      updateMarker,
      clearUserLocations,
      updateRoute,
      fitToRoute
    };

    // Initialize map when page loads
    document.addEventListener('DOMContentLoaded', function() {
      console.log('DOM loaded, initializing map');
      initializeMap();
    });

    // Fallback initialization
    setTimeout(() => {
      if (!map) {
        console.log('Fallback initialization');
        initializeMap();
      }
    }, 1000);
  </script>
</body>
</html>`;
  };

  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Received message from WebView:', data);
      
      switch (data.type) {
        case 'mapReady':
          setIsMapReady(true);
          break;
          
        case 'mapClick':
          onMapPress && onMapPress({
            latitude: data.latitude,
            longitude: data.longitude
          });
          break;
          
        case 'markerDragEnd':
          onMarkerDragEnd && onMarkerDragEnd({
            latitude: data.latitude,
            longitude: data.longitude
          });
          break;
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    centerOnLocation: (location, zoom = 15) => {
      sendMessageToWebView(`
        if (window.mapFunctions && window.mapFunctions.centerOnLocation) {
          window.mapFunctions.centerOnLocation(${location.latitude}, ${location.longitude}, ${zoom});
        }
      `);
    },
    
    clearMap: () => {
      sendMessageToWebView(`
        if (window.mapFunctions && window.mapFunctions.clearUserLocations) {
          window.mapFunctions.clearUserLocations();
        }
      `);
    },
    
    fitToRoute: () => {
      sendMessageToWebView(`
        if (window.mapFunctions && window.mapFunctions.fitToRoute) {
          window.mapFunctions.fitToRoute();
        }
      `);
    },

    updateRoute: (locations) => {
      sendMessageToWebView(`
        if (window.mapFunctions && window.mapFunctions.updateRoute) {
          window.mapFunctions.updateRoute(${JSON.stringify(locations)});
        }
      `);
    },

    updateMarker: (location) => {
      sendMessageToWebView(`
        if (window.mapFunctions && window.mapFunctions.updateMarker) {
          window.mapFunctions.updateMarker(${location.latitude}, ${location.longitude});
        }
      `);
    }
  }));

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: createMapHtml(initialMapData) }}
        style={styles.webview}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        bounces={false}
        scrollEnabled={false}
        mixedContentMode="compatibility"
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error: ', nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
        }}
        onLoadStart={() => {
          console.log('WebView load started');
          setIsMapReady(false);
        }}
        onLoadEnd={() => console.log('WebView load ended')}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});

export default SimpleLeafletMap;