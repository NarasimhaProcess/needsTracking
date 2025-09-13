ALTER TABLE public.orders
ADD COLUMN delivery_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;