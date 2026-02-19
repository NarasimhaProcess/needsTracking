-- Name: create_push_tokens_table.sql
-- Desc: Creates a table to store multiple push tokens per user.

CREATE TABLE public.push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.push_tokens IS 'Stores push notification tokens for user devices.';
COMMENT ON COLUMN public.push_tokens.user_id IS 'The user associated with the token.';
COMMENT ON COLUMN public.push_tokens.token IS 'The push notification token from the device.';

-- Enable RLS
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Policies for push_tokens
CREATE POLICY "Users can view their own push tokens"
ON public.push_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push tokens"
ON public.push_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push tokens"
ON public.push_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- Also, we need to remove the old push_token column from the profiles table.
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS push_token;
