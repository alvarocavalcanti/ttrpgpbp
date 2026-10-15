-- #674 Discover search: match the free-text query against the game system too,
-- so a player can type "shadowdark" and get listings for it. Search now covers
-- name + description + game_system.
--
-- The UI's game-system dropdown is gone (one search box replaces system filter +
-- header search). p_game_system stays on the signature: it is still an exact
-- filter facet of this search API and there is no live caller to migrate, but
-- the Lobby no longer passes it.
--
-- Body-only replacement: no signature, grant, or projection change, so the
-- regenerated types are byte-identical. Discovery remains a safe projection —
-- the channels SELECT policy is not broadened.

CREATE OR REPLACE FUNCTION public.list_public_channels(
  p_search TEXT DEFAULT NULL,
  p_game_system TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  gm_display_name TEXT,
  game_system TEXT,
  description TEXT,
  constraints TEXT,
  member_count BIGINT,
  last_message_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_search TEXT;
  v_game_system TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_search := NULLIF(btrim(p_search), '');
  v_game_system := NULLIF(btrim(p_game_system), '');

  RETURN QUERY
  SELECT c.id, c.name, gm.display_name, c.game_system, c.description, c.constraints,
    COALESCE(m.members, 0) AS member_count, c.last_message_at
  FROM channels c
  LEFT JOIN profiles gm ON gm.id = c.gm_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS members
    FROM channel_members cm
    WHERE cm.channel_id = c.id AND NOT cm.is_blocked
  ) m ON true
  WHERE c.join_mode = 'approval'
    AND NOT c.is_archived
    -- A blocked caller never discovers the channel.
    AND NOT EXISTS (
      SELECT 1 FROM channel_members cm
      WHERE cm.channel_id = c.id AND cm.user_id = v_uid AND cm.is_blocked
    )
    AND (
      v_search IS NULL
      OR c.name ILIKE '%' || v_search || '%'
      OR c.description ILIKE '%' || v_search || '%'
      OR c.game_system ILIKE '%' || v_search || '%'
    )
    AND (v_game_system IS NULL OR c.game_system = v_game_system)
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
  -- A NULL p_limit must not become LIMIT ALL (an unbounded read): default to
  -- the page size and cap it.
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 0), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
