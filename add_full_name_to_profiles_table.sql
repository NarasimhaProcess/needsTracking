-- Adds the full_name column to the profiles table to store the user's name.
ALTER TABLE public.profiles
ADD COLUMN full_name TEXT;

COMMENT ON COLUMN public.profiles.full_name IS 'Stores the user\'s full name, populated during signup.';