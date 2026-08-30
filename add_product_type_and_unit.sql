-- Add product_type and unit columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'product_type') THEN
        ALTER TABLE public.products ADD COLUMN product_type TEXT DEFAULT 'other';
    ELSE
        ALTER TABLE public.products ALTER COLUMN product_type TYPE TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'unit') THEN
        ALTER TABLE public.products ADD COLUMN unit TEXT DEFAULT 'pcs';
    END IF;
END $$;