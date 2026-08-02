-- ============================================================================
-- ARCANA — 0008 profile avatar/handle + shared uploads bucket
-- Idempotent: columns via ADD COLUMN IF NOT EXISTS, bucket via ON CONFLICT,
-- storage policies dropped-then-created.
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS handle text UNIQUE;

-- ---------------------------------------------------------------------------
-- Shared public bucket. Every file lives under <uid>/<folder>/<filename> —
-- ownership of the folder (not the destination column) is what RLS checks,
-- so the same bucket serves buyer avatars and seller/factory photos.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS uploads_select_public ON storage.objects;
CREATE POLICY uploads_select_public ON storage.objects
  FOR SELECT USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS uploads_insert_owner ON storage.objects;
CREATE POLICY uploads_insert_owner ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS uploads_update_owner ON storage.objects;
CREATE POLICY uploads_update_owner ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS uploads_delete_owner ON storage.objects;
CREATE POLICY uploads_delete_owner ON storage.objects
  FOR DELETE USING (
    bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  );
