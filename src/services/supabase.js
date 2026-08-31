import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system'; // Import FileSystem
import { Buffer } from 'buffer';

WebBrowser.maybeCompleteAuthSession();

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

// Fallback-safe credentials resolution for Standalone / APK / EAS / Expo Go builds
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  Constants?.expoConfig?.extra?.SUPABASE_URL;

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  Constants?.expoConfig?.extra?.SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
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

export function extractFileDetails(uri, defaultMediaType = 'image') {
  const isVideo = defaultMediaType === 'video';
  let extension = isVideo ? 'mp4' : 'jpg';
  let contentType = isVideo ? 'video/mp4' : 'image/jpeg';

  if (typeof uri === 'string') {
    if (uri.startsWith('data:image/png')) {
      extension = 'png';
      contentType = 'image/png';
    } else if (uri.startsWith('data:image/webp')) {
      extension = 'webp';
      contentType = 'image/webp';
    } else if (uri.startsWith('data:image/gif')) {
      extension = 'gif';
      contentType = 'image/gif';
    } else if (uri.startsWith('data:video/mp4')) {
      extension = 'mp4';
      contentType = 'video/mp4';
    } else {
      const cleanPath = uri.split('?')[0].split('#')[0];
      const match = cleanPath.match(/\.([a-zA-Z0-9]{2,5})$/);
      if (match && match[1]) {
        const ext = match[1].toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm'].includes(ext)) {
          extension = ext === 'jpeg' ? 'jpg' : ext;
          if (extension === 'png') contentType = 'image/png';
          else if (extension === 'webp') contentType = 'image/webp';
          else if (extension === 'gif') contentType = 'image/gif';
          else if (extension === 'mp4') contentType = 'video/mp4';
          else if (extension === 'mov' || extension === 'webm') contentType = `video/${extension}`;
          else contentType = 'image/jpeg';
        }
      }
    }
  }

  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
  return { extension, contentType, fileName };
}

export async function saveProductMedia(productId, mediaData, mediaType, userId, accessToken) {
  const normalizedMediaType = mediaType === 'video' ? 'video' : 'image';
  
  if (mediaType === 'url' || (typeof mediaData === 'string' && (mediaData.startsWith('http://') || mediaData.startsWith('https://')))) {
    const { error: insertError } = await supabase
      .from('product_media')
      .insert([
        {
          product_id: productId,
          media_url: mediaData,
          media_type: normalizedMediaType,
        },
      ]);

    if (insertError) {
      console.error('Error inserting media URL into database:', insertError.message);
      return null;
    }
    return mediaData;
  } else {
    try {
      const { extension, contentType, fileName } = extractFileDetails(mediaData, normalizedMediaType);
      const filePath = `product_media/${productId}/${fileName}`;
      const finalEdgePath = userId ? `${userId}/${filePath}` : filePath;

      let publicUrl = null;
      let fileData = null;

      // Safe binary data conversion for Web, iOS, and Android
      if (Platform.OS === 'web' || (typeof window !== 'undefined' && typeof fetch === 'function')) {
        try {
          const fileResponse = await fetch(mediaData);
          fileData = await fileResponse.blob();
        } catch (webBlobErr) {
          console.warn('Web blob fetch failed:', webBlobErr.message);
        }
      }
      
      if (!fileData) {
        try {
          const fileResponse = await fetch(mediaData);
          fileData = await fileResponse.blob();
        } catch (fetchBlobErr) {
          try {
            const base64 = await FileSystem.readAsStringAsync(mediaData, {
              encoding: FileSystem.EncodingType.Base64,
            });
            if (typeof Buffer !== 'undefined') {
              const buf = Buffer.from(base64, 'base64');
              fileData = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
            } else {
              fileData = new Uint8Array(
                atob(base64).split('').map((c) => c.charCodeAt(0))
              ).buffer;
            }
          } catch (fsErr) {
            console.error('FileSystem read error:', fsErr.message);
          }
        }
      }

      if (!fileData) {
        console.error('saveProductMedia: Unable to obtain file binary data.');
        return null;
      }

      // Primary Attempt: Try storage buckets
      const bucketsToTry = ['productsmedia', 'locationtracker', 'chat_media', 'damage_photos', 'qr_codes'];
      for (const bucketName of bucketsToTry) {
        if (!fileData) break;
        try {
          console.log(`Attempting upload to Supabase storage bucket '${bucketName}'...`);
          const { data: storageUploadData, error: storageUploadError } = await supabase.storage
            .from(bucketName)
            .upload(filePath, fileData, {
              contentType: contentType,
              upsert: true,
            });

          if (!storageUploadError) {
            const { data: publicUrlData } = supabase.storage
              .from(bucketName)
              .getPublicUrl(filePath);
            if (publicUrlData?.publicUrl) {
              publicUrl = publicUrlData.publicUrl;
              console.log(`Direct storage upload successful to '${bucketName}'. Public URL:`, publicUrl);
              break;
            }
          } else {
            console.warn(`Storage upload to '${bucketName}' failed:`, storageUploadError.message);
          }
        } catch (bucketErr) {
          console.warn(`Error trying storage bucket '${bucketName}':`, bucketErr.message);
        }
      }

      // Fallback Attempt: Signed URL workflow via Edge Function if storage direct failed
      if (!publicUrl) {
        try {
          let token = accessToken;
          if (!token) {
            const { data: { session } } = await supabase.auth.getSession();
            token = session?.access_token || supabaseAnonKey;
          }

          const { data: functionData, error: funcError } = await supabase.functions.invoke('upload-image', {
            body: {
              action: 'generateSignedUrl',
              file_name: fileName,
              file_path: filePath,
              content_type: contentType,
              user_id: userId,
            },
          });

          let signedUrl = functionData?.signedUrl;

          if (funcError || !signedUrl) {
            const edgeFunctionUrl = `${supabaseUrl}/functions/v1/upload-image`;
            const signedUrlResponse = await fetch(edgeFunctionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                action: 'generateSignedUrl',
                file_name: fileName,
                file_path: filePath,
                content_type: contentType,
                user_id: userId,
              }),
            });

            if (signedUrlResponse.ok) {
              const resJson = await signedUrlResponse.json();
              signedUrl = resJson.signedUrl;
            }
          }

          if (signedUrl) {
            const fileResponse = await fetch(mediaData);
            const blob = await fileResponse.blob();

            const uploadDirectResponse = await fetch(signedUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': contentType,
                'x-upsert': 'true',
              },
              body: blob,
            });

            if (uploadDirectResponse.ok) {
              const { data: pubData } = supabase.storage
                .from('productsmedia')
                .getPublicUrl(finalEdgePath);
              publicUrl = pubData.publicUrl;
            }
          }
        } catch (edgeErr) {
          console.warn('Edge function fallback error:', edgeErr.message);
        }
      }

      if (!publicUrl) {
        console.error('Failed to obtain public URL for uploaded media.');
        return null;
      }

      // Save Public URL to Database
      const { error: insertError } = await supabase
        .from('product_media')
        .insert([
          {
            product_id: productId,
            media_url: publicUrl,
            media_type: normalizedMediaType,
          },
        ]);

      if (insertError) {
        console.error('Error inserting media URL into database:', insertError.message);
        return null;
      }

      return publicUrl;
    } catch (error) {
      console.error('Error in saveProductMedia:', error.message);
      return null;
    }
  }
}


