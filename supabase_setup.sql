-- Create location_history table for user tracking
CREATE TABLE IF NOT EXISTS location_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    device_name TEXT,
    location_status INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_location_history_user_id ON location_history(user_id);
CREATE INDEX IF NOT EXISTS idx_location_history_timestamp ON location_history(timestamp);

-- Enable Row Level Security (RLS)
ALTER TABLE location_history ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to see only their own location data
CREATE POLICY "Users can view own location history" ON location_history
    FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own location data
CREATE POLICY "Users can insert own location data" ON location_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own location data
CREATE POLICY "Users can update own location data" ON location_history
    FOR UPDATE USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own location data
CREATE POLICY "Users can delete own location data" ON location_history
    FOR DELETE USING (auth.uid() = user_id);

-- Create users table for additional user information
CREATE TABLE IF NOT EXISTS users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    user_type TEXT DEFAULT 'user',
    profile_photo_data BYTEA, -- Binary data for profile photos
    location_status INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view their own profile
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

-- Create policy to allow users to update their own profile
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Create policy to allow users to insert their own profile
CREATE POLICY "Users can insert own profile" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Create function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, user_type)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name', COALESCE(NEW.raw_user_meta_data->>'user_type', 'user'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create user profile
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create customers table for loan management
CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    loan_amount NUMERIC(12,2) NOT NULL,
    loan_date TIMESTAMPTZ DEFAULT NOW(),
    loan_term INTEGER NOT NULL,
    interest_rate DOUBLE PRECISION,
    status VARCHAR(20) CHECK (status IN ('active', 'closed', 'defaulted', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for customers table
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view their own customers
CREATE POLICY "Users can view own customers" ON customers
    FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own customers
CREATE POLICY "Users can insert own customers" ON customers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own customers
CREATE POLICY "Users can update own customers" ON customers
    FOR UPDATE USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own customers
CREATE POLICY "Users can delete own customers" ON customers
    FOR DELETE USING (auth.uid() = user_id);

-- Add borrower-specific fields to customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS amount_given NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS days_to_complete INTEGER,
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS late_fee_per_day NUMERIC(12,2);

-- Remove borrower-specific fields if present
ALTER TABLE customers DROP COLUMN IF EXISTS repayment_frequency;
ALTER TABLE customers DROP COLUMN IF EXISTS repayment_amount;

-- Create transaction table for money credit/debit
CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT REFERENCES customers(id),
    user_id UUID REFERENCES users(id),
    amount NUMERIC(12,2) NOT NULL,
    transaction_type VARCHAR(20), -- e.g. 'given', 'repayment', 'advance', 'late_fee'
    remarks TEXT,
    transaction_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add transaction_id to location_history for linking transactions
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS transaction_id BIGINT REFERENCES transactions(id); 