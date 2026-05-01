import 'dotenv/config';

export default {
  "expo": {
    "name": "NeedsTracking",
    "slug": "needstracking",
    "version": "1.0.0",
    "android": {
      "googleServicesFile": "./google-services.json"
     },
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
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.RECORD_AUDIO",
        "android.permission.INTERNET"
      ],
      "package": "com.narasimhaexpo.needstrackingmobile",
      "config": {
        "googleMaps": {
          "apiKey": process.env.GOOGLE_MAPS_API_KEY || "YOUR_GOOGLE_MAPS_API_KEY"
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
      ]
    ],
    "updates": {
      "url": "https://u.expo.dev/f07d0da1-dedd-4f3f-9739-ab2a1cbbf86f"
    },
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "sdkVersion": "53.0.0",
    
    "extra": {
        ORG_NAME: process.env.ORG_NAME || "localwala's",
        SUPABASE_URL: process.env.SUPABASE_URL || "https://qdljcbvesouchefzxsag.supabase.co",
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbGpjYnZlc291Y2hlZnp4c2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzgyOTYsImV4cCI6MjA5MjcxNDI5Nn0.w2OkjwkXJVa69l-Zt56o69wWiyyArGIavVIMhbOn5K8",
      "eas": {
        "projectId": "f07d0da1-dedd-4f3f-9739-ab2a1cbbf86f"
      }
    }
  }
}; 