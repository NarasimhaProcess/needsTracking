CREATE TYPE product_type_enum AS ENUM ('grocery', 'electronics', 'clothing', 'other');

ALTER TABLE public.products
ADD COLUMN product_type product_type_enum DEFAULT 'other',
ADD COLUMN unit TEXT;