-- #301: P1 confidentiality — public images bucket.
--
-- The 'images' bucket was public, so any object URL was readable by anyone
-- regardless of channel membership (storage RLS is ignored for public buckets).
-- All channels are private, so every uploaded asset (channel avatar, message
-- image, NPC portrait, map, resources) leaked to anyone holding its URL.
--
-- Fix:
--   1. Make the bucket private.
--   2. Gate reads on channel membership (first path segment is the channel id).
--   3. Enforce enablement + size + image-type server-side (was client-only).
--   4. Rewrite legacy public URLs stored in content/columns to bare object
--      paths, since the public URL no longer resolves on a private bucket.

-- 1. Private bucket. Reads now require the storage.objects SELECT policy below
--    (or a signed URL issued through the Storage API, which checks that policy).
UPDATE storage.buckets SET public = false WHERE id = 'images';

-- 2. Read gate: only channel members may read an image. The object path's first
--    segment is the owning channel id (see useImageUpload: `${channelId}/...`).
DROP POLICY IF EXISTS "images_select" ON storage.objects;
CREATE POLICY "images_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'images'
    AND is_channel_member((storage.foldername(name))[1]::uuid)
  );

-- 3. Server-side write guard. The storage API writes objects with the caller's
--    role (authenticated), so this BEFORE INSERT/UPDATE trigger is the only
--    place that can enforce the admin toggle and size cap regardless of client.
--    Runs SECURITY DEFINER so it can read app_settings even for the storage path.
CREATE OR REPLACE FUNCTION enforce_image_upload_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_max_mb INTEGER;
  v_size BIGINT;
  v_mime TEXT;
BEGIN
  IF NEW.bucket_id <> 'images' THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE((SELECT value::boolean FROM app_settings WHERE key = 'image_uploading_enabled'), false),
    COALESCE((SELECT value::integer FROM app_settings WHERE key = 'image_max_size_mb'), 5)
  INTO v_enabled, v_max_mb;

  IF NOT v_enabled THEN
    RAISE EXCEPTION 'Image uploads are disabled by the server admin';
  END IF;

  v_size := COALESCE((NEW.metadata->>'size')::bigint, 0);
  IF v_size > v_max_mb * 1024 * 1024 THEN
    RAISE EXCEPTION 'Image exceeds the % MB size limit', v_max_mb;
  END IF;

  v_mime := COALESCE(NEW.metadata->>'mimetype', '');
  IF v_mime NOT LIKE 'image/%' THEN
    RAISE EXCEPTION 'Only image files may be uploaded';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS images_upload_rules ON storage.objects;
CREATE TRIGGER images_upload_rules
  BEFORE INSERT OR UPDATE OF bucket_id, name, metadata ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION enforce_image_upload_rules();

-- 4. Rewrite legacy public URLs to bare object paths. The old format was
--    `https://<ref>.supabase.co/storage/v1/object/public/images/<path>`; the
--    new stored value is just `<path>` (signed at render time). External URLs
--    (drive, owlbear, lorekeeper, Google avatars, game-icons) are untouched —
--    the LIKE guard only matches the images bucket prefix.

-- 4a. Message content (markdown `![](url)` and inline URLs) and the NPC avatar
--     snapshot column.
UPDATE messages SET
  content = regexp_replace(
    content,
    'https?://[^[:space:])]+/storage/v1/object/public/images/',
    '',
    'g'
  ),
  npc_avatar_url = CASE WHEN npc_avatar_url LIKE '%/storage/v1/object/public/images/%'
    THEN regexp_replace(npc_avatar_url, 'https?://[^[:space:]]+/storage/v1/object/public/images/', '')
    ELSE npc_avatar_url END;

-- 4b. Channel image columns.
UPDATE channels SET
  avatar_url = CASE WHEN avatar_url LIKE '%/storage/v1/object/public/images/%'
    THEN regexp_replace(avatar_url, 'https?://[^[:space:]]+/storage/v1/object/public/images/', '')
    ELSE avatar_url END,
  map_url = CASE WHEN map_url LIKE '%/storage/v1/object/public/images/%'
    THEN regexp_replace(map_url, 'https?://[^[:space:]]+/storage/v1/object/public/images/', '')
    ELSE map_url END,
  resources_url = CASE WHEN resources_url LIKE '%/storage/v1/object/public/images/%'
    THEN regexp_replace(resources_url, 'https?://[^[:space:]]+/storage/v1/object/public/images/', '')
    ELSE resources_url END;

-- 4c. NPC and character portraits.
UPDATE channel_npcs SET avatar_url = CASE WHEN avatar_url LIKE '%/storage/v1/object/public/images/%'
  THEN regexp_replace(avatar_url, 'https?://[^[:space:]]+/storage/v1/object/public/images/', '')
  ELSE avatar_url END;

UPDATE channel_members SET character_avatar_url = CASE WHEN character_avatar_url LIKE '%/storage/v1/object/public/images/%'
  THEN regexp_replace(character_avatar_url, 'https?://[^[:space:]]+/storage/v1/object/public/images/', '')
  ELSE character_avatar_url END;