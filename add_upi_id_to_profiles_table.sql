-- ============================================================================
-- Migration: add_upi_id_to_profiles_table.sql
-- Description:
-- 1. Adds 'upi_id' column to public.profiles table so merchants/sellers can save their Merchant UPI ID.
-- 2. Ensures public.user_qr_codes has proper RLS policies so customers can view active seller QR codes at checkout.
-- 3. Grants SELECT permissions on user_qr_codes to anon and authenticated roles.
-- ============================================================================

-- 1. Add upi_id column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS upi_id TEXT;

COMMENT ON COLUMN public.profiles.upi_id IS 'Stores merchant/user UPI ID (VPA) for checkout payments and payouts.';

-- 2. Ensure user_qr_codes table exists
CREATE TABLE IF NOT EXISTS public.user_qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    qr_image_url TEXT NOT NULL,
    name TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all needed columns exist
ALTER TABLE public.user_qr_codes ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.user_qr_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;

-- 3. Enable RLS on user_qr_codes
ALTER TABLE public.user_qr_codes ENABLE ROW LEVEL SECURITY;

-- 4. Allow users to manage their own QR codes
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_qr_codes' AND policyname = 'Users can view their own QR codes'
  ) THEN
    CREATE POLICY "Users can view their own QR codes" ON public.user_qr_codes
    FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_qr_codes' AND policyname = 'Users can insert their own QR codes'
  ) THEN
    CREATE POLICY "Users can insert their own QR codes" ON public.user_qr_codes
    FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_qr_codes' AND policyname = 'Users can update their own QR codes'
  ) THEN
    CREATE POLICY "Users can update their own QR codes" ON public.user_qr_codes
    FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_qr_codes' AND policyname = 'Users can delete their own QR codes'
  ) THEN
    CREATE POLICY "Users can delete their own QR codes" ON public.user_qr_codes
    FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. CRITICAL: Allow buyers and guests to view active seller QR codes during checkout!
DROP POLICY IF EXISTS "Public can view active QR codes" ON public.user_qr_codes;
CREATE POLICY "Public can view active QR codes" ON public.user_qr_codes
FOR SELECT USING (is_active = true);

-- 6. Grant read permissions to anon and authenticated
GRANT SELECT ON public.user_qr_codes TO anon, authenticated;
GRANT ALL ON public.user_qr_codes TO authenticated;
