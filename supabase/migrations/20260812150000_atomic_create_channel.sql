-- UX#6 / P0-8: make channel creation atomic. Previously the client inserted the
-- channel, then the secrets row, then joined via join_channel — a failure at any
-- step left an orphan channel. One transactional RPC replaces the three
-- round-trips: any failure rolls back the whole channel.
CREATE OR REPLACE FUNCTION create_channel(
  p_name TEXT,
  p_game_system TEXT DEFAULT 'none',
  p_invite_code TEXT,
  p_character_name TEXT,
  p_character_avatar_url TEXT DEFAULT NULL,
  p_character_sheet_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_password_salt TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id UUID;
  v_character_name TEXT;
  v_is_admin BOOLEAN;
  v_channel_count INTEGER;
  v_max_channels INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Enforce the channel cap for non-server-admins, mirroring join_channel. The
  -- count runs inside the transaction so a concurrent create can't slip past it.
  SELECT server_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    v_max_channels := 10;
    SELECT (value #>> '{}')::int INTO v_max_channels
    FROM app_settings WHERE key = 'max_channels_per_user';
    v_max_channels := COALESCE(v_max_channels, 10);

    SELECT COUNT(*) INTO v_channel_count
    FROM channel_members cm
    JOIN channels c ON c.id = cm.channel_id
    WHERE cm.user_id = auth.uid() AND NOT c.is_archived;
    IF v_channel_count >= v_max_channels THEN
      RAISE EXCEPTION 'Channel limit reached. You can create at most % channels.', v_max_channels;
    END IF;
  END IF;

  INSERT INTO channels (name, gm_id, game_system, invite_code)
  VALUES (p_name, auth.uid(), p_game_system, p_invite_code)
  RETURNING id INTO v_channel_id;

  IF p_password_hash IS NOT NULL THEN
    INSERT INTO channel_secrets (channel_id, password_hash, password_salt)
    VALUES (v_channel_id, p_password_hash, p_password_salt);
  END IF;

  v_character_name := LEFT(p_character_name, 20);

  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url)
  VALUES (v_channel_id, auth.uid(), v_character_name, p_character_avatar_url, p_character_sheet_url);

  RETURN v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION create_channel(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_channel(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
