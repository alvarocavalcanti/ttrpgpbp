-- Issue #715: expose per-channel activity on admin_list_channels for the
-- Active Channels stat card.
--
-- "Active channel" mirrors the usage-report skill: >=2 distinct human senders
-- and >=15 non-system human messages (see
-- .opencode/skills/usage-report/usage.sql). Keep in sync. Human = sender_id IS
-- NOT NULL AND type <> 'system'; soft-deleted rows still count (they were
-- activity when posted). Non-archived scope is unchanged, so the Total
-- Channels card keeps its meaning.
--
-- The member count and the activity aggregates are separate LEFT JOIN LATERAL
-- subqueries: joining channel_members and messages in one GROUP BY would fan
-- out and inflate both counts. STABLE (no write path), matching the prior
-- admin_list_* functions. DROP first: CREATE OR REPLACE cannot change an
-- existing function's return type (SQLSTATE 42P13).

DROP FUNCTION IF EXISTS admin_list_channels();
CREATE OR REPLACE FUNCTION admin_list_channels()
RETURNS TABLE (
  id UUID,
  name TEXT,
  game_system TEXT,
  gm_id UUID,
  member_count BIGINT,
  created_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  gm_display_name TEXT,
  human_sender_count BIGINT,
  human_message_count BIGINT
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
    SELECT c.id, c.name, c.game_system, c.gm_id,
      COALESCE(m.members, 0) AS member_count,
      c.created_at,
      c.last_message_at,
      gm.display_name AS gm_display_name,
      COALESCE(a.senders, 0) AS human_sender_count,
      COALESCE(a.messages, 0) AS human_message_count
    FROM channels c
    LEFT JOIN profiles gm ON gm.id = c.gm_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS members
      FROM channel_members cm
      WHERE cm.channel_id = c.id
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT msg.sender_id) AS senders, COUNT(*) AS messages
      FROM messages msg
      WHERE msg.channel_id = c.id
        AND msg.sender_id IS NOT NULL
        AND msg.type <> 'system'
    ) a ON true
    WHERE NOT c.is_archived
    ORDER BY c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_channels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_channels() TO authenticated;
