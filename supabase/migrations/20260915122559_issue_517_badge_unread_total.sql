-- Issue #517: iOS users report a "stuck" launcher badge (15, 3) after reading
-- every visible channel, while Android users never see it.
--
-- Two defects feed the same symptom:
--
-- 1. Archived channels inflate the badge. Both unread functions scan every
--    channel_members row with no channels.is_archived filter, but the Lobby
--    (useChannels) filters is_archived = false. A non-GM member of an
--    archived channel has no UI path back to it (the archived page lists only
--    the GM's channels), so that unread can never be read or cleared — a
--    permanent badge number exactly like the whisper gap (#437) and the
--    blocked/suspended gap (#441) before it. The badge = actionable unread,
--    so archived channels are excluded to match the Lobby and the channel
--    cap. Restoring a channel brings its unread back.
--
-- 2. Admin unread never reaches the badge. useAdminUnread drives only the
--    in-app Messages dot; the launcher badge counts channel messages only.
--    The badge now totals both, from one server-side source for the app
--    (get_user_unread_total) and a batch equivalent for the push pipeline
--    (get_admin_unread_totals, consumed by the edge function alongside
--    get_unread_totals).
--
-- Android masks all of this: Chrome binds the badge to the notification
-- shade and clears it on dismiss/tap. iOS is fully manual — the number stays
-- until the app clears it — so every gap above is permanent there.

-- Per-user unread counts (lobby pill, channelRead badge refresh). Now skips
-- archived channels; the read mark itself is unchanged, so restoring a
-- channel re-surfaces its unread.
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
  JOIN channels ch ON ch.id = cm.channel_id
  WHERE cm.user_id = v_uid
    AND cm.is_blocked = false
    AND NOT ch.is_archived
    AND NOT COALESCE((SELECT p.is_suspended FROM profiles p WHERE p.id = cm.user_id), false);
END;
$func$;

REVOKE ALL ON FUNCTION get_user_channels_unread(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_channels_unread(UUID) TO authenticated;

-- Batch unread totals for the push edge function (service_role caller).
-- Archived channels are excluded for the same reason as above.
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
  JOIN channels ch ON ch.id = cm.channel_id
  WHERE cm.user_id = ANY(p_user_ids)
    AND cm.is_blocked = false
    AND NOT ch.is_archived
    AND NOT COALESCE((SELECT p.is_suspended FROM profiles p WHERE p.id = cm.user_id), false)
  GROUP BY cm.user_id
$$;

REVOKE ALL ON FUNCTION get_unread_totals(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_unread_totals(UUID[]) TO service_role;

-- Single launcher-badge total for the app: non-archived channel messages
-- plus unread admin threads. Thin wrapper over the two existing guarded
-- functions; the inner self/admin checks make the wrapper self-guard too,
-- the outer checks pin the same error contract for direct callers.
CREATE OR REPLACE FUNCTION public.get_user_unread_total(p_user_id UUID)
RETURNS BIGINT
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

  RETURN COALESCE(
    (SELECT SUM(unread_count) FROM public.get_user_channels_unread(p_user_id)),
    0
  ) + public.get_admin_unread_count(p_user_id);
END;
$func$;

REVOKE ALL ON FUNCTION public.get_user_unread_total(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_unread_total(UUID) TO authenticated;

-- Batch admin-thread unread for the push edge function (service_role
-- caller): the get_admin_unread_count audience predicate evaluated per
-- user id. SECURITY DEFINER like get_admin_unread_count, because
-- is_suspended() is fully revoked from every API role (grant sweep
-- 20260905141623) and is_server_admin() reads auth.uid(), which is NULL
-- for the edge caller. Server-admin visibility is therefore checked inline
-- against profiles.server_admin instead.
--
-- Users with no unread admin threads contribute no row; the edge function
-- already defaults missing rows to 0, matching get_unread_totals.
CREATE OR REPLACE FUNCTION public.get_admin_unread_totals(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, COUNT(t.id)::BIGINT
  FROM (SELECT DISTINCT id FROM unnest(p_user_ids) AS uid(id)) u
  JOIN public.admin_threads t ON (
    (
      t.type = 'dm'
      AND u.id = t.gm_id
    )
    OR (
      t.type = 'announcement'
      AND (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id AND p.server_admin)
        OR (t.audience = 'all_users' AND NOT is_suspended(u.id))
        OR (t.audience = 'gms' AND is_active_gm(u.id))
      )
    )
  )
  LEFT JOIN public.admin_thread_reads r ON r.thread_id = t.id AND r.user_id = u.id
  WHERE r.last_read_at IS NULL OR t.last_message_at > r.last_read_at
  GROUP BY u.id
$$;

REVOKE ALL ON FUNCTION public.get_admin_unread_totals(UUID[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_unread_totals(UUID[]) TO service_role;
