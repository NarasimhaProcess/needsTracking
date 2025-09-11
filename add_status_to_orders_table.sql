ALTER TABLE public.orders
ADD COLUMN status text DEFAULT 'pending' NOT NULL;