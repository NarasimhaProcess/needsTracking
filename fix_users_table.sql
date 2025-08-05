-- Fix users table to ensure email column exists and is populated
-- Run this in your Supabase SQL editor

-- 1. Add email column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Update existing users with email from auth.users table
UPDATE users 
SET email = auth.users.email 
FROM auth.users 
WHERE users.id = auth.users.id 
AND (users.email IS NULL OR users.email = '');

-- 3. Make email column NOT NULL after updating existing records
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- 4. Update the trigger function to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, user_type)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name', COALESCE(NEW.raw_user_meta_data->>'user_type', 'user'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Check current users in the table
SELECT id, email, name, user_type, location_status FROM users ORDER BY created_at DESC;

-- 6. If you need to manually create a user profile, use this template:
-- INSERT INTO users (id, email, name, user_type, location_status) 
-- VALUES ('your-user-id-here', 'user@example.com', 'User Name', 'user', 0); 