export async function getAllProducts() {
  const { data, error } = await supabase.from('products').select('*');
  if (error) {
    console.error('Error fetching all products:', error.message);
    return null;
  }
  return data;
}

export async function getProductsWithDetails(userId) {
  console.log('getProductsWithDetails: Received userId:', userId);
  const { data: { user } } = await supabase.auth.getUser();
  console.log('getProductsWithDetails: Authenticated user UID:', user?.id);

  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      product_media (id, media_url, media_type),
      product_variants (
        id,
        name,
        variant_options (id, value)
      ),
      product_variant_combinations (id, combination_string, price, quantity, sku)
    `)
    .eq('user_id', userId)
    .order('display_order');

  if (error) {
    console.error('Error fetching products with details:', error.message);
    return null;
  }
  console.log('getProductsWithDetails: Fetched products data:', data);
  return data;
}

export async function getActiveProductsWithDetails(userId) {
  try {
    if (userId) {
      const { data, error } = await supabase.rpc('get_active_products_with_details', {
        p_user_id: userId,
      });

      if (!error && data && data.length > 0) {
        console.log('Fetched active products via RPC:', data);
        return data;
      }
    }
  } catch (rpcErr) {
    console.warn('RPC get_active_products_with_details failed:', rpcErr);
  }

  // Fallback: direct query on products table with relations
  try {
    let query = supabase
      .from('products')
      .select(`
        *,
        product_media (id, media_url, media_type),
        product_variants (
          id,
          name,
          variant_options (id, value)
        ),
        product_variant_combinations (id, combination_string, price, quantity, sku)
      `)
      .eq('is_active', true);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('display_order', { ascending: true });
    if (error) {
      console.error('Error in getActiveProductsWithDetails direct query:', error.message);
      return [];
    }
    console.log('Fetched active products via direct query:', data);
    return data || [];
  } catch (err) {
    console.error('Error fetching active products:', err);
    return [];
  }
}

export async function getTopProductsWithDetails() {
  const now = new Date();
  const currentTime = new Date().toTimeString().split(' ')[0];

  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      product_media (id, media_url, media_type),
      product_variants (
        id,
        name,
        variant_options (id, value)
      ),
      product_variant_combinations (id, combination_string, price, quantity, sku)
    `)
    .eq('is_active', true)
    .or(`visible_from.is.null,visible_from.lte.${currentTime}`)
    .or(`visible_to.is.null,visible_to.gte.${currentTime}`)
    .order('display_order', { ascending: true })
    .limit(10);

  if (error) {
    console.error('Error fetching top products with details:', error.message);
    return null;
  }
  return data;
}





export async function createProductVariant(variantData) {
  const { data, error } = await supabase
    .from('product_variants')
    .insert(variantData)
    .select();

  if (error) {
    console.error('Error creating product variant:', error.message);
    return null;
  }
  return data ? data[0] : null;
}

export async function createVariantOption(optionData) {
  const { data, error } = await supabase
    .from('variant_options')
    .insert(optionData)
    .select();

  if (error) {
    console.error('Error creating variant option:', error.message);
    return null;
  }
  return data ? data[0] : null;
}

