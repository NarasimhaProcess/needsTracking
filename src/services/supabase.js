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


export async function getAllProducts() {
  const { data, error } = await supabase.from('products').select('*');
  if (error) {
    console.error('Error fetching all products:', error.message);
    return null;
  }
  return data;
}

export async function getProductsWithDetails(customerId) {
  console.log('getProductsWithDetails: Received customerId:', customerId);
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
    .eq('customer_id', customerId)
    .order('display_order');

  if (error) {
    console.error('Error fetching products with details:', error.message);
    return null;
  }
  console.log('getProductsWithDetails: Fetched products data:', data);
  return data;
}

export async function getActiveProductsWithDetails(customerId) {
  const now = new Date();
  const currentTime = new Date().toTimeString().split(' ')[0];

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
    .eq('is_active', true)
    .or(`visible_from.is.null,visible_from.lte.${currentTime}`)
    .or(`visible_to.is.null,visible_to.gte.${currentTime}`)
    .order('display_order');

  if (customerId) {
    console.log('Filtering products by customerId:', customerId);
    query = query.eq('customer_id', customerId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching active products with details:', error.message);
    return null;
  }
  return data;
}

export async function getTopProductsWithDetails(customerId) {
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
    .eq('customer_id', customerId)
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

export async function addToCart(userId, productVariantCombinationId, quantity) {
  let { data: cart, error: cartError } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (cartError && cartError.code !== 'PGRST116') { // Ignore error when no cart is found
    console.error('Error fetching cart:', cartError.message);
    return null;
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

  const { data, error } = await supabase
    .from('cart_items')
    .insert({
      cart_id: cart.id,
      product_variant_combination_id: productVariantCombinationId,
      quantity: quantity,
    })
    .select();

  if (error) {
    console.error('Error adding to cart:', error.message);
    return null;
  }
  return data ? data[0] : null;
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
    const fileExtension = imageUri.split('.').pop();
    const fileName = `${Date.now()}-${userId}.${fileExtension}`;
    const filePath = `qr_codes/${userId}/${fileName}`;
    const contentType = `image/${fileExtension}`;

    const response = await fetch(imageUri);
    const blob = await response.blob();

    const { data, error } = await supabase.storage
      .from('qr_codes')
      .upload(filePath, blob, {
        contentType: contentType,
        upsert: false,
      });

    if (error) {
      console.error('Error uploading QR image:', error.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from('qr_codes')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Error in uploadQrImage:', error.message);
    return null;
  }
}

export async function addQrCode(userId, qrImageUrl, name, isActive) {
  const { data, error } = await supabase
    .from('user_qr_codes')
    .insert([{ user_id: userId, qr_image_url: qrImageUrl, name: name, is_active: isActive }])
    .select();

  if (error) {
    console.error('Error adding QR code:', error.message);
    return null;
  }
  return data ? data[0] : null;
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
    const bucketName = 'qr_codes';
    const pathSegments = imageUrl.split('/');
    const filePathInBucket = pathSegments.slice(pathSegments.indexOf(bucketName) + 1).join('/');

    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .remove([filePathInBucket]);

    if (storageError) {
      console.error('Error deleting QR image from storage:', storageError.message);
      throw storageError;
    }

    const { error: dbError } = await supabase
      .from('user_qr_codes')
      .delete()
      .eq('id', qrCodeId);

    if (dbError) {
      console.error('Error deleting QR code from database:', dbError.message);
      throw dbError;
    }
    return true;
  } catch (error) {
    console.error('Failed to delete QR code:', error.message);
    return false;
  }
}

export async function getActiveQrCode(userId) {
  const { data, error } = await supabase
    .from('user_qr_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching active QR code:', error.message);
    return null;
  }
  return data;
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
  console.log('getOrders: userId', userId);

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
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getOrders: Error fetching orders:', error.message);
    return null;
  }
  console.log('getOrders: Fetched orders data', data);
  return data;
}

export async function getOrderById(orderId) {
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
            product_media (media_url, media_type)
          )
        )
      )
    `)
    .eq('id', orderId)
    .single();

  if (error) {
    console.error('Error fetching order by ID:', error.message);
    return null;
  }
  return data;
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