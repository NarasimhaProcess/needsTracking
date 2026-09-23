-- Add theme_preference column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'system';

COMMENT ON COLUMN public.profiles.theme_preference IS 'Stores the user interface theme preference: light, dark, or system.';
