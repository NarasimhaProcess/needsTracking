# Multi-Role Commerce & Real-Time Delivery Tracking App

A full-stack React Native mobile application supporting **Buyers**, **Sellers**, and **Delivery Partners** with real-time location tracking, instant order dispatch, and Supabase backend integration.

> 📖 **Comprehensive Documentation**:
> - [**`LATEST_PROCESS_AND_SYSTEM_FLOW.md`**](file:///workspaces/needsTracking/LATEST_PROCESS_AND_SYSTEM_FLOW.md) — Detailed end-to-end architecture, role-based workflows, and database setup.
> - [**`LIVE_TRACKING_AND_DELIVERY_SYSTEM_UPDATES.md`**](file:///workspaces/needsTracking/LIVE_TRACKING_AND_DELIVERY_SYSTEM_UPDATES.md) — Live location tracking architecture, delivery dispatch logic, sellers-only map, and push notifications flow.

---

## 🚀 Key Roles & Capabilities

### 🛒 1. Buyers (Customers)
- **Authentication**: Email/Password & Google One-Tap sign-in with automatic profile creation and guest cart migration.
- **Product Catalog**: Multi-variant browsing with dynamic price updates and high-res media.
- **Cart & Checkout**: Real-time stock checks, Cash on Delivery (COD) & online payment selection.
- **Live Order Tracking**: Interactive Leaflet map with animated vehicle marker tracking the assigned delivery partner in real time.

### 🏪 2. Sellers (Merchants)
- **Product Management**: Create, edit, and organize multi-variant products with media uploads.
- **Inventory & Orders**: Real-time stock decrement, counter/shop order processing (dine-in/parcel).
- **Thermal Receipt Printing**: 58mm / 80mm Bluetooth ESC/POS and Web receipts featuring prominent **Day-Wise Order Numbers (Daily Order / Token #)** and full **Order Numbers**.
- **Real-Time Voice Announcements**: In-app Web Audio chime alert and Text-to-Speech voice notifications announcing incoming orders and receipts aloud.

### 🛵 3. Delivery Partners (Delivery Managers)
- **Instant Order Dispatch**: Orders created by buyers or sellers immediately broadcast to active delivery partners via push notifications, Supabase Realtime, and voice alert announcements.
- **Available Deliveries Pool**: One-tap **"Accept Delivery"** action to claim unassigned delivery requests.
- **Active Task Management**: One-tap status transitions (`Start Delivery` $\rightarrow$ `Mark as Delivered`).
- **Turn-by-Turn Directions**: Direct integration with Google Maps and Apple Maps navigation.
- **Live Location Broadcasting**: High-accuracy GPS streaming (`expo-location`) to keep customers informed.

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

## 🚀 CI/CD & Deployment Guide

This project includes automated GitHub Actions workflows for building Android APKs, running EAS Cloud builds, and deploying the Web application to GitHub Pages.

---

### 🔑 1. Required GitHub Secrets Configuration

Before triggering builds, configure the repository secrets in GitHub:
**Repository** $\rightarrow$ **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions** $\rightarrow$ **New repository secret**

| Secret Name | Required? | Description & Source |
| :--- | :---: | :--- |
| **`SUPABASE_URL`** | **Mandatory** | Your Supabase Project URL (`https://xxxx.supabase.co`).<br>📍 *Supabase Dashboard $\rightarrow$ Project Settings $\rightarrow$ API* |
| **`SUPABASE_ANON_KEY`** | **Mandatory** | Your Supabase Anonymous Public API key (`eyJhb...`).<br>📍 *Supabase Dashboard $\rightarrow$ Project Settings $\rightarrow$ API* |
| **`GOOGLE_MAPS_API_KEY`** | *Optional* | Google Maps API key (if using native Google Maps SDK). |
| **`ORG_NAME`** | *Optional* | Organization/store branding string (defaults to `"localwala's"`). |
| **`EXPO_TOKEN`** | *For EAS Cloud* | Expo Access Token.<br>📍 *Create at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens)* |

---

### ⚙️ 2. Workflow Permissions & GitHub Pages Setup

1. **Workflow Permissions**:
   - Go to **Settings** $\rightarrow$ **Actions** $\rightarrow$ **General**.
   - Under **Workflow permissions**, select **"Read and write permissions"** and check **"Allow GitHub Actions to create and approve pull requests"**.
   - Click **Save**.
2. **GitHub Pages (Web App)**:
   - Go to **Settings** $\rightarrow$ **Pages**.
   - Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose branch **`gh-pages`** and folder **`/ (root)`**, then click **Save**.

---

### 📦 3. Automated Build Workflows

#### Option A: Free Android APK Build (Gradle on GitHub Runner)
- **Workflow File**: [`.github/workflows/android-build-gradle.yml`](file:///.github/workflows/android-build-gradle.yml)
- **How to Run**: Go to **Actions** tab $\rightarrow$ **Build Android APK - Gradle** $\rightarrow$ **Run workflow**.
- **Output**: Generates and uploads a standalone `.apk` directly as a downloadable GitHub Actions artifact (No EAS build limits or credits required).

#### Option B: EAS Cloud Build (Android / iOS / Production)
- **Workflow File**: [`.github/workflows/eas-build.yml`](file:///.github/workflows/eas-build.yml)
- **How to Run**: Go to **Actions** tab $\rightarrow$ **EAS Build (Expo Cloud)** $\rightarrow$ Select platform (`android`/`ios`/`all`) and profile (`preview`/`production`) $\rightarrow$ **Run workflow**.
- **Output**: Builds `.apk`/`.aab` or iOS builds in the Expo Cloud and attaches live dashboard links.

#### Option C: Automated Web Deployment (GitHub Pages)
- **Workflow File**: [`.github/workflows/deploy-web.yml`](file:///.github/workflows/deploy-web.yml)
- **How to Run**: Triggers automatically on every `push` to `master` or `main` (or run manually via **Run workflow**).
- **Output**: Exports and publishes the web application to GitHub Pages at `https://NarasimhaProcess.github.io/needsTracking/`.

---

### 📱 4. Local CLI Builds (Alternative)

```bash
# Build standalone Android APK locally using EAS CLI
eas build -p android --profile preview

# Build production Android App Bundle (AAB) for Google Play
eas build -p android --profile production

# Export web build locally
npx expo export --platform web
```

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