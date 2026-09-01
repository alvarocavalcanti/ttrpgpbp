-- Issue #348 regression: message sends fail in channels whose avatar_url
-- (or map_url / resources_url / safety_tools_url) is a relative storage path.
--
-- Root cause: image uploads (useImageUpload) and the 20260826160000 storage
-- normalization intentionally store bare object paths (e.g.
-- '<channel-id>/folder/<uuid>.jpg') that are signed at render time. The
-- enforce_url_scheme trigger added in 20260831150000 requires every URL to
-- match ^https?://, so any UPDATE to such a channel fails. Message inserts
-- UPDATE channels.last_message_at (on_message_inserted_last_message_at),
-- which fires the trigger — making every message send in those channels roll
-- back with "URLs must start with http:// or https://".
--
-- Fix: only reject values that carry an explicit non-http(s) scheme
-- (javascript:, data:, blob:, ftp:, ...). Scheme-less relative paths are the
-- app's canonical storage format and pass; absolute http(s) URLs still pass.
-- No data backfill needed: nothing invalid ever persisted (the trigger blocked
-- those writes) and existing relative paths become legal again.

CREATE OR REPLACE FUNCTION public.enforce_url_scheme()
RETURNS TRIGGER AS $$
DECLARE
  v_url TEXT;
BEGIN
  FOREACH v_url IN ARRAY ARRAY[
    NEW.map_url, NEW.resources_url, NEW.safety_tools_url, NEW.avatar_url
  ] LOOP
    IF v_url IS NOT NULL AND v_url <> ''
       AND v_url ~* '^[a-z][a-z0-9+.-]*:'
       AND v_url !~* '^https?://' THEN
      RAISE EXCEPTION 'URLs must start with http:// or https://';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
