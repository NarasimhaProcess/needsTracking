// src/services/printerService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import { supabase } from './supabase';
import { announceOrderPrint } from './speechService';
export { announceOrderPrint };

const PRINTER_STORAGE_KEY = '@printer_config_v1';

// Default printer configuration
export const DEFAULT_PRINTER_CONFIG = {
  printerName: '',
  printerAddress: '',
  paperWidth: '58mm', // '58mm' (32 chars) or '80mm' (48 chars)
  currencySymbol: 'Rs.', // 'Rs.' (recommended for POS thermal printers) | '₹' | 'INR'
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
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_PRINTER_CONFIG,
        ...parsed,
        currencySymbol: parsed.currencySymbol || 'Rs.',
      };
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
 * Safely parses any number, numeric string (with commas or symbols), or fallback.
 */
export const safeParseNumber = (val, defaultVal = 0) => {
  if (val === null || val === undefined || val === '') return defaultVal;
  if (typeof val === 'number') return isNaN(val) || !isFinite(val) ? defaultVal : val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) || !isFinite(parsed) ? defaultVal : parsed;
};

/**
 * Safely formats price with 2 decimal places and currency prefix.
 */
export const safeFormatPrice = (val, currency = 'Rs.') => {
  const num = safeParseNumber(val, 0);
  const prefix = currency ? `${currency}` : '';
  return `${prefix}${num.toFixed(2)}`;
};

/**
 * Safely formats numeric value to fixed 2-decimal string.
 */
export const safeFormatNumber = (val, decimals = 2) => {
  const num = safeParseNumber(val, 0);
  return num.toFixed(decimals);
};

/**
 * Sanitizes text specifically for ESC/POS thermal receipt printers.
 * Thermal POS printers use 8-bit ASCII / Code Pages (PC437) and do not support Unicode ₹ (U+20B9).
 * Multi-byte UTF-8 ₹ (0xE2 0x82 0xB9) causes Chinese-mode firmware to print Chinese glyphs
 * and consume the following price digits. This sanitizer guarantees strictly 7-bit clean ASCII.
 */
export const sanitizeThermalText = (text, currencySymbol = 'Rs.') => {
  if (!text) return '';
  const safeCurrency = (!currencySymbol || currencySymbol === '₹') ? 'Rs.' : currencySymbol;
  let str = String(text)
    .replace(/\u20B9/g, safeCurrency)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return str.replace(/[^\x20-\x7E\n\r\t]/g, '');
};

/**
 * Formats a two-column line (Left text, Right text) padded with spaces to fill the paper width.
 */
export const formatTwoColumns = (leftText, rightText, totalWidth = 32) => {
  const left = sanitizeThermalText(String(leftText || '').trim());
  let right = sanitizeThermalText(String(rightText || '').trim());
  if (right.length >= totalWidth) {
    return right.substring(0, totalWidth);
  }
  const spaceNeeded = totalWidth - left.length - right.length;
  if (spaceNeeded <= 0) {
    const maxLeft = Math.max(1, totalWidth - right.length - 1);
    return left.substring(0, maxLeft) + ' ' + right;
  }
  return left + ' '.repeat(spaceNeeded) + right;
};

/**
 * Formats an item row cleanly for 58mm (32 cols) or 80mm (48 cols) thermal paper.
 * Prevents line wrapping, handles multi-quantity orders with unit rate and line total,
 * and ensures all numbers are ASCII formatted without swallowing digits.
 */
