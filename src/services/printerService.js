// src/services/printerService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';

const PRINTER_STORAGE_KEY = '@printer_config_v1';

// Default printer configuration
export const DEFAULT_PRINTER_CONFIG = {
  printerName: '',
  printerAddress: '',
  paperWidth: '58mm', // '58mm' (32 chars) or '80mm' (48 chars)
  storeName: "LocalWala's",
  storeAddress: '',
  storeContact: '',
  gstNumber: '',
  footerNote: 'Thank You! Visit Again.',
  autoPrintOnOrder: false,
  printMode: 'bluetooth', // 'bluetooth' | 'system'
};

// Global active Web Bluetooth BLE device/characteristic instance
let activeBleDevice = null;
let activeCharacteristic = null;

/**
 * Fetch saved printer configuration from local storage.
 */
export const getPrinterConfig = async () => {
  try {
    const raw = await AsyncStorage.getItem(PRINTER_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn('[PrinterService] Failed to load printer config:', err);
  }
  return DEFAULT_PRINTER_CONFIG;
};

/**
 * Save printer configuration to local storage.
 */
export const savePrinterConfig = async (config) => {
  try {
    const merged = { ...DEFAULT_PRINTER_CONFIG, ...config };
    await AsyncStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (err) {
    console.error('[PrinterService] Failed to save printer config:', err);
    throw err;
  }
};

/**
 * Helper to get maximum line characters based on paper size.
 */
export const getLineCharWidth = (paperWidth = '58mm') => {
  return paperWidth === '80mm' ? 48 : 32;
};

/**
 * Formats a two-column line (Left text, Right text) padded with spaces to fill the paper width.
 */
export const formatTwoColumns = (leftText, rightText, totalWidth = 32) => {
  const left = String(leftText || '');
  const right = String(rightText || '');
  const spaceNeeded = totalWidth - left.length - right.length;
  if (spaceNeeded <= 0) {
    const maxLeft = Math.max(1, totalWidth - right.length - 1);
    return left.substring(0, maxLeft) + ' ' + right;
  }
  return left + ' '.repeat(spaceNeeded) + right;
};

/**
 * Formats a three-column item row (Item, Qty, Price)
 */
export const formatItemRow = (name, qty, price, totalWidth = 32) => {
  const qtyStr = `x${qty}`;
  const priceStr = `₹${parseFloat(price).toFixed(2)}`;
  const rightPart = `${qtyStr} ${priceStr}`;
  const maxNameWidth = totalWidth - rightPart.length - 1;

  let displayName = name;
  if (name.length > maxNameWidth) {
    displayName = name.substring(0, maxNameWidth);
  }

  const spaceNeeded = totalWidth - displayName.length - rightPart.length;
  return displayName + ' '.repeat(Math.max(1, spaceNeeded)) + rightPart;
};

/**
 * Creates dashed separator line according to paper width.
 */
export const getSeparator = (totalWidth = 32) => {
  return '-'.repeat(totalWidth);
};

/**
 * Generates raw ESC/POS command bytes for 58mm / 80mm thermal receipt printers.
 */
export const generateEscPosBytes = (data, config = DEFAULT_PRINTER_CONFIG) => {
  const width = getLineCharWidth(config.paperWidth);
  const separator = getSeparator(width);
  const encoder = new TextEncoder();

  // ESC/POS Commands
  const ESC = 0x1b;
  const GS = 0x1d;

  const CMD_INIT = [ESC, 0x40]; // Initialize
  const CMD_ALIGN_CENTER = [ESC, 0x61, 0x01];
  const CMD_ALIGN_LEFT = [ESC, 0x61, 0x00];
  const CMD_ALIGN_RIGHT = [ESC, 0x61, 0x02];
  const CMD_BOLD_ON = [ESC, 0x45, 0x01];
  const CMD_BOLD_OFF = [ESC, 0x45, 0x00];
  const CMD_DOUBLE_SIZE = [GS, 0x21, 0x11]; // Double height & width
  const CMD_NORMAL_SIZE = [GS, 0x21, 0x00];
  const CMD_FEED_AND_CUT = [ESC, 0x64, 0x04, GS, 0x56, 0x41, 0x00]; // Feed 4 lines and full cut

  let byteChunks = [];

  const addBytes = (bytes) => {
    byteChunks.push(new Uint8Array(bytes));
  };

  const addText = (text) => {
    byteChunks.push(encoder.encode(text + '\n'));
  };

  // 1. Initialize
  addBytes(CMD_INIT);

  // 2. Header (Centered, Bold, Double Size)
  addBytes(CMD_ALIGN_CENTER);
  addBytes(CMD_BOLD_ON);
  addBytes(CMD_DOUBLE_SIZE);
  addText(config.storeName || "RECEIPT");
  addBytes(CMD_NORMAL_SIZE);
  addBytes(CMD_BOLD_OFF);

  if (config.storeAddress) {
    addText(config.storeAddress);
  }
  if (config.storeContact) {
    addText(`Tel: ${config.storeContact}`);
  }
  if (config.gstNumber) {
    addText(`GSTIN: ${config.gstNumber}`);
  }

  // 3. Receipt Title & Info
  addText(separator);
  addBytes(CMD_BOLD_ON);
  addText(data.title || 'TAX INVOICE / ORDER RECEIPT');
  addBytes(CMD_BOLD_OFF);
  addText(separator);

  // 4. Order Meta
  addBytes(CMD_ALIGN_LEFT);
  if (data.orderId) {
    addText(formatTwoColumns(`Order #: ${String(data.orderId).substring(0, 12)}`, '', width));
  }
  if (data.date) {
    addText(formatTwoColumns(`Date: ${data.date}`, '', width));
  }
  if (data.customerName) {
    addText(formatTwoColumns(`Customer: ${data.customerName}`, '', width));
  }
  if (data.customerPhone) {
    addText(formatTwoColumns(`Phone: ${data.customerPhone}`, '', width));
  }
  if (data.orderType) {
    addText(formatTwoColumns(`Type: ${data.orderType.toUpperCase()}`, '', width));
  }

  // 5. Items Header
  addText(separator);
  addBytes(CMD_BOLD_ON);
  addText(formatTwoColumns('ITEM', 'QTY  PRICE', width));
  addBytes(CMD_BOLD_OFF);
  addText(separator);

  // 6. Items List
  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item) => {
      const name = item.name || 'Item';
      const qty = item.quantity || 1;
      const price = item.price || 0;
      addText(formatItemRow(name, qty, price, width));
    });
  }

  // 7. Totals & Summary
  addText(separator);
  if (data.subtotal !== undefined) {
    addText(formatTwoColumns('Subtotal:', `₹${parseFloat(data.subtotal).toFixed(2)}`, width));
  }
  if (data.deliveryFee) {
    addText(formatTwoColumns('Delivery Fee:', `₹${parseFloat(data.deliveryFee).toFixed(2)}`, width));
  }
  if (data.discount) {
    addText(formatTwoColumns('Discount:', `-₹${parseFloat(data.discount).toFixed(2)}`, width));
  }

  addText(separator);
  addBytes(CMD_BOLD_ON);
  addBytes(CMD_DOUBLE_SIZE);
  addText(formatTwoColumns('TOTAL:', `₹${parseFloat(data.total || 0).toFixed(2)}`, Math.floor(width / 2)));
  addBytes(CMD_NORMAL_SIZE);
  addBytes(CMD_BOLD_OFF);
  addText(separator);

  if (data.paymentMethod) {
    addText(formatTwoColumns('Payment Mode:', String(data.paymentMethod).toUpperCase(), width));
  }
  if (data.paymentStatus) {
    addText(formatTwoColumns('Payment Status:', String(data.paymentStatus).toUpperCase(), width));
  }

  // 8. Footer
  addBytes(CMD_ALIGN_CENTER);
  addText(separator);
  if (config.footerNote) {
    addText(config.footerNote);
  }
  addText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // 9. Cut paper & Feed
  addBytes(CMD_FEED_AND_CUT);

  // Combine all Uint8Array chunks into a single ArrayBuffer
  const totalLength = byteChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const finalBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of byteChunks) {
    finalBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  return finalBuffer;
};

