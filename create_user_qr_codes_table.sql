-- Create user_qr_codes table
CREATE TABLE public.user_qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    qr_image_url TEXT NOT NULL,
    name TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for user_qr_codes
ALTER TABLE public.user_qr_codes ENABLE ROW LEVEL SECURITY;

-- Policies for user_qr_codes
CREATE POLICY "Users can view their own QR codes" ON public.user_qr_codes
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own QR codes" ON public.user_qr_codes
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own QR codes" ON public.user_qr_codes
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own QR codes" ON public.user_qr_codes
FOR DELETE USING (auth.uid() = user_id);
