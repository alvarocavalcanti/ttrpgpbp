-- The 'images' bucket carries client-supplied width/height in the object
-- metadata so the chat can reserve an image's box before it loads. Those values
-- are untrusted input: the upload guard validates size and mimetype but not
-- these, so a hand-crafted upload could otherwise make every member's client
-- reserve an absurd layout box.
--
-- Extend the existing write guard to keep width/height only when both are whole
-- pixels within a sane range; otherwise strip the keys entirely. The client
-- applies the same bound on read (positiveDimension in useSignedImageUrl).
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
  v_width INTEGER;
  v_height INTEGER;
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

  -- Coarse content gate. The stored mimetype is the Content-Type the storage
  -- server will serve the object with, so requiring image/* keeps uploaded
  -- objects from ever being served as HTML/text. It is NOT byte-level proof:
  -- a caller can label arbitrary bytes as image/* and pass this check.
  v_mime := COALESCE(NEW.metadata->>'mimetype', '');
  IF v_mime NOT LIKE 'image/%' THEN
    RAISE EXCEPTION 'Only image files may be uploaded';
  END IF;

  -- Layout metadata is untrusted: keep the dimensions only when both are whole
  -- pixels within 1..20000; otherwise drop them so no client reserves a box.
  IF NEW.metadata IS NOT NULL AND (NEW.metadata ? 'width' OR NEW.metadata ? 'height') THEN
    BEGIN
      v_width := (NEW.metadata->>'width')::integer;
      v_height := (NEW.metadata->>'height')::integer;
    EXCEPTION WHEN others THEN
      v_width := NULL;
      v_height := NULL;
    END;
    IF v_width IS NULL OR v_height IS NULL
       OR v_width < 1 OR v_width > 20000
       OR v_height < 1 OR v_height > 20000 THEN
      NEW.metadata := NEW.metadata - 'width' - 'height';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Replacing a function keeps its ACL, but be explicit: the write guard is only
-- ever fired by the trigger, never called directly (house pattern, see
-- 20260907093802_sec1_extend_grant_sweep.sql).
REVOKE ALL ON FUNCTION public.enforce_image_upload_rules()
  FROM PUBLIC, anon, authenticated, service_role;
