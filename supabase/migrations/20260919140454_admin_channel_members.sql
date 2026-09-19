-- Issue #556: server admin channel roster in the read-only channel view.
--
-- Admins are not channel_members, so the membership-gated channel_members
-- SELECT blocks them. This SECURITY DEFINER RPC follows the established
-- admin_list_* precedent: guard with is_server_admin(), channel-exists check,
-- join profiles for the display name. No audit row: the roster is metadata
-- already exposed in bulk (unaudited) by admin_list_users, unlike the
-- audited message-content reads. Read-only by construction: SELECT only,
-- ordered by join time.
--
-- STABLE (no write path), matching admin_list_users / admin_list_channels.

CREATE OR REPLACE FUNCTION public.admin_list_channel_members(
  p_channel_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  character_name TEXT,
  is_blocked BOOLEAN,
  is_active_player BOOLEAN
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

  IF NOT EXISTS (SELECT 1 FROM channels WHERE channels.id = p_channel_id) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  RETURN QUERY
    SELECT
      cm.user_id,
      p.display_name,
      cm.character_name,
      cm.is_blocked,
      cm.is_active_player
    FROM channel_members cm
    -- The profile join is LEFT (same as admin_list_channel_messages): the
    -- membership row must survive profile deletion, and the client falls back
    -- to the character name when the display name is null.
    LEFT JOIN profiles p ON p.id = cm.user_id
    WHERE cm.channel_id = p_channel_id
    ORDER BY cm.joined_at ASC, cm.user_id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_channel_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_channel_members(UUID) TO authenticated;
