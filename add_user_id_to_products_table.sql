ALTER TABLE public.products
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;