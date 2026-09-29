-- Profile pictures live in the private 'images' bucket at
-- `{user_id}/profile/{uuid}.jpg`. They must be readable by any authenticated
-- user, matching profiles' own visibility, while channel images remain
-- member-only.
--
-- The widened branch below is safe because upload-image is the only writer,
-- and it rejects the 'profile' folder for channel-scoped uploads. No
-- channel-owned object can therefore exist under a profile folder.
DROP POLICY IF EXISTS "images_select" ON storage.objects;
CREATE POLICY "images_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'images'
    AND (
      is_channel_member((storage.foldername(name))[1]::uuid)
      OR (storage.foldername(name))[2] = 'profile'
    )
  );