export async function createProductVariantCombination(combinationData) {
  const { data, error } = await supabase
    .from('product_variant_combinations')
    .insert(combinationData)
    .select();

  if (error) {
    console.error('Error creating product variant combination:', error.message);
    return null;
  }
  return data ? data[0] : null;
}

export async function deleteProductVariants(productId) {
  try {
    // Delete product_variant_combinations first
    const { error: combinationsError } = await supabase
      .from('product_variant_combinations')
      .delete()
      .eq('product_id', productId);

    if (combinationsError) {
      console.error('Error deleting product variant combinations:', combinationsError.message);
      throw combinationsError;
    }

    // Then delete product_variants (variant_options will cascade due to schema)
    const { error: variantsError } = await supabase
      .from('product_variants')
      .delete()
      .eq('product_id', productId);

    if (variantsError) {
      console.error('Error deleting product variants:', variantsError.message);
      throw variantsError;
    }
    console.log(`Successfully deleted variants and combinations for product ${productId}`);
  } catch (error) {
    console.error('Failed to delete product variants and combinations:', error.message);
    throw error; // Re-throw to be caught by the calling function
  }
}

export async function getCart(userId) {
  const { data, error } = await supabase
    .from('carts')
    .select(`
      id,
      cart_items (
        id,
        quantity,
        product_variant_combinations (
          id,
          combination_string,
          price,
          products (
            id,
            product_name,
            customer_id,
            user_id,
            product_media (media_url, media_type)
          )
        )
      )
    `)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching cart:', error.message);
    return null;
  }
  return data;
}

export async function addToCart(userId, productVariantCombinationId, quantity = 1) {
  try {
    if (!userId) {
      console.error('addToCart: userId is required');
      return null;
    }

    // 1. Get or create cart for user
    let { data: cart, error: cartError } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (cartError) {
      console.error('Error fetching cart in addToCart:', cartError.message);
    }

    if (!cart) {
      const { data: newCart, error: newCartError } = await supabase
        .from('carts')
        .insert({ user_id: userId })
        .select('id')
        .single();

      if (newCartError) {
        console.error('Error creating cart:', newCartError.message);
        return null;
      }
      cart = newCart;
    }

    // 2. Resolve valid product_variant_combination_id
    let validCombinationId = productVariantCombinationId;

    // Check if ID exists in product_variant_combinations
    const { data: existingPvc } = await supabase
      .from('product_variant_combinations')
      .select('id, product_id, price')
      .eq('id', productVariantCombinationId)
      .maybeSingle();

    if (existingPvc) {
      validCombinationId = existingPvc.id;
    } else {
      // productVariantCombinationId might be a product_id
      // Check if a combination exists for this product_id
      const { data: comboForProduct } = await supabase
        .from('product_variant_combinations')
        .select('id, product_id, price')
        .eq('product_id', productVariantCombinationId)
        .limit(1)
        .maybeSingle();

      if (comboForProduct) {
        validCombinationId = comboForProduct.id;
      } else {
        // Find product to create default combination so foreign key is valid
        const { data: prod } = await supabase
          .from('products')
          .select('id, amount, product_name')
          .eq('id', productVariantCombinationId)
          .maybeSingle();

        if (prod) {
          const { data: createdCombo, error: createComboError } = await supabase
            .from('product_variant_combinations')
            .insert({
              product_id: prod.id,
              combination_string: 'Default',
              price: prod.amount || 0,
              quantity: 100,
              sku: '',
            })
            .select('id')
            .single();

          if (createdCombo) {
            validCombinationId = createdCombo.id;
          } else {
            console.error('Failed to create default combination:', createComboError?.message);
          }
        }
      }
    }

    if (!validCombinationId) {
      console.error('addToCart: Unable to resolve valid combination ID for:', productVariantCombinationId);
      return null;
    }

    // 3. Check if cart item already exists
    const { data: existingItem } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('cart_id', cart.id)
      .eq('product_variant_combination_id', validCombinationId)
      .maybeSingle();

    if (existingItem) {
      const { data, error } = await supabase
        .from('cart_items')
        .update({ quantity: existingItem.quantity + quantity })
        .eq('id', existingItem.id)
        .select();

      if (error) {
        console.error('Error updating existing cart item:', error.message);
        return null;
      }
      return data ? data[0] : null;
    }

    // 4. Insert new cart item
    const { data, error } = await supabase
      .from('cart_items')
      .insert({
        cart_id: cart.id,
        product_variant_combination_id: validCombinationId,
        quantity: quantity,
      })
      .select();

    if (error) {
      console.error('Error adding to cart:', error.message);
      return null;
    }
    return data ? data[0] : null;
  } catch (err) {
    console.error('Unexpected error in addToCart:', err);
    return null;
  }
}

export async function updateCartItem(cartItemId, quantity) {
  const { data, error } = await supabase
    .from('cart_items')
    .update({ quantity: quantity })
    .eq('id', cartItemId)
    .select();

  if (error) {
    console.error('Error updating cart item:', error.message);
    return null;
  }
  return data ? data[0] : null;
}