export const formatItemRow = (name, qty, price, totalWidth = 32, currencySymbol = 'Rs.', total = null) => {
  const safeCurrency = (!currencySymbol || currencySymbol === '₹') ? 'Rs.' : currencySymbol;
  const cleanName = sanitizeThermalText(String(name || 'Item').trim(), safeCurrency);
  const quantity = safeParseNumber(qty, 1);
  const unitRate = safeParseNumber(price, 0);
  const lineTotal = total !== null && total !== undefined ? safeParseNumber(total, 0) : quantity * unitRate;
  const totalStr = `${safeCurrency}${lineTotal.toFixed(2)}`;

  if (totalWidth >= 48) {
    // 80mm format: 4 columns [ITEM (22), QTY (4), RATE (10), AMOUNT (12)] = 48 chars
    const nameColWidth = totalWidth - 4 - 10 - 12;
    const qtyCol = String(quantity).padStart(4, ' ');
    const rateCol = unitRate.toFixed(2).padStart(10, ' ');
    const totalCol = totalStr.padStart(12, ' ');

    if (cleanName.length <= nameColWidth) {
      const nameCol = cleanName.padEnd(nameColWidth, ' ');
      return nameCol + qtyCol + rateCol + totalCol;
    } else {
      const line1 = cleanName;
      const line2 = ' '.repeat(nameColWidth) + qtyCol + rateCol + totalCol;
      return line1 + '\n' + line2;
    }
  }

  // 58mm format (32 chars)
  if (quantity === 1) {
    const spaceForName = totalWidth - totalStr.length - 1;
    if (cleanName.length <= spaceForName) {
      const pad = totalWidth - cleanName.length - totalStr.length;
      return cleanName + ' '.repeat(Math.max(1, pad)) + totalStr;
    } else {
      return cleanName + '\n' + ' '.repeat(totalWidth - totalStr.length) + totalStr;
    }
  } else {
    // Multi-quantity on 58mm:
    // Line 1: Item Name
    // Line 2: "  2 x 50.00          Rs.100.00"
    const qtyRateStr = `  ${quantity} x ${unitRate.toFixed(2)}`;
    const spaceNeeded = totalWidth - qtyRateStr.length - totalStr.length;
    const line2 = qtyRateStr + ' '.repeat(Math.max(1, spaceNeeded)) + totalStr;
    return cleanName + '\n' + line2;
  }
};

/**
 * Helper to parse full order number and day-wise order number from order data.
 */
