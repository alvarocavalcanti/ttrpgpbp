-- #722: tell the applicant about a decision in the app, not only by push.
--
-- Push covers a device that granted notifications and holds a subscription; a
-- player without one saw a rejection as "nothing happened" (the listing simply
-- offered Apply to join again) and an approval as a silent new Lobby row.
--
-- get_my_join_request_decisions returns the caller's decided applications that
-- they have not acknowledged yet, with the channel name. It is SECURITY DEFINER
-- because the applicant is not a member of a channel they were rejected from
-- (channels is not readable to them), and because the channel may have been
-- delisted or archived since. It exposes only the caller's own rows, and only
-- the name and outcome the applicant already participated in.
--
-- acknowledge_join_request_decision stamps the row, so a dismissed notice stays
-- dismissed across reloads and devices.

-- ==========================================
-- 1. Acknowledgement marker
-- ==========================================

-- Nullable on purpose: existing decided rows are deliberately left
-- unacknowledged, so an applicant whose decision only ever reached a device
-- (or no device at all) still learns the outcome the first time they open the
-- lobby. Public channels are days old, so that is a handful of rows.
ALTER TABLE public.channel_join_requests
  ADD COLUMN applicant_acknowledged_at TIMESTAMPTZ;

-- The applicant's own rows, and the applicant RLS policy's filter, are both by
-- user_id. Without this the lobby's decision fetch seq-scans every application
-- on the platform.
CREATE INDEX channel_join_requests_user_id_idx
  ON public.channel_join_requests (user_id);

-- ==========================================
-- 2. The applicant's decisions
-- ==========================================

CREATE FUNCTION public.get_my_join_request_decisions()
RETURNS TABLE (
  id UUID,
  channel_id UUID,
  channel_name TEXT,
  status public.join_request_status,
  decided_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT cjr.id, cjr.channel_id, c.name, cjr.status, cjr.decided_at
  FROM channel_join_requests cjr
  JOIN channels c ON c.id = cjr.channel_id
  WHERE cjr.user_id = v_uid
    -- Only a real outcome is news: a pending application shows in the listing,
    -- and a withdrawn one was the applicant's own doing.
    AND cjr.status IN ('approved', 'rejected')
    AND cjr.applicant_acknowledged_at IS NULL
  ORDER BY cjr.decided_at DESC NULLS LAST
  LIMIT 20;
END;
$$;

CREATE FUNCTION public.acknowledge_join_request_decision(p_request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE channel_join_requests
  SET applicant_acknowledged_at = now()
  WHERE id = p_request_id
    AND user_id = v_uid
    AND status IN ('approved', 'rejected');

  -- A foreign or still-pending id must not silently succeed: the client clears
  -- the notice on the strength of this call.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found.';
  END IF;
END;
$$;

-- ==========================================
-- 3. Grants
-- ==========================================

REVOKE ALL ON FUNCTION public.get_my_join_request_decisions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_join_request_decisions() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.acknowledge_join_request_decision(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_join_request_decision(UUID) TO authenticated, service_role;
