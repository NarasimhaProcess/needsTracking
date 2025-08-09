import 'dotenv/config';

export default {
  "expo": {
    "name": "NeedsTracking",
    "slug": "needstracking",
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
      "adaptiveIcon": {
        "backgroundColor": "#FFFFFF"
      },
      "permissions": [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.WAKE_LOCK",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.RECORD_AUDIO"
      ],
      "package": "com.narasimhaexpo.needstrackingmobile",
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_GOOGLE_MAPS_API_KEY"
        }
      }
    },
    "web": {
      "bundler": "metro",
      "favicon": "./assets/icon.png"
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
      SUPABASE_URL: "https://wtcxhhbigmqrmqdyhzcz.supabase.co",
      SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Y3hoaGJpZ21xcm1xZHloemN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxNjE3ODgsImV4cCI6MjA2NzczNzc4OH0.AIViaiRT2odHJM2wQXl3dDZ69YxEj7t_7UiRFqEgZjY",
      "eas": {
        "projectId": "f07d0da1-dedd-4f3f-9739-ab2a1cbbf86f"
      }
    }
  }
}; 