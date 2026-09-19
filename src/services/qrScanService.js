import { Platform } from 'react-native';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import jpeg from 'jpeg-js';
import { Buffer } from 'buffer';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Parses any raw string from a scanned QR code to extract UPI payment parameters.
 * Supports:
 * 1. Standard UPI URI: `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...`
 * 2. Query string fragment: `pa=...&pn=...`
 * 3. BharatQR / EMVCo string: `000201...` containing UPI VPA
 * 4. Plain UPI ID / VPA: `name@bank`, `9876543210@upi`
 */
export function parseUpiString(text) {
  if (!text || typeof text !== 'string') {
    return {
      rawText: '',
      upiId: '',
      payeeName: '',
      amount: '',
      currency: 'INR',
      merchantCode: '',
      note: '',
      isUpi: false,
    };
  }

  const trimmed = text.trim();

  // 1. Standard UPI URI: upi://pay?...
  if (trimmed.toLowerCase().includes('upi://pay')) {
    try {
      const upiUrl = trimmed.match(/upi:\/\/pay\?[^\s"'>]+/i)?.[0] || trimmed;
      const queryPart = upiUrl.includes('?') ? upiUrl.split('?')[1] : upiUrl;
      const params = new URLSearchParams(queryPart);
      const pa = params.get('pa') || '';
      const pn = params.get('pn') || '';
      const am = params.get('am') || '';
      const cu = params.get('cu') || 'INR';
      const mc = params.get('mc') || '';
      const tn = params.get('tn') || '';

      const cleanUpiId = pa ? decodeURIComponent(pa).trim() : '';
      const cleanPayeeName = pn ? decodeURIComponent(pn).trim() : '';

      return {
        rawText: trimmed,
        upiId: cleanUpiId,
        payeeName: cleanPayeeName,
        amount: am ? decodeURIComponent(am).trim() : '',
        currency: cu,
        merchantCode: mc,
        note: tn ? decodeURIComponent(tn).trim() : '',
        isUpi: Boolean(cleanUpiId && cleanUpiId.includes('@')),
      };
    } catch (err) {
      console.warn('Error parsing upi://pay URI params:', err);
    }
  }

  // 2. Query param or fragment format (e.g. pa=someone@bank or URL containing pa=)
  if (trimmed.includes('pa=') && trimmed.includes('@')) {
    const paMatch = trimmed.match(/[?&]pa=([^&"'\s]+)/i) || trimmed.match(/pa=([^&"'\s]+)/i);
    const pnMatch = trimmed.match(/[?&]pn=([^&"'\s]+)/i) || trimmed.match(/pn=([^&"'\s]+)/i);
    const amMatch = trimmed.match(/[?&]am=([^&"'\s]+)/i) || trimmed.match(/am=([^&"'\s]+)/i);
    const cleanUpiId = paMatch ? decodeURIComponent(paMatch[1]).trim() : '';
    const cleanPayeeName = pnMatch ? decodeURIComponent(pnMatch[1]).trim() : '';
    if (cleanUpiId && cleanUpiId.includes('@')) {
      return {
        rawText: trimmed,
        upiId: cleanUpiId,
        payeeName: cleanPayeeName,
        amount: amMatch ? decodeURIComponent(amMatch[1]).trim() : '',
        currency: 'INR',
        merchantCode: '',
        note: '',
        isUpi: true,
      };
    }
  }

  // 3. BharatQR / EMVCo format (starts with 000201 or contains org.npci.upi)
  if (trimmed.startsWith('000201') || trimmed.includes('000201') || trimmed.includes('org.npci.upi')) {
    const upiMatch = trimmed.match(/upi:\/\/pay\?[^"'\s]+/i);
    if (upiMatch) {
      return parseUpiString(upiMatch[0]);
    }

    // Extract VPA from NPCI tag (e.g. 0009org.npci.upi0116store@okhdfcbank)
    let extractedUpi = '';
    const npciMatch = trimmed.match(/org\.npci\.upi(?:01)?(?:\d{2})?([a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,30})/i);
    if (npciMatch) {
      extractedUpi = npciMatch[1].trim();
    } else {
      const genericVpa = trimmed.match(/(?:^|[^a-zA-Z0-9.\-_])([a-zA-Z0-9][a-zA-Z0-9.\-_]{1,63}@[a-zA-Z]{2,30})(?:[^a-zA-Z0-9.\-_]|$)/);
      if (genericVpa) {
        extractedUpi = genericVpa[1].trim();
      }
    }

    // Extract Merchant Name from EMV tag 59 (59<len><name>)
    let extractedPayee = '';
    const payeeMatch = trimmed.match(/59(\d{2})([A-Za-z0-9\s&.,'-]+)/);
    if (payeeMatch) {
      const len = parseInt(payeeMatch[1], 10);
      if (!isNaN(len) && len > 0) {
        extractedPayee = payeeMatch[2].substring(0, len).trim();
      }
    }

    if (extractedUpi) {
      return {
        rawText: trimmed,
        upiId: extractedUpi,
        payeeName: extractedPayee,
        amount: '',
        currency: 'INR',
        merchantCode: '',
        note: '',
        isUpi: true,
      };
    }
  }

  // 4. Plain UPI ID / VPA (e.g. mobile@upi, username@okhdfcbank)
  const plainVpaMatch = trimmed.match(/^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,63}@[a-zA-Z]{2,30}$/);
  if (plainVpaMatch) {
    return {
      rawText: trimmed,
      upiId: trimmed,
      payeeName: '',
      amount: '',
      currency: 'INR',
      merchantCode: '',
      note: '',
      isUpi: true,
    };
  }

  // 5. Embedded VPA anywhere in text
  const insideVpaMatch = trimmed.match(/(?:^|[^a-zA-Z0-9.\-_])([a-zA-Z0-9][a-zA-Z0-9.\-_]{1,63}@[a-zA-Z]{2,30})(?:[^a-zA-Z0-9.\-_]|$)/);
  if (insideVpaMatch) {
    return {
      rawText: trimmed,
      upiId: insideVpaMatch[1].trim(),
      payeeName: '',
      amount: '',
      currency: 'INR',
      merchantCode: '',
      note: '',
      isUpi: true,
    };
  }

  // 6. 10-digit mobile number, UPI number, or alphanumeric Merchant ID fallback
  const normalizedCandidate = normalizeUpiId(trimmed);
  if (normalizedCandidate && normalizedCandidate.includes('@')) {
    return {
      rawText: trimmed,
      upiId: normalizedCandidate,
      payeeName: '',
      amount: '',
      currency: 'INR',
      merchantCode: '',
      note: '',
      isUpi: true,
    };
  }

  return {
    rawText: trimmed,
    upiId: '',
    payeeName: '',
    amount: '',
    currency: 'INR',
    merchantCode: '',
    note: '',
    isUpi: false,
  };
}

/**
 * Checks if a string is a generic QR name/label or placeholder rather than an actual UPI ID.
 */
export function isGenericQrName(text) {
  if (!text || typeof text !== 'string') return true;
  const clean = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!clean) return true;
  const genericLabels = [
    'myupiqr',
    'myupiqr@upi',
    'myqr',
    'myupi',
    'upiqr',
    'qrcode',
    'qr_code',
    'activeqr',
    'staticqr',
    'dynamicqr',
    'storeqr',
    'sellerqr',
    'default',
    'storemerchant',
    'store',
    'null',
    'undefined',
    'vpa',
    'merchantid',
    'qr',
    'image',
    'scanqr',
    'myaccount',
  ];
  if (genericLabels.includes(clean)) return true;
  if (
    clean.startsWith('myupiqr') ||
    clean.startsWith('storeqr') ||
    clean.startsWith('qrcode') ||
    clean.startsWith('staticqr')
  ) {
    return true;
  }
  return false;
}

/**
 * Normalizes any UPI ID, 10-digit mobile number, or Merchant ID into a valid standard UPI VPA (Virtual Payment Address).
 * If the user inputs a plain Merchant ID (e.g. "storename" or "9876543210"), automatically appends the "@upi" handler!
 * Supports:
 * - Full UPI URI: upi://pay?pa=store@okaxis -> store@okaxis
 * - Query string: pa=store@okaxis -> store@okaxis
 * - Plain VPA: store@okaxis -> store@okaxis
 * - 10-digit Mobile: 9876543210 -> 9876543210@upi
 * - With Country Code: +919876543210 / 919876543210 -> 9876543210@upi
 * - Alphanumeric Merchant ID: storename / merchant123 / reddy_store -> storename@upi
 * - Partial handle: storename@ -> storename@upi
 */
export function normalizeUpiId(text) {
  if (!text || typeof text !== 'string') return '';
  let trimmed = text.trim();
  if (!trimmed) return '';

  // Filter out generic labels/placeholders (e.g. "My UPI QR")
  if (isGenericQrName(trimmed)) {
    return '';
  }

  // 1. If full URI or query with pa=
  if (trimmed.toLowerCase().includes('upi://pay')) {
    const paMatch = trimmed.match(/[?&]pa=([^&"'\s]+)/i);
    if (paMatch) {
      trimmed = decodeURIComponent(paMatch[1]).trim();
    }
  } else if (trimmed.includes('pa=') && trimmed.includes('@')) {
    const paMatch = trimmed.match(/[?&]pa=([^&"'\s]+)/i) || trimmed.match(/pa=([^&"'\s]+)/i);
    if (paMatch) {
      trimmed = decodeURIComponent(paMatch[1]).trim();
    }
  }

  // 2. Remove all whitespace
  trimmed = trimmed.replace(/\s+/g, '');

  // 3. If already has @
  if (trimmed.includes('@')) {
    if (trimmed.endsWith('@')) {
      trimmed = `${trimmed}upi`;
    }
    const parts = trimmed.split('@');
    if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
      if (isGenericQrName(parts[0])) return '';
      return trimmed.toLowerCase();
    }
    if (!trimmed.startsWith('@')) {
      return trimmed.toLowerCase();
    }
    return '';
  }

  // 4. Check if 10-digit mobile number (with optional +91, 91, or 0 prefix)
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits}@upi`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `${digits.slice(2)}@upi`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${digits.slice(1)}@upi`;
  }

  // 5. Alphanumeric Merchant ID / Store ID (e.g. merchant123, storeid, reddy_store)
  // Automatically append the standard @upi handler
  const sanitized = trimmed.replace(/[^a-zA-Z0-9.\-_]/g, '');
  if (sanitized.length >= 2 && !isGenericQrName(sanitized)) {
    return `${sanitized.toLowerCase()}@upi`;
  }

  return '';
}

/**
 * Builds standard UPI Payment URI
 */
export function buildUpiPaymentUri({ upiId, payeeName = 'Store Merchant', amount, note = 'Order Payment', rawText }) {
  if (rawText && typeof rawText === 'string' && rawText.includes('upi://pay?')) {
    try {
      const upiUrl = rawText.match(/upi:\/\/pay\?[^\s"'>]+/i)?.[0] || rawText;
      const base = upiUrl.split('?')[0];
      const queryPart = upiUrl.includes('?') ? upiUrl.split('?')[1] : '';
      const params = new URLSearchParams(queryPart);
      if (amount !== undefined && amount !== null && !isNaN(Number(amount)) && Number(amount) > 0) {
        params.set('am', Number(amount).toFixed(2));
      }
      if (note) {
        // Strip # and special characters that cause UPI transaction failures (UPI standard allows alphanumeric and spaces/hyphens only)
        const cleanNoteParam = String(note).replace(/[^a-zA-Z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
        params.set('tn', cleanNoteParam);
      }
      if (payeeName && payeeName !== 'Store Merchant' && !params.has('pn')) {
        params.set('pn', payeeName.trim());
      }
      return `${base}?${params.toString()}`;
    } catch (e) {
      console.warn('Error preserving scanned UPI parameters in buildUpiPaymentUri:', e);
    }
  }

  const cleanUpi = normalizeUpiId(upiId);
  if (!cleanUpi) return '';
  const cleanName = payeeName.trim() || 'Store Merchant';
  // Strip # and any character that is not alphanumeric, space, or hyphen
  const cleanNote = String(note || 'Order Payment').replace(/[^a-zA-Z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim() || 'Order Payment';

  let uri = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(cleanName)}&cu=INR&tn=${encodeURIComponent(cleanNote)}`;
  if (amount !== undefined && amount !== null && !isNaN(Number(amount)) && Number(amount) > 0) {
    uri += `&am=${Number(amount).toFixed(2)}`;
  }
  return uri;
}

/**
 * Generates local QR code data URL (offline, instant, no external API dependency).
 * Falls back to public API if library fails.
 */
export async function generateQrDataUrl(text, options = {}) {
  if (!text) return null;
  const width = options.width || 350;
  const margin = options.margin !== undefined ? options.margin : 2;

  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width,
      margin,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF',
      },
    });
    if (dataUrl) return dataUrl;
  } catch (err) {
    console.warn('Local QRCode.toDataURL failed, using fallback URL:', err);
  }

  // Fallback to qrserver API
  return `https://api.qrserver.com/v1/create-qr-code/?size=${width}x${width}&margin=${margin * 4}&data=${encodeURIComponent(text)}`;
}

/**
 * Helper to run jsQR with multiple preprocessing passes (standard, scaled, high-contrast, dynamic mean)
 */
function scanRgbaPixels(rgbaData, width, height) {
  if (!rgbaData || width <= 0 || height <= 0) return null;

  // Pass 1: Standard scan
  let code = jsQR(rgbaData, width, height, { inversionAttempts: 'attemptBoth' });
  if (code && code.data) return code.data;

  // Pass 2: High-contrast binarization pass at threshold 128
  const copy = new Uint8ClampedArray(rgbaData.length);
  let sumGray = 0;
  for (let i = 0; i < rgbaData.length; i += 4) {
    const gray = 0.299 * rgbaData[i] + 0.587 * rgbaData[i + 1] + 0.114 * rgbaData[i + 2];
    sumGray += gray;
    const bin = gray < 128 ? 0 : 255;
    copy[i] = bin;
    copy[i + 1] = bin;
    copy[i + 2] = bin;
    copy[i + 3] = 255;
  }
  code = jsQR(copy, width, height, { inversionAttempts: 'attemptBoth' });
  if (code && code.data) return code.data;

  // Pass 3: Adaptive mean brightness threshold
  const numPixels = rgbaData.length / 4;
  const meanGray = numPixels > 0 ? sumGray / numPixels : 128;
  if (Math.abs(meanGray - 128) > 15) {
    for (let i = 0; i < rgbaData.length; i += 4) {
      const gray = 0.299 * rgbaData[i] + 0.587 * rgbaData[i + 1] + 0.114 * rgbaData[i + 2];
      const bin = gray < meanGray ? 0 : 255;
      copy[i] = bin;
      copy[i + 1] = bin;
      copy[i + 2] = bin;
      copy[i + 3] = 255;
    }
    code = jsQR(copy, width, height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data) return code.data;
  }

  return null;
}

/**
 * Decodes a QR code from any image URI (Web Canvas, Mobile ImageManipulator + jpeg-js)
 * Supports blob:, file://, https://, data:image/...
 *
 * @param {string} imageUri
 * @returns {Promise<{ success: boolean, rawText?: string, upiId?: string, payeeName?: string, amount?: string, isUpi?: boolean, error?: string }>}
 */
export async function decodeQrFromImage(imageUri) {
  if (!imageUri || typeof imageUri !== 'string') {
    return { success: false, error: 'Invalid image URI provided' };
  }

  // -------------------------------------------------------------
  // Web Environment (HTMLCanvasElement)
  // -------------------------------------------------------------
  if (Platform.OS === 'web' || (typeof window !== 'undefined' && typeof document !== 'undefined')) {
    try {
      const decodedText = await new Promise((resolve) => {
        const tryCanvasScan = (imgElement) => {
          try {
            const origW = imgElement.naturalWidth || imgElement.width;
            const origH = imgElement.naturalHeight || imgElement.height;
            if (!origW || !origH) return null;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return null;

            // Test native size & downscaled sizes (for high-res phone photos)
            const targetSizes = [{ w: origW, h: origH }];
            if (origW > 800 || origH > 800) {
              const scale = Math.min(800 / origW, 800 / origH);
              targetSizes.unshift({ w: Math.round(origW * scale), h: Math.round(origH * scale) });
            }
            if (origW > 500 || origH > 500) {
              const scale2 = Math.min(500 / origW, 500 / origH);
              targetSizes.push({ w: Math.round(origW * scale2), h: Math.round(origH * scale2) });
            }

            for (const sz of targetSizes) {
              canvas.width = sz.w;
              canvas.height = sz.h;
              ctx.clearRect(0, 0, sz.w, sz.h);
              ctx.drawImage(imgElement, 0, 0, sz.w, sz.h);
              const imgData = ctx.getImageData(0, 0, sz.w, sz.h);
              const found = scanRgbaPixels(imgData.data, sz.w, sz.h);
              if (found) return found;

              // Also test center 75% crop if the image has large margins/standee border
              if (sz.w > 200 && sz.h > 200) {
                const cropW = Math.round(sz.w * 0.75);
                const cropH = Math.round(sz.h * 0.75);
                const cropX = Math.round((sz.w - cropW) / 2);
                const cropY = Math.round((sz.h - cropH) / 2);
                const cropData = ctx.getImageData(cropX, cropY, cropW, cropH);
                const cropFound = scanRgbaPixels(cropData.data, cropW, cropH);
                if (cropFound) return cropFound;
              }
            }
            return null;
          } catch (canvasErr) {
            console.warn('Web canvas QR scan error:', canvasErr);
            return null;
          }
        };

        const img = new window.Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          const res = tryCanvasScan(img);
          if (res) {
            resolve(res);
          } else {
            // If direct cross-origin image was tainted or didn't find QR, try blob fetch
            fetchBlobAndRetry();
          }
        };

        img.onerror = () => {
          fetchBlobAndRetry();
        };

        const fetchBlobAndRetry = async () => {
          try {
            const resp = await fetch(imageUri);
            const blob = await resp.blob();
            const objUrl = URL.createObjectURL(blob);
            const blobImg = new window.Image();
            blobImg.onload = () => {
              const blobRes = tryCanvasScan(blobImg);
              URL.revokeObjectURL(objUrl);
              resolve(blobRes);
            };
            blobImg.onerror = () => {
              URL.revokeObjectURL(objUrl);
              resolve(null);
            };
            blobImg.src = objUrl;
          } catch (_) {
            resolve(null);
          }
        };

        img.src = imageUri;
      });

      if (decodedText) {
        const parsed = parseUpiString(decodedText);
        return {
          success: true,
          ...parsed,
        };
      }
    } catch (webErr) {
      console.warn('Web decodeQrFromImage error:', webErr);
    }
  }

  // -------------------------------------------------------------
  // Mobile / Native Environment (ImageManipulator -> base64 -> jpeg-js -> jsQR)
  // -------------------------------------------------------------
  try {
    if (ImageManipulator && ImageManipulator.manipulateAsync) {
      const sizesToTry = [800, 500, 1000];
      for (const targetW of sizesToTry) {
        const manipResult = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: targetW } }],
          { format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (manipResult?.base64) {
          const rawBuf = Buffer.from(manipResult.base64, 'base64');
          const decodedJpeg = jpeg.decode(rawBuf, { useTArray: true });
          if (decodedJpeg && decodedJpeg.data) {
            const foundText = scanRgbaPixels(decodedJpeg.data, decodedJpeg.width, decodedJpeg.height);
            if (foundText) {
              const parsed = parseUpiString(foundText);
              return {
                success: true,
                ...parsed,
              };
            }
          }
        }
      }
    }
  } catch (nativeErr) {
    console.warn('Native decodeQrFromImage error:', nativeErr);
  }

  return {
    success: false,
    error: 'No QR code could be detected in this image. Please ensure the QR code is clearly visible, in focus, and not cropped.',
  };
}
