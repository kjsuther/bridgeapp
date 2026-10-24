/*
# Add private profile avatar uploads

1. New Storage
- Create the `profile-avatars` private bucket for player-uploaded avatar images.
- Limit uploads to common image formats and 2 MB per file.

2. Modified Storage Security
- Authenticated users may upload, replace, and delete only files inside their own user-id folder.
- Authenticated users may read avatar files through signed URLs, while the bucket remains private and has no public URL access.
- Anonymous users receive no access to this bucket.

3. Important Notes
- Avatar object paths must begin with the authenticated user's id, followed by a generated filename.
- The application stores the private object path in `profiles.avatar_url`; it does not store a permanent public URL.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];

DROP POLICY IF EXISTS "profile_avatars_select_authenticated" ON storage.objects;
CREATE POLICY "profile_avatars_select_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "profile_avatars_insert_own" ON storage.objects;
CREATE POLICY "profile_avatars_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "profile_avatars_update_own" ON storage.objects;
CREATE POLICY "profile_avatars_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "profile_avatars_delete_own" ON storage.objects;
CREATE POLICY "profile_avatars_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);