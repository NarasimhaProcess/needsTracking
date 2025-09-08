-- This script updates the data type of visible_from and visible_to columns to TIME.

ALTER TABLE public.products
ALTER COLUMN visible_from TYPE TIME,
ALTER COLUMN visible_to TYPE TIME;

-- Reload the schema
NOTIFY pgrst, 'reload schema';
