-- =============================================================================
-- FIX PRODUCT MEDIA RLS POLICIES & STORAGE ACCESS
-- =============================================================================

-- 1. Ensure product_media table has RLS enabled
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies on product_media
DROP POLICY IF EXISTS "Users can view own product media" ON public.product_media;
DROP POLICY IF EXISTS "Users can insert own product media" ON public.product_media;
DROP POLICY IF EXISTS "Users can delete own product media" ON public.product_media;
DROP POLICY IF EXISTS "Anyone can view media for active products" ON public.product_media;
DROP POLICY IF EXISTS "Anyone can view product media" ON public.product_media;
DROP POLICY IF EXISTS "Sellers can manage media for their own products" ON public.product_media;
DROP POLICY IF EXISTS "Sellers can insert media for their own products" ON public.product_media;
DROP POLICY IF EXISTS "Sellers can update media for their own products" ON public.product_media;
DROP POLICY IF EXISTS "Sellers can delete media for their own products" ON public.product_media;

-- 3. Create comprehensive SELECT policy
-- Anyone (authenticated or anonymous) should be able to view product media in catalog, cart, orders, etc.
CREATE POLICY "Anyone can view product media" ON public.product_media
  FOR SELECT
  USING (true);

-- 4. Create INSERT policy for sellers
CREATE POLICY "Sellers can insert media for their own products" ON public.product_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_media.product_id
      AND products.user_id = auth.uid()
    )
  );

-- 5. Create UPDATE policy for sellers
CREATE POLICY "Sellers can update media for their own products" ON public.product_media
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_media.product_id
      AND products.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_media.product_id
      AND products.user_id = auth.uid()
    )
  );

-- 6. Create DELETE policy for sellers
CREATE POLICY "Sellers can delete media for their own products" ON public.product_media
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_media.product_id
      AND products.user_id = auth.uid()
    )
  );

-- 7. Ensure Storage bucket 'productsmedia' is public and accessible
INSERT INTO storage.buckets (id, name, public)
VALUES ('productsmedia', 'productsmedia', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing storage policies for productsmedia if any
DROP POLICY IF EXISTS "Public Access to productsmedia" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to productsmedia" ON storage.objects;
DROP POLICY IF EXISTS "Users can update and delete productsmedia" ON storage.objects;

-- Create storage policies
CREATE POLICY "Public Access to productsmedia" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'productsmedia');

CREATE POLICY "Authenticated users can upload to productsmedia" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'productsmedia' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update and delete productsmedia" ON storage.objects
  FOR ALL
  USING (bucket_id = 'productsmedia' AND auth.role() = 'authenticated');

-- 8. Clean up any invalid or legacy media_type values in database
UPDATE public.product_media
SET media_type = 'image'
WHERE media_type IS NULL OR media_type = 'url' OR media_type ILIKE 'image%' OR media_type = '';
