-- Add email column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Update existing users with email from auth.users table
UPDATE users 
SET email = auth.users.email 
FROM auth.users 
WHERE users.id = auth.users.id 
AND users.email IS NULL;

-- Make email column NOT NULL after updating existing records
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Update the trigger function to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, user_type)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name', COALESCE(NEW.raw_user_meta_data->>'user_type', 'user'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 