// src/services/speechService.js
import { Platform } from 'react-native';

let ExpoSpeech = null;
try {
  ExpoSpeech = require('expo-speech');
} catch (e) {
  // Fallback if dynamic require
}

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
 *
 * @param {string} text - The message to announce.
 * @param {object} options - Voice options { language, pitch, rate, playChime }.
 */
export const announceText = async (text, options = {}) => {
  if (!text || typeof text !== 'string') return;

  if (options.playChime !== false) {
    playNotificationChime();
  }

  const lang = options.language || 'en-IN'; // Indian English default, works smoothly with numbers & currency
  const pitch = options.pitch || 1.0;
  const rate = options.rate || 0.95;

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
        const preferredVoice = voices.find(v => v.lang === 'en-IN' || v.lang === 'en_IN' || v.lang.startsWith('en')) || voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;
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
      ExpoSpeech.speak(text, {
        language: lang,
        pitch,
        rate,
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
 * Specifically announces an Order when printing a receipt.
 * e.g. "Daily Order Number 5. Order Number 20260829-0005. Total amount 250 Rupees."
 */
export const announceOrderPrint = async (orderDetails) => {
  if (!orderDetails) return;

  const totalAmt = orderDetails.total !== undefined ? Math.round(Number(orderDetails.total)) : '';
  const orderType = orderDetails.orderType || '';
  const tableNo = orderDetails.tableNo || '';

  let message = '';
  const dayOrder = orderDetails.dayOrderNo || orderDetails.dailyOrderNo || orderDetails.dailyOrderNumber || orderDetails.dayWiseOrderNo;
  if (dayOrder) {
    message += `Daily Order Number ${String(dayOrder).replace(/^#/, '')}. `;
    if (orderDetails.orderId && String(orderDetails.orderId) !== String(dayOrder)) {
      message += `Order Number ${orderDetails.orderId}. `;
    }
  } else if (orderDetails.orderId) {
    message += `Order Number ${orderDetails.orderId}. `;
  }

  if (tableNo) {
    message += `Table number ${tableNo}. `;
  } else if (orderType && (orderType.toLowerCase().includes('parcel') || orderType.toLowerCase().includes('takeaway'))) {
    message += `Parcel order. `;
  }

  if (totalAmt > 0) {
    message += `Total amount ${totalAmt} Rupees. `;
  }

  if (orderDetails.items && orderDetails.items.length > 0) {
    message += `${orderDetails.items.length} ${orderDetails.items.length === 1 ? 'item' : 'items'}.`;
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
