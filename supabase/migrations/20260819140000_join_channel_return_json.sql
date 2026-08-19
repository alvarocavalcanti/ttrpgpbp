-- Drop the existing function that returns void
DROP FUNCTION IF EXISTS join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION join_channel(
  p_channel_id UUID,
  p_character_name TEXT,
  p_character_avatar_url TEXT DEFAULT NULL,
  p_character_sheet_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_invite_code TEXT DEFAULT NULL,
  p_character_attributes JSONB DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel record;
  v_secret record;
  v_character_name TEXT;
  v_channel_count INTEGER;
  v_is_admin BOOLEAN;
  v_max_channels INTEGER;
  v_attributes JSONB;
  v_min_mod INTEGER := -4;
  v_max_mod INTEGER := 5;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_suspended(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account suspended.');
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Channel not found');
  END IF;

  IF v_channel.is_archived THEN
    RETURN jsonb_build_object('success', false, 'error', 'This channel has been archived and can no longer be joined.');
  END IF;

  SELECT * INTO v_secret FROM channel_secrets WHERE channel_id = p_channel_id;

  IF v_channel.gm_id = auth.uid() THEN
    -- Allowed
  ELSIF v_channel.invite_code IS NOT NULL AND v_channel.invite_code = p_invite_code THEN
    -- Allowed via invite code
  ELSIF v_secret IS NOT NULL AND v_secret.password_hash IS NOT NULL THEN

    IF v_secret.password_hash = p_password_hash THEN
      -- Allowed via password
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid password or invite code');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid password or invite code');
  END IF;

  v_character_name := LEFT(COALESCE(p_character_name, ''), 20);

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
      RETURN jsonb_build_object('success', false, 'error', format('Channel limit reached. You can join at most %s channels.', v_max_channels));
    END IF;
  END IF;

  IF v_channel.game_system = 'shadowdark' THEN
    v_min_mod := -4;
    v_max_mod := 4;
  END IF;

  v_attributes := '{}'::jsonb;
  IF p_character_attributes IS NOT NULL AND jsonb_typeof(p_character_attributes) = 'object' THEN
    SELECT jsonb_object_agg(k, least(greatest(v::int, v_min_mod), v_max_mod))
    INTO v_attributes
    FROM jsonb_each_text(p_character_attributes) AS e(k, v)
    WHERE v ~ '^-?\d+$';
  END IF;

  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url, attributes)
  VALUES (p_channel_id, auth.uid(), v_character_name, p_character_avatar_url, p_character_sheet_url, v_attributes);

  INSERT INTO messages (channel_id, sender_id, type, content)
  VALUES (p_channel_id, auth.uid(), 'system', v_character_name || ' joined the channel');

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
