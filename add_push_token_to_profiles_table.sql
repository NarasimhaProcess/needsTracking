-- Add push_token column to profiles table
ALTER TABLE public.profiles
ADD COLUMN push_token TEXT;

COMMENT ON COLUMN public.profiles.push_token IS 'Stores the Expo Push Token for sending notifications to the user.';
