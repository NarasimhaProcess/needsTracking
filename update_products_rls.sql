-- Drop existing RLS policies for the products table
DROP POLICY IF EXISTS "Users can view own products" ON public.products;
DROP POLICY IF EXISTS "Users can insert own products" ON public.products;
DROP POLICY IF EXISTS "Users can update own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete own products" ON public.products;

-- Create new RLS policies for the products table based on user_id

-- 1. Allow public read access to active products for the catalog
CREATE POLICY "Anyone can view active products" ON public.products
  FOR SELECT
  USING (is_active = true);

-- 2. Allow sellers to insert products for themselves
CREATE POLICY "Sellers can insert their own products" ON public.products
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. Allow sellers to update their own products
CREATE POLICY "Sellers can update their own products" ON public.products
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 4. Allow sellers to delete their own products
CREATE POLICY "Sellers can delete their own products" ON public.products
  FOR DELETE
  USING (auth.uid() = user_id);
