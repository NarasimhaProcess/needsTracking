import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { playNotificationChime } from './speechService';

// In-app notification pub/sub listeners
const inAppNotificationListeners = new Set();
let globalNotificationClickHandler = null;

export function addInAppNotificationListener(listener) {
  if (typeof listener === 'function') {
    inAppNotificationListeners.add(listener);
  }
  return () => {
    inAppNotificationListeners.delete(listener);
  };
}

export function setGlobalNotificationClickHandler(handler) {
  globalNotificationClickHandler = handler;
}

export function handleNotificationClick(data) {
  if (typeof globalNotificationClickHandler === 'function') {
    try {
      globalNotificationClickHandler(data);
    } catch (err) {
      console.warn('[NotificationService] Click handler error:', err);
    }
  }
}

export function emitInAppNotification(notification) {
  inAppNotificationListeners.forEach((listener) => {
    try {
      listener(notification);
    } catch (err) {
      console.warn('[NotificationService] In-app listener notice:', err);
    }
  });
}

// Set up notification handler for when the app is in the foreground (Native only)
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (handlerErr) {
    console.warn('[NotificationService] Native notification handler notice:', handlerErr);
  }
}

/**
 * Checks whether Web Browser Notification API is supported
 */
export function isWebNotificationSupported() {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'Notification' in window
  );
}

/**
 * Returns current Web Notification permission: 'granted' | 'denied' | 'default' | 'unsupported'
 */
export function getWebNotificationPermission() {
  if (!isWebNotificationSupported()) return 'unsupported';
  try {
    return window.Notification.permission;
  } catch (_) {
    return 'unsupported';
  }
}

/**
 * Requests Web Notification permission from browser (must be called via user gesture)
 */
export async function requestWebNotificationPermission() {
  if (!isWebNotificationSupported()) {
    console.log('[NotificationService] Web notifications not supported in this environment.');
    return 'unsupported';
  }

  try {
    if (window.Notification.permission === 'granted') {
      return 'granted';
    }

    let permission;
    // Standard Promise syntax
    try {
      permission = await window.Notification.requestPermission();
    } catch (_) {
      // Legacy callback syntax for older browsers
      permission = await new Promise((resolve) => {
        window.Notification.requestPermission((result) => resolve(result));
      });
    }

    console.log('[NotificationService] Web notification permission result:', permission);
    return permission || window.Notification?.permission || 'denied';
  } catch (err) {
    console.warn('[NotificationService] Error requesting web notification permission:', err);
    return window.Notification?.permission || 'denied';
  }
}

/**
 * Helper to create standard desktop Notification instance
 */
function createDesktopNotification(title, options, data) {
  try {
    const notification = new window.Notification(title, options);
    notification.onclick = (event) => {
      try {
        event.preventDefault();
        window.focus();
      } catch (_) {}
      handleNotificationClick(data);
      notification.close();
    };
    return notification;
  } catch (err) {
    console.warn('[NotificationService] Desktop Notification notice:', err);
    return null;
  }
}

/**
 * Triggers a browser system notification popup on Web
 * Safe for both Desktop browsers and ServiceWorker/Android Chrome
 */
export function showWebNotification(title, body, data = {}) {
  if (!isWebNotificationSupported()) return null;

  try {
    if (window.Notification.permission === 'granted') {
      const options = {
        body: body || '',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data,
      };

      // If ServiceWorker is available (required on Chrome for Android)
      if (
        typeof navigator !== 'undefined' &&
        navigator.serviceWorker &&
        navigator.serviceWorker.ready
      ) {
        navigator.serviceWorker.ready
          .then((registration) => {
            if (registration && typeof registration.showNotification === 'function') {
              registration.showNotification(title, options);
            } else {
              createDesktopNotification(title, options, data);
            }
          })
          .catch(() => {
            createDesktopNotification(title, options, data);
          });
      } else {
        return createDesktopNotification(title, options, data);
      }
    }
  } catch (err) {
    console.warn('[NotificationService] showWebNotification notice:', err);
  }
  return null;
}

export async function registerForPushNotificationsAsync() {
  let token = null;

  // Web registration
  if (Platform.OS === 'web') {
    try {
      const permission = getWebNotificationPermission();
      console.log('[NotificationService] Web notification permission status:', permission);
      if (permission === 'granted') {
        token = 'web-notifications-active';
      }
    } catch (err) {
      console.warn('[NotificationService] Web registration notice:', err);
    }
    return token;
  }

  // Native mobile registration (Android / iOS)
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Push notification permissions not granted.');
        return null;
      }

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.manifest?.extra?.eas?.projectId ||
        '3ce03f97-e109-4f80-a0ba-b0fa19f6ad0b';

      if (!projectId) {
        console.warn('Project ID not found for push notifications.');
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      token = tokenData?.data || null;
      console.log('Push notification token:', token);
    } else {
      console.log('Push notifications require a physical device on native platforms.');
    }
  } catch (error) {
    console.warn('registerForPushNotificationsAsync error:', error?.message || error);
  }

  return token;
}

/**
 * Schedule or immediately show a notification message across Web and Mobile.
 * - Always emits an in-app notification message banner.
 * - On Web: triggers browser Notification API (if allowed) and plays audio chime.
 * - On Native: schedules system notification via expo-notifications.
 */
export async function schedulePushNotification(title, body, data = {}) {
  const notifPayload = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title,
    body,
    data,
    date: new Date(),
  };

  // 1. Always emit in-app notification banner message
  emitInAppNotification(notifPayload);

  // 2. Play audio notification chime
  try {
    playNotificationChime();
  } catch (e) {
    console.warn('[NotificationService] Play chime notice:', e);
  }

  // 3. Web browser notification (if granted)
  if (Platform.OS === 'web') {
    if (isWebNotificationSupported() && window.Notification.permission === 'granted') {
      showWebNotification(title, body, data);
    }
    return;
  }

  // 4. Native mobile notification
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: body,
        data: data,
      },
      trigger: { seconds: 1 },
    });
  } catch (nativeErr) {
    console.warn('[NotificationService] scheduleNotificationAsync error:', nativeErr);
  }
}

// Function to send a push notification to an Expo push token
export async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
    return;
  }
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (err) {
    console.warn('[NotificationService] sendPushNotification error:', err);
  }
}