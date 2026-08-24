import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Set up notification handler for when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token = null;

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
      if (Platform.OS !== 'web') {
        console.log('Push notifications require a physical device.');
      } else {
        console.log('Push notifications are not fully supported on web without additional configuration.');
      }
    }
  } catch (error) {
    console.warn('registerForPushNotificationsAsync error:', error?.message || error);
  }

  return token;
}

export async function schedulePushNotification(title, body, data) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: title,
      body: body,
      data: data,
    },
    trigger: { seconds: 2 },
  });
}

// New function to send a push notification
export async function sendPushNotification(expoPushToken, title, body, data = {}) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}