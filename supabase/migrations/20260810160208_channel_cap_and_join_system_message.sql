-- Channel cap + system message on join. Reworks join_channel so non-server-admins
-- are limited to MAX_CHANNELS_PER_USER channels and a system message announces joins.
CREATE OR REPLACE FUNCTION join_channel(
  p_channel_id UUID,
  p_character_name TEXT,
  p_character_avatar_url TEXT DEFAULT NULL,
  p_character_sheet_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_invite_code TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel record;
  v_secret record;
  v_character_name TEXT;
  v_channel_count INTEGER;
  v_is_admin BOOLEAN;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  -- Use a separate query to handle the potential absence of a row
  SELECT * INTO v_secret FROM channel_secrets WHERE channel_id = p_channel_id;
  
  -- GM can always join their own channel
  IF v_channel.gm_id = auth.uid() THEN
    -- Allowed
  ELSIF v_channel.invite_code IS NOT NULL AND v_channel.invite_code = p_invite_code THEN
    -- Allowed via invite code
  ELSIF v_secret IS NOT NULL AND v_secret.password_hash IS NOT NULL AND v_secret.password_hash = p_password_hash THEN
    -- Allowed via password
  ELSE
    RAISE EXCEPTION 'Invalid password or invite code';
  END IF;

  -- Enforce the 20-char character name limit
  v_character_name := LEFT(p_character_name, 20);

  -- Enforce the channel cap (10) for non-server-admins. Counts non-archived
  -- channels only, matching the UI count in useChannels.
  SELECT server_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    SELECT COUNT(*) INTO v_channel_count
    FROM channel_members cm
    JOIN channels c ON c.id = cm.channel_id
    WHERE cm.user_id = auth.uid() AND NOT c.is_archived;
    IF v_channel_count >= 10 THEN
      RAISE EXCEPTION 'Channel limit reached. You can join at most 10 channels.';
    END IF;
  END IF;

  -- Insert the member
  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url)
  VALUES (p_channel_id, auth.uid(), v_character_name, p_character_avatar_url, p_character_sheet_url);

  -- Announce the join as a system message
  INSERT INTO messages (channel_id, sender_id, type, content)
  VALUES (p_channel_id, auth.uid(), 'system', v_character_name || ' joined the channel');
END;
$$;
