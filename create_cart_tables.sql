-- Create carts table
CREATE TABLE public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create cart_items table
CREATE TABLE public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES public.carts(id) ON DELETE CASCADE,
    product_variant_combination_id UUID REFERENCES public.product_variant_combinations(id) ON DELETE CASCADE,
    quantity INT NOT NULL
);

-- Enable Row Level Security for the new tables
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- Policies for carts
CREATE POLICY "Users can view their own cart" ON public.carts
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cart" ON public.carts
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cart" ON public.carts
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cart" ON public.carts
FOR DELETE USING (auth.uid() = user_id);

-- Policies for cart_items
CREATE POLICY "Users can view their own cart items" ON public.cart_items
FOR SELECT USING (EXISTS (SELECT 1 FROM public.carts WHERE carts.id = cart_items.cart_id AND auth.uid() = carts.user_id));

CREATE POLICY "Users can insert their own cart items" ON public.cart_items
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.carts WHERE carts.id = cart_items.cart_id AND auth.uid() = carts.user_id));

CREATE POLICY "Users can update their own cart items" ON public.cart_items
FOR UPDATE USING (EXISTS (SELECT 1 FROM public.carts WHERE carts.id = cart_items.cart_id AND auth.uid() = carts.user_id));

CREATE POLICY "Users can delete their own cart items" ON public.cart_items
FOR DELETE USING (EXISTS (SELECT 1 FROM public.carts WHERE carts.id = cart_items.cart_id AND auth.uid() = carts.user_id));
