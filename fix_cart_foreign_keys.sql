-- ==============================================================================
-- FIX CART ITEMS FOREIGN KEY CONSTRAINT & PRODUCT COMBINATIONS
-- Run this in your Supabase SQL Editor
-- ==============================================================================

-- 1. Ensure product_id column exists in product_variant_combinations
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='product_variant_combinations' AND column_name='product_id') THEN
    ALTER TABLE public.product_variant_combinations ADD COLUMN product_id UUID;
  END IF;
END $$;

-- 2. Ensure product_variant_combinations has foreign key to products
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

-- 3. Populate default variant combination for all existing products that don't have one
INSERT INTO public.product_variant_combinations (product_id, combination_string, price, quantity, sku)
SELECT 
    p.id, 
    'Default', 
    COALESCE(p.amount, 0), 
    100, 
    ''
FROM public.products p
WHERE NOT EXISTS (
    SELECT 1 
    FROM public.product_variant_combinations pvc 
    WHERE pvc.product_id = p.id
);

-- 4. Re-create cart_items foreign key constraint cleanly
ALTER TABLE public.cart_items 
DROP CONSTRAINT IF EXISTS cart_items_product_variant_combination_id_fkey;

ALTER TABLE public.cart_items 
DROP CONSTRAINT IF EXISTS cart_items_product_variant_id_fkey;

ALTER TABLE public.cart_items
ADD CONSTRAINT cart_items_product_variant_combination_id_fkey
FOREIGN KEY (product_variant_combination_id)
REFERENCES public.product_variant_combinations(id)
ON DELETE CASCADE;

-- 5. Create automatic trigger to ensure newly created products always have a default combination
CREATE OR REPLACE FUNCTION public.ensure_default_product_combination()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.product_variant_combinations WHERE product_id = NEW.id) THEN
        INSERT INTO public.product_variant_combinations (product_id, combination_string, price, quantity, sku)
        VALUES (NEW.id, 'Default', COALESCE(NEW.amount, 0), 100, '');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ensure_default_product_combination ON public.products;
CREATE TRIGGER trg_ensure_default_product_combination
AFTER INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.ensure_default_product_combination();

-- 6. Ensure RLS policies on carts and cart_items
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own cart" ON public.carts;
CREATE POLICY "Users can manage own cart" ON public.carts
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own cart items" ON public.cart_items;
CREATE POLICY "Users can manage own cart items" ON public.cart_items
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.carts 
        WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.carts 
        WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
    )
);

-- 7. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
