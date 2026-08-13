-- #61: GDPR account deletion. When a profile is deleted, their GM channels are
-- orphaned (gm_id SET NULL) instead of cascade-deleting every member's chat
-- history. Server admins can reclaim orphaned channels via admin_claim_channel.

-- channels.gm_id becomes nullable and orphans (SET NULL) on profile delete.
ALTER TABLE channels DROP CONSTRAINT channels_gm_id_fkey;
ALTER TABLE channels ALTER COLUMN gm_id DROP NOT NULL;
ALTER TABLE channels ADD CONSTRAINT channels_gm_id_fkey
  FOREIGN KEY (gm_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Server admin adopts an orphaned channel as its new GM. No-op if the channel
-- already has a GM.
CREATE OR REPLACE FUNCTION admin_claim_channel(p_channel_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE channels
  SET gm_id = auth.uid()
  WHERE id = p_channel_id AND gm_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION admin_claim_channel(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_claim_channel(UUID) TO authenticated;

-- Surface gm_id in the admin channel list so the client can badge orphaned
-- channels (gm_id IS NULL) and offer a Claim action.
CREATE OR REPLACE FUNCTION admin_list_channels()
RETURNS TABLE (
  id UUID,
  name TEXT,
  game_system TEXT,
  gm_id UUID,
  member_count BIGINT,
  created_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  gm_display_name TEXT
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
      COUNT(cm.id) AS member_count,
      c.created_at,
      c.last_message_at,
      gm.display_name AS gm_display_name
    FROM channels c
    LEFT JOIN channel_members cm ON cm.channel_id = c.id
    LEFT JOIN profiles gm ON gm.id = c.gm_id
    WHERE NOT c.is_archived
    GROUP BY c.id, c.gm_id, gm.display_name
    ORDER BY c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_channels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_channels() TO authenticated;
