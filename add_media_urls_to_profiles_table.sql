-- Add media_urls column to public.profiles table to store array of profile images and videos
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
