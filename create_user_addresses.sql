-- Migration: Create user_addresses table for multiple customer delivery addresses with GPS / Map support
CREATE TABLE IF NOT EXISTS public.user_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tag TEXT DEFAULT 'Home', -- 'Home', 'Work', 'Other'
    recipient_name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    address_line_1 TEXT NOT NULL,
    address_line_2 TEXT,
    city TEXT NOT NULL,
    state TEXT,
    zip_code TEXT,
    country TEXT DEFAULT 'India',
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for speedy lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON public.user_addresses(user_id);

-- Enable RLS
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own addresses" ON public.user_addresses;
DROP POLICY IF EXISTS "Users can insert their own addresses" ON public.user_addresses;
DROP POLICY IF EXISTS "Users can update their own addresses" ON public.user_addresses;
DROP POLICY IF EXISTS "Users can delete their own addresses" ON public.user_addresses;

-- Create RLS Policies
CREATE POLICY "Users can view their own addresses"
ON public.user_addresses
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own addresses"
ON public.user_addresses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own addresses"
ON public.user_addresses
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own addresses"
ON public.user_addresses
FOR DELETE
USING (auth.uid() = user_id);
