-- Batch unread total for the push edge function: one round trip for all
-- push targets so each user's PWA icon badge can show their total unread.
-- Caller is the edge function (service_role); rows are the user's own
-- memberships' unread counts, summed across channels.
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
  )), 0)::BIGINT
  FROM channel_members cm
  WHERE cm.user_id = ANY(p_user_ids)
  GROUP BY cm.user_id
$$;

REVOKE ALL ON FUNCTION get_unread_totals(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_unread_totals(UUID[]) TO service_role;
