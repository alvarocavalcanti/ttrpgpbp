-- Issue #550: server admin can open any channel read-only.
--
-- Admins are not channel_members, so the membership-gated messages SELECT
-- blocks them. This SECURITY DEFINER RPC follows the #548 precedent (audited
-- admin content reads): guard with is_server_admin(), audit every read to
-- audit_logs, return all rows including whispers between other users (safety
-- review need) and soft-deleted rows (moderation needs to see removals).
--
-- Paging uses the same stable (created_at, id) cursor as
-- admin_list_user_messages so rows sharing a boundary timestamp are not
-- skipped between pages. Read-only by construction: SELECT only, no write
-- path. The existing messages insert policy (member-only) keeps admins from
-- sending even if a client tried.

CREATE OR REPLACE FUNCTION public.admin_list_channel_messages(
  p_channel_id UUID,
  p_before TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  channel_id UUID,
  sender_id UUID,
  sender_display_name TEXT,
  sender_character_name TEXT,
  content TEXT,
  type TEXT,
  is_deleted BOOLEAN,
  whisper_to UUID,
  npc_name TEXT,
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

  IF NOT EXISTS (SELECT 1 FROM channels WHERE channels.id = p_channel_id) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (auth.uid(), 'read_channel_messages', p_channel_id, jsonb_build_object('limit', v_limit));

  RETURN QUERY
    SELECT
      m.id,
      m.channel_id,
      m.sender_id,
      p.display_name,
      cm.character_name,
      m.content,
      m.type,
      m.is_deleted,
      m.whisper_to,
      m.npc_name,
      m.created_at
    FROM messages m
    LEFT JOIN profiles p ON p.id = m.sender_id
    LEFT JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = m.sender_id
    WHERE m.channel_id = p_channel_id
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

REVOKE ALL ON FUNCTION public.admin_list_channel_messages(UUID, TIMESTAMPTZ, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_channel_messages(UUID, TIMESTAMPTZ, UUID, INT) TO authenticated;