export const extractOrderNumbers = (order = {}) => {
  if (!order || typeof order !== 'object') {
    return { orderNumber: 'N/A', dayOrderNo: null };
  }

  const rawId = order.id || order.order_id || order.orderId || '';
  const orderNum =
    order.order_number ||
    order.orderNumber ||
    order.order_no ||
    (rawId ? String(rawId).substring(0, 8).toUpperCase() : 'N/A');

  let dayOrderNo =
    order.daily_order_number ||
    order.day_wise_order_number ||
    order.day_order_no ||
    order.daily_order_no ||
    order.dayOrderNo ||
    order.dailyOrderNumber ||
    order.day_order_number ||
    order.token_no ||
    order.token_number ||
    order.token ||
    null;

  // If dayOrderNo is not explicitly set, try extracting from order_number
  // Examples: '20260829-0001', 'ORD-20260829-0042', '20260829_0012', '#0005', '0005'
  if (!dayOrderNo && orderNum && typeof orderNum === 'string') {
    const suffixMatch = orderNum.match(/[-_](\d+)$/);
    if (suffixMatch && suffixMatch[1]) {
      dayOrderNo = suffixMatch[1];
    } else if (/^\d{1,6}$/.test(orderNum.trim())) {
      dayOrderNo = orderNum.trim();
    } else if (/^#\d{1,6}$/.test(orderNum.trim())) {
      dayOrderNo = orderNum.trim().replace(/^#/, '');
    }
  }

  return {
    orderNumber: String(orderNum),
    dayOrderNo: dayOrderNo ? String(dayOrderNo) : null,
  };
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
  // ESC/POS must strictly use ASCII currency 'Rs.' or 'Rs ' to prevent Chinese glyph corruption on thermal hardware
  const currencySymbol = (config.currencySymbol && config.currencySymbol !== '₹') ? config.currencySymbol : 'Rs.';
  const encoder = new TextEncoder();

  // ESC/POS Commands
  const ESC = 0x1b;
  const FS = 0x1c;
  const GS = 0x1d;

  const CMD_INIT = [ESC, 0x40]; // Initialize printer
  const CMD_CANCEL_KANJI = [FS, 0x2e]; // FS . (Cancel Chinese/Kanji character mode - prevents Chinese glyphs)
  const CMD_CODEPAGE_PC437 = [ESC, 0x74, 0x00]; // ESC t 0 (Select Code page 0: PC437 Standard USA)
  const CMD_CHARSET_USA = [ESC, 0x52, 0x00]; // ESC R 0 (USA Character Set)

  const CMD_ALIGN_CENTER = [ESC, 0x61, 0x01];
  const CMD_ALIGN_LEFT = [ESC, 0x61, 0x00];
  const CMD_ALIGN_RIGHT = [ESC, 0x61, 0x02];
  const CMD_BOLD_ON = [ESC, 0x45, 0x01];
  const CMD_BOLD_OFF = [ESC, 0x45, 0x00];
  const CMD_DOUBLE_SIZE = [GS, 0x21, 0x11]; // Double height & width
  const CMD_DOUBLE_HEIGHT = [GS, 0x21, 0x01]; // Double height only (preserves full 32/48 col line width)
  const CMD_NORMAL_SIZE = [GS, 0x21, 0x00];
  const CMD_FEED_AND_CUT = [ESC, 0x64, 0x04, GS, 0x56, 0x41, 0x00]; // Feed 4 lines and full cut

  let byteChunks = [];

  const addBytes = (bytes) => {
    byteChunks.push(new Uint8Array(bytes));
  };

  const addText = (text) => {
    const clean = sanitizeThermalText(text, currencySymbol);
    byteChunks.push(encoder.encode(clean + '\n'));
  };

  // 1. Initialize and cancel Chinese character mode
  addBytes(CMD_INIT);
  addBytes(CMD_CANCEL_KANJI);
  addBytes(CMD_CODEPAGE_PC437);
  addBytes(CMD_CHARSET_USA);

  // 2. Header (Centered, Bold)
  addBytes(CMD_ALIGN_CENTER);
  addBytes(CMD_BOLD_ON);
  const store = sanitizeThermalText(data.storeName || config.storeName || "RECEIPT", currencySymbol);
  if (store.length <= Math.floor(width / 2)) {
    addBytes(CMD_DOUBLE_SIZE);
  } else {
    addBytes(CMD_DOUBLE_HEIGHT);
  }
  addText(store);
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

  // 4. Token / Day Order Number (Prominent banner for counter/kitchen)
  const dayOrder = data.dayOrderNo || data.dailyOrderNumber || data.dayWiseOrderNo;
  if (dayOrder) {
    addBytes(CMD_ALIGN_CENTER);
    addBytes(CMD_BOLD_ON);
    addText(`*** DAY ORDER NO: #${String(dayOrder).replace(/^#/, '')} ***`);
    addBytes(CMD_BOLD_OFF);
    addText(separator);
  }

  // Order Meta
  addBytes(CMD_ALIGN_LEFT);

  if (data.orderId || data.rawOrderId) {
    const orderNoStr = String(data.orderId || data.rawOrderId);
    if (orderNoStr.length > 20) {
      addText('Order No:');
      addText(`  ${orderNoStr}`);
    } else {
      addText(formatTwoColumns('Order No:', orderNoStr, width));
    }
  }
  if (data.date) {
    addText(formatTwoColumns('Date:', String(data.date), width));
  }
  if (data.customerName) {
    addText(formatTwoColumns(`Customer: ${data.customerName}`, '', width));
  }
  if (data.customerPhone) {
    addText(formatTwoColumns('Phone:', String(data.customerPhone), width));
  }
  if (data.orderType) {
    addText(formatTwoColumns('Type:', String(data.orderType).toUpperCase(), width));
  }
  if (data.tableNo) {
    addText(formatTwoColumns('Table:', `#${data.tableNo}`, width));
  }
  if (data.deliveryAddress) {
    addText(`Address: ${data.deliveryAddress.substring(0, width * 2)}`);
  }

  // 5. Items Header
  addText(separator);
  addBytes(CMD_BOLD_ON);
  if (width >= 48) {
    const nameHdr = 'ITEM'.padEnd(width - 4 - 10 - 12, ' ');
    addText(nameHdr + ' QTY      RATE      AMOUNT');
  } else {
    addText(formatTwoColumns('ITEM', 'QTY  PRICE', width));
  }
  addBytes(CMD_BOLD_OFF);
  addText(separator);

  // 6. Items List
  if (data.items && Array.isArray(data.items) && data.items.length > 0) {
    data.items.forEach((item) => {
      const name = item.name || 'Item';
      const qty = item.quantity || 1;
      const price = item.price || 0;
      const total = item.total !== undefined ? item.total : (qty * price);
      const rowText = formatItemRow(name, qty, price, width, currencySymbol, total);
      addText(rowText);
    });
  } else {
    addText(formatTwoColumns('(No itemized list)', '', width));
  }

  // 7. Totals & Summary
  const rawTotal =
    data.total !== undefined && data.total !== null && String(data.total).trim() !== ''
      ? data.total
      : data.total_amount !== undefined && data.total_amount !== null && String(data.total_amount).trim() !== ''
      ? data.total_amount
      : data.amount !== undefined && data.amount !== null && String(data.amount).trim() !== ''
      ? data.amount
      : null;

  const computedTotal =
    rawTotal !== null && safeParseNumber(rawTotal, -1) >= 0
      ? safeParseNumber(rawTotal, 0)
      : safeParseNumber(data.subtotal, 0) > 0
      ? safeParseNumber(data.subtotal, 0) + safeParseNumber(data.deliveryFee, 0) - safeParseNumber(data.discount, 0)
      : data.items && Array.isArray(data.items) && data.items.length > 0
      ? data.items.reduce((sum, it) => sum + safeParseNumber(it.total !== undefined ? it.total : (it.quantity * it.price), 0), 0)
      : 0;

  const hasMetaTotals =
    (data.subtotal !== undefined && safeParseNumber(data.subtotal, 0) > 0) ||
    (data.deliveryFee && safeParseNumber(data.deliveryFee) > 0) ||
    (data.discount && safeParseNumber(data.discount) > 0);

  addText(separator);
  if (hasMetaTotals) {
    if (data.subtotal !== undefined && safeParseNumber(data.subtotal, 0) > 0) {
      addText(formatTwoColumns('Subtotal:', safeFormatPrice(data.subtotal, currencySymbol), width));
    }
    if (data.deliveryFee && safeParseNumber(data.deliveryFee) > 0) {
      addText(formatTwoColumns('Delivery Fee:', safeFormatPrice(data.deliveryFee, currencySymbol), width));
    }
    if (data.discount && safeParseNumber(data.discount) > 0) {
      addText(formatTwoColumns('Discount:', `-${safeFormatPrice(data.discount, currencySymbol)}`, width));
    }
    addText(separator);
  }

  // TOTAL Line in standard universal BOLD (100% supported on all thermal printers, never dropped)
  addBytes(CMD_BOLD_ON);
  addText(formatTwoColumns('TOTAL AMOUNT:', safeFormatPrice(computedTotal, currencySymbol), width));
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

  // Feed 3 blank lines so paper feeds clear of the tear bar / cutter before cutting
  addText('\n\n\n');

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
  const currencySymbol = config.currencySymbol || 'Rs.';

  const rawTotal =
    data.total !== undefined && data.total !== null && String(data.total).trim() !== ''
      ? data.total
      : data.total_amount !== undefined && data.total_amount !== null && String(data.total_amount).trim() !== ''
      ? data.total_amount
      : data.amount !== undefined && data.amount !== null && String(data.amount).trim() !== ''
      ? data.amount
      : null;

  const computedTotal =
    rawTotal !== null && safeParseNumber(rawTotal, -1) >= 0
      ? safeParseNumber(rawTotal, 0)
      : safeParseNumber(data.subtotal, 0) > 0
      ? safeParseNumber(data.subtotal, 0) + safeParseNumber(data.deliveryFee, 0) - safeParseNumber(data.discount, 0)
      : data.items && Array.isArray(data.items) && data.items.length > 0
      ? data.items.reduce((sum, it) => sum + safeParseNumber(it.total !== undefined ? it.total : (it.quantity * it.price), 0), 0)
      : 0;

  const dayOrder = data.dayOrderNo || data.dailyOrderNumber || data.dayWiseOrderNo;

  const itemsHtml = (data.items && data.items.length > 0)
    ? data.items
        .map(
          (item) => `
          <tr>
            <td style="text-align: left; padding: 4px 0; word-break: break-word; font-size: inherit;">${item.name || 'Item'}</td>
            <td style="text-align: center; padding: 4px 0; font-size: inherit;">x${item.quantity || 1}</td>
            <td style="text-align: right; padding: 4px 0; font-size: inherit;">${currencySymbol}${safeFormatNumber(item.price || 0)}</td>
            <td style="text-align: right; padding: 4px 0; font-size: inherit; font-weight: bold;">${currencySymbol}${safeFormatNumber(item.total !== undefined ? item.total : (item.quantity * item.price))}</td>
          </tr>
        `
        )
        .join('')
    : `
      <tr>
        <td colspan="4" style="text-align: center; padding: 8px 0; color: #666; font-style: italic;">(No itemized list)</td>
      </tr>
    `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @page {
            size: ${widthMm} auto;
            margin: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: ${widthMm};
            margin: 0 auto;
            padding: 8px 4px;
            color: #000;
            background: #fff;
            font-size: ${is80mm ? '13px' : '11px'};
            line-height: 1.35;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .store-name { font-size: ${is80mm ? '18px' : '15px'}; font-weight: bold; margin-bottom: 3px; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .meta-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: ${is80mm ? '12px' : '10px'}; }
          .day-order-box {
            border: 1.5px dashed #000;
            padding: 4px 2px;
            margin: 5px 0;
            text-align: center;
          }
          .day-order-label {
            font-size: ${is80mm ? '11px' : '9px'};
            font-weight: bold;
            letter-spacing: 0.5px;
          }
          .day-order-val {
            font-size: ${is80mm ? '20px' : '17px'};
            font-weight: 900;
            margin-top: 1px;
          }
          table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: inherit; }
          th { border-bottom: 1px dashed #000; font-weight: bold; padding: 4px 0; font-size: inherit; }
          .total-row { font-size: ${is80mm ? '16px' : '14px'}; font-weight: bold; margin: 6px 0; display: flex; justify-content: space-between; }
          .footer { margin-top: 10px; font-size: ${is80mm ? '11px' : '10px'}; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="store-name">${data.storeName || config.storeName || "RECEIPT"}</div>
          ${config.storeAddress ? `<div>${config.storeAddress}</div>` : ''}
          ${config.storeContact ? `<div>Tel: ${config.storeContact}</div>` : ''}
          ${config.gstNumber ? `<div>GSTIN: ${config.gstNumber}</div>` : ''}
        </div>

        <div class="divider"></div>
        <div class="center bold">${data.title || 'TAX INVOICE / ORDER RECEIPT'}</div>
        <div class="divider"></div>

        ${dayOrder ? `
        <div class="day-order-box">
          <div class="day-order-label">DAY ORDER NO</div>
          <div class="day-order-val">#${String(dayOrder).replace(/^#/, '')}</div>
        </div>
        <div class="divider"></div>
        ` : ''}

        <div class="meta-row"><span>Order No:</span><span class="bold">${data.orderId || data.rawOrderId || 'N/A'}</span></div>
        ${dayOrder ? `<div class="meta-row"><span>Day Order No:</span><span class="bold">#${String(dayOrder).replace(/^#/, '')}</span></div>` : ''}
        <div class="meta-row"><span>Date:</span><span>${data.date || new Date().toLocaleString()}</span></div>
        ${data.customerName ? `<div class="meta-row"><span>Customer:</span><span class="bold">${data.customerName}</span></div>` : ''}
        ${data.customerPhone ? `<div class="meta-row"><span>Mobile:</span><span>${data.customerPhone}</span></div>` : ''}
        ${data.orderType ? `<div class="meta-row"><span>Type:</span><span class="bold">${String(data.orderType).toUpperCase()}</span></div>` : ''}
        ${data.tableNo ? `<div class="meta-row"><span>Table:</span><span class="bold">#${data.tableNo}</span></div>` : ''}
        ${data.deliveryAddress ? `<div class="meta-row" style="flex-direction:column; margin-top:2px;"><span>Address:</span><span style="font-size:0.9em; word-break:break-word;">${data.deliveryAddress}</span></div>` : ''}

        <div class="divider"></div>
        <table>
          <thead>
            <tr>
              <th style="text-align: left;">ITEM</th>
              <th style="text-align: center;">QTY</th>
              <th style="text-align: right;">RATE</th>
              <th style="text-align: right;">AMT</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="divider"></div>

        ${data.subtotal !== undefined ? `<div class="meta-row"><span>Subtotal:</span><span>${currencySymbol}${safeFormatNumber(data.subtotal)}</span></div>` : ''}
        ${data.deliveryFee ? `<div class="meta-row"><span>Delivery:</span><span>${currencySymbol}${safeFormatNumber(data.deliveryFee)}</span></div>` : ''}
        ${data.discount ? `<div class="meta-row"><span>Discount:</span><span>-${currencySymbol}${safeFormatNumber(data.discount)}</span></div>` : ''}

        <div class="divider"></div>
        <div class="total-row">
          <span>TOTAL AMOUNT:</span>
          <span>${currencySymbol}${safeFormatNumber(computedTotal)}</span>
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

  const CHUNK_SIZE = 64;
  for (let i = 0; i < uint8Bytes.length; i += CHUNK_SIZE) {
    const chunk = uint8Bytes.slice(i, i + CHUNK_SIZE);
    if (activeCharacteristic.writeValueWithoutResponse) {
      await activeCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await activeCharacteristic.writeValue(chunk);
    }
    // Slight pause between packets to prevent buffer overflow on mini thermal chips
    await new Promise((r) => setTimeout(r, 20));
  }
};

/**
 * Browser-isolated receipt printing via hidden iframe with popup fallback for Web/GitHub Pages.
 */
export const printHtmlOnWeb = (html) => {
  return new Promise((resolve) => {
    try {
      if (typeof document === 'undefined') {
        resolve({ success: false, error: 'Document not available' });
        return;
      }

      // Remove any leftover temporary print iframes
      const existing = document.getElementById('thermal-print-iframe');
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'thermal-print-iframe';
      iframe.setAttribute(
        'style',
        'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;visibility:hidden;z-index:-9999;'
      );
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow || iframe.contentDocument;
      const targetDoc = frameDoc.document || frameDoc;

      targetDoc.open();
      targetDoc.write(html);
      targetDoc.close();

      let printed = false;
      const executePrint = () => {
        if (printed) return;
        printed = true;
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
            resolve({ success: true, mode: 'web_iframe' });
          }, 1200);
        } catch (e) {
          console.warn('[PrinterService] Iframe print failed, attempting popup fallback:', e);
          try {
            const printWin = window.open('', '_blank', 'width=450,height=650');
            if (printWin) {
              printWin.document.write(html);
              printWin.document.close();
              printWin.focus();
              printWin.print();
              setTimeout(() => {
                try { printWin.close(); } catch (_) {}
              }, 1200);
              resolve({ success: true, mode: 'web_popup' });
            } else {
              window.print();
              resolve({ success: true, mode: 'window_print' });
            }
          } catch (winErr) {
            console.error('[PrinterService] Popup print error:', winErr);
            resolve({ success: false, error: winErr });
          }
        }
      };

      if (iframe.contentWindow) {
        iframe.contentWindow.onload = executePrint;
        setTimeout(executePrint, 350);
      } else {
        executePrint();
      }
    } catch (err) {
      console.error('[PrinterService] Web print initialization failed:', err);
      try {
        if (typeof window !== 'undefined') {
          window.print();
          resolve({ success: true, mode: 'window_print' });
        } else {
          resolve({ success: false, error: err });
        }
      } catch (fallbackErr) {
        resolve({ success: false, error: fallbackErr });
      }
    }
  });
};

