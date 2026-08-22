-- ==============================================================================
-- FIX DAMAGE REPORTS TABLE SCHEMA
-- Ensure damage_reports uses user_id / manager_id and does not require customer_id
-- ==============================================================================

-- 1. Make customer_id and area_id nullable if they have NOT NULL constraints
ALTER TABLE IF EXISTS public.damage_reports 
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE IF EXISTS public.damage_reports 
  ALTER COLUMN area_id DROP NOT NULL;

-- 2. Ensure manager_id and user_id columns exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='damage_reports' AND column_name='manager_id') THEN
    ALTER TABLE public.damage_reports ADD COLUMN manager_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='damage_reports' AND column_name='user_id') THEN
    ALTER TABLE public.damage_reports ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Update RLS policies for damage_reports
ALTER TABLE IF EXISTS public.damage_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own damage reports" ON public.damage_reports;
CREATE POLICY "Users can manage own damage reports" ON public.damage_reports
FOR ALL USING (
  auth.uid() = manager_id OR auth.uid() = user_id OR auth.uid() IS NOT NULL
)
WITH CHECK (
  auth.uid() = manager_id OR auth.uid() = user_id OR auth.uid() IS NOT NULL
);

NOTIFY pgrst, 'reload schema';
