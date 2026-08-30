import { Alert, Platform } from "react-native";

/**
 * Universal Alert replacement that works seamlessly across Web, iOS, and Android.
 * In React Native Web, Alert.alert does not handle button callbacks or confirmations.
 * This utility uses window.alert and window.confirm on Web, and Alert.alert on Native.
 *
 * @param {string} title - Alert title
 * @param {string} [message] - Alert message
 * @param {Array<{ text: string, style?: string, onPress?: () => void }>} [buttons] - Buttons array
 * @param {object} [options] - Optional Alert options
 */
export const showAlert = (title, message, buttons = [{ text: "OK" }], options = {}) => {
  if (Platform.OS === "web") {
    const fullText = [title, message].filter(Boolean).join("\n\n");

    // Single-button or notification alert
    if (!buttons || buttons.length <= 1) {
      if (typeof window !== "undefined") {
        window.alert(fullText);
      }
      if (buttons && buttons[0] && typeof buttons[0].onPress === "function") {
        buttons[0].onPress();
      }
      return;
    }

    // Multi-button confirmation dialog
    const cancelBtn = buttons.find(
      (b) => b.style === "cancel" || (b.text && b.text.toLowerCase() === "cancel")
    );
    const confirmBtn = buttons.find((b) => b !== cancelBtn) || buttons[buttons.length - 1];

    let confirmed = false;
    if (typeof window !== "undefined") {
      confirmed = window.confirm(fullText);
    } else {
      confirmed = true;
    }

    if (confirmed) {
      if (confirmBtn && typeof confirmBtn.onPress === "function") {
        confirmBtn.onPress();
      }
    } else {
      if (cancelBtn && typeof cancelBtn.onPress === "function") {
        cancelBtn.onPress();
      }
    }
  } else {
    Alert.alert(title, message, buttons, options);
  }
};

/**
 * Convenience helper specifically for confirmation dialogs (e.g. Logout, Delete, Remove)
 *
 * @param {string} title - Title
 * @param {string} message - Message
 * @param {() => void} onConfirm - Confirm callback
 * @param {() => void} [onCancel] - Cancel callback
 * @param {string} [confirmText="OK"] - Confirm button text
 * @param {string} [cancelText="Cancel"] - Cancel button text
 */
export const showConfirm = (
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "OK",
  cancelText = "Cancel"
) => {
  showAlert(title, message, [
    { text: cancelText, style: "cancel", onPress: onCancel },
    { text: confirmText, style: "destructive", onPress: onConfirm },
  ]);
};

export default showAlert;
