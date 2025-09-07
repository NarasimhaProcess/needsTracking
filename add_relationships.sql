-- This script adds the necessary foreign key relationships to your existing tables.
-- Execute this in your Supabase SQL editor.

-- Add foreign key from products to customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_customer_id_fkey'
  ) THEN
    ALTER TABLE public.products 
    ADD CONSTRAINT products_customer_id_fkey 
    FOREIGN KEY (customer_id) 
    REFERENCES public.customers(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key from product_media to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_media_product_id_fkey'
  ) THEN
    ALTER TABLE public.product_media 
    ADD CONSTRAINT product_media_product_id_fkey 
    FOREIGN KEY (product_id) 
    REFERENCES public.products(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key from product_variants to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_variants_product_id_fkey'
  ) THEN
    ALTER TABLE public.product_variants 
    ADD CONSTRAINT product_variants_product_id_fkey 
    FOREIGN KEY (product_id) 
    REFERENCES public.products(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key from variant_options to product_variants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'variant_options_variant_id_fkey'
  ) THEN
    ALTER TABLE public.variant_options 
    ADD CONSTRAINT variant_options_variant_id_fkey 
    FOREIGN KEY (variant_id) 
    REFERENCES public.product_variants(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key from product_variant_combinations to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_variant_combinations_product_id_fkey'
  ) THEN
    ALTER TABLE public.product_variant_combinations 
    ADD CONSTRAINT product_variant_combinations_product_id_fkey 
    FOREIGN KEY (product_id) 
    REFERENCES public.products(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key from orders to auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'orders_user_id_fkey'
  ) THEN
    ALTER TABLE public.orders 
    ADD CONSTRAINT orders_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key from order_items to orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'order_items_order_id_fkey'
  ) THEN
    ALTER TABLE public.order_items 
    ADD CONSTRAINT order_items_order_id_fkey 
    FOREIGN KEY (order_id) 
    REFERENCES public.orders(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key from order_items to product_variant_combinations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'order_items_product_variant_combination_id_fkey'
  ) THEN
    ALTER TABLE public.order_items 
    ADD CONSTRAINT order_items_product_variant_combination_id_fkey 
    FOREIGN KEY (product_variant_combination_id) 
    REFERENCES public.product_variant_combinations(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key from customers to auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'customers_user_id_fkey'
  ) THEN
    ALTER TABLE public.customers 
    ADD CONSTRAINT customers_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id);
  END IF;
END $$;

-- Reload the schema
NOTIFY pgrst, 'reload schema';
