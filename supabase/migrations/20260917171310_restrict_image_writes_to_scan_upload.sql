-- Review fix C1: the CSAM scan must not be bypassable.
--
-- 20260814194631_add_channel_avatar.sql granted any channel GM direct
-- INSERT/UPDATE on the 'images' bucket via their own JWT. enforce_image_upload_rules
-- only checks the admin toggle, the size, and a caller-supplied mimetype, so a GM
-- could skip scan-upload entirely:
--
--   await supabase.storage.from('images')
--     .upload(`${channelId}/message/${uuid}.jpg`, csamBytes, { contentType: 'image/jpeg' })
--
-- ...which bypassed the Safer check, content_hashes, the audit row, and the
-- auto-suspend. The scan-upload edge function stores with the service role, which
-- bypasses RLS, so it is now the only writer.
--
-- Safe to drop: useImageUpload goes through scan-upload, useChannelMedia only
-- lists, and cleanup-images uses the service role. Nothing in src calls upload()
-- or remove() on this bucket any more. Reads stay membership-gated (images_select).
--
-- ponytail: images_delete is deliberately kept for now — a GM deleting their own
-- stored objects is out of scope for this fix. Revisit if provenance matters more
-- than letting a GM clean up their own uploads.

DROP POLICY IF EXISTS "images_insert" ON storage.objects;
DROP POLICY IF EXISTS "images_update" ON storage.objects;

-- Regression note: if an INSERT/UPDATE policy is ever added back on the 'images'
-- bucket, it re-opens the scan bypass above. The only writer must remain the
-- service role (scan-upload).
COMMENT ON POLICY "images_select" ON storage.objects IS
  'Channel members may read; the server admin may read. Writes have no client policy by design — only the service role (scan-upload) may write, so no image can be stored without a CSAM scan.';
