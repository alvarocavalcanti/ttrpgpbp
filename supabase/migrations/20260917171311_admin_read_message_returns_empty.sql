-- Review fix M2: a missing message should be an empty result, not an error.
--
-- admin_read_message raised 'Message not found' when the message did not exist,
-- so a deleted message surfaced to the admin console as an RPC error string
-- ("Failed to load the reported message.") and the friendly "no longer exists"
-- path was unreachable dead code. RETURN QUERY with no rows is the designed
-- shape; this also drops the EXISTS/SELECT time-of-check race.

CREATE OR REPLACE FUNCTION public.admin_read_message(p_message_id UUID)
RETURNS TABLE (
  id UUID,
  channel_id UUID,
  channel_name TEXT,
  sender_id UUID,
  sender_display_name TEXT,
  type TEXT,
  content TEXT,
  is_deleted BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (auth.uid(), 'read_message', p_message_id, NULL);

  RETURN QUERY
    SELECT
      m.id,
      m.channel_id,
      c.name,
      m.sender_id,
      p.display_name,
      m.type,
      m.content,
      m.is_deleted,
      m.created_at
    FROM messages m
    LEFT JOIN channels c ON c.id = m.channel_id
    LEFT JOIN profiles p ON p.id = m.sender_id
    WHERE m.id = p_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_read_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_read_message(UUID) TO authenticated;
