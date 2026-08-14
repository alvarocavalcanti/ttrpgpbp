-- #168: channel avatar, uploaded as an image and shown in the channel list and
-- header.
--
-- avatar_url on channels follows the same pattern as map_url / resources_url:
-- a plain public URL. Uploaded avatars land in the public 'images' storage
-- bucket at {channel_id}/avatar/{uuid}.jpg.

ALTER TABLE channels ADD COLUMN avatar_url TEXT;

-- Public bucket for uploaded images. Public URLs are simpler than signed URLs
-- and match the existing <img> rendering. Write access is gated per-object via
-- the storage.objects policies below (the object path's first segment is the
-- owning channel id).
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Reads are public (avatars aren't secrets).
CREATE POLICY "images_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'images');

-- Only the GM of the owning channel may upload, replace, or delete an object.
CREATE POLICY "images_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'images'
    AND is_channel_gm((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "images_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'images'
    AND is_channel_gm((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "images_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'images'
    AND is_channel_gm((storage.foldername(name))[1]::uuid)
  );

-- Admin toggles for image uploads (same pattern as max_channels_per_user).
-- image_uploading_enabled off by default keeps the near-zero cost baseline;
-- image_max_size_mb caps how much a single upload can burn of the free tier.
INSERT INTO app_settings (key, value) VALUES
  ('image_uploading_enabled', 'false'),
  ('image_max_size_mb', '5')
ON CONFLICT (key) DO NOTHING;
