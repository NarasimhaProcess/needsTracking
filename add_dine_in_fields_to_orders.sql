-- Add columns for dine-in / shop orders
ALTER TABLE public.orders
ADD COLUMN order_type TEXT;

ALTER TABLE public.orders
ADD COLUMN table_no TEXT;
