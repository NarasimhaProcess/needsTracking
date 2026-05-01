-- ==========================================
-- SUPABASE FULL DATABASE BACKUP & MIGRATION
-- Project ID: qdljcbvesouchefzxsag
-- ==========================================

-- 1. EXTENSIONS
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "cube" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "earthdistance" WITH SCHEMA extensions;
-- Note: 'net' extension is now handled via Database Webhooks in the Supabase Dashboard.

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE inventory_change_type AS ENUM ('initial_stock', 'sale', 'return', 'restock', 'manual_adjustment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABLES
-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  mobile text UNIQUE,
  role text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  zip_code text,
  latitude double precision,
  longitude double precision,
  push_token text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  email TEXT UNIQUE,
  name character varying NOT NULL,
  mobile character varying UNIQUE,
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

-- Areas
CREATE TABLE IF NOT EXISTS public.area_master (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    area_name VARCHAR(255) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id BIGINT REFERENCES public.customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    size VARCHAR(50),
    unit VARCHAR(50),
    product_type VARCHAR(50),
    start_date DATE,
    end_date DATE,
    visible_from TIME,
    visible_to TIME,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Media
CREATE TABLE IF NOT EXISTS public.product_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Variants
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL
);

-- Variant Options
CREATE TABLE IF NOT EXISTS public.variant_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    value TEXT NOT NULL
);

-- Product Variant Combinations
CREATE TABLE IF NOT EXISTS public.product_variant_combinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    combination_string TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL,
    sku TEXT
);

-- Carts
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES public.carts(id) ON DELETE CASCADE,
    product_variant_combination_id UUID REFERENCES public.product_variant_combinations(id) ON DELETE CASCADE,
    quantity INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id BIGINT REFERENCES public.customers(id),
    delivery_manager_id UUID REFERENCES public.profiles(id),
    shipping_address JSONB,
    total_amount NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    order_number TEXT UNIQUE,
    is_dine_in BOOLEAN DEFAULT FALSE,
    table_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_variant_combination_id UUID REFERENCES public.product_variant_combinations(id) ON DELETE SET NULL,
    quantity INT NOT NULL,
    price NUMERIC(10, 2) NOT NULL
);

-- Inventory History
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

-- QR Codes
CREATE TABLE IF NOT EXISTS public.user_qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    qr_image_url TEXT NOT NULL,
    name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery Locations
CREATE TABLE IF NOT EXISTS public.delivery_manager_locations (
  id bigserial PRIMARY KEY,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  location extensions.geography(Point, 4326),
  created_at timestamp with time zone DEFAULT now()
);

-- Push Tokens
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. VIEWS
CREATE OR REPLACE VIEW public.latest_delivery_manager_locations AS
 SELECT DISTINCT ON (delivery_manager_locations.manager_id) delivery_manager_locations.manager_id,
    delivery_manager_locations.location,
    delivery_manager_locations.created_at
   FROM public.delivery_manager_locations
  ORDER BY delivery_manager_locations.manager_id, delivery_manager_locations.created_at DESC;

-- 5. FUNCTIONS & TRIGGERS
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Example of dynamic URL from Vault (Requires 'pg_net' or Webhooks setup)
-- This is the best practice for multi-tenant hosting.
-- To use this, you must have 'supabase_url' and 'service_role_key' in your vault.
-- SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url';

CREATE OR REPLACE FUNCTION public.get_active_products_with_details(p_user_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(t) INTO result FROM (
    SELECT 
      p.*,
      COALESCE((SELECT json_agg(pm) FROM public.product_media pm WHERE pm.product_id = p.id), '[]'::json) as product_media,
      COALESCE((SELECT json_agg(pv) FROM (
        SELECT pv_inner.*, COALESCE((SELECT json_agg(vo) FROM public.variant_options vo WHERE vo.variant_id = pv_inner.id), '[]'::json) as variant_options
        FROM public.product_variants pv_inner WHERE pv_inner.product_id = p.id
      ) pv), '[]'::json) as product_variants,
      COALESCE((SELECT json_agg(pvc) FROM public.product_variant_combinations pvc WHERE pvc.product_id = p.id), '[]'::json) as product_variant_combinations
    FROM public.products p
    WHERE p.user_id = p_user_id AND p.is_active = true
    ORDER BY p.display_order ASC
  ) t;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 6. RLS POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow individual update on profiles" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 7. NOTIFICATIONS
NOTIFY pgrst, 'reload schema';
