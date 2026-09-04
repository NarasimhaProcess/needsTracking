// src/services/speechService.js
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let ExpoSpeech = null;
try {
  ExpoSpeech = require('expo-speech');
} catch (e) {
  // Fallback if dynamic require
}

const VOICE_SETTINGS_KEY = '@app_voice_settings';

export const DEFAULT_VOICE_SETTINGS = {
  gender: 'female', // 'female' | 'male'
  rate: 0.95,
  language: 'en-IN',
};

/**
 * Loads voice preferences from AsyncStorage.
 */
export const getVoiceSettings = async () => {
  try {
    const raw = await AsyncStorage.getItem(VOICE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_VOICE_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn('[SpeechService] Error loading voice settings:', err);
  }
  return DEFAULT_VOICE_SETTINGS;
};

/**
 * Saves voice preferences (e.g. { gender: 'male' | 'female' }).
 */
export const saveVoiceSettings = async (settings = {}) => {
  try {
    const current = await getVoiceSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('[SpeechService] Error saving voice settings:', err);
    throw err;
  }
};

/**
 * Plays a pleasant notification chime tone via Web Audio API.
 */
export const playNotificationChime = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.3);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.0, now + 0.12); // A5
        gain2.gain.setValueAtTime(0.3, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.55);
      }
    } catch (e) {
      console.warn('[SpeechService] Audio chime notice:', e);
    }
  }
};

/**
 * Announces text aloud via Text-to-Speech (TTS).
 * Works seamlessly on Web (Web Speech Synthesis API), Android, and iOS.
 * Automatically respects the user's selected Male / Female voice setting.
 *
 * @param {string} text - The message to announce.
 * @param {object} options - Voice options { gender, language, pitch, rate, playChime }.
 */
export const announceText = async (text, options = {}) => {
  if (!text || typeof text !== 'string') return;

  if (options.playChime !== false) {
    playNotificationChime();
  }

  // Load configured voice gender
  const savedSettings = await getVoiceSettings();
  const gender = options.gender || savedSettings.gender || 'female';
  const isMale = gender.toLowerCase() === 'male';

  const lang = options.language || savedSettings.language || 'en-IN';
  // Male voice benefits from deeper resonant pitch (0.85); Female from crisp higher pitch (1.15)
  const defaultPitch = isMale ? 0.85 : 1.15;
  const pitch = options.pitch !== undefined ? options.pitch : defaultPitch;
  const rate = options.rate !== undefined ? options.rate : (savedSettings.rate || 0.95);

  const maleKeywords = ['male', 'man', 'david', 'ravi', 'george', 'mark', 'alex', 'daniel', 'richard', 'james', 'guy', 'prabhat'];
  const femaleKeywords = ['female', 'woman', 'zira', 'heera', 'samantha', 'victoria', 'karen', 'veena', 'ananya', 'priya', 'hazel', 'susan', 'catherine'];
  const targetKeywords = isMale ? maleKeywords : femaleKeywords;

  // 1. Web Speech Synthesis API
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.pitch = pitch;
      utterance.rate = rate;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        // 1. Try matching language + gender
        let matchedVoice = voices.find(v => {
          const isTargetLang = v.lang && (v.lang === lang || v.lang === 'en_IN' || v.lang.startsWith('en'));
          const vName = (v.name || '').toLowerCase();
          return isTargetLang && targetKeywords.some(k => vName.includes(k));
        });

        // 2. Try matching any language with gender keyword
        if (!matchedVoice) {
          matchedVoice = voices.find(v => {
            const vName = (v.name || '').toLowerCase();
            return targetKeywords.some(k => vName.includes(k));
          });
        }

        // 3. Fallback to preferred language
        if (!matchedVoice) {
          matchedVoice = voices.find(v => v.lang === 'en-IN' || v.lang === 'en_IN' || v.lang.startsWith('en')) || voices[0];
        }

        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }
      }

      window.speechSynthesis.speak(utterance);
      return;
    } catch (webSpeechErr) {
      console.warn('[SpeechService] Web speech synthesis warning:', webSpeechErr);
    }
  }

  // 2. Native Expo Speech
  try {
    if (!ExpoSpeech) {
      ExpoSpeech = require('expo-speech');
    }
    if (ExpoSpeech && typeof ExpoSpeech.speak === 'function') {
      ExpoSpeech.stop();

      let voiceIdentifier = undefined;
      try {
        if (ExpoSpeech.getAvailableVoicesAsync) {
          const nativeVoices = await ExpoSpeech.getAvailableVoicesAsync();
          if (nativeVoices && nativeVoices.length > 0) {
            const match = nativeVoices.find(v => {
              const vName = (v.name || v.identifier || '').toLowerCase();
              return targetKeywords.some(k => vName.includes(k));
            });
            if (match) {
              voiceIdentifier = match.identifier;
            }
          }
        }
      } catch (_) {}

      ExpoSpeech.speak(text, {
        language: lang,
        pitch,
        rate,
        ...(voiceIdentifier ? { voice: voiceIdentifier } : {}),
        onDone: () => console.log('[SpeechService] Speech announcement finished'),
        onError: (err) => console.warn('[SpeechService] Speech error:', err),
      });
      return;
    }
  } catch (nativeSpeechErr) {
    console.warn('[SpeechService] Native speech error:', nativeSpeechErr);
  }
};

