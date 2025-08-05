# User Tracking Mobile App

A React Native mobile application for real-time location tracking with Supabase backend integration.

## 🚀 Features

### Core Features
- **Real-time Location Tracking** - Track user location with high accuracy
- **Background Location Updates** - Continue tracking when app is in background
- **Offline Support** - Store location data locally when offline
- **Interactive Map** - View location history on interactive map
- **User Authentication** - Secure login/signup with Supabase Auth
- **Push Notifications** - Real-time notifications for location events

### Advanced Features
- **Geofencing** - Get notified when entering/leaving specific areas
- **Route Visualization** - View travel routes on map
- **Location Statistics** - Track distance, speed, and accuracy
- **Data Synchronization** - Sync offline data when connection restored
- **Battery Optimization** - Smart location updates to save battery

## 📱 Screens

1. **Login Screen** - User authentication
2. **Dashboard** - Main control panel with tracking toggle
3. **Map Screen** - Interactive map with location history
4. **Location History** - Detailed location data and statistics
5. **Profile Screen** - User profile and settings

## 🛠 Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Expo CLI
- iOS Simulator (for iOS development)
- Android Studio (for Android development)

### Installation

1. **Clone the repository**
```bash
cd UserTracking
```

2. **Install dependencies**
```bash
npm install
```

3. **Install Expo CLI globally** (if not already installed)
```bash
npm install -g @expo/cli
```

4. **Start the development server**
```bash
npm start
```

5. **Run on device/simulator**
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on your phone

### Environment Configuration

The app is configured to use the same Supabase project as the web application. The credentials are already set in `src/services/supabase.js`.

## 📋 Project Structure

```
UserTracking/
├── App.js                 # Main app component
├── app.json              # Expo configuration
├── package.json          # Dependencies
├── src/
│   ├── screens/          # Screen components
│   │   ├── LoginScreen.js
│   │   ├── DashboardScreen.js
│   │   ├── MapScreen.js
│   │   ├── LocationHistoryScreen.js
│   │   └── ProfileScreen.js
│   ├── services/         # Business logic
│   │   ├── supabase.js
│   │   └── needsTracking.js
│   └── components/       # Reusable components
└── assets/              # Images and icons
```

## 🔧 Key Components

### Location Tracker Service
- Handles GPS location updates
- Manages background location tracking
- Stores offline data
- Syncs with Supabase

### Supabase Integration
- User authentication
- Real-time location storage
- Offline data synchronization
- Push notifications

### Map Integration
- React Native Maps
- Real-time location display
- Route visualization
- Interactive markers

## 📊 Database Schema

The app uses the same Supabase tables as the web application:

### users table
- id (UUID)
- email (string)
- name (string)
- user_type (string)

### location_history table
- id (UUID)
- user_id (UUID)
- latitude (float)
- longitude (float)
- accuracy (float)
- timestamp (timestamp)
- device_name (string)
- location_status (integer)

## 🔐 Permissions

The app requires the following permissions:

### iOS
- Location When In Use
- Location Always and When In Use
- Background App Refresh

### Android
- ACCESS_FINE_LOCATION
- ACCESS_COARSE_LOCATION
- ACCESS_BACKGROUND_LOCATION
- FOREGROUND_SERVICE

## 🚀 Deployment

### Building for Production

1. **Configure app.json**
```json
{
  "expo": {
    "name": "User Tracking",
    "slug": "user-tracking-mobile",
    "version": "1.0.0"
  }
}
```

2. **Build for iOS**
```bash
expo build:ios
```

3. **Build for Android**
```bash
expo build:android
```

### App Store Deployment

1. **iOS App Store**
- Create app in App Store Connect
- Upload build via Xcode or Expo
- Submit for review

2. **Google Play Store**
- Create app in Google Play Console
- Upload APK/AAB file
- Submit for review

## 🔧 Development

### Adding New Features

1. **Create new screen**
```javascript
// src/screens/NewScreen.js
import React from 'react';
import { View, Text } from 'react-native';

export default function NewScreen() {
  return (
    <View>
      <Text>New Screen</Text>
    </View>
  );
}
```

2. **Add to navigation**
```javascript
// App.js
<Stack.Screen name="NewScreen" component={NewScreen} />
```

### Testing

1. **Unit Tests**
```bash
npm test
```

2. **E2E Tests**
```bash
npm run e2e
```

## 🐛 Troubleshooting

### Common Issues

1. **Location not working**
- Check device permissions
- Ensure location services are enabled
- Verify GPS is turned on

2. **Build errors**
- Clear npm cache: `npm cache clean --force`
- Delete node_modules and reinstall
- Update Expo CLI: `npm install -g @expo/cli`

3. **Supabase connection issues**
- Check internet connection
- Verify Supabase credentials
- Check API rate limits

## 📈 Performance Optimization

- **Battery optimization** - Smart location update intervals
- **Offline support** - Local storage for offline data
- **Image optimization** - Compressed assets
- **Memory management** - Efficient component lifecycle

## 🔒 Security

- **Secure authentication** - Supabase Auth
- **Data encryption** - HTTPS connections
- **Permission handling** - Proper permission requests
- **Privacy compliance** - GDPR compliant data handling

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review Expo documentation
- Contact development team

## 📄 License

This project is licensed under the MIT License. 