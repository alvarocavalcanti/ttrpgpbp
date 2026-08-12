-- C4: replace the client's per-channel unread-count queries (N+1) with one
-- round trip. Invoker-rights (RLS still applies): the caller is only ever
-- counting their own memberships' messages.
CREATE OR REPLACE FUNCTION get_user_channels_unread(p_user_id UUID)
RETURNS TABLE (channel_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT cm.channel_id, COALESCE((
    SELECT COUNT(*) FROM messages m
    WHERE m.channel_id = cm.channel_id
      AND m.created_at > cm.last_read_at
      AND m.sender_id <> p_user_id
      AND m.is_deleted = false
  ), 0)::BIGINT
  FROM channel_members cm
  WHERE cm.user_id = p_user_id
$$;

REVOKE ALL ON FUNCTION get_user_channels_unread(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_channels_unread(UUID) TO authenticated;
