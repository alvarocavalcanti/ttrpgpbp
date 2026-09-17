-- Trust & safety P0-B: record the hash of every image that passes the upload
-- scan, so uploads are dedupable and every in-flight object has a provenance
-- row. The scan itself (hash + Thorn Safer match) runs in the scan-upload edge
-- function; this table is service-role-only — browser clients get no access.
--
-- A 'match' row means the object was BLOCKED and never stored, so object_path
-- for a match is the path that was attempted, not an existing object.

CREATE TABLE public.content_hashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_path TEXT NOT NULL UNIQUE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sha256 TEXT NOT NULL,
  pdq_hash TEXT,
  safer_status TEXT NOT NULL DEFAULT 'unscanned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_hashes_safer_status_check
    CHECK (safer_status IN ('unscanned', 'clear', 'match', 'error'))
);

COMMENT ON TABLE public.content_hashes IS
  'Service-role-only provenance for scanned uploads. safer_status=clear means the image was scanned and stored; match means it was blocked and never persisted.';

ALTER TABLE public.content_hashes ENABLE ROW LEVEL SECURITY;
-- No client policies: only the service role (edge functions) reads/writes here.

CREATE INDEX content_hashes_channel_idx ON public.content_hashes(channel_id);

-- Admin-visible list of blocked uploads, newest first.
CREATE OR REPLACE FUNCTION public.admin_list_content_matches()
RETURNS TABLE (
  id UUID,
  object_path TEXT,
  channel_id UUID,
  channel_name TEXT,
  uploaded_by UUID,
  uploaded_by_display_name TEXT,
  sha256 TEXT,
  safer_status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT
      ch.id,
      ch.object_path,
      ch.channel_id,
      c.name,
      ch.uploaded_by,
      p.display_name,
      ch.sha256,
      ch.safer_status,
      ch.created_at
    FROM content_hashes ch
    LEFT JOIN channels c ON c.id = ch.channel_id
    LEFT JOIN profiles p ON p.id = ch.uploaded_by
    WHERE ch.safer_status = 'match'
    ORDER BY ch.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_content_matches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_content_matches() TO authenticated;
