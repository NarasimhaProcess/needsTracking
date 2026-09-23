-- ============================================================================
-- COMPLETE FIX FOR USERS TABLE, SELLER USERTYPE, AND GOOGLE / GMAIL SIGNUPS
-- Run this script in your Supabase Project SQL Editor
-- ============================================================================

-- 1. Ensure public.users table exists with all required columns
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY,
    email TEXT,
    name TEXT,
    mobile TEXT,
    profile_photo_data TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    device_name TEXT,
    location_status INTEGER DEFAULT 0,
    user_type TEXT DEFAULT 'customer',
    location_update_interval INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist if table was previously created
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'customer';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_photo_data TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location_status INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location_update_interval INTEGER DEFAULT 30;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Ensure public.profiles table has role, full_name, email, mobile
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'customer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. Configure Row Level Security (RLS) policies on public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

-- Allow read, insert, and update so the client app and triggers can manage users seamlessly
CREATE POLICY "Allow all" ON public.users 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- 4. Unified handle_new_user() trigger for auth.users
-- Automatically populates BOTH public.profiles AND public.users upon Google/Gmail or Email signup
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
  -- Extract name from metadata (e.g. Google OAuth full_name) or fallback to email prefix
  extracted_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'user_name'), ''),
    split_part(NEW.email, '@', 1),
    'User'
  );

  -- Extract mobile (NULL if empty string)
  extracted_mobile := NULLIF(TRIM(NEW.raw_user_meta_data->>'mobile'), '');

  -- Extract role or default to 'customer'
  user_role := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'user_type'), ''),
    'customer'
  );

  -- 4a. Insert/update public.profiles
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
      role = COALESCE(public.profiles.role, EXCLUDED.role),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error in profiles insert: %', SQLERRM;
  END;

  -- 4b. Insert/update public.users (ensures users table ALWAYS gets the new row)
  BEGIN
    INSERT INTO public.users (
      id,
      email,
      name,
      mobile,
      user_type,
      profile_photo_data,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      extracted_name,
      extracted_mobile,
      user_role,
      NEW.raw_user_meta_data->>'avatar_url',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = COALESCE(EXCLUDED.email, public.users.email),
      name = COALESCE(EXCLUDED.name, public.users.name),
      mobile = COALESCE(EXCLUDED.mobile, public.users.mobile),
      user_type = COALESCE(public.users.user_type, EXCLUDED.user_type),
      profile_photo_data = COALESCE(EXCLUDED.profile_photo_data, public.users.profile_photo_data),
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error in users insert: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Rebind trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Bi-directional Sync Triggers between profiles and users
-- Ensures changing role in profiles updates user_type in users, and vice-versa

CREATE OR REPLACE FUNCTION public.sync_profile_to_user()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET 
    user_type = NEW.role,
    name = COALESCE(NEW.full_name, public.users.name),
    email = COALESCE(NEW.email, public.users.email),
    mobile = COALESCE(NEW.mobile, public.users.mobile),
    profile_photo_data = COALESCE(NEW.avatar_url, public.users.profile_photo_data),
    updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_profile_to_user ON public.profiles;
CREATE TRIGGER trigger_sync_profile_to_user
  AFTER UPDATE OF role, full_name, mobile, avatar_url ON public.profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.sync_profile_to_user();

CREATE OR REPLACE FUNCTION public.sync_user_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET 
    role = NEW.user_type,
    full_name = COALESCE(NEW.name, public.profiles.full_name),
    email = COALESCE(NEW.email, public.profiles.email),
    mobile = COALESCE(NEW.mobile, public.profiles.mobile),
    avatar_url = COALESCE(NEW.profile_photo_data, public.profiles.avatar_url),
    updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_user_to_profile ON public.users;
CREATE TRIGGER trigger_sync_user_to_profile
  AFTER UPDATE OF user_type, name, mobile, profile_photo_data ON public.users
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.sync_user_to_profile();

-- 6. Immediately sync all existing profiles into public.users
INSERT INTO public.users (
  id,
  email,
  name,
  mobile,
  user_type,
  profile_photo_data,
  latitude,
  longitude,
  created_at,
  updated_at
)
SELECT 
  p.id,
  COALESCE(p.email, u.email, ''),
  COALESCE(p.full_name, split_part(COALESCE(p.email, u.email, ''), '@', 1), 'User'),
  p.mobile,
  COALESCE(p.role, 'customer'),
  p.avatar_url,
  p.latitude,
  p.longitude,
  p.created_at,
  p.updated_at
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
ON CONFLICT (id) DO UPDATE
SET 
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  mobile = COALESCE(EXCLUDED.mobile, public.users.mobile),
  user_type = EXCLUDED.user_type,
  profile_photo_data = COALESCE(EXCLUDED.profile_photo_data, public.users.profile_photo_data),
  updated_at = NOW();

-- 7. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
