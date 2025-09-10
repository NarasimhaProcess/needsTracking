import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_EXPENSES_KEY = 'offline_expenses';
const OFFLINE_LOCATIONS_KEY = 'offline_locations';
const OFFLINE_QUICK_TRANSACTIONS_KEY = 'offline_quick_transactions';
const OFFLINE_AREAS_KEY = 'offline_areas';
const OFFLINE_CUSTOMERS_KEY = 'offline_customers';
const OFFLINE_IMAGES_KEY = 'offline_images';

export const OfflineStorageService = {
  getOfflineExpenses: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(OFFLINE_EXPENSES_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      console.error('Error getting offline expenses', e);
      return [];
    }
  },

  saveOfflineExpense: async (expense) => {
    try {
      const offlineExpenses = await OfflineStorageService.getOfflineExpenses();
      offlineExpenses.push(expense);
      const jsonValue = JSON.stringify(offlineExpenses);
      await AsyncStorage.setItem(OFFLINE_EXPENSES_KEY, jsonValue);
    } catch (e) {
      console.error('Error saving offline expense', e);
    }
  },

  clearOfflineExpenses: async () => {
    try {
      await AsyncStorage.removeItem(OFFLINE_EXPENSES_KEY);
    } catch (e) {
      console.error('Error clearing offline expenses', e);
    }
  },

  getOfflineLocations: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      console.error('Error getting offline locations', e);
      return [];
    }
  },

  saveOfflineLocation: async (location) => {
    try {
      const offlineLocations = await OfflineStorageService.getOfflineLocations();
      offlineLocations.push(location);
      const jsonValue = JSON.stringify(offlineLocations);
      await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, jsonValue);
    } catch (e) {
      console.error('Error saving offline location', e);
    }
  },

  clearOfflineLocations: async () => {
    try {
      await AsyncStorage.removeItem(OFFLINE_LOCATIONS_KEY);
    } catch (e) {
      console.error('Error clearing offline locations', e);
    }
  },

  getOfflineQuickTransactions: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(OFFLINE_QUICK_TRANSACTIONS_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      console.error('Error getting offline quick transactions', e);
      return [];
    }
  },

  saveOfflineQuickTransaction: async (transaction) => {
    try {
      const offlineTransactions = await OfflineStorageService.getOfflineQuickTransactions();
      offlineTransactions.push(transaction);
      const jsonValue = JSON.stringify(offlineTransactions);
      await AsyncStorage.setItem(OFFLINE_QUICK_TRANSACTIONS_KEY, jsonValue);
    } catch (e) {
      console.error('Error saving offline quick transaction', e);
    }
  },

  clearOfflineQuickTransactions: async () => {
    try {
      await AsyncStorage.removeItem(OFFLINE_QUICK_TRANSACTIONS_KEY);
    } catch (e) {
      console.error('Error clearing offline quick transactions', e);
    }
  },

  getOfflineAreas: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(OFFLINE_AREAS_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      console.error('Error getting offline areas', e);
      return [];
    }
  },

  saveOfflineAreas: async (areas) => {
    try {
      const jsonValue = JSON.stringify(areas);
      await AsyncStorage.setItem(OFFLINE_AREAS_KEY, jsonValue);
    } catch (e) {
      console.error('Error saving offline areas', e);
    }
  },

  getOfflineCustomers: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(OFFLINE_CUSTOMERS_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      console.error('Error getting offline customers', e);
      return [];
    }
  },

  saveOfflineCustomers: async (customers) => {
    try {
      const jsonValue = JSON.stringify(customers);
      await AsyncStorage.setItem(OFFLINE_CUSTOMERS_KEY, jsonValue);
    } catch (e) {
      console.error('Error saving offline customers', e);
    }
  },

  saveOfflineImage: async (imageData) => { // imageData should contain { id, uri, mimeType }
    try {
      const offlineImages = await AsyncStorage.getItem(OFFLINE_IMAGES_KEY);
      const images = offlineImages != null ? JSON.parse(offlineImages) : [];
      images.push(imageData);
      await AsyncStorage.setItem(OFFLINE_IMAGES_KEY, JSON.stringify(images));
    } catch (e) {
      console.error('Error saving offline image', e);
    }
  },

  getOfflineImage: async (imageId) => {
    try {
      const offlineImages = await AsyncStorage.getItem(OFFLINE_IMAGES_KEY);
      const images = offlineImages != null ? JSON.parse(offlineImages) : [];
      return images.find(img => img.id === imageId);
    } catch (e) {
      console.error('Error getting offline image', e);
      return null;
    }
  },

  clearOfflineImage: async (imageId) => {
    try {
      const offlineImages = await AsyncStorage.getItem(OFFLINE_IMAGES_KEY);
      let images = offlineImages != null ? JSON.parse(offlineImages) : [];
      images = images.filter(img => img.id !== imageId);
      await AsyncStorage.setItem(OFFLINE_IMAGES_KEY, JSON.stringify(images));
    } catch (e) {
      console.error('Error clearing offline image', e);
    }
  },
};
