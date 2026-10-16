-- #722: publish a channel at creation.
--
-- Listing was Settings-only, so a GM who wanted a discoverable channel had to
-- create a private one, open the channel, open Settings → Discovery, write the
-- copy and save. create_channel now takes the listing in the same transaction,
-- which also means the channels_listing_fields CHECK is satisfied by the single
-- INSERT below instead of by a second round trip.
--
-- Same rules as update_channel_settings (§4 of 20261015105032): join_mode must
-- be 'invite' or 'approval', a listed channel needs a non-blank description and
-- constraints (≤600 each), and the prompt is ≤300.

-- DROP first: four new parameters change the signature, so CREATE OR REPLACE
-- would leave the 8-argument overload behind and PostgREST could not choose
-- between them.
DROP FUNCTION IF EXISTS public.create_channel(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.create_channel(
  p_name TEXT,
  p_invite_code TEXT,
  p_character_name TEXT,
  p_game_system TEXT DEFAULT 'none',
  p_character_avatar_url TEXT DEFAULT NULL,
  p_character_sheet_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_password_salt TEXT DEFAULT NULL,
  p_join_mode TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_constraints TEXT DEFAULT NULL,
  p_application_prompt TEXT DEFAULT NULL
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
  v_join_mode public.channel_join_mode;
  v_description TEXT;
  v_constraints TEXT;
  v_prompt TEXT;
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

  -- Listing copy (#722). Absent/blank join mode is today's private channel.
  v_join_mode := COALESCE(NULLIF(btrim(p_join_mode), ''), 'invite')::public.channel_join_mode;
  IF v_join_mode = 'approval' THEN
    v_description := NULLIF(btrim(p_description), '');
    v_constraints := NULLIF(btrim(p_constraints), '');
    IF v_description IS NULL OR v_constraints IS NULL THEN
      RAISE EXCEPTION 'A listed channel needs a description and constraints.';
    END IF;
    IF char_length(v_description) > 600 OR char_length(v_constraints) > 600 THEN
      RAISE EXCEPTION 'Description and constraints must be 600 characters or fewer.';
    END IF;
  ELSE
    -- A private channel carries no listing copy, whatever the caller sent.
    v_description := NULL;
    v_constraints := NULL;
  END IF;

  v_prompt := NULLIF(btrim(p_application_prompt), '');
  IF v_prompt IS NOT NULL AND char_length(v_prompt) > 300 THEN
    RAISE EXCEPTION 'The application prompt must be 300 characters or fewer.';
  END IF;

  INSERT INTO channels (name, gm_id, game_system, invite_code, join_mode, description, constraints, application_prompt)
  VALUES (p_name, auth.uid(), p_game_system, p_invite_code, v_join_mode, v_description, v_constraints, v_prompt)
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

REVOKE ALL ON FUNCTION public.create_channel(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_channel(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