/**
 * Tests the voice announcement with the given or saved gender.
 */
export const testVoiceAnnouncement = async (gender = null) => {
  const current = await getVoiceSettings();
  const targetGender = gender || current.gender || 'female';
  const label = targetGender.toLowerCase() === 'male' ? 'Male' : 'Female';
  await announceText(`This is a test of the ${label} voice. Daily Order Number 5. Total amount 250 Rupees.`, {
    gender: targetGender,
  });
};

/**
 * Announces an Order aloud on demand.
 * Works with both full order records from database/screens and prepared receipt payloads.
 * e.g. "Daily Order Number 5. Order Number 20260829-0005. Total amount 250 Rupees."
 */
export const announceOrderPrint = async (orderDetails) => {
  if (!orderDetails) return;

  const rawTotal =
    orderDetails.total !== undefined && orderDetails.total !== null
      ? orderDetails.total
      : orderDetails.total_amount !== undefined && orderDetails.total_amount !== null
      ? orderDetails.total_amount
      : orderDetails.amount || 0;

  const totalAmt = Math.round(Number(rawTotal) || 0);

  const rawId =
    orderDetails.orderId ||
    orderDetails.order_number ||
    orderDetails.orderNumber ||
    orderDetails.id ||
    '';
  const orderId = rawId ? String(rawId).substring(0, 12).toUpperCase() : '';

  let dayOrder =
    orderDetails.dayOrderNo ||
    orderDetails.dailyOrderNo ||
    orderDetails.dailyOrderNumber ||
    orderDetails.daily_order_number ||
    orderDetails.day_order_no ||
    orderDetails.token_no ||
    orderDetails.token ||
    null;

  if (!dayOrder && orderId) {
    const match = String(orderId).match(/[-_](\d+)$/);
    if (match && match[1]) dayOrder = match[1];
  }

  const orderType = orderDetails.orderType || orderDetails.order_type || '';
  const tableNo = orderDetails.tableNo || orderDetails.table_no || '';
  const items = orderDetails.items || orderDetails.order_items || orderDetails.cart_items || [];

  let message = '';
  if (dayOrder) {
    message += `Daily Order Number ${String(dayOrder).replace(/^#/, '')}. `;
    if (orderId && String(orderId) !== String(dayOrder)) {
      message += `Order Number ${orderId}. `;
    }
  } else if (orderId) {
    message += `Order Number ${orderId}. `;
  }

  if (tableNo) {
    message += `Table number ${tableNo}. `;
  } else if (orderType && (orderType.toLowerCase().includes('parcel') || orderType.toLowerCase().includes('takeaway'))) {
    message += `Parcel order. `;
  }

  if (totalAmt > 0) {
    message += `Total amount ${totalAmt} Rupees. `;
  }

  if (items && items.length > 0) {
    message += `${items.length} ${items.length === 1 ? 'item' : 'items'}.`;
  }

  if (message.trim()) {
    await announceText(message);
  }
};

/**
 * Announces incoming New Order notifications in realtime on Web and Mobile.
 * e.g. "New Order Received! Day Order Number 1. Order Number 20260829-0001. Total 350 Rupees."
 */
export const announceNewOrder = async (order) => {
  if (!order) return;

  const rawId = order.id || order.order_id || '';
  const orderNum = order.order_number || (rawId ? String(rawId).substring(0, 8).toUpperCase() : '');

  let dayOrderNo = order.daily_order_number || order.day_order_no || order.token_no;
  if (!dayOrderNo && orderNum && typeof orderNum === 'string') {
    const match = orderNum.match(/[-_](\d+)$/);
    if (match && match[1]) dayOrderNo = match[1];
  }

  const totalAmt = order.total_amount !== undefined ? Math.round(Number(order.total_amount)) : '';
  const tableNo = order.table_no || order.table_number || '';

  let msg = 'New Order Received! ';
  if (dayOrderNo) {
    msg += `Day Order Number ${String(dayOrderNo).replace(/^#/, '')}. `;
  }
  if (orderNum && String(orderNum) !== String(dayOrderNo)) {
    msg += `Order Number ${orderNum}. `;
  }
  if (tableNo) {
    msg += `Table ${tableNo}. `;
  }
  if (totalAmt > 0) {
    msg += `Total ${totalAmt} Rupees.`;
  }

  await announceText(msg);
};
