import 'dotenv/config';

export default {
  "expo": {
    "name": "NeedsTracking",
    "slug": "needstracking",
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
        "NSLocationAlwaysUsageDescription": "NeedsTracking needs access to location to track your movements in background for continuous location monitoring.",
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
        "android.permission.INTERNET"
      ],
      "package": "com.narasimhaexpo.needstrackingmobile",
      "config": {
        "googleMaps": {
          // CHANGE 1: Use the new prefixed variable
          "apiKey": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
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
      "url": "https://u.expo.dev/f07d0da1-dedd-4f3f-9739-ab2a1cbbf86f"
    },
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "sdkVersion": "53.0.0",
    
    "extra": {
      // CHANGE 2: Update these references to match your .env and GitHub workflow
      "ORG_NAME": process.env.EXPO_PUBLIC_ORG_NAME || "localwala's",
      "SUPABASE_URL": process.env.EXPO_PUBLIC_SUPABASE_URL,
      "SUPABASE_ANON_KEY": process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      "eas": {
        "projectId": "f07d0da1-dedd-4f3f-9739-ab2a1cbbf86f"
      }
    }
  }
};