export async function removeCartItem(cartItemId) {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', cartItemId);

  if (error) {
    console.error('Error removing cart item:', error.message);
  }
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

export async function deleteOrder(orderId) {
  try {
    // Delete associated order items first
    const { error: deleteItemsError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    if (deleteItemsError) {
      console.error('Error deleting order items:', deleteItemsError.message);
      throw deleteItemsError;
    }

    // Then delete the order itself
    const { error: deleteOrderError } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (deleteOrderError) {
      console.error('Error deleting order:', deleteOrderError.message);
      throw deleteOrderError;
    }

    console.log(`Order ${orderId} and its items deleted successfully.`);
    return true;
  } catch (error) {
    console.error('Failed to delete order:', error.message);
    return false;
  }
} 

export async function uploadQrImage(userId, imageUri) {
  try {
    const { extension, contentType, fileName } = extractFileDetails(imageUri, 'image');
    const qrFileName = `${Date.now()}-${userId}.${extension}`;
    const filePath = `qr_codes/${userId}/${qrFileName}`;

    let fileData = null;
    if (Platform.OS === 'web' || (typeof window !== 'undefined' && typeof fetch === 'function')) {
      try {
        const fileResponse = await fetch(imageUri);
        fileData = await fileResponse.blob();
      } catch (webBlobErr) {
        console.warn('Web blob fetch failed in uploadQrImage:', webBlobErr.message);
      }
    }
    
    if (!fileData) {
      try {
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        fileData = new Uint8Array(
          atob(base64).split("").map((c) => c.charCodeAt(0))
        );
      } catch (fsErr) {
        console.error('FileSystem read error in uploadQrImage:', fsErr.message);
      }
    }

    if (!fileData) {
      console.error('uploadQrImage: Unable to obtain QR image binary data.');
      return null;
    }

    let publicUrl = null;

    // Try storage buckets: qr_codes, productsmedia, locationtracker
    const bucketsToTry = ['qr_codes', 'productsmedia', 'locationtracker'];
    for (const bucketName of bucketsToTry) {
      try {
        const { error } = await supabase.storage
          .from(bucketName)
          .upload(filePath, fileData, {
            contentType: contentType,
            upsert: true,
          });

        if (!error) {
          const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filePath);
          publicUrl = publicUrlData?.publicUrl;
          if (publicUrl) {
            console.log(`QR image uploaded successfully to bucket "${bucketName}":`, publicUrl);
            break;
          }
        } else {
          console.warn(`Storage upload to "${bucketName}" failed:`, error.message);
        }
      } catch (bucketErr) {
        console.warn(`Error trying storage bucket "${bucketName}":`, bucketErr.message);
      }
    }

    // Fallback: Edge function signed upload if needed
    if (!publicUrl) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || supabaseAnonKey;
        const { data: functionData, error: funcError } = await supabase.functions.invoke('upload-image', {
          body: {
            action: 'generateSignedUrl',
            file_name: fileName,
            file_path: filePath,
            content_type: contentType,
            user_id: userId,
          },
        });

        if (!funcError && functionData?.signedUrl) {
          const fileResponse = await fetch(imageUri);
          const blob = await fileResponse.blob();
          const uploadDirectResponse = await fetch(functionData.signedUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': contentType,
              'x-upsert': 'true',
            },
            body: blob,
          });

          if (uploadDirectResponse.ok) {
            const { data: pubData } = supabase.storage
              .from('productsmedia')
              .getPublicUrl(filePath);
            publicUrl = pubData.publicUrl;
          }
        }
      } catch (edgeErr) {
        console.warn('Edge function fallback error:', edgeErr.message);
      }
    }

    return publicUrl;
  } catch (error) {
    console.error('Error in uploadQrImage:', error.message);
    return null;
  }
}

/**
 * Upload profile media (image or video) to Supabase Storage
 */
export async function uploadProfileMedia(userId, mediaUri, mediaType = 'image') {
  try {
    const isVideo = mediaType === 'video';
    const { extension, contentType, fileName } = extractFileDetails(mediaUri, isVideo ? 'video' : 'image');
    const profileFileName = `${Date.now()}-${userId}-${fileName}`;
    const filePath = `profile_media/${userId}/${profileFileName}`;

    let fileData = null;
    if (Platform.OS === 'web' || (typeof window !== 'undefined' && typeof fetch === 'function')) {
      try {
        const fileResponse = await fetch(mediaUri);
        fileData = await fileResponse.blob();
      } catch (webBlobErr) {
        console.warn('Web blob fetch failed in uploadProfileMedia:', webBlobErr.message);
      }
    }

    if (!fileData) {
      try {
        const base64 = await FileSystem.readAsStringAsync(mediaUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (typeof Buffer !== 'undefined') {
          const buf = Buffer.from(base64, 'base64');
          fileData = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } else {
          fileData = new Uint8Array(
            atob(base64).split('').map((c) => c.charCodeAt(0))
          );
        }
      } catch (fsErr) {
        console.error('FileSystem read error in uploadProfileMedia:', fsErr.message);
      }
    }

    if (!fileData) {
      console.error('uploadProfileMedia: Unable to obtain media binary data.');
      return null;
    }

    let publicUrl = null;
    const bucketsToTry = ['productsmedia', 'locationtracker', 'chat_media', 'qr_codes', 'damage_photos'];
    for (const bucketName of bucketsToTry) {
      try {
        const { error } = await supabase.storage
          .from(bucketName)
          .upload(filePath, fileData, {
            contentType: contentType,
            upsert: true,
          });

        if (!error) {
          const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filePath);
          publicUrl = publicUrlData?.publicUrl;
          if (publicUrl) {
            console.log(`Profile media uploaded successfully to bucket "${bucketName}":`, publicUrl);
            break;
          }
        } else {
          console.warn(`Storage upload to "${bucketName}" failed:`, error.message);
        }
      } catch (bucketErr) {
        console.warn(`Error trying storage bucket "${bucketName}":`, bucketErr.message);
      }
    }

    return publicUrl;
  } catch (error) {
    console.error('Error in uploadProfileMedia:', error.message);
    return null;
  }
}

