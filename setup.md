# 🚀 User Tracking Mobile App Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
cd UserTracking
npm install
```

### 2. Install Expo CLI (if not already installed)
```bash
npm install -g @expo/cli
```

### 3. Start the Development Server
```bash
npm start
```

### 4. Run on Device/Simulator
- **iOS Simulator**: Press `i` in terminal
- **Android Emulator**: Press `a` in terminal
- **Physical Device**: Scan QR code with Expo Go app

## 📱 App Features

### ✅ Completed Features
- **User Authentication** - Login/Signup with Supabase
- **Real-time Location Tracking** - GPS with high accuracy
- **Background Location** - Continues tracking when app is closed
- **Interactive Map** - View location history on map
- **Offline Support** - Stores data locally when offline
- **Push Notifications** - Real-time alerts
- **Data Synchronization** - Syncs offline data when online
- **User Profile Management** - Account settings and data management

### 🎯 Key Screens
1. **Login Screen** - User authentication
2. **Dashboard** - Main control panel with tracking toggle
3. **Map Screen** - Interactive map with location history
4. **Location History** - Detailed location data and statistics
5. **Profile Screen** - User profile and settings

## 🔧 Configuration

### Supabase Integration
The app uses the same Supabase project as your web application:
- **URL**: https://wtcxhhbigmqrmqdyhzcz.supabase.co
- **Tables**: users, location_history
- **Authentication**: Supabase Auth

### Permissions Required
- **Location Access** - For GPS tracking
- **Background Location** - For continuous tracking
- **Notifications** - For push alerts

## 📊 Database Schema

### users table
```sql
id (UUID) - Primary key
email (string) - User email
name (string) - User name
user_type (string) - User role
```

### location_history table
```sql
id (UUID) - Primary key
user_id (UUID) - Foreign key to users
latitude (float) - GPS latitude
longitude (float) - GPS longitude
accuracy (float) - GPS accuracy in meters
timestamp (timestamp) - Location timestamp
device_name (string) - Device identifier
location_status (integer) - Tracking status
```

## 🛠 Development Commands

```bash
# Start development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Build for production
expo build:ios
expo build:android

# Eject from Expo (if needed)
expo eject
```

## 📱 Testing

### Physical Device Testing
1. Install Expo Go app on your phone
2. Scan QR code from terminal
3. Grant location permissions
4. Test location tracking features

### Simulator Testing
- **iOS**: Use iOS Simulator with location simulation
- **Android**: Use Android Emulator with GPS simulation

## 🔒 Security Features

- **Secure Authentication** - Supabase Auth with JWT
- **Data Encryption** - HTTPS connections
- **Permission Handling** - Proper permission requests
- **Privacy Compliance** - GDPR compliant data handling

## 📈 Performance Features

- **Battery Optimization** - Smart location update intervals
- **Offline Support** - Local storage for offline data
- **Memory Management** - Efficient component lifecycle
- **Background Processing** - Optimized background tasks

## 🚀 Deployment

### App Store Deployment
1. **iOS App Store**
   - Create app in App Store Connect
   - Build with `expo build:ios`
   - Upload via Xcode or Expo

2. **Google Play Store**
   - Create app in Google Play Console
   - Build with `expo build:android`
   - Upload APK/AAB file

### Environment Variables
The app is configured to use your existing Supabase project. No additional environment setup required.

## 🐛 Troubleshooting

### Common Issues
1. **Location not working**
   - Check device permissions
   - Ensure location services enabled
   - Verify GPS is turned on

2. **Build errors**
   - Clear cache: `npm cache clean --force`
   - Delete node_modules and reinstall
   - Update Expo CLI

3. **Supabase connection issues**
   - Check internet connection
   - Verify Supabase credentials
   - Check API rate limits

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review Expo documentation
- Contact development team

## 🎉 Ready to Use!

Your mobile app is now ready for development and testing. The app includes all the features from your web application plus mobile-specific enhancements like background tracking and offline support. 