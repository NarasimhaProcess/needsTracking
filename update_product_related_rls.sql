-- Drop existing RLS policies for product-related tables

-- product_media
DROP POLICY IF EXISTS "Users can view own product media" ON public.product_media;
DROP POLICY IF EXISTS "Users can insert own product media" ON public.product_media;
DROP POLICY IF EXISTS "Users can delete own product media" ON public.product_media;

-- product_variants
DROP POLICY IF EXISTS "Users can view own product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Users can insert own product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Users can update own product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Users can delete own product variants" ON public.product_variants;

-- variant_options
DROP POLICY IF EXISTS "Users can view own variant options" ON public.variant_options;
DROP POLICY IF EXISTS "Users can insert own variant options" ON public.variant_options;
DROP POLICY IF EXISTS "Users can update own variant options" ON public.variant_options;
DROP POLICY IF EXISTS "Users can delete own variant options" ON public.variant_options;

-- product_variant_combinations
DROP POLICY IF EXISTS "Users can view own product variant combinations" ON public.product_variant_combinations;
DROP POLICY IF EXISTS "Users can insert own product variant combinations" ON public.product_variant_combinations;
DROP POLICY IF EXISTS "Users can update own product variant combinations" ON public.product_variant_combinations;
DROP POLICY IF EXISTS "Users can delete own product variant combinations" ON public.product_variant_combinations;


-- Create new RLS policies for product-related tables based on user_id

-- product_media
CREATE POLICY "Anyone can view media for active products" ON public.product_media
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND products.is_active = true));

CREATE POLICY "Sellers can manage media for their own products" ON public.product_media
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND products.user_id = auth.uid()));

-- product_variants
CREATE POLICY "Anyone can view variants for active products" ON public.product_variants
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND products.is_active = true));

CREATE POLICY "Sellers can manage variants for their own products" ON public.product_variants
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND products.user_id = auth.uid()));

-- variant_options
CREATE POLICY "Anyone can view options for active products" ON public.variant_options
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND p.is_active = true));

CREATE POLICY "Sellers can manage options for their own products" ON public.variant_options
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND p.user_id = auth.uid()));

-- product_variant_combinations
CREATE POLICY "Anyone can view combinations for active products" ON public.product_variant_combinations
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND products.is_active = true));

CREATE POLICY "Sellers can manage combinations for their own products" ON public.product_variant_combinations
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND products.user_id = auth.uid()));
