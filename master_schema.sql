-- This script sets up the entire database schema from scratch.
-- It is designed to be idempotent, so it can be run multiple times without causing errors.

-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS net WITH SCHEMA extensions;

-- 2. Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  email TEXT UNIQUE,
  name character varying NOT NULL,
  mobile character varying,
  book_no character varying,
  latitude double precision,
  longitude double precision,
  area_id bigint,
  customer_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  repayment_frequency character varying,
  repayment_amount numeric,
  photo_data text
);

-- 3. Create products table and related tables
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id BIGINT REFERENCES public.customers(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    size VARCHAR(50),
    start_date DATE,
    end_date DATE,
    visible_from TIME,
    visible_to TIME,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.variant_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_variant_combinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    combination_string TEXT NOT NULL, -- e.g., "Color:Red,Size:Small"
    price NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL,
    sku TEXT
);

-- 4. Create orders and order_items tables
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    shipping_address JSONB NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_variant_combination_id UUID REFERENCES public.product_variant_combinations(id) ON DELETE SET NULL,
    quantity INT NOT NULL,
    price NUMERIC(10, 2) NOT NULL
);

-- 5. Create inventory management tables and types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_change_type') THEN
        CREATE TYPE inventory_change_type AS ENUM (
          'initial_stock',
          'sale',
          'return',
          'restock',
          'manual_adjustment'
        );
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.inventory_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_combination_id UUID REFERENCES public.product_variant_combinations(id) ON DELETE CASCADE,
  change_type inventory_change_type NOT NULL,
  quantity_change INT NOT NULL,
  new_quantity INT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Alter tables
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='quantity') THEN
    ALTER TABLE public.products DROP COLUMN quantity;
  END IF;
END $$;

-- 7. Create functions and triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_order_item() 
RETURNS TRIGGER AS $$
BEGIN
  perform net.http_post(
    url:='https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/update-product-quantity',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Y3hoaGJpZ21xcm1xZHloemN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxNjE3ODgsImV4cCI6MjA2NzczNzc4OH0.AIViaiRT2odHJM2wQXl3dDZ69YxEj7t_7UiRFqEgZjY"}',
    body:=json_build_object('order_id', new.order_id)::text
  );
  return new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_order_item_insert ON public.order_items;
CREATE TRIGGER on_order_item_insert
  AFTER INSERT
  ON public.order_items
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_order_item();

-- 8. Enable RLS and create policies
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own products" ON public.products FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));
CREATE POLICY "Users can insert own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));
CREATE POLICY "Users can update own products" ON public.products FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));
CREATE POLICY "Users can delete own products" ON public.products FOR DELETE USING (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own product media" ON public.product_media FOR SELECT USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));
CREATE POLICY "Users can insert own product media" ON public.product_media FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));
CREATE POLICY "Users can delete own product media" ON public.product_media FOR DELETE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own product variants" ON public.product_variants FOR SELECT USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));
CREATE POLICY "Users can insert own product variants" ON public.product_variants FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));
CREATE POLICY "Users can update own product variants" ON public.product_variants FOR UPDATE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));
CREATE POLICY "Users can delete own product variants" ON public.product_variants FOR DELETE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

ALTER TABLE public.variant_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own variant options" ON public.variant_options FOR SELECT USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));
CREATE POLICY "Users can insert own variant options" ON public.variant_options FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));
CREATE POLICY "Users can update own variant options" ON public.variant_options FOR UPDATE USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));
CREATE POLICY "Users can delete own variant options" ON public.variant_options FOR DELETE USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));

ALTER TABLE public.product_variant_combinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own product variant combinations" ON public.product_variant_combinations FOR SELECT USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));
CREATE POLICY "Users can insert own product variant combinations" ON public.product_variant_combinations FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));
CREATE POLICY "Users can update own product variant combinations" ON public.product_variant_combinations FOR UPDATE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));
CREATE POLICY "Users can delete own product variant combinations" ON public.product_variant_combinations FOR DELETE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own order items" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND auth.uid() = orders.user_id));

ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own inventory history" ON public.inventory_history FOR SELECT USING (EXISTS (SELECT 1 FROM public.products p JOIN public.product_variant_combinations pvc ON p.id = pvc.product_id WHERE pvc.id = inventory_history.product_variant_combination_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));

-- 9. Reload schema
NOTIFY pgrst, 'reload schema';