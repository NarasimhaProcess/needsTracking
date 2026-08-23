-- ============================================================================
-- FIX AUTH TRIGGERS & PROFILES TABLE FOR BUYERS, SELLERS & DELIVERY MANAGERS
-- Run this in your Supabase SQL Editor to resolve "Database error saving new user"
-- ============================================================================

-- 1. Ensure all required columns exist on public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'customer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_line_1 TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_line_2 TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Convert any empty string mobile numbers to NULL so they don't violate unique constraints
UPDATE public.profiles SET mobile = NULL WHERE mobile = '' OR TRIM(mobile) = '';

-- 3. If public.users table exists (from earlier setups), ensure its columns exist and allow safe inserts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'user';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    
    -- Ensure email is not strictly NOT NULL with no default if legacy data has missing emails
    ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
  END IF;
END $$;

-- 4. Enable Row Level Security (RLS) and set clean policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Allow public select on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public read on profiles" ON public.profiles;
CREATE POLICY "Allow public select on profiles"
  ON public.profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Allow individual insert on profiles" ON public.profiles;
CREATE POLICY "Allow individual insert on profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Allow individual update on profiles" ON public.profiles;
CREATE POLICY "Allow individual update on profiles"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 5. Create a robust, failure-proof handle_new_user() trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  extracted_name TEXT;
  extracted_mobile TEXT;
  user_role TEXT;
BEGIN
  -- Extract name from metadata or fallback to email prefix
  extracted_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'user_name'), ''),
    split_part(NEW.email, '@', 1),
    'User'
  );

  -- Extract mobile (only non-empty string, otherwise NULL to prevent unique constraint error)
  extracted_mobile := NULLIF(TRIM(NEW.raw_user_meta_data->>'mobile'), '');

  -- Extract role from metadata or default to 'customer'
  user_role := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'user_type'), ''),
    'customer'
  );

  -- 5a. Safely create or update profile in public.profiles
  BEGIN
    INSERT INTO public.profiles (
      id,
      full_name,
      email,
      mobile,
      role,
      avatar_url,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      extracted_name,
      NEW.email,
      extracted_mobile,
      user_role,
      NEW.raw_user_meta_data->>'avatar_url',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      mobile = COALESCE(EXCLUDED.mobile, public.profiles.mobile),
      role = COALESCE(EXCLUDED.role, public.profiles.role),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed on profiles insert: %', SQLERRM;
  END;

  -- 5b. If legacy public.users table exists, safely create/update it as well
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    ) THEN
      INSERT INTO public.users (
        id,
        email,
        name,
        user_type,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        extracted_name,
        user_role,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE
      SET
        email = COALESCE(EXCLUDED.email, public.users.email),
        name = COALESCE(EXCLUDED.name, public.users.name),
        user_type = COALESCE(EXCLUDED.user_type, public.users.user_type),
        updated_at = NOW();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed on legacy users insert: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 6. Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