/**
 * Generates an HTML representation styled specifically for 58mm / 80mm thermal receipt printing.
 */
export const generateReceiptHtml = (data, config = DEFAULT_PRINTER_CONFIG) => {
  const is80mm = config.paperWidth === '80mm';
  const widthMm = is80mm ? '72mm' : '48mm';

  const itemsHtml = (data.items || [])
    .map(
      (item) => `
      <tr>
        <td style="text-align: left; padding: 3px 0; word-break: break-word;">${item.name || 'Item'}</td>
        <td style="text-align: center; padding: 3px 0;">x${item.quantity || 1}</td>
        <td style="text-align: right; padding: 3px 0;">₹${parseFloat(item.price || 0).toFixed(2)}</td>
      </tr>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @page {
            size: ${widthMm} auto;
            margin: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace, monospace;
            width: ${widthMm};
            margin: 0 auto;
            padding: 8px 4px;
            color: #000;
            background: #fff;
            font-size: ${is80mm ? '13px' : '11px'};
            line-height: 1.3;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .store-name { font-size: ${is80mm ? '18px' : '15px'}; font-weight: bold; margin-bottom: 3px; }
          .divider { border-top: 1px dashed #000; margin: 5px 0; }
          .meta-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: ${is80mm ? '12px' : '10px'}; }
          table { width: 100%; border-collapse: collapse; margin: 5px 0; font-size: inherit; }
          th { border-bottom: 1px dashed #000; font-weight: bold; padding: 3px 0; }
          .total-row { font-size: ${is80mm ? '16px' : '14px'}; font-weight: bold; margin: 6px 0; display: flex; justify-content: space-between; }
          .footer { margin-top: 10px; font-size: ${is80mm ? '11px' : '10px'}; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="store-name">${config.storeName || "RECEIPT"}</div>
          ${config.storeAddress ? `<div>${config.storeAddress}</div>` : ''}
          ${config.storeContact ? `<div>Tel: ${config.storeContact}</div>` : ''}
          ${config.gstNumber ? `<div>GSTIN: ${config.gstNumber}</div>` : ''}
        </div>

        <div class="divider"></div>
        <div class="center bold">${data.title || 'TAX INVOICE / RECEIPT'}</div>
        <div class="divider"></div>

        <div class="meta-row"><span>Order ID:</span><span class="bold">${data.orderId ? String(data.orderId).substring(0, 12) : 'N/A'}</span></div>
        <div class="meta-row"><span>Date:</span><span>${data.date || new Date().toLocaleDateString()}</span></div>
        ${data.customerName ? `<div class="meta-row"><span>Customer:</span><span>${data.customerName}</span></div>` : ''}
        ${data.customerPhone ? `<div class="meta-row"><span>Mobile:</span><span>${data.customerPhone}</span></div>` : ''}
        ${data.orderType ? `<div class="meta-row"><span>Type:</span><span class="bold">${String(data.orderType).toUpperCase()}</span></div>` : ''}

        <div class="divider"></div>
        <table>
          <thead>
            <tr>
              <th style="text-align: left;">ITEM</th>
              <th style="text-align: center;">QTY</th>
              <th style="text-align: right;">AMT</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="divider"></div>

        ${data.subtotal !== undefined ? `<div class="meta-row"><span>Subtotal:</span><span>₹${parseFloat(data.subtotal).toFixed(2)}</span></div>` : ''}
        ${data.deliveryFee ? `<div class="meta-row"><span>Delivery:</span><span>₹${parseFloat(data.deliveryFee).toFixed(2)}</span></div>` : ''}
        ${data.discount ? `<div class="meta-row"><span>Discount:</span><span>-₹${parseFloat(data.discount).toFixed(2)}</span></div>` : ''}

        <div class="divider"></div>
        <div class="total-row">
          <span>TOTAL:</span>
          <span>₹${parseFloat(data.total || 0).toFixed(2)}</span>
        </div>
        <div class="divider"></div>

        ${data.paymentMethod ? `<div class="meta-row"><span>Payment:</span><span class="bold">${String(data.paymentMethod).toUpperCase()}</span></div>` : ''}
        ${data.paymentStatus ? `<div class="meta-row"><span>Status:</span><span class="bold">${String(data.paymentStatus).toUpperCase()}</span></div>` : ''}

        <div class="center footer">
          <div>${config.footerNote || 'Thank You! Visit Again.'}</div>
          <div style="margin-top: 3px; color: #555;">${new Date().toLocaleTimeString()}</div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Request Web Bluetooth pairing (for Chrome on Android/Desktop/Web).
 */
export const scanAndConnectWebBluetooth = async () => {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    throw new Error('Web Bluetooth API is only available in Chrome / supported browsers on Android and PC.');
  }

  // Standard thermal receipt printer BLE service UUIDs
  const PRINTER_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS BLE
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ffe0-0000-1000-8000-00805f9b34fb', // Generic serial/BLE printer
  ];

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });

    const server = await device.gatt.connect();
    activeBleDevice = device;

    // Find write characteristic
    let matchedCharacteristic = null;
    for (const serviceUuid of PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            matchedCharacteristic = char;
            break;
          }
        }
        if (matchedCharacteristic) break;
      } catch (err) {
        // service not found on this device, check next
      }
    }

    activeCharacteristic = matchedCharacteristic;

    // Save connected device details
    const currentConfig = await getPrinterConfig();
    const updated = await savePrinterConfig({
      ...currentConfig,
      printerName: device.name || 'Bluetooth POS Printer',
      printerAddress: device.id || 'WebBLE-Device',
      printMode: 'bluetooth',
    });

    return {
      success: true,
      deviceName: device.name || 'Bluetooth Printer',
      config: updated,
    };
  } catch (err) {
    console.error('[PrinterService] Web Bluetooth connection error:', err);
    throw err;
  }
};

/**
 * Send raw ESC/POS bytes to active Web Bluetooth characteristic in chunks.
 */
const sendBytesViaWebBluetooth = async (uint8Bytes) => {
  if (!activeCharacteristic && activeBleDevice?.gatt?.connected) {
    const server = activeBleDevice.gatt;
    const services = await server.getPrimaryServices();
    for (const s of services) {
      const chars = await s.getCharacteristics();
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          activeCharacteristic = c;
          break;
        }
      }
      if (activeCharacteristic) break;
    }
  }

  if (!activeCharacteristic) {
    throw new Error('No active Bluetooth printer connection. Please reconnect the printer.');
  }

  const CHUNK_SIZE = 512;
  for (let i = 0; i < uint8Bytes.length; i += CHUNK_SIZE) {
    const chunk = uint8Bytes.slice(i, i + CHUNK_SIZE);
    if (activeCharacteristic.writeValueWithoutResponse) {
      await activeCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await activeCharacteristic.writeValue(chunk);
    }
    // Slight pause between packets to prevent buffer overflow on mini thermal chips
    await new Promise((r) => setTimeout(r, 25));
  }
};

/**
 * Universal Print Execution:
 * Dispatches to Web Bluetooth BLE or System Print (expo-print/AirPrint/PDF).
 */
export const printDataPayload = async (dataPayload) => {
  const config = await getPrinterConfig();

  // 1. If Web Bluetooth characteristic is actively connected
  if (activeCharacteristic) {
    try {
      const rawBytes = generateEscPosBytes(dataPayload, config);
      await sendBytesViaWebBluetooth(rawBytes);
      return { success: true, mode: 'bluetooth' };
    } catch (bleErr) {
      console.warn('[PrinterService] Direct BLE print failed, falling back to system print:', bleErr);
    }
  }

  // 2. Universal printing via expo-print
  try {
    const html = generateReceiptHtml(dataPayload, config);
    await Print.printAsync({ html });
    return { success: true, mode: 'system' };
  } catch (printErr) {
    console.error('[PrinterService] Print error:', printErr);
    throw printErr;
  }
};

/**
 * Prints an Order Receipt.
 *
 * @param {object} orderDetails - The full order record.
 * @param {object} options - Optional overrides.
 */
export const printReceipt = async (orderDetails, options = {}) => {
  if (!orderDetails) {
    Alert.alert('Error', 'No order details available to print.');
    return;
  }

  try {
    const items = (orderDetails.order_items || []).map((item) => {
      const productName =
        item.product_variant_combinations?.products?.product_name ||
        item.product_name ||
        'Product';
      const variantStr =
        item.product_variant_combinations?.combination_string
          ? ` (${item.product_variant_combinations.combination_string})`
          : '';
      return {
        name: `${productName}${variantStr}`,
        quantity: item.quantity || 1,
        price: item.price || 0,
      };
    });

    const payload = {
      title: 'TAX INVOICE / ORDER RECEIPT',
      orderId: orderDetails.id || orderDetails.order_number,
      date: orderDetails.created_at
        ? new Date(orderDetails.created_at).toLocaleString()
        : new Date().toLocaleString(),
      customerName: orderDetails.profiles?.full_name || orderDetails.customer_name || '',
      customerPhone: orderDetails.profiles?.mobile || orderDetails.customer_mobile || '',
      orderType: orderDetails.order_type || (orderDetails.table_no ? `Dine-In (Table ${orderDetails.table_no})` : 'Delivery'),
      items,
      subtotal: orderDetails.subtotal || orderDetails.total_amount,
      deliveryFee: orderDetails.delivery_fee || 0,
      discount: orderDetails.discount_amount || 0,
      total: orderDetails.total_amount || 0,
      paymentMethod: orderDetails.payment_method || 'CASH',
      paymentStatus: orderDetails.payment_status || (orderDetails.status === 'completed' ? 'PAID' : 'PENDING'),
    };

    const result = await printDataPayload(payload);
    return result;
  } catch (err) {
    Alert.alert(
      'Print Failed',
      `Could not print receipt: ${err.message || err}.\n\nPlease ensure your printer is powered on or select printer settings.`,
      [{ text: 'OK' }]
    );
    return { success: false, error: err };
  }
};

/**
 * Prints a Pre-Bill / Cart Estimate.
 *
 * @param {object} cart - Cart object with cart_items.
 */
export const printPreBill = async (cart) => {
  if (!cart || !cart.cart_items || cart.cart_items.length === 0) {
    Alert.alert('Empty Cart', 'There are no items to print a pre-bill for.');
    return;
  }

  try {
    const totalAmount = cart.cart_items.reduce(
      (total, item) =>
        total + (item.product_variant_combinations?.price || 0) * (item.quantity || 1),
      0
    );

    const items = cart.cart_items.map((item) => {
      const productName =
        item.product_variant_combinations?.products?.product_name ||
        item.product_name ||
        'Item';
      const variantStr =
        item.product_variant_combinations?.combination_string
          ? ` (${item.product_variant_combinations.combination_string})`
          : '';
      return {
        name: `${productName}${variantStr}`,
        quantity: item.quantity || 1,
        price: item.product_variant_combinations?.price || 0,
      };
    });

    const payload = {
      title: '*** PRE-BILL / ESTIMATE ***',
      orderId: 'EST-' + Math.floor(100000 + Math.random() * 900000),
      date: new Date().toLocaleString(),
      items,
      subtotal: totalAmount,
      total: totalAmount,
      paymentMethod: 'NOT PAID (ESTIMATE)',
      paymentStatus: 'DRAFT',
    };

    const result = await printDataPayload(payload);
    return result;
  } catch (err) {
    Alert.alert('Print Failed', `Could not print pre-bill: ${err.message || err}`);
    return { success: false, error: err };
  }
};

/**
 * Prints a Test Slip to verify printer connectivity and paper alignment.
 */
export const printTestReceipt = async () => {
  const config = await getPrinterConfig();
  const payload = {
    title: '=== PRINTER TEST SLIP ===',
    orderId: 'TEST-9999',
    date: new Date().toLocaleString(),
    items: [
      { name: '58mm/80mm Alignment Test', quantity: 1, price: 10.0 },
      { name: 'Thermal ESC/POS Check', quantity: 2, price: 20.0 },
    ],
    subtotal: 50.0,
    total: 50.0,
    paymentMethod: 'TEST OK',
    paymentStatus: 'VERIFIED',
  };

  try {
    const result = await printDataPayload(payload);
    Alert.alert('Test Print Sent', `Test slip successfully sent to ${config.printerName || 'Printer'}.`);
    return result;
  } catch (err) {
    Alert.alert('Test Print Error', err.message || 'Failed to print test slip.');
  }
};

