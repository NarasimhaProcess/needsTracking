-- Create products table
CREATE TABLE public.products (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
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

-- Create product_images table
CREATE TABLE public.product_images (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for product_images table
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Policy for users to view product images related to their own products
CREATE POLICY "Users can view own product images" ON public.product_images
FOR SELECT USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_images.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

-- Policy for users to insert product images related to their own products
CREATE POLICY "Users can insert own product images" ON public.product_images
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_images.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

-- Policy for users to delete product images related to their own products
CREATE POLICY "Users can delete own product images" ON public.product_images
FOR DELETE USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_images.product_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = products.customer_id)));

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
