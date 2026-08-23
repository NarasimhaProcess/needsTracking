-- ============================================================================
-- SUPABASE MIGRATION: LIVE TRACKING & GOOGLE (GMAIL) AUTH INTEGRATION
-- ============================================================================

-- 1. Enable PostGIS Extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- 2. Create / Update Delivery Partner Live Tracking Table
CREATE TABLE IF NOT EXISTS public.delivery_partner_locations (
    partner_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION DEFAULT 0, -- 0-360 degrees for vehicle icon rotation
    speed DOUBLE PRECISION DEFAULT 0,   -- Speed in m/s or km/h
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast order lookups
CREATE INDEX IF NOT EXISTS idx_delivery_partner_order_id ON public.delivery_partner_locations(order_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.delivery_partner_locations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Partners can manage own location" ON public.delivery_partner_locations;
DROP POLICY IF EXISTS "Anyone can view live partner locations" ON public.delivery_partner_locations;

-- RLS Policy: Delivery partners can insert or update their own live location
CREATE POLICY "Partners can manage own location" 
ON public.delivery_partner_locations
FOR ALL 
USING (auth.uid() = partner_id)
WITH CHECK (auth.uid() = partner_id);

-- RLS Policy: Buyers and Admins can view partner locations for live tracking
CREATE POLICY "Anyone can view live partner locations" 
ON public.delivery_partner_locations
FOR SELECT 
USING (true);

-- 3. Enable Supabase Realtime for live location broadcasting & listening
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'delivery_partner_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_partner_locations;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_manager_locations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'delivery_manager_locations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_manager_locations;
    END IF;
  END IF;
END $$;

-- 4. Google (Gmail) & Social Sign-up Trigger for Automatic Buyer Profile Creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  extracted_name TEXT;
  user_role TEXT;
BEGIN
  -- Extract name from Google metadata or default to 'Buyer'
  extracted_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'user_name',
    split_part(NEW.email, '@', 1)
  );

  -- Extract role or default to 'customer' for buyer sign-ups
  user_role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    'customer'
  );

  -- Insert or update profile
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    avatar_url,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    extracted_name,
    NEW.email,
    user_role,
    NEW.raw_user_meta_data->>'avatar_url',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Helper Function: Get Live Tracking Details for an Order
CREATE OR REPLACE FUNCTION public.get_order_live_tracking(p_order_id UUID)
RETURNS TABLE (
  order_id UUID,
  order_status TEXT,
  delivery_manager_id UUID,
  partner_name TEXT,
  partner_mobile TEXT,
  partner_lat DOUBLE PRECISION,
  partner_lon DOUBLE PRECISION,
  partner_heading DOUBLE PRECISION,
  partner_speed DOUBLE PRECISION,
  last_updated TIMESTAMPTZ,
  shipping_address JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id AS order_id,
    o.status AS order_status,
    o.delivery_manager_id,
    p.full_name AS partner_name,
    p.mobile AS partner_mobile,
    dpl.latitude AS partner_lat,
    dpl.longitude AS partner_lon,
    dpl.heading AS partner_heading,
    dpl.speed AS partner_speed,
    dpl.updated_at AS last_updated,
    o.shipping_address::jsonb
  FROM public.orders o
  LEFT JOIN public.profiles p ON o.delivery_manager_id = p.id
  LEFT JOIN public.delivery_partner_locations dpl ON o.delivery_manager_id = dpl.partner_id
  WHERE o.id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
