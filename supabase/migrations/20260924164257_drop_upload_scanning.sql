-- Drop the automated upload scan. Image uploads are no longer checked against
-- known illegal material before storage: the scanning provider (Thorn Safer)
-- is a paid service the app cannot afford, so uploads now store directly and
-- user reports reviewed by the admin are the safety net instead (Terms §7).
--
-- What goes away:
--   - content_hashes (provenance + hourly attempt cap, which existed only to
--     bound paid provider quota) and its indexes.
--   - The per-hour upload cap enforced by the (renamed) upload-image edge
--     function via that table.
--
-- What stays:
--   - The upload-image edge function remains the only writer of stored objects
--     (no client write policy on the 'images' bucket), enforcing the admin
--     toggle, the size cap, the path shape, and GM-of-channel.
--   - cleanup-images keeps pruning stored objects by image_retention_days; the
--     hash-record prune is gone with the table.
--   - The CSAM wording in Terms §7 (report what we become aware of) is
--     unchanged and now carries the whole safety story; Privacy and FEATURES
--     copy are updated alongside this migration.

DROP TABLE IF EXISTS public.content_hashes;

-- The write-guard comment claimed every image got a CSAM scan. Keep the
-- no-client-writes rule, but state the true reason (server-side gates live in
-- the upload-image edge function).
COMMENT ON POLICY "images_select" ON storage.objects IS
  'Channel members may read; the server admin may read. Writes have no client policy by design — only the service role (upload-image) may write, so the admin toggle, size cap, path shape, and GM-only rule hold no matter how an upload is made. Uploads are not scanned for illegal material; reports are reviewed by the admin.';
