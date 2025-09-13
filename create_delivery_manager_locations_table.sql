CREATE TABLE public.delivery_manager_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    location GEOGRAPHY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.delivery_manager_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery managers can insert their own locations" ON public.delivery_manager_locations
FOR INSERT WITH CHECK (auth.uid() = manager_id);

CREATE POLICY "Users can view delivery manager locations" ON public.delivery_manager_locations
FOR SELECT USING (true);
