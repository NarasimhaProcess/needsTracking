import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system'; // Import FileSystem
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

export async function saveProductMedia(productId, mediaData, mediaType, customerId, accessToken) {
  if (mediaType === 'url') {
    const { error: insertError } = await supabase
      .from('product_media')
      .insert([
        {
          product_id: productId,
          media_url: mediaData,
          media_type: 'url',
        },
      ]);

    if (insertError) {
      console.error('Error inserting media URL into database:', insertError.message);
      return null;
    }
    return mediaData;
  } else {
    try {
      const fileExtension = mediaData.split('.').pop();
      const fileName = `${Date.now()}.${fileExtension}`;
      const filePath = `product_media/${productId}/${fileName}`;
      const contentType = mediaType === 'video' ? `video/${fileExtension}` : `image/${fileExtension}`;

      const edgeFunctionUrl = 'https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/upload-image';

      // Step 1: Request Signed URL from Edge Function
      console.log("Requesting signed URL from Edge Function...");
      const signedUrlResponse = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: 'generateSignedUrl',
          file_name: fileName,
          file_path: filePath,
          content_type: contentType,
          customer_id: customerId,
        }),
      });

      if (!signedUrlResponse.ok) {
        const errorText = await signedUrlResponse.text();
        throw new Error(`Failed to get signed URL: ${signedUrlResponse.status} - ${errorText}`);
      }
      const { signedUrl, path: signedPath } = await signedUrlResponse.json();
      console.log("Received signed URL:", signedUrl);

      // Step 2: Direct Upload to Signed URL
      console.log("Directly uploading file to signed URL...");
      const fileResponse = await fetch(mediaData);
      const blob = await fileResponse.blob();

      const uploadDirectResponse = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'x-upsert': 'true', // Overwrite if file exists
        },
        body: blob,
      });

      if (!uploadDirectResponse.ok) {
        const errorText = await uploadDirectResponse.text();
        throw new Error(`Direct upload failed: ${uploadDirectResponse.status} - ${errorText}`);
      }
      console.log("Direct upload successful.");

      // Step 3: Confirm Upload and Get Public URL from Edge Function
      console.log("Confirming upload and getting public URL from Edge Function...");
      const confirmUploadResponse = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: 'confirmUpload',
          file_path: filePath, // Use the original filePath to get the public URL
          customer_id: customerId,
        }),
      });

      if (!confirmUploadResponse.ok) {
        const errorText = await confirmUploadResponse.text();
        throw new Error(`Failed to confirm upload and get public URL: ${confirmUploadResponse.status} - ${errorText}`);
      }
      const { publicUrl } = await confirmUploadResponse.json();
      console.log("Received public URL:", publicUrl);

      if (!publicUrl) {
        throw new Error("Edge function did not return a public URL after confirmation.");
      }

      // Step 4: Save Public URL to Database
      const { error: insertError } = await supabase
        .from('product_media')
        .insert([
          {
            product_id: productId,
            media_url: publicUrl,
            media_type: mediaType,
          },
        ]);

      console.log("Supabase product_media insert result - error:", insertError);

      if (insertError) {
        console.error('Error inserting media URL into database:', insertError.message);
        return null;
      }

      return publicUrl;
    } catch (error) {
      console.error('Error in saveProductMedia (signed URL workflow):', error.message);
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

export async function deleteProductMedia(mediaId, mediaUrl) {
  try {
    // 1. Delete from Supabase Storage
    const bucketName = 'productsmedia';
    // Extract the file path from the full URL
    // Example URL: https://<project_ref>.supabase.co/storage/v1/object/public/productsmedia/product_media/123/image.jpeg
    const pathSegments = mediaUrl.split('/');
    const filePathInBucket = pathSegments.slice(pathSegments.indexOf(bucketName) + 1).join('/');

    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .remove([filePathInBucket]);

    if (storageError) {
      console.error('Error deleting media from storage:', storageError.message);
      throw storageError; // Propagate error to prevent DB deletion if storage fails
    }
    console.log('Media deleted from storage successfully:', filePathInBucket);

    // 2. Delete from product_media table in database
    const { error: dbError } = await supabase
      .from('product_media')
      .delete()
      .eq('id', mediaId);

    if (dbError) {
      console.error('Error deleting media from database:', dbError.message);
      throw dbError;
    }
    console.log('Media deleted from database successfully:', mediaId);

    return true; // Indicate success
  } catch (error) {
    console.error('Failed to delete product media:', error.message);
    return false; // Indicate failure
  }
}

export async function deleteProduct(productId) {
  try {
    // 1. Fetch all media associated with the product
    const { data: mediaData, error: fetchMediaError } = await supabase
      .from('product_media')
      .select('id, media_url')
      .eq('product_id', productId);

    if (fetchMediaError) {
      console.error('Error fetching product media for deletion:', fetchMediaError.message);
      throw fetchMediaError;
    }

    // 2. Delete each media file from Supabase storage
    const bucketName = 'productsmedia';
    for (const media of mediaData) {
      const pathSegments = media.media_url.split('/');
      const filePathInBucket = pathSegments.slice(pathSegments.indexOf(bucketName) + 1).join('/');
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([filePathInBucket]);

      if (storageError) {
        console.warn(`Warning: Could not delete media file ${filePathInBucket} from storage:`, storageError.message);
        // Do not throw, try to continue with other deletions
      }
    }

    // 3. Delete all product_media records from the database for that product
    const { error: deleteMediaDbError } = await supabase
      .from('product_media')
      .delete()
      .eq('product_id', productId);

    if (deleteMediaDbError) {
      console.error('Error deleting product media records from database:', deleteMediaDbError.message);
      throw deleteMediaDbError;
    }

    // 4. Delete the product record itself from the products table
    const { error: deleteProductError } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (deleteProductError) {
      console.error('Error deleting product from database:', deleteProductError.message);
      throw deleteProductError;
    }

    console.log(`Product ${productId} and its media deleted successfully.`);
    return true; // Indicate success
  } catch (error) {
    console.error('Failed to delete product:', error.message);
    return false; // Indicate failure
  }
} 