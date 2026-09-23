-- SQL Script to create storage buckets and enable public access
-- Idempotent: safe to run repeatedly.

-- 1. Create buckets
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('productsmedia', 'productsmedia', true, ARRAY['image/*', 'video/*'])
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('qr_codes', 'qr_codes', true, ARRAY['image/*'])
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('customer_documents', 'customer_documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('damage_photos', 'damage_photos', true, ARRAY['image/*'])
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('locationtracker', 'locationtracker', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat_media', 'chat_media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Storage Objects RLS Policies (Idempotent)
DO $$
BEGIN
  -- productsmedia
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for productsmedia') THEN
    CREATE POLICY "Public Access for productsmedia" ON storage.objects FOR SELECT USING (bucket_id = 'productsmedia');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload Access for productsmedia') THEN
    CREATE POLICY "Upload Access for productsmedia" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'productsmedia');
  END IF;

  -- qr_codes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for qr_codes') THEN
    CREATE POLICY "Public Access for qr_codes" ON storage.objects FOR SELECT USING (bucket_id = 'qr_codes');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload Access for qr_codes') THEN
    CREATE POLICY "Upload Access for qr_codes" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'qr_codes');
  END IF;

  -- customer_documents
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for customer_documents') THEN
    CREATE POLICY "Public Access for customer_documents" ON storage.objects FOR SELECT USING (bucket_id = 'customer_documents');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload Access for customer_documents') THEN
    CREATE POLICY "Upload Access for customer_documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'customer_documents');
  END IF;

  -- damage_photos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for damage_photos') THEN
    CREATE POLICY "Public Access for damage_photos" ON storage.objects FOR SELECT USING (bucket_id = 'damage_photos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload Access for damage_photos') THEN
    CREATE POLICY "Upload Access for damage_photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'damage_photos');
  END IF;

  -- locationtracker
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for locationtracker') THEN
    CREATE POLICY "Public Access for locationtracker" ON storage.objects FOR SELECT USING (bucket_id = 'locationtracker');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload Access for locationtracker') THEN
    CREATE POLICY "Upload Access for locationtracker" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'locationtracker');
  END IF;

  -- chat_media
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for chat_media') THEN
    CREATE POLICY "Public Access for chat_media" ON storage.objects FOR SELECT USING (bucket_id = 'chat_media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload Access for chat_media') THEN
    CREATE POLICY "Upload Access for chat_media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat_media');
  END IF;
END $$;