export async function addQrCode(userId, qrImageUrl, name = 'My UPI QR', isActive = true) {
  try {
    if (isActive) {
      // Deactivate previous active QR codes for this user
      await supabase
        .from('user_qr_codes')
        .update({ is_active: false })
        .eq('user_id', userId);
    }

    const { data, error } = await supabase
      .from('user_qr_codes')
      .insert([{ user_id: userId, qr_image_url: qrImageUrl, name: name, is_active: isActive }])
      .select();

    if (error) {
      console.error('Error adding QR code:', error.message);
      return null;
    }
    return data ? data[0] : null;
  } catch (err) {
    console.error('Exception in addQrCode:', err);
    return null;
  }
}

export async function updateQrCode(qrCodeId, name, isActive) {
  const { data, error } = await supabase
    .from('user_qr_codes')
    .update({ name: name, is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', qrCodeId)
    .select();

  if (error) {
    console.error('Error updating QR code:', error.message);
    return null;
  }
  return data ? data[0] : null;
}

export async function deleteQrCode(qrCodeId, imageUrl) {
  try {
    const bucketsToTry = ['qr_codes', 'productsmedia', 'locationtracker'];
    if (imageUrl) {
      for (const bucketName of bucketsToTry) {
        if (imageUrl.includes(bucketName)) {
          const pathSegments = imageUrl.split('/');
          const filePathInBucket = pathSegments.slice(pathSegments.indexOf(bucketName) + 1).join('/');
          await supabase.storage.from(bucketName).remove([filePathInBucket]);
          break;
        }
      }
    }

    const { error: dbError } = await supabase
      .from('user_qr_codes')
      .delete()
      .eq('id', qrCodeId);

    if (dbError) {
      console.error('Error deleting QR code from database:', dbError.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to delete QR code:', error.message);
    return false;
  }
}

export async function getActiveQrCode(userId) {
  try {
    const { data, error } = await supabase
      .from('user_qr_codes')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching active QR code:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Exception in getActiveQrCode:', err);
    return null;
  }
}

export async function getAllQrCodes(userId) {
  const { data, error } = await supabase
    .from('user_qr_codes')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching all QR codes:', error.message);
    return null;
  }
  return data;
}

export async function getCustomerDocuments(customerId) {
  const { data, error } = await supabase
    .from('customer_documents')
    .select('file_data, file_type')
    .eq('customer_id', customerId);

  if (error) {
    console.error('Error fetching customer documents:', error.message);
    return null;
  }
  return data;
}

// Order Management Functions
export async function getOrders(userId) {
  if (!userId) return [];
  console.log('getOrders: userId', userId);

  try {
    const { data, error } = await supabase
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
              product_media (media_url, media_type)
            )
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      console.log('getOrders: Fetched orders data', data);
      return data;
    }
    if (error) {
      console.warn('getOrders primary query notice:', error.message);
    }
  } catch (err) {
    console.warn('getOrders primary query exception:', err);
  }

  // Fallback 1: Query order_items with product_variant_combinations without deep joins
  try {
    const { data, error } = await supabase
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
            price
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data;
    }
  } catch (err) {
    console.warn('getOrders fallback 1 exception:', err);
  }

  // Fallback 2: Basic orders query
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data;
    }
  } catch (err) {
    console.error('getOrders fallback 2 exception:', err);
  }

  return [];
}

export async function getOrderById(orderId) {
  try {
    const { data, error } = await supabase
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
              product_media (media_url, media_type)
            )
          )
        )
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching order by ID:', error.message);
      return null;
    }

    if (!data) return null;

    // Fetch buyer profile if user_id is set
    if (data.user_id) {
      try {
        const { data: userProf } = await supabase
          .from('profiles')
          .select('id, full_name, mobile, email')
          .eq('id', data.user_id)
          .maybeSingle();
        if (userProf) {
          data.customer_profile = userProf;
          if (!data.customer_name && userProf.full_name) data.customer_name = userProf.full_name;
          if (!data.customer_mobile && userProf.mobile) data.customer_mobile = userProf.mobile;
        }
      } catch (_) {}
    }

    // Fetch delivery manager profile if assigned
    if (data.delivery_manager_id) {
      try {
        const { data: dmProf } = await supabase
          .from('profiles')
          .select('id, full_name, mobile')
          .eq('id', data.delivery_manager_id)
          .maybeSingle();
        if (dmProf) {
          data.delivery_manager_profile = dmProf;
        }
      } catch (_) {}
    }

    return data;
  } catch (err) {
    console.error('getOrderById exception:', err);
    return null;
  }
}

