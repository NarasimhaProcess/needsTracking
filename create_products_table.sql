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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for products table
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own products
CREATE POLICY "Users can view own products" ON public.products
FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));

-- Policy for users to insert their own products
CREATE POLICY "Users can insert own products" ON public.products
FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));

-- Policy for users to update their own products
CREATE POLICY "Users can update own products" ON public.products
FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.customers WHERE id = customer_id));

-- Policy for users to delete their own products
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

-- Policy for users to view product media related to their own products
CREATE POLICY "Users can view own product media" ON public.product_media
FOR SELECT USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

-- Policy for users to insert product media related to their own products
CREATE POLICY "Users can insert own product media" ON public.product_media
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

-- Policy for users to delete product media related to their own products
CREATE POLICY "Users can delete own product media" ON public.product_media
FOR DELETE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_media.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

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