/**
 * Universal Print Execution:
 * Dispatches to Web Bluetooth BLE, Web Iframe Print, or System Print (expo-print/AirPrint/PDF).
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

  // 2. Universal printing: Web iframe receipt or native expo-print
  try {
    const html = generateReceiptHtml(dataPayload, config);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      return await printHtmlOnWeb(html);
    } else {
      await Print.printAsync({ html });
      return { success: true, mode: 'system' };
    }
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
    return { success: false, error: 'No order details provided' };
  }

  try {
    let order = typeof orderDetails === 'string' ? { id: orderDetails } : { ...orderDetails };
    const orderId = order.id || order.order_id || order.orderId;

    // 1. If order_items are not present or empty, auto-fetch full order details from Supabase
    if (orderId && (!order.order_items || !Array.isArray(order.order_items) || order.order_items.length === 0)) {
      try {
        const { data: fetchedOrder, error: fetchErr } = await supabase
          .from('orders')
          .select(`
            *,
            order_items (
              id,
              quantity,
              price,
              product_variant_combination_id,
              product_variant_combinations (
                id,
                combination_string,
                price,
                products (
                  id,
                  product_name,
                  customer_id,
                  user_id
                )
              )
            )
          `)
          .eq('id', orderId)
          .maybeSingle();

        if (!fetchErr && fetchedOrder) {
          order = { ...order, ...fetchedOrder };
        }
      } catch (dbErr) {
        console.warn('[PrinterService] Auto-fetching order items notice:', dbErr);
      }
    }

    // 2. Parse Shipping Address / Contact Info
    let shippingObj = null;
    if (order.shipping_address) {
      if (typeof order.shipping_address === 'object') {
        shippingObj = order.shipping_address;
      } else if (typeof order.shipping_address === 'string') {
        try {
          shippingObj = JSON.parse(order.shipping_address);
        } catch (_) {
          shippingObj = { address: order.shipping_address };
        }
      }
    }

    let customerName =
      shippingObj?.name ||
      order.customer_name ||
      order.customerName ||
      '';

    let customerPhone =
      shippingObj?.phone ||
      shippingObj?.mobile ||
      order.customer_mobile ||
      order.customer_phone ||
      order.customerPhone ||
      '';

    // If customer details still missing, query user profile by user_id
    if ((!customerName || !customerPhone) && order.user_id) {
      try {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('full_name, mobile')
          .eq('id', order.user_id)
          .maybeSingle();

        if (userProfile) {
          if (!customerName && userProfile.full_name) customerName = userProfile.full_name;
          if (!customerPhone && userProfile.mobile) customerPhone = userProfile.mobile;
        }
      } catch (_) {}
    }

    // 3. Process line items with comprehensive fallbacks
    const rawItems = order.order_items || order.items || order.cart_items || [];
    const items = rawItems.map((item) => {
      const prodCombo = item.product_variant_combinations;
      const prod = prodCombo?.products || item.products || item.product;
      const productName =
        prod?.product_name ||
        item.product_name ||
        item.itemName ||
        item.item_name ||
        item.name ||
        item.title ||
        'Item';

      const comboStr = prodCombo?.combination_string || item.combination_string || item.variant || item.variant_name;
      const variantStr = (comboStr && comboStr.trim().toLowerCase() !== 'default')
        ? ` (${comboStr})`
        : '';

      const quantity = Number(item.quantity || item.qty || item.count || 1);
      const unitPrice = Number(
        item.price !== undefined && item.price !== null
          ? item.price
          : (prodCombo?.price !== undefined ? prodCombo.price : (item.amount || 0))
      );

      return {
        name: `${productName}${variantStr}`,
        quantity,
        price: unitPrice,
        total: quantity * unitPrice,
      };
    });

    // Robust calculation of subtotal and total with multiple fallbacks
    const itemsTotal = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
    const deliveryFee = Number(order.delivery_fee || order.deliveryFee || 0);
    const discount = Number(order.discount_amount || order.discount || 0);

    let subtotal = 0;
    if (order.subtotal !== undefined && order.subtotal !== null && Number(order.subtotal) > 0) {
      subtotal = Number(order.subtotal);
    } else if (itemsTotal > 0) {
      subtotal = itemsTotal;
    } else if (order.total_amount !== undefined && order.total_amount !== null && Number(order.total_amount) > 0) {
      subtotal = Number(order.total_amount);
    } else if (order.total !== undefined && order.total !== null && Number(order.total) > 0) {
      subtotal = Number(order.total);
    }

    let total = 0;
    if (order.total_amount !== undefined && order.total_amount !== null && Number(order.total_amount) > 0) {
      total = Number(order.total_amount);
    } else if (order.total !== undefined && order.total !== null && Number(order.total) > 0) {
      total = Number(order.total);
    } else if (order.amount !== undefined && order.amount !== null && Number(order.amount) > 0) {
      total = Number(order.amount);
    } else if (subtotal > 0) {
      total = subtotal + deliveryFee - discount;
    } else if (itemsTotal > 0) {
      total = itemsTotal + deliveryFee - discount;
    }

    const { orderNumber, dayOrderNo } = extractOrderNumbers(order);
    const resolvedDayOrderNo = options.dayOrderNo || options.dailyOrderNumber || dayOrderNo;

    const formattedAddress = shippingObj
      ? [shippingObj.address, shippingObj.city, shippingObj.postalCode || shippingObj.postal_code, shippingObj.country].filter(Boolean).join(', ')
      : (typeof order.shipping_address === 'string' ? order.shipping_address : '');

    const orderType = order.order_type || (order.table_no ? (order.table_no === 'Parcel' ? 'Takeaway / Parcel' : `Dine-In (Table #${order.table_no})`) : 'Delivery');

    const payload = {
      title: options.title || 'TAX INVOICE / ORDER RECEIPT',
      orderId: orderNumber,
      rawOrderId: orderId,
      dayOrderNo: resolvedDayOrderNo || null,
      dailyOrderNumber: resolvedDayOrderNo || null,
      dayWiseOrderNo: resolvedDayOrderNo || null,
      date: order.created_at
        ? new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      customerName,
      customerPhone,
      deliveryAddress: formattedAddress,
      orderType,
      tableNo: order.table_no,
      items,
      subtotal,
      deliveryFee,
      discount,
      total,
      paymentMethod: String(order.payment_method || 'CASH').toUpperCase(),
      paymentStatus: String(order.payment_status || (order.status === 'completed' || order.status === 'paid' ? 'PAID' : 'PENDING')).toUpperCase(),
      storeName: options.storeName || undefined,
    };

    const result = await printDataPayload(payload);

    // Optional voice announcement only when explicitly enabled (separated so user can click voice icon independently)
    if (options.speak === true) {
      try {
        announceOrderPrint(payload);
      } catch (speechErr) {
        console.warn('[PrinterService] Speech announcement notice:', speechErr);
      }
    }

    return result;
  } catch (err) {
    console.error('[PrinterService] printReceipt error:', err);
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
    orderId: '20260829-0001',
    dayOrderNo: '0001',
    dailyOrderNumber: '0001',
    dayWiseOrderNo: '0001',
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