export async function updateOrderStatus(orderId, newStatus) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)
    .select();

  if (error) {
    console.error('Error updating order status:', error.message);
    return null;
  }
  return data ? data[0] : null;
}

export async function getPendingOrdersCount(userId) {
  const { count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'processing']);

  if (error) {
    console.error('Error fetching pending orders count:', error.message);
    return 0;
  }
  return count;
}

export async function getAssignedOrders(deliveryManagerId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        id,
        quantity,
        price,
        product_variant_combinations (
          id,
          combination_string,
          products (
            id,
            product_name,
            customer_id,
            product_media (media_url, media_type)
          )
        )
      )
    `)
    .eq('delivery_manager_id', deliveryManagerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching assigned orders:', error.message);
    return [];
  }
  return data || [];
}

export async function getAvailableDeliveryOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        id,
        quantity,
        price,
        product_variant_combinations (
          id,
          combination_string,
          products (
            id,
            product_name,
            customer_id,
            product_media (media_url, media_type)
          )
        )
      )
    `)
    .is('delivery_manager_id', null)
    .or('order_type.is.null,order_type.neq.shop-order')
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching available delivery orders:', error.message);
    return [];
  }
  return data || [];
}

export async function acceptDeliveryOrder(orderId, deliveryManagerId) {
  const { data, error } = await supabase
    .from('orders')
    .update({
      delivery_manager_id: deliveryManagerId,
      status: 'Processing',
    })
    .eq('id', orderId)
    .select();

  if (error) {
    console.error('Error accepting delivery order:', error.message);
    return null;
  }
  return data ? data[0] : null;
}

export async function updateDeliveryManagerLocation(managerId, location) {
  const { data, error } = await supabase
    .from('delivery_manager_locations')
    .insert({
      manager_id: managerId,
      location: `POINT(${location.coords.longitude} ${location.coords.latitude})`,
    });

  return data;
}

export async function getDeliveryManagerLocations() {
  const { data, error } = await supabase
    .from('latest_delivery_manager_locations')
    .select(`
      manager_id,
      location,
      profiles (
        full_name,
        mobile
      )
    `);

  if (error) {
    console.error('Error fetching delivery manager locations:', error.message);
    return null;
  }
  return data;
}

export async function getSellersInRange(latitude, longitude, radius) {
  const { data, error } = await supabase.rpc('get_sellers_in_range', {
    user_lat: latitude,
    user_lon: longitude,
    radius_meters: radius,
  });

  if (error) {
    console.error('Error fetching sellers in range:', error);
    return null;
  }
  return data;
}

export async function getProductsInRange(latitude, longitude, radius) {
  console.log('Calling get_products_in_range RPC with:', { user_lat: latitude, user_lon: longitude, radius_meters: radius });
  const { data, error } = await supabase.rpc('get_products_in_range', {
    user_lat: latitude,
    user_lon: longitude,
    radius_meters: radius,
  });

  if (error) {
    console.error('Error fetching products in range:', error);
    return null;
  }
  console.log('Products in range data:', data);
  return data;
}

/**
 * Calculate the exact callback URL for OAuth and Email Confirmation
 * Works on Web, GitHub Pages subpaths, and Native Mobile deep links.
 */
export function getAuthRedirectUrl() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      let pathname = window.location.pathname || '';
      // Remove specific file names like index.html if present
      if (pathname.endsWith('.html')) {
        pathname = pathname.substring(0, pathname.lastIndexOf('/') + 1);
      }
      if (!pathname.endsWith('/')) {
        pathname = pathname + '/';
      }
      return `${origin}${pathname}`;
    }
    return 'https://narasimhaprocess.github.io/needsTracking/';
  }

  return AuthSession.makeRedirectUri({
    scheme: 'needstracking',
    path: 'auth/callback',
  });
}

/**
 * Ensures user profile exists in `profiles` table after OAuth or Email login with proper role
 */
export async function ensureUserProfile(user, defaultRole = null) {
  if (!user || !user.id) return null;
  try {
    // 1. Check for explicit or stored pending role (from SellerLogin / DeliveryLogin / BuyerLogin)
    let roleToAssign = defaultRole;
    if (!roleToAssign) {
      try {
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          roleToAssign = localStorage.getItem('pending_auth_role') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pending_auth_role') : null);
        }
        if (!roleToAssign && Storage && typeof Storage.getItem === 'function') {
          roleToAssign = await Storage.getItem('pending_auth_role');
        }
      } catch (_) {}
    }

    // Clear pending role once read
    if (roleToAssign) {
      try {
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          localStorage.removeItem('pending_auth_role');
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('pending_auth_role');
        }
        if (Storage && typeof Storage.removeItem === 'function') {
          await Storage.removeItem('pending_auth_role');
        }
      } catch (_) {}
    }

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    // If an explicit role was requested (e.g. 'seller' or 'delivery_manager')
    if (roleToAssign) {
      // Sync auth user metadata
      try {
        await supabase.auth.updateUser({
          data: { role: roleToAssign }
        });
      } catch (_) {}

      if (existingProfile) {
        // Upgrade / sync role if different and not admin / superadmin
        if (existingProfile.role !== roleToAssign && !isUserAdminOrSuperadmin(existingProfile, user)) {
          const { data: updatedProfile, error: updateErr } = await supabase
            .from('profiles')
            .update({
              role: roleToAssign,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)
            .select()
            .maybeSingle();

          if (!updateErr && updatedProfile) {
            console.log(`[ensureUserProfile] Upgraded user profile to role "${roleToAssign}":`, updatedProfile);
            return updatedProfile;
          }
        }
        return existingProfile;
      }
    }

    if (existingProfile) {
      return existingProfile;
    }

    // New profile creation
    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'User';
    const role = roleToAssign || user.user_metadata?.role || 'customer';

    const newProfile = {
      id: user.id,
      full_name: fullName,
      email: user.email || '',
      role: role,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (user.user_metadata?.mobile) {
      newProfile.mobile = user.user_metadata.mobile;
    }

    const { data, error: insertErr } = await supabase
      .from('profiles')
      .upsert(newProfile)
      .select()
      .maybeSingle();

    if (insertErr) {
      console.warn('[ensureUserProfile] Upsert notice:', insertErr.message);
    }
    return data || newProfile;
  } catch (err) {
    console.error('[ensureUserProfile] Error:', err);
    return null;
  }
}

