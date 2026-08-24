import 'dotenv/config';

export default {
  "expo": {
    "name": "Needs Tracker",
    "slug": "needs-tracker",
    "scheme": "needstracking",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "icon": "./assets/icon.png",
    "splash": {
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "NeedsTracking needs access to location to track your movements for location history.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "NeedsTracking needs access to location to track your movements even when the app is in background for continuous tracking.",
        "NSBluetoothAlwaysUsageDescription": "NeedsTracking needs access to Bluetooth to discover and connect to Bluetooth thermal receipt printers.",
        "NSBluetoothPeripheralUsageDescription": "NeedsTracking needs access to Bluetooth to connect to thermal receipt printers.",
        "UIBackgroundModes": [
          "location",
          "background-processing"
        ]
      }
    },
    "android": {
      "usesCleartextTraffic": true,
      "adaptiveIcon": {
        "backgroundColor": "#FFFFFF"
      },
      "googleServicesFile": "./google-services.json",
      "permissions": [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.WAKE_LOCK",
        "android.permission.RECORD_AUDIO",
        "android.permission.INTERNET",
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.BLUETOOTH_SCAN"
      ],
      "package": "com.narasimhaexpo.needstrackingmobile",
      "config": {
        "googleMaps": {
          "apiKey": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ""
        }
      }
    },
    "web": {
      "bundler": "metro",
      "favicon": "./assets/icon.png"
    },
    "experiments": {
      "baseUrl": "/needsTracking/"
    },
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow NeedsTracking to use your location for tracking purposes.",
          "locationAlwaysPermission": "Allow NeedsTracking to use your location in the background for continuous tracking."
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow NeedsTracking to access your photos to upload profile images."
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/icon.png",
          "color": "#ffffff"
        }
      ],
      "expo-web-browser"
    ],
    "updates": {
      "url": "https://u.expo.dev/3ce03f97-e109-4f80-a0ba-b0fa19f6ad0b"
    },
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "sdkVersion": "53.0.0",
    
    "extra": {
      "ORG_NAME": process.env.EXPO_PUBLIC_ORG_NAME || process.env.ORG_NAME || "localwala's",
      "SUPABASE_URL": process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://wtcxhhbigmqrmqdyhzcz.supabase.co",
      "SUPABASE_ANON_KEY": process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Y3hoaGJpZ21xcm1xZHloemN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxNjE3ODgsImV4cCI6MjA2NzczNzc4OH0.AIViaiRT2odHJM2wQXl3dDZ69YxEj7t_7UiRFqEgZjY",
      "eas": {
        "projectId": "3ce03f97-e109-4f80-a0ba-b0fa19f6ad0b"
      }
    }
  }
};
