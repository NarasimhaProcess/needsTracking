-- Create damage_reports table
CREATE TABLE public.damage_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manager_id UUID REFERENCES auth.users(id) NOT NULL, -- Link to the user who reported
    area_id BIGINT REFERENCES public.areas(id) NOT NULL, -- Link to the specific area
    customer_id UUID REFERENCES public.customers(id) NOT NULL, -- Link to the customer associated with the area
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    photo_url TEXT NOT NULL, -- URL to the image in Supabase Storage
    description TEXT,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'reported' -- e.g., 'reported', 'under_review', 'resolved'
);

-- Enable Row Level Security for damage_reports table
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;

-- Policy for field managers to insert their own reports
CREATE POLICY "Field managers can insert their own damage reports" ON public.damage_reports
FOR INSERT WITH CHECK (auth.uid() = manager_id);

-- Policy for field managers to view their own reports
CREATE POLICY "Field managers can view their own damage reports" ON public.damage_reports
FOR SELECT USING (auth.uid() = manager_id);

-- Policy for admins/service_role to view all reports (adjust as needed)
-- CREATE POLICY "Admins can view all damage reports" ON public.damage_reports
-- FOR SELECT USING (auth.role() = 'service_role'); -- Or a custom admin role
