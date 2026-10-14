-- #621 Phase 2: per-room capability flags. A room may disallow dice, scenes,
-- character (NPC) posts, and/or whispers; Main (NULL) always allows everything.
-- Default TRUE, so every existing room and every new room keeps today's
-- behaviour until a GM turns something off.

ALTER TABLE public.sub_channels
  ADD COLUMN allow_dice boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_scenes boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_npc boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_whispers boolean NOT NULL DEFAULT true;

-- Extend update_sub_channel with the four flags. Adding parameters changes the
-- signature, so drop + recreate (a trailing default does not make CREATE OR
-- REPLACE reuse the old signature) and re-apply the grants.
DROP FUNCTION IF EXISTS public.update_sub_channel(UUID, TEXT, BOOLEAN);

CREATE FUNCTION public.update_sub_channel(
  p_sub_channel_id UUID,
  p_name TEXT DEFAULT NULL,
  p_is_archived BOOLEAN DEFAULT NULL,
  p_allow_dice BOOLEAN DEFAULT NULL,
  p_allow_scenes BOOLEAN DEFAULT NULL,
  p_allow_npc BOOLEAN DEFAULT NULL,
  p_allow_whispers BOOLEAN DEFAULT NULL
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

  -- Capability flags: each is set only when supplied, so a rename or an
  -- archive/restore never disturbs the flags.
  IF p_allow_dice IS NOT NULL OR p_allow_scenes IS NOT NULL
     OR p_allow_npc IS NOT NULL OR p_allow_whispers IS NOT NULL THEN
    UPDATE sub_channels SET
      allow_dice = COALESCE(p_allow_dice, allow_dice),
      allow_scenes = COALESCE(p_allow_scenes, allow_scenes),
      allow_npc = COALESCE(p_allow_npc, allow_npc),
      allow_whispers = COALESCE(p_allow_whispers, allow_whispers),
      updated_at = now()
    WHERE id = p_sub_channel_id;
  END IF;
END;
$func$;

REVOKE ALL ON FUNCTION public.update_sub_channel(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_sub_channel(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated, service_role;

-- Capability enforcement lives in one BEFORE INSERT guard rather than in each
-- command: a trigger fires on every row insert regardless of RLS, so it covers
-- the SECURITY DEFINER commands (send_message / roll_dice_unchecked) and direct
-- client inserts alike. Main (sub_channel_id NULL) and unknown rooms are passed
-- through — room ownership is enforced by the FK, the RPCs, and the INSERT
-- policy. The message type carries the capability (dice rolls are type
-- 'dice_roll'), so no per-command plumbing is needed.
CREATE OR REPLACE FUNCTION public.enforce_room_capabilities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_dice BOOLEAN;
  v_scenes BOOLEAN;
  v_npc BOOLEAN;
  v_whispers BOOLEAN;
BEGIN
  IF NEW.sub_channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT allow_dice, allow_scenes, allow_npc, allow_whispers
  INTO v_dice, v_scenes, v_npc, v_whispers
  FROM sub_channels WHERE id = NEW.sub_channel_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'scene' AND NOT v_scenes THEN
    RAISE EXCEPTION 'Scenes are turned off in this room.';
  END IF;
  IF NEW.type = 'npc' AND NOT v_npc THEN
    RAISE EXCEPTION 'Character posts are turned off in this room.';
  END IF;
  IF NEW.type = 'dice_roll' AND NOT v_dice THEN
    RAISE EXCEPTION 'Dice are turned off in this room.';
  END IF;
  IF NEW.whisper_to IS NOT NULL AND NOT v_whispers THEN
    RAISE EXCEPTION 'Whispers are turned off in this room.';
  END IF;

  RETURN NEW;
END;
$func$;

-- Trigger helper: callable by owner only (matches the house revoke for guards).
REVOKE ALL ON FUNCTION public.enforce_room_capabilities() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messages_room_capabilities
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_room_capabilities();