/**
 * Sign in / Sign up with Google OAuth via Supabase
 * @param {string} defaultRole - Role to assign if new profile ('seller' / 'delivery_manager' / 'customer')
 */
export async function signInWithGoogle(defaultRole = 'customer') {
  try {
    // Persist pending role so after OAuth redirect on web / app refocus, role is preserved
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('pending_auth_role', defaultRole);
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('pending_auth_role', defaultRole);
      }
      if (Storage && typeof Storage.setItem === 'function') {
        await Storage.setItem('pending_auth_role', defaultRole);
      }
    } catch (storeErr) {
      console.warn('[Google Auth] Could not store pending_auth_role:', storeErr);
    }

    const redirectUrl = getAuthRedirectUrl();
    console.log('[Google Auth] Using redirect URL:', redirectUrl, 'for intended role:', defaultRole);

    if (Platform.OS === 'web') {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
      return { success: true };
    }

    // Native Mobile (Expo Go / Standalone / Dev Build)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) throw error;

    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    console.log('[Google Auth] Browser result:', res);

    if (res.type === 'success' && res.url) {
      let accessToken = null;
      let refreshToken = null;

      if (res.url.includes('#')) {
        const hashParams = new URLSearchParams(res.url.split('#')[1]);
        accessToken = hashParams.get('access_token');
        refreshToken = hashParams.get('refresh_token');
      }

      if (!accessToken && res.url.includes('?')) {
        const queryParams = new URLSearchParams(res.url.split('?')[1]);
        accessToken = queryParams.get('access_token');
        refreshToken = queryParams.get('refresh_token');
      }

      if (accessToken && refreshToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) throw sessionError;

        if (sessionData?.user) {
          const profile = await ensureUserProfile(sessionData.user, defaultRole);
          return { user: sessionData.user, session: sessionData.session, profile, success: true };
        }

        return { user: sessionData.user, session: sessionData.session, success: true };
      }
    }
    return { success: false, cancelled: true };
  } catch (error) {
    console.error('Google Sign-In Error:', error.message || error);
    return { success: false, error: error.message || 'Google sign-in failed' };
  }
}

/**
 * Update real-time GPS location of Delivery Partner
 */
