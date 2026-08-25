-- SQL Script to create storage buckets and enable public access
-- Run this in your Supabase SQL Editor if buckets are missing.

-- 1. Create 'productsmedia' bucket
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('productsmedia', 'productsmedia', true, ARRAY['image/*', 'video/*'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Create 'qr_codes' bucket
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('qr_codes', 'qr_codes', true, ARRAY['image/*'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Create 'customer_documents' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer_documents', 'customer_documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Enable public RLS policies for objects
CREATE POLICY "Public Access for productsmedia"
ON storage.objects FOR SELECT
USING (bucket_id = 'productsmedia');

CREATE POLICY "Upload Access for productsmedia"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'productsmedia');

CREATE POLICY "Public Access for qr_codes"
ON storage.objects FOR SELECT
USING (bucket_id = 'qr_codes');

CREATE POLICY "Upload Access for qr_codes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'qr_codes');
