-- Review fix N5: page the admin message history with a stable cursor.
--
-- Paging used `created_at < p_before` on a single timestamp column, so rows
-- sharing the boundary timestamp were skipped between pages. send_message and
-- join_channel write from a single transaction, so same-timestamp rows are
-- plausible — and silently skipping rows in a moderation tool can hide evidence.
-- The cursor is now (created_at, id); a NULL p_before_id sorts as the lowest
-- uuid so a caller that only knows the timestamp still makes progress.
--
-- The 3-arg version is dropped first: with defaults it would otherwise remain as
-- an ambiguous overload.

DROP FUNCTION IF EXISTS public.admin_list_user_messages(UUID, TIMESTAMPTZ, INT);

CREATE OR REPLACE FUNCTION public.admin_list_user_messages(
  p_user_id UUID,
  p_before TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  channel_id UUID,
  channel_name TEXT,
  content TEXT,
  type TEXT,
  is_deleted BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (auth.uid(), 'list_user_messages', p_user_id, jsonb_build_object('limit', v_limit));

  RETURN QUERY
    SELECT
      m.id,
      m.channel_id,
      c.name,
      m.content,
      m.type,
      m.is_deleted,
      m.created_at
    FROM messages m
    LEFT JOIN channels c ON c.id = m.channel_id
    WHERE m.sender_id = p_user_id
      AND (
        p_before IS NULL
        OR (m.created_at, m.id) < (
          p_before,
          COALESCE(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_messages(UUID, TIMESTAMPTZ, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_messages(UUID, TIMESTAMPTZ, UUID, INT) TO authenticated;
