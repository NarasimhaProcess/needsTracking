-- =============================================================================
-- FIX ADMIN MANAGEMENT, RLS POLICIES, AND STORE/MAP/PRODUCT TOGGLE FUNCTIONS
-- Run this in your Supabase SQL Editor to allow Admins to manage all stores & products
-- =============================================================================

-- 1. Helper function to check if current authenticated user is an Admin/Superadmin
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('admin', 'superadmin', 'appadmin', 'app_admin')
  );
$$;

-- 2. Update RLS Policies on `public.profiles` so Admins can update any seller profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow individual update on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and owners can update profiles" ON public.profiles;
CREATE POLICY "Admins and owners can update profiles"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id OR public.is_admin_user()
  );

-- 3. Update RLS Policies on `public.products` so Admins can update/delete any product
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can update their own products" ON public.products;
DROP POLICY IF EXISTS "Admins and sellers can update products" ON public.products;
CREATE POLICY "Admins and sellers can update products"
  ON public.products FOR UPDATE
  USING (
    auth.uid() = user_id OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "Sellers can delete their own products" ON public.products;
DROP POLICY IF EXISTS "Admins and sellers can delete products" ON public.products;
CREATE POLICY "Admins and sellers can delete products"
  ON public.products FOR DELETE
  USING (
    auth.uid() = user_id OR public.is_admin_user()
  );

-- 4. RPC Function: Admin Set Single Seller Store Settings
CREATE OR REPLACE FUNCTION public.admin_set_seller_store_settings(
  p_seller_id UUID,
  p_store_active BOOLEAN,
  p_map_active BOOLEAN,
  p_product_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_media JSONB;
  filtered_media JSONB := '[]'::jsonb;
  new_settings JSONB;
  elem JSONB;
BEGIN
  -- Get existing media_urls
  SELECT COALESCE(media_urls, '[]'::jsonb) INTO current_media
  FROM public.profiles
  WHERE id = p_seller_id;

  IF current_media IS NULL THEN
    current_media := '[]'::jsonb;
  END IF;

  -- Filter out existing store_settings
  IF jsonb_typeof(current_media) = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(current_media)
    LOOP
      IF elem->>'type' IS DISTINCT FROM 'store_settings' THEN
        filtered_media := filtered_media || elem;
      END IF;
    END LOOP;
  END IF;

  -- Build new settings object
  new_settings := jsonb_build_object(
    'type', 'store_settings',
    'store_active', p_store_active,
    'map_active', p_map_active,
    'product_active', p_product_active,
    'updated_at', NOW()
  );

  filtered_media := filtered_media || new_settings;

  -- Update profiles table
  UPDATE public.profiles
  SET media_urls = filtered_media,
      updated_at = NOW()
  WHERE id = p_seller_id;

  RETURN jsonb_build_object('success', true, 'seller_id', p_seller_id, 'settings', new_settings);
END;
$$;

-- 5. RPC Function: Admin Global Toggle All Stores (Active or Inactive)
CREATE OR REPLACE FUNCTION public.admin_global_toggle_stores(
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  seller_row RECORD;
  current_media JSONB;
  filtered_media JSONB;
  new_settings JSONB;
  elem JSONB;
  updated_count INT := 0;
BEGIN
  FOR seller_row IN 
    SELECT id, media_urls FROM public.profiles
    WHERE LOWER(role) IN ('seller', 'admin', 'superadmin', 'appadmin', 'app_admin', 'merchant')
       OR id IN (SELECT DISTINCT user_id FROM public.products WHERE user_id IS NOT NULL)
  LOOP
    current_media := COALESCE(seller_row.media_urls, '[]'::jsonb);
    filtered_media := '[]'::jsonb;

    IF jsonb_typeof(current_media) = 'array' THEN
      FOR elem IN SELECT * FROM jsonb_array_elements(current_media)
      LOOP
        IF elem->>'type' IS DISTINCT FROM 'store_settings' THEN
          filtered_media := filtered_media || elem;
        END IF;
      END LOOP;
    END IF;

    new_settings := jsonb_build_object(
      'type', 'store_settings',
      'store_active', p_is_active,
      'map_active', p_is_active,
      'product_active', p_is_active,
      'updated_at', NOW()
    );

    filtered_media := filtered_media || new_settings;

    UPDATE public.profiles
    SET media_urls = filtered_media,
        updated_at = NOW()
    WHERE id = seller_row.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_sellers', updated_count, 'status', p_is_active);
END;
$$;

-- 6. RPC Function: Admin Global Toggle All Products (Active or Inactive)
CREATE OR REPLACE FUNCTION public.admin_global_toggle_products(
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_rows INT;
BEGIN
  UPDATE public.products
  SET is_active = p_is_active
  WHERE id IS NOT NULL;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated_products', affected_rows, 'status', p_is_active);
END;
$$;

-- 7. RPC Function: Admin Set Single Seller's Products Active Status
CREATE OR REPLACE FUNCTION public.admin_set_seller_products_active(
  p_seller_id UUID,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_rows INT;
BEGIN
  UPDATE public.products
  SET is_active = p_is_active
  WHERE user_id = p_seller_id OR customer_id = p_seller_id;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'seller_id', p_seller_id, 'updated_products', affected_rows);
END;
$$;

-- 8. ONE-TIME FIX: Ensure all existing products and sellers are ACTIVE right now
UPDATE public.products SET is_active = true WHERE is_active IS NOT TRUE;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
