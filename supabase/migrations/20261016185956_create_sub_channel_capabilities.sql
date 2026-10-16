-- #722: create a room with its features already chosen.
--
-- The capability toggles (#621 Phase 2) were reachable only on an existing room,
-- so a GM creating their first room never saw them. They are now parameters of
-- create_sub_channel, defaulting to true (today's behaviour for every existing
-- caller and for Main, which allows everything).

-- DROP first: four new parameters change the signature, so CREATE OR REPLACE
-- would leave the 2-argument overload behind and PostgREST could not choose
-- between them.
DROP FUNCTION IF EXISTS public.create_sub_channel(UUID, TEXT);

CREATE FUNCTION public.create_sub_channel(
  p_channel_id UUID,
  p_name TEXT,
  p_allow_dice BOOLEAN DEFAULT true,
  p_allow_scenes BOOLEAN DEFAULT true,
  p_allow_npc BOOLEAN DEFAULT true,
  p_allow_whispers BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT;
  v_count INTEGER;
  v_is_admin BOOLEAN;
  v_room_id UUID;
  -- ponytail: hardcoded room cap of 10; promote to app_settings when a GM asks for a different limit.
  v_cap CONSTANT INTEGER := 10;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
  IF EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This channel is archived and can no longer receive new rooms.';
  END IF;
  IF NOT is_channel_gm(p_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can create rooms.';
  END IF;

  v_name := trim(p_name);
  IF v_name = '' THEN
    RAISE EXCEPTION 'Enter a room name.';
  END IF;
  IF char_length(v_name) > 40 THEN
    RAISE EXCEPTION 'Room name is too long (max 40 characters).';
  END IF;
  IF lower(v_name) = 'main' THEN
    RAISE EXCEPTION 'Main is a reserved room name.';
  END IF;

  -- Server admins bypass the cap, mirroring create_channel. Count active rooms
  -- only: an archived room is retired (readable but off the tab bar), so
  -- archiving frees a slot and a GM can never be locked out at the cap.
  SELECT server_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    SELECT COUNT(*) INTO v_count FROM sub_channels
    WHERE channel_id = p_channel_id AND NOT is_archived;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'Room limit reached (%). Delete a room first.', v_cap;
    END IF;
  END IF;

  INSERT INTO sub_channels (channel_id, name, created_by, allow_dice, allow_scenes, allow_npc, allow_whispers)
  VALUES (
    p_channel_id,
    v_name,
    v_uid,
    COALESCE(p_allow_dice, true),
    COALESCE(p_allow_scenes, true),
    COALESCE(p_allow_npc, true),
    COALESCE(p_allow_whispers, true)
  )
  RETURNING id INTO v_room_id;

  RETURN v_room_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.create_sub_channel(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sub_channel(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated, service_role;
