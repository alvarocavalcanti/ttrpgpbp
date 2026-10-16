-- #674 Phase 4b: let the admin console tell a taken-down listing from a private
-- channel.
--
-- admin_takedown_channel force-delists (join_mode -> 'invite') and stamps
-- listing_takedown_at; admin_restore_channel_listing clears it. Without the
-- marker in this projection the console can only see `invite`, so a taken-down
-- listing would be indistinguishable from an ordinary private channel — and the
-- restore RPC would have no reachable UI at all.
--
-- The RETURNS TABLE gains one column, so this is a drop-and-recreate (Postgres
-- refuses CREATE OR REPLACE across a return-type change). The drop takes the
-- ACLs with it, so the grants are restated below, and the regenerated
-- src/types/database.ts must be committed with this migration.

DROP FUNCTION public.admin_list_channels();

CREATE FUNCTION public.admin_list_channels()
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
  human_message_count BIGINT,
  join_mode public.channel_join_mode,
  pending_request_count BIGINT,
  listing_takedown_at TIMESTAMPTZ,
  description TEXT,
  constraints TEXT
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
      COALESCE(a.messages, 0) AS human_message_count,
      c.join_mode,
      COALESCE(p.pending, 0) AS pending_request_count,
      c.listing_takedown_at,
      c.description,
      c.constraints
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
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS pending
      FROM channel_join_requests cjr
      WHERE cjr.channel_id = c.id AND cjr.status = 'pending'
    ) p ON true
    WHERE NOT c.is_archived
    ORDER BY c.created_at DESC;
END;
$$;

-- Restated after the drop (matching 20261015105032_public_channels_rpcs.sql).
REVOKE ALL ON FUNCTION public.admin_list_channels() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_channels() TO authenticated, service_role;
