-- Add product_id column to product_variant_combinations if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='product_variant_combinations' AND column_name='product_id') THEN
    ALTER TABLE public.product_variant_combinations ADD COLUMN product_id UUID;
  END IF;
END $$;

-- Add foreign key constraint if it doesn't exist
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

-- Reload the schema
NOTIFY pgrst, 'reload schema';