export async function updateDeliveryPartnerLocation(partnerId, orderId, coords) {
  try {
    const { latitude, longitude, heading = 0, speed = 0 } = coords;

    // 1. Broadcast via Realtime channel (Instant sub-second delivery)
    if (orderId) {
      const broadcastChannel = supabase.channel(`order-tracking:${orderId}`);
      broadcastChannel.send({
        type: 'broadcast',
        event: 'partner_location',
        payload: {
          partnerId,
          orderId,
          latitude,
          longitude,
          heading,
          speed,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 2. Persist in delivery_partner_locations
    await supabase.from('delivery_partner_locations').upsert({
      partner_id: partnerId,
      order_id: orderId || null,
      latitude,
      longitude,
      heading,
      speed,
      updated_at: new Date().toISOString(),
    });

    // 3. Keep legacy delivery_manager_locations compatible
    await supabase.from('delivery_manager_locations').insert({
      manager_id: partnerId,
      location: `POINT(${longitude} ${latitude})`,
    });

    return true;
  } catch (err) {
    console.error('Error updating live delivery location:', err);
    return false;
  }
}

/**
 * Subscribe to live tracking of a delivery partner for a given order
 */
export function subscribeToLiveDelivery(orderId, partnerId, onLocationUpdate) {
  const channel = supabase
    .channel(`order-tracking:${orderId}`)
    .on('broadcast', { event: 'partner_location' }, (payload) => {
      if (payload?.payload && onLocationUpdate) {
        onLocationUpdate(payload.payload);
      }
    })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'delivery_partner_locations',
        filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
      },
      (payload) => {
        if (payload?.new && onLocationUpdate) {
          onLocationUpdate(payload.new);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Set active status for all products of a given seller
 */
export async function setSellerProductsActiveStatus(userId, isActive) {
  try {
    if (!userId) return false;
    // 1. Try RPC
    try {
      const { data, error } = await supabase.rpc('admin_set_seller_products_active', {
        p_seller_id: userId,
        p_is_active: isActive === true,
      });
      if (!error) return true;
    } catch (_) {}

    // 2. Direct table update fallback
    const { error } = await supabase
      .from('products')
      .update({ is_active: isActive })
      .or(`user_id.eq.${userId},customer_id.eq.${userId}`);
    if (error) {
      console.warn('Error updating seller products active status:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Exception updating seller products active status:', e);
    return false;
  }
}

/**
 * Set active status for all products across the entire platform (AppAdmin)
 */
export async function setAllProductsActiveStatus(isActive) {
  try {
    // 1. Try RPC
    try {
      const { data, error } = await supabase.rpc('admin_global_toggle_products', {
        p_is_active: isActive === true,
      });
      if (!error) return true;
    } catch (_) {}

    // 2. Direct table update fallback
    const { error } = await supabase
      .from('products')
      .update({ is_active: isActive })
      .not('id', 'is', null);
    if (error) {
      console.warn('Error updating all products active status:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Exception updating all products active status:', e);
    return false;
  }
}

/**
 * Set store & map active status for a specific seller
 */
export async function setSellerStoreActiveStatus(sellerId, settings) {
  try {
    if (!sellerId) return false;
    const { is_store_active, is_map_active, is_product_active, existingMedia } = settings || {};

    // 1. Attempt via RPC
    try {
      const { data, error } = await supabase.rpc('admin_set_seller_store_settings', {
        p_seller_id: sellerId,
        p_store_active: is_store_active !== false,
        p_map_active: is_map_active !== false,
        p_product_active: is_product_active !== false,
      });
      if (!error) return true;
    } catch (_) {}

    // 2. Direct profiles table update fallback
    const updatedMedia = embedStoreSettings(existingMedia || [], {
      is_store_active: is_store_active !== false,
      is_map_active: is_map_active !== false,
      is_product_active: is_product_active !== false,
    });

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ media_urls: updatedMedia })
      .eq('id', sellerId);

    if (profileErr) {
      console.warn('Direct profile update notice:', profileErr.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exception in setSellerStoreActiveStatus:', err);
    return false;
  }
}

/**
 * Global toggle for all stores and maps across the platform
 */
export async function setAllStoresActiveStatus(isActive, sellersList = []) {
  try {
    // 1. Try global RPC
    try {
      const { data, error } = await supabase.rpc('admin_global_toggle_stores', {
        p_is_active: isActive === true,
      });
      if (!error) return true;
    } catch (_) {}

    // 2. Fallback: Iterate and update each profile
    let listToUpdate = sellersList;
    if (!listToUpdate || listToUpdate.length === 0) {
      const { data: profs } = await supabase.from('profiles').select('id, media_urls');
      listToUpdate = profs || [];
    }

    for (const s of listToUpdate) {
      const updatedMedia = embedStoreSettings(s.media_urls || [], {
        is_store_active: isActive === true,
        is_map_active: isActive === true,
        is_product_active: s.is_product_active !== false,
      });
      await supabase
        .from('profiles')
        .update({ media_urls: updatedMedia })
        .eq('id', s.id);
    }
    return true;
  } catch (err) {
    console.error('Exception in setAllStoresActiveStatus:', err);
    return false;
  }
}

/**
 * Helper to check if a user or profile is Admin or Superadmin
 */
export function isUserAdminOrSuperadmin(profile, user) {
  const role = (
    profile?.role ||
    profile?.user_type ||
    user?.user_metadata?.role ||
    user?.user_metadata?.user_type ||
    ''
  ).toLowerCase().trim();
  return (
    role === 'admin' ||
    role === 'superadmin' ||
    role === 'appadmin' ||
    role === 'app_admin'
  );
}

/**
 * Helper to parse store settings from media_urls or object.
 * By default, if no store_settings object is stored yet, default to ACTIVE (true) so stores are visible.
 */
export function extractStoreSettings(mediaUrls) {
  let list = [];
  if (typeof mediaUrls === 'string') {
    try {
      list = JSON.parse(mediaUrls);
    } catch (_) {
      list = [];
    }
  } else if (Array.isArray(mediaUrls)) {
    list = mediaUrls;
  }
  const settingsItem = (list || []).find((m) => m && m.type === 'store_settings');
  if (!settingsItem) {
    return {
      is_store_active: true,
      is_map_active: true,
      is_product_active: true,
    };
  }
  return {
    is_store_active: settingsItem.store_active !== false,
    is_map_active: settingsItem.map_active !== false,
    is_product_active: settingsItem.product_active !== false,
  };
}

/**
 * Helper to embed store settings into media_urls array without losing media photos/videos
 */
export function embedStoreSettings(existingMediaList, storeSettings) {
  let list = [];
  if (typeof existingMediaList === 'string') {
    try {
      list = JSON.parse(existingMediaList);
    } catch (_) {
      list = [];
    }
  } else if (Array.isArray(existingMediaList)) {
    list = existingMediaList;
  }
  const cleanMedia = (list || []).filter(
    (m) => m && m.type !== 'store_settings'
  );
  cleanMedia.push({
    type: 'store_settings',
    store_active: storeSettings?.is_store_active !== false,
    map_active: storeSettings?.is_map_active !== false,
    product_active: storeSettings?.is_product_active !== false,
    updated_at: new Date().toISOString(),
  });
  return cleanMedia;
}


