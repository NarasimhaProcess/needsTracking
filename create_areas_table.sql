-- Create areas table
CREATE TABLE public.areas (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name VARCHAR(255) NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for areas table
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

-- Policy to allow all authenticated users to view all areas
CREATE POLICY "All authenticated users can view areas" ON public.areas
FOR SELECT USING (auth.role() = 'authenticated');
