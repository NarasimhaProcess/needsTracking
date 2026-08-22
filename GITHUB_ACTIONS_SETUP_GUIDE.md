# GitHub Actions Setup Guide - Android Gradle Build

Complete guide to set up GitHub Actions for building Android APK files using Gradle with environment variables and secrets integration.

## 📋 Overview

This guide provides three GitHub Actions workflows to automatically build your NeedsTracking app:
1. **Development Build** (from `develop` branch) - Debug APK
2. **Preview Build** (from `staging` branch) - Release APK for QA
3. **Production Build** (from `main` branch or tags) - Release APK for production

## 🔧 Step 1: Add GitHub Secrets

### Navigate to Repository Settings
1. Go to your repository: https://github.com/NarasimhaProcess/needsTracking
2. Click **Settings** (top right)
3. Click **Secrets and variables** in left sidebar
4. Click **Actions**
5. Click **New repository secret** button

### Add These 4 Secrets

#### Secret 1: SUPABASE_URL
```
Name: SUPABASE_URL
Value: https://your-project.supabase.co
```
**Where to find:** Supabase Dashboard → Settings → API → Project URL

#### Secret 2: SUPABASE_ANON_KEY
```
Name: SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
**Where to find:** Supabase Dashboard → Settings → API → anon public key

#### Secret 3: GOOGLE_MAPS_API_KEY
```
Name: GOOGLE_MAPS_API_KEY
Value: AIzaSyD1234567890abcdefghijklmnopqr
```
**Where to find:** Google Cloud Console → APIs → Maps SDK for Android → Create API Key

#### Secret 4: ORG_NAME
```
Name: ORG_NAME
Value: Your Organization Name
```
**Any string value representing your organization**

### Verify Secrets Added
After adding all 4 secrets, you should see:
- ✅ SUPABASE_URL
- ✅ SUPABASE_ANON_KEY
- ✅ GOOGLE_MAPS_API_KEY
- ✅ ORG_NAME

## 📂 Step 2: Create Workflow Files

Create these three files in your repository:

### File 1: .github/workflows/android-build-gradle.yml

```yaml
name: Build Android APK - Gradle

on:
  push:
    branches:
      - develop
  pull_request:
    branches:
      - develop

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install Node dependencies
        run: npm ci
      
      - name: Setup Java JDK
        uses: actions/setup-java@v3
        with:
          distribution: 'temurin'
          java-version: '11'
      
      - name: Create .env file with Secrets
        run: |
          cat > .env << EOF
          SUPABASE_URL=${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}
          GOOGLE_MAPS_API_KEY=${{ secrets.GOOGLE_MAPS_API_KEY }}
          ORG_NAME=${{ secrets.ORG_NAME }}
          EOF
      
      - name: Create android/local.properties
        run: |
          mkdir -p android
          cat > android/local.properties << EOF
          sdk.dir=$ANDROID_SDK_ROOT
          ndk.dir=$ANDROID_NDK_ROOT
          org.gradle.jvmargs=-Xmx4096m
          org.gradle.parallel=true
          org.gradle.configureondemand=true
          EOF
      
      - name: Export React Native App for Android
        run: npx expo export --platform android
      
      - name: Setup Android SDK
        uses: android-actions/setup-android@v2
        with:
          api-level: 33
          ndk-version: 25.1.8937393
      
      - name: Build Debug APK with Gradle
        run: |
          cd android
          chmod +x gradlew
          ./gradlew clean assembleDebug --info
      
      - name: Find APK file
        run: |
          find android -name "*.apk" -type f
          ls -lh android/app/build/outputs/apk/debug/
      
      - name: Copy APK to root
        run: cp android/app/build/outputs/apk/debug/app-debug.apk needsTracking-development-debug.apk
      
      - name: Upload APK to Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: needsTracking-development-apk
          path: needsTracking-development-debug.apk
          retention-days: 30
```

### File 2: .github/workflows/android-build-release.yml

```yaml
name: Build Android Release APK - Gradle

on:
  push:
    branches:
      - staging
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install Node dependencies
        run: npm ci
      
      - name: Setup Java JDK
        uses: actions/setup-java@v3
        with:
          distribution: 'temurin'
          java-version: '11'
      
      - name: Create .env file with Secrets
        run: |
          cat > .env << EOF
          SUPABASE_URL=${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}
          GOOGLE_MAPS_API_KEY=${{ secrets.GOOGLE_MAPS_API_KEY }}
          ORG_NAME=${{ secrets.ORG_NAME }}
          EOF
      
      - name: Create android/local.properties
        run: |
          mkdir -p android
          cat > android/local.properties << EOF
          sdk.dir=$ANDROID_SDK_ROOT
          ndk.dir=$ANDROID_NDK_ROOT
          org.gradle.jvmargs=-Xmx4096m
          org.gradle.parallel=true
          org.gradle.configureondemand=true
          EOF
      
      - name: Export React Native App for Android
        run: npx expo export --platform android
      
      - name: Setup Android SDK
        uses: android-actions/setup-android@v2
        with:
          api-level: 33
          ndk-version: 25.1.8937393
      
      - name: Build Release APK with Gradle
        run: |
          cd android
          chmod +x gradlew
          ./gradlew clean assembleRelease --info
      
      - name: Find APK file
        run: |
          find android -name "*.apk" -type f
          ls -lh android/app/build/outputs/apk/release/
      
      - name: Copy APK to root
        run: cp android/app/build/outputs/apk/release/app-release.apk needsTracking-preview-release.apk
      
      - name: Upload APK to Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: needsTracking-preview-apk
          path: needsTracking-preview-release.apk
          retention-days: 30
