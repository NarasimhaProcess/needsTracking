-- Create product_variants table
CREATE TABLE public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL
);

-- Create variant_options table
CREATE TABLE public.variant_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    value TEXT NOT NULL
);

-- Create product_variant_combinations table
CREATE TABLE public.product_variant_combinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    combination_string TEXT NOT NULL, -- e.g., "Color:Red,Size:Small"
    price NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL,
    sku TEXT
);

-- Enable Row Level Security for the new tables
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
