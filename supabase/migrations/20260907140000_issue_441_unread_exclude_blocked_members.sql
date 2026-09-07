-- Issue #441: blocked members kept accruing unread counts for messages they
-- can never see.
--
-- The messages SELECT policy hides every message from a blocked member
-- (is_channel_member requires is_blocked = false, and suspended users fail
-- the core access checks), but both unread functions iterated every
-- channel_members row with no blocked/suspended filter. A blocked member's
-- channel_members row stays (is_blocked = true), so the lobby pill and the
-- launcher badge counted messages that could never be read or cleared —
-- the same stuck-badge shape as #437, which fixed only the whisper gap.
--
-- Both member scans now skip blocked and suspended members, mirroring what
-- the SELECT policy already grants. Suspension is included for symmetry:
-- a suspended user cannot read messages either, so counting them would
-- recreate the same permanent unread.
--
-- The suspension check reads profiles.is_suspended directly instead of
-- is_suspended(): the grant sweep (20260905141623) revoked EXECUTE on that
-- helper from PUBLIC, authenticated, and service_role, so both callers would
-- hit a permission error. profiles SELECT is open to authenticated (USING
-- (true)) and service_role bypasses RLS, so the inline subquery works for both.

-- Per-user unread counts (lobby pill, channelRead badge refresh).
CREATE OR REPLACE FUNCTION get_user_channels_unread(p_user_id UUID)
RETURNS TABLE (channel_id UUID, unread_count BIGINT)
LANGUAGE plpgsql
STABLE
AS $func$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'User id must match authenticated user.';
  END IF;

  RETURN QUERY
  SELECT cm.channel_id, COALESCE((
    SELECT COUNT(*) FROM messages m
    WHERE m.channel_id = cm.channel_id
      AND m.created_at > cm.last_read_at
      AND m.sender_id <> v_uid
      AND m.is_deleted = false
      AND (
        m.whisper_to IS NULL
        OR m.whisper_to = cm.user_id
        OR m.sender_id = cm.user_id
        OR EXISTS (SELECT 1 FROM channels c WHERE c.id = m.channel_id AND c.gm_id = cm.user_id)
      )
  ), 0)::BIGINT
  FROM channel_members cm
  WHERE cm.user_id = v_uid
    AND cm.is_blocked = false
    AND NOT COALESCE((SELECT p.is_suspended FROM profiles p WHERE p.id = cm.user_id), false);
END;
$func$;

REVOKE ALL ON FUNCTION get_user_channels_unread(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_channels_unread(UUID) TO authenticated;

-- Batch unread totals for the push edge function (service_role caller).
CREATE OR REPLACE FUNCTION get_unread_totals(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT cm.user_id, COALESCE(SUM((
    SELECT COUNT(*) FROM messages m
    WHERE m.channel_id = cm.channel_id
      AND m.created_at > cm.last_read_at
      AND m.sender_id <> cm.user_id
      AND m.is_deleted = false
      AND (
        m.whisper_to IS NULL
        OR m.whisper_to = cm.user_id
        OR m.sender_id = cm.user_id
        OR EXISTS (SELECT 1 FROM channels c WHERE c.id = m.channel_id AND c.gm_id = cm.user_id)
      )
  )), 0)::BIGINT
  FROM channel_members cm
  WHERE cm.user_id = ANY(p_user_ids)
    AND cm.is_blocked = false
    AND NOT COALESCE((SELECT p.is_suspended FROM profiles p WHERE p.id = cm.user_id), false)
  GROUP BY cm.user_id
$$;

REVOKE ALL ON FUNCTION get_unread_totals(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_unread_totals(UUID[]) TO service_role;
