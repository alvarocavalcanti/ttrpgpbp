-- Issue #611: server admin list of archived channels for the restore-request
-- support workflow ("a user asks me to restore a channel" - the admin needs
-- GM name + email and the player characters to identify the right channel).
--
-- Admins are not channel_members, so the membership-gated channel_members
-- SELECT blocks them, and profiles.email was dropped (the H1/P0-3 privacy
-- fix reads the address from auth.users instead). This SECURITY DEFINER RPC
-- follows the established admin_list_* precedent: guard with
-- is_server_admin(), aggregate the non-GM members' character names inline
-- (one call, no per-row roster RPC; fine at admin scale), GM email from
-- auth.users. No audit row: the player-character list is metadata already
-- exposed in bulk (unaudited) by admin_list_users / admin_list_channels,
-- and the admin console can already open every channel's full roster via
-- admin_list_channel_members. Read-only by construction: SELECT only,
-- ordered by channel creation.
--
-- STABLE (no write path), matching admin_list_users / admin_list_channels.

CREATE OR REPLACE FUNCTION public.admin_list_archived_channels()
RETURNS TABLE (
  id UUID,
  name TEXT,
  game_system TEXT,
  gm_id UUID,
  gm_display_name TEXT,
  gm_email TEXT,
  member_count BIGINT,
  player_characters TEXT[],
  created_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ
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
    SELECT
      c.id,
      c.name,
      c.game_system,
      c.gm_id,
      gm.display_name,
      -- auth.users.email is varchar(255); the declared return is TEXT.
      u.email::TEXT,
      COUNT(cm.id) AS member_count,
      -- The GM is a channel_members row too (create_channel inserts one), so
      -- exclude the GM's own character: this is the *player* roster. The
      -- GM's profile survives deletion on orphaned channels (SET NULL), in
      -- which case IS DISTINCT FROM matches every member.
      COALESCE(
        array_agg(cm.character_name ORDER BY cm.joined_at)
          FILTER (WHERE cm.user_id IS DISTINCT FROM c.gm_id),
        '{}'
      ) AS player_characters,
      c.created_at,
      c.last_message_at
    FROM channels c
    LEFT JOIN profiles gm ON gm.id = c.gm_id
    LEFT JOIN auth.users u ON u.id = c.gm_id
    LEFT JOIN channel_members cm ON cm.channel_id = c.id
    WHERE c.is_archived
    GROUP BY c.id, gm.display_name, u.email
    ORDER BY c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_archived_channels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_archived_channels() TO authenticated;
