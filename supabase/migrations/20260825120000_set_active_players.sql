-- Issue #289: standalone GM control for active players.
--
-- Sets the channel's active player(s) without requiring a message. Mirrors the
-- active-player flip inside send_message so the GM can advance the turn marker
-- directly from the channel menu.
--
-- * auth.uid() must be set
-- * only the GM may change active players
-- * every uid in the array must be a non-blocked member of the channel
-- * an empty array clears all active players (a legal no-op false update)

CREATE OR REPLACE FUNCTION set_active_players(
  p_channel_id UUID,
  p_active_player_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_channel_gm(p_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can change active players.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_active_player_ids) AS t(uid)
    WHERE NOT EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_id = p_channel_id AND user_id = t.uid AND NOT is_blocked
    )
  ) THEN
    RAISE EXCEPTION 'Active player must be a member of this channel.';
  END IF;

  UPDATE channel_members SET is_active_player = false WHERE channel_id = p_channel_id;
  UPDATE channel_members SET is_active_player = true
  WHERE channel_id = p_channel_id AND user_id = ANY(p_active_player_ids);
END;
$$;

REVOKE ALL ON FUNCTION set_active_players(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_active_players(UUID, UUID[]) TO authenticated;
