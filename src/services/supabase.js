import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
let Storage;
if (Platform.OS === 'web') {
  Storage = {
    getItem: async (key) => window.localStorage.getItem(key),
    setItem: async (key, value) => window.localStorage.setItem(key, value),
    removeItem: async (key) => window.localStorage.removeItem(key),
  };
} else {
  Storage = require('@react-native-async-storage/async-storage').default;
}

const supabaseUrl = Constants.expoConfig.extra.SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig.extra.SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function getTransactionsByCustomerId(customerId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('customer_id', customerId);

  if (error) {
    console.error('Error fetching transactions:', error.message);
    return null;
  }
  return data;
}

export async function createProduct(productData) {
  const { data, error } = await supabase
    .from('products')
    .insert([productData])
    .select();

  if (error) {
    console.error('Error creating product:', error.message);
    return null;
  }
  return data ? data[0] : null;
}

export async function saveProductMedia(productId, mediaData, mediaType) {
  const bucketToUse = 'productsmedia'; // Default bucket for uploads

  // mediaData can be a file URI or a direct URL
  if (mediaType === 'url') {
    const { error: insertError } = await supabase
      .from('product_media')
      .insert([
        {
          product_id: productId,
          media_url: mediaData, // Store the provided URL directly
          media_type: 'url',
        },
      ]);

    if (insertError) {
      console.error('Error inserting media URL into database:', insertError.message);
      return null;
    }
    return mediaData;
  } else { // Assume it's a file URI for upload
    const fileExtension = mediaData.split('.').pop();
    const fileName = `${Date.now()}.${fileExtension}`;
    const filePath = `product_media/${productId}/${fileName}`;

    try {
      const response = await fetch(mediaData);
      const blob = await response.blob();

      const { data, error } = await supabase.storage
        .from(bucketToUse)
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: mediaType === 'video' ? `video/${fileExtension}` : `image/${fileExtension}`,
        });

      if (error) {
        console.error('Error uploading media:', error.message);
        return null;
      }

      // Store the relative file path, not the full public URL
      const { error: insertError } = await supabase
        .from('product_media')
        .insert([
          {
            product_id: productId,
            media_url: filePath, // Store relative path
            media_type: mediaType,
          },
        ]);

      if (insertError) {
        console.error('Error inserting media URL into database:', insertError.message);
        return null;
      }

      // Return the full public URL for immediate use in the UI
      return supabase.storage.from(bucketToUse).getPublicUrl(filePath).data.publicUrl;
    } catch (error) {
      console.error('Error in saveProductMedia (file upload):', error.message);
      return null;
    }
  }
}

export async function getProductsWithMedia() {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      product_media (media_url, media_type)
    `);

  if (error) {
    console.error('Error fetching products with media:', error.message);
    return null;
  }
  return data;
}

export async function getAreas() {
  const { data, error } = await supabase
    .from('area_master')
    .select(`
      *,
      group_areas(
        groups(name)
      )
    `);

  if (error) {
    console.error('Error fetching areas:', error.message);
    return null;
  }
  console.log("Supabase getAreas raw data:", data); // Log raw data
  return data;
} 