```

### File 3: .github/workflows/android-build-production.yml

```yaml
name: Build Android Production APK - Gradle

on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install Node dependencies
        run: npm ci
      
      - name: Setup Java JDK
        uses: actions/setup-java@v3
        with:
          distribution: 'temurin'
          java-version: '11'
      
      - name: Create .env file with Secrets
        run: |
          cat > .env << EOF
          SUPABASE_URL=${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}
          GOOGLE_MAPS_API_KEY=${{ secrets.GOOGLE_MAPS_API_KEY }}
          ORG_NAME=${{ secrets.ORG_NAME }}
          EOF
      
      - name: Create android/local.properties
        run: |
          mkdir -p android
          cat > android/local.properties << EOF
          sdk.dir=$ANDROID_SDK_ROOT
          ndk.dir=$ANDROID_NDK_ROOT
          org.gradle.jvmargs=-Xmx4096m
          org.gradle.parallel=true
          org.gradle.configureondemand=true
          EOF
      
      - name: Export React Native App for Android
        run: npx expo export --platform android
      
      - name: Setup Android SDK
        uses: android-actions/setup-android@v2
        with:
          api-level: 33
          ndk-version: 25.1.8937393
      
      - name: Build Production APK with Gradle
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleRelease
      
      - name: Find APK file
        run: |
          find android -name "*.apk" -type f
          ls -lh android/app/build/outputs/apk/release/
      
      - name: Copy APK to root
        run: cp android/app/build/outputs/apk/release/app-release.apk needsTracking-production.apk
      
      - name: Upload APK to Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: needsTracking-production-apk
          path: needsTracking-production.apk
          retention-days: 90
      
      - name: Create Release (on tag)
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v1
        with:
          files: needsTracking-production.apk
          draft: false
          prerelease: false
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 🚀 Step 3: Test Your Setup

### Test Development Build
```bash
git push origin develop
```
- Go to Actions tab
- Wait 8-13 minutes
- Download `needsTracking-development-apk` from Artifacts

### Test Preview Build
```bash
git push origin staging
```
- Go to Actions tab
- Download `needsTracking-preview-apk` from Artifacts

### Test Production Build
```bash
git tag v1.0.0
git push origin v1.0.0
```
- Go to Actions tab
- Download `needsTracking-production-apk` from Artifacts
- Also check Releases page for APK attachment

## 📥 Download APK Files

### From GitHub UI
1. Go to **Actions** tab
2. Click the workflow run
3. Scroll to **Artifacts** section
4. Click the APK artifact name to download

### From GitHub CLI
```bash
# List recent runs
gh run list --workflow android-build-gradle.yml --limit 5

# Download specific artifact
gh run download <RUN_ID> -n needsTracking-development-apk
```

## 🎯 Branch Workflow

| Branch | Workflow | Trigger | Output |
|--------|----------|---------|--------|
| `develop` | android-build-gradle.yml | Push to develop | Debug APK (30 days) |
| `staging` | android-build-release.yml | Push to staging | Release APK (30 days) |
| `main` | android-build-production.yml | Push to main | Production APK (90 days) |
| `v*` tags | android-build-production.yml | Create tag | Production APK + Release |

## 📱 Install APK on Device

```bash
# Connect device via USB or start emulator
adb devices

# Install APK
adb install -r needsTracking-development-debug.apk

# Or for production
adb install -r needsTracking-production.apk
```

## ✅ Final Checklist

- [ ] Added SUPABASE_URL secret to GitHub
- [ ] Added SUPABASE_ANON_KEY secret to GitHub
- [ ] Added GOOGLE_MAPS_API_KEY secret to GitHub
- [ ] Added ORG_NAME secret to GitHub
- [ ] Created `.github/workflows/android-build-gradle.yml`
- [ ] Created `.github/workflows/android-build-release.yml`
- [ ] Created `.github/workflows/android-build-production.yml`
- [ ] Pushed to `develop` branch to test
- [ ] Downloaded APK from Artifacts
- [ ] Installed APK on device with `adb install`
- [ ] Verified app works on device

## 🔍 Troubleshooting

### Build fails with "SUPABASE_URL not found"
- Check all 4 secrets are added
- Verify secret names are exact (case-sensitive)

### APK not found in output
- Check Gradle build log in GitHub Actions
- Ensure Java 11 is installed
- Verify Android SDK is set up

### App crashes after installation
- Check .env variables are correct
- Verify API keys are valid
- Check device logs: `adb logcat | grep needsTracking`

## 📞 Need Help?

1. Check GitHub Actions logs for detailed error messages
2. Verify all secrets are configured correctly
3. Ensure branch names match workflow triggers
4. Review the workflow file YAML syntax
