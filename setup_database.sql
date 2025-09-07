-- This script sets up the database schema from scratch.
-- Execute this in your Supabase SQL editor.

-- Create customers table
CREATE TABLE public.customers (
  id bigint NOT NULL DEFAULT nextval('customers_id_seq'::regclass),
  name character varying NOT NULL,
  mobile character varying,
  email character varying,
  book_no character varying,
  latitude double precision,
  longitude double precision,
  area_id bigint,
  user_id uuid,
  customer_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  repayment_frequency character varying,
  repayment_amount numeric,
  photo_data text,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Create products table and related tables
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create products table
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id BIGINT REFERENCES public.customers(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    size VARCHAR(50),
    quantity INT NOT NULL,
    start_date DATE,
    end_date DATE,
    visible_from TIMESTAMPTZ,
    visible_to TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for products table
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Policies for products
CREATE POLICY "Users can view own products" ON public.products
FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));

CREATE POLICY "Users can insert own products" ON public.products
FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));

CREATE POLICY "Users can update own products" ON public.products
FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));

CREATE POLICY "Users can delete own products" ON public.products
FOR DELETE USING (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));

-- Create product_media table
CREATE TABLE public.product_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for product_media table
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

-- Policies for product_media
CREATE POLICY "Users can view own product media" ON public.product_media
FOR SELECT USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

CREATE POLICY "Users can insert own product media" ON public.product_media
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

CREATE POLICY "Users can delete own product media" ON public.product_media
FOR DELETE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

-- Create variants tables
CREATE TABLE public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL
);

CREATE TABLE public.variant_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    value TEXT NOT NULL
);

CREATE TABLE public.product_variant_combinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    combination_string TEXT NOT NULL, -- e.g., "Color:Red,Size:Small"
    price NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL,
    sku TEXT
);

-- Enable Row Level Security for variants tables
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_combinations ENABLE ROW LEVEL SECURITY;

-- Policies for product_variants
CREATE POLICY "Users can view own product variants" ON public.product_variants
FOR SELECT USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

CREATE POLICY "Users can insert own product variants" ON public.product_variants
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

CREATE POLICY "Users can update own product variants" ON public.product_variants
FOR UPDATE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

CREATE POLICY "Users can delete own product variants" ON public.product_variants
FOR DELETE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

-- Policies for variant_options
CREATE POLICY "Users can view own variant options" ON public.variant_options
FOR SELECT USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));

CREATE POLICY "Users can insert own variant options" ON public.variant_options
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));

CREATE POLICY "Users can update own variant options" ON public.variant_options
FOR UPDATE USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));

CREATE POLICY "Users can delete own variant options" ON public.variant_options
FOR DELETE USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = variant_options.variant_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));

-- Policies for product_variant_combinations
CREATE POLICY "Users can view own product variant combinations" ON public.product_variant_combinations
FOR SELECT USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

CREATE POLICY "Users can insert own product variant combinations" ON public.product_variant_combinations
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

CREATE POLICY "Users can update own product variant combinations" ON public.product_variant_combinations
FOR UPDATE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

CREATE POLICY "Users can delete own product variant combinations" ON public.product_variant_combinations
FOR DELETE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variant_combinations.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

-- Create orders and order_items tables
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    shipping_address JSONB NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_variant_combination_id UUID REFERENCES public.product_variant_combinations(id) ON DELETE SET NULL,
    quantity INT NOT NULL,
    price NUMERIC(10, 2) NOT NULL
);

-- Enable Row Level Security for orders and order_items tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Policies for orders
CREATE POLICY "Users can view their own orders" ON public.orders
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own orders" ON public.orders
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for order_items
CREATE POLICY "Users can view their own order items" ON public.order_items
FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND auth.uid() = orders.user_id));

-- Function to update updated_at column automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for products table
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reload the schema
NOTIFY pgrst, 'reload schema';
