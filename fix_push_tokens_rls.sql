-- SQL script to fix Push Tokens RLS policy in Supabase
-- Run this in your Supabase SQL Editor:

-- Enable RLS (if not already enabled)
ALTER TABLE IF EXISTS public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing restricted policies
DROP POLICY IF EXISTS "Users can view their own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can insert their own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can update their own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can delete their own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can manage their own push tokens" ON public.push_tokens;

-- Create comprehensive ALL (SELECT, INSERT, UPDATE, DELETE) policy
CREATE POLICY "Users can manage their own push tokens"
ON public.push_tokens
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
