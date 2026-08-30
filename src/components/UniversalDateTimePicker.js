import React, { useState, useEffect } from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform } from "react-native";

let DateTimePickerModal = null;
if (Platform.OS !== "web") {
  try {
    DateTimePickerModal = require("react-native-modal-datetime-picker").default;
  } catch (e) {
    console.warn("Could not load react-native-modal-datetime-picker on native:", e);
  }
}

const formatDateToYMD = (d) => {
  const date = d instanceof Date && !isNaN(d.getTime()) ? d : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateToHM = (d) => {
  const date = d instanceof Date && !isNaN(d.getTime()) ? d : new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const formatDateToYMDHM = (d) => {
  const date = d instanceof Date && !isNaN(d.getTime()) ? d : new Date();
  return `${formatDateToYMD(date)}T${formatDateToHM(date)}`;
};

const UniversalDateTimePicker = ({
  isVisible = false,
  mode = "date",
  date = new Date(),
  onConfirm,
  onCancel,
  minimumDate,
  maximumDate,
  headerTextIOS,
  ...rest
}) => {
  const [tempValue, setTempValue] = useState("");

  const initialDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date(date || Date.now());

  useEffect(() => {
    if (isVisible) {
      if (mode === "time") {
        setTempValue(formatDateToHM(initialDate));
      } else if (mode === "datetime") {
        setTempValue(formatDateToYMDHM(initialDate));
      } else {
        setTempValue(formatDateToYMD(initialDate));
      }
    }
  }, [isVisible, date, mode]);

  if (Platform.OS !== "web" && DateTimePickerModal) {
    return (
      <DateTimePickerModal
        isVisible={isVisible}
        mode={mode}
        date={initialDate}
        onConfirm={onConfirm}
        onCancel={onCancel}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        headerTextIOS={headerTextIOS}
        {...rest}
      />
    );
  }

  if (!isVisible) return null;

  const handleWebConfirm = () => {
    let resultDate = new Date(initialDate);
    if (tempValue) {
      if (mode === "time") {
        const [h, m] = tempValue.split(":").map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          resultDate.setHours(h, m, 0, 0);
        }
      } else if (mode === "datetime") {
        const parsed = new Date(tempValue);
        if (!isNaN(parsed.getTime())) {
          resultDate = parsed;
        }
      } else {
        const [y, m, d] = tempValue.split("-").map(Number);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          resultDate = new Date(y, m - 1, d, initialDate.getHours(), initialDate.getMinutes());
        }
      }
    }
    if (onConfirm) {
      onConfirm(resultDate);
    }
  };

  const inputType = mode === "time" ? "time" : mode === "datetime" ? "datetime-local" : "date";
  const modalTitle = mode === "time" ? "Select Time" : mode === "datetime" ? "Select Date & Time" : "Select Date";

  return (
    <Modal
      transparent={true}
      visible={isVisible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{headerTextIOS || modalTitle}</Text>
          <View style={styles.inputWrapper}>
            <input
              type={inputType}
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              style={styles.webInput}
              min={minimumDate ? (mode === "date" ? formatDateToYMD(minimumDate) : undefined) : undefined}
              max={maximumDate ? (mode === "date" ? formatDateToYMD(maximumDate) : undefined) : undefined}
            />
          </View>
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.confirmBtn]} onPress={handleWebConfirm}>
              <Text style={styles.confirmBtnText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 9999,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 18,
    textAlign: "center",
  },
  inputWrapper: {
    width: "100%",
    marginBottom: 24,
    alignItems: "center",
  },
  webInput: {
    width: "100%",
    padding: "12px 14px",
    fontSize: "16px",
    borderRadius: "8px",
    border: "1.5px solid #007AFF",
    outline: "none",
    backgroundColor: "#f8fafc",
    fontFamily: "inherit",
    color: "#1e293b",
    boxSizing: "border-box",
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: "#f1f5f9",
  },
  cancelBtnText: {
    color: "#475569",
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBtn: {
    backgroundColor: "#007AFF",
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default UniversalDateTimePicker;
