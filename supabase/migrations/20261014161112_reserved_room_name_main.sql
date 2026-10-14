-- #621 follow-up: reserve the name "Main" so a room cannot collide with the
-- Main timeline tab label. The room CRUD RPCs are the only writers of
-- sub_channels (the table has no client write policy), so the check lives in
-- them rather than a table constraint, and it reuses the existing client copy
-- path (createError / friendlyRoomError) with a player-facing message.
--
-- CREATE OR REPLACE keeps the existing signatures (and therefore their grants).

-- Rooms created before the reserve could be named "Main" in any case. Rename
-- them so none collides with the Main tab, active or archived. Keyed on the
-- room id, so the new name cannot collide within the channel, and a no-op on a
-- clean database. Renamed rather than archived: the UI only offers Restore for
-- an archived room, so an archived "Main" could not be renamed and would be a
-- dead end.
UPDATE sub_channels
SET name = 'Main room ' || left(id::text, 8), updated_at = now()
WHERE lower(trim(name)) = 'main';

CREATE OR REPLACE FUNCTION public.create_sub_channel(
  p_channel_id UUID,
  p_name TEXT
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

  INSERT INTO sub_channels (channel_id, name, created_by)
  VALUES (p_channel_id, v_name, v_uid)
  RETURNING id INTO v_room_id;

  RETURN v_room_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.update_sub_channel(
  p_sub_channel_id UUID,
  p_name TEXT DEFAULT NULL,
  p_is_archived BOOLEAN DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_channel_id UUID;
  v_name TEXT;
  v_is_admin BOOLEAN;
  -- ponytail: hardcoded room cap of 10; keep in sync with create_sub_channel.
  v_cap CONSTANT INTEGER := 10;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT channel_id INTO v_channel_id FROM sub_channels WHERE id = p_sub_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF NOT is_channel_gm(v_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can manage rooms.';
  END IF;

  IF p_name IS NOT NULL THEN
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
    UPDATE sub_channels SET name = v_name, updated_at = now() WHERE id = p_sub_channel_id;
  END IF;

  IF p_is_archived IS NOT NULL THEN
    -- Restoring reactivates a room: enforce the active cap here too, or a
    -- create -> archive -> create -> restore loop bypasses it forever.
    IF p_is_archived = false AND EXISTS (
      SELECT 1 FROM sub_channels WHERE id = p_sub_channel_id AND is_archived
    ) THEN
      SELECT server_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
      IF NOT COALESCE(v_is_admin, false) THEN
        IF (SELECT COUNT(*) FROM sub_channels WHERE channel_id = v_channel_id AND NOT is_archived) >= v_cap THEN
          RAISE EXCEPTION 'Room limit reached (%). Archive or delete a room first.', v_cap;
        END IF;
      END IF;
    END IF;
    UPDATE sub_channels SET is_archived = p_is_archived, updated_at = now()
    WHERE id = p_sub_channel_id;
  END IF;
END;
$func$;
