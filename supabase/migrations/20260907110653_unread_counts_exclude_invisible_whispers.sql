-- Issue #437: unread counts included messages the viewer can never see.
--
-- The messages SELECT policy hides whispers from third parties
-- (whisper_to = auth.uid() OR sender_id = auth.uid() OR is_channel_gm),
-- but both unread functions counted every non-own, non-deleted message.
-- A whisper between two other members therefore added a permanent unread to
-- every other member's lobby pill and launcher badge — reading could never
-- clear it, and a refresh recomputed the same stuck number.
--
-- Both functions now mirror the SELECT policy: a whisper only counts toward
-- the recipient, the sender, or the channel's GM. The GM clause is written
-- against channels.gm_id (not is_channel_gm(), which reads auth.uid()) so it
-- also holds for get_unread_totals, whose caller is the service_role edge
-- function with auth.uid() NULL.

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
  WHERE cm.user_id = v_uid;
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
  GROUP BY cm.user_id
$$;

REVOKE ALL ON FUNCTION get_unread_totals(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_unread_totals(UUID[]) TO service_role;

-- ==========================================
-- Server-side read mark
-- ==========================================
-- The client previously wrote last_read_at itself with its own clock
-- (new Date().toISOString()). A client clock behind the server's leaves a
-- permanent unread window (messages created in the skew gap are always
-- "newer" than the read mark), and two devices with different clocks could
-- move the boundary backward, resurrecting unread counts that a refresh
-- recomputed the same way — the stuck badge from issue #437. Marking read
-- here uses the database clock (now()), so the boundary is monotonic and
-- skew-free, matching mark_admin_thread_read. GREATEST keeps it monotonic even
-- under concurrent writers: now() is the transaction start time, so a
-- transaction that started earlier but commits later could otherwise
-- overwrite a newer read boundary with its older timestamp (issue #437).
CREATE OR REPLACE FUNCTION public.mark_channel_read(p_channel_id UUID)
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

  UPDATE public.channel_members
  SET last_read_at = GREATEST(last_read_at, now())
  WHERE channel_id = p_channel_id AND user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_channel_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_channel_read(UUID) TO authenticated;