-- #621 follow-up (from the Phase 2 review): a member could impersonate an NPC.
-- `MessageItem` renders `npc_name` / `npc_avatar_url` regardless of `type`, so
-- a `type='regular'` row carrying `npc_name` is shown as that NPC. This keys
-- the capability trigger on the snapshot fields too, not just `type`, so a room
-- that turns NPCs off rejects them. The INSERT backstop that stops a non-GM
-- from setting those fields is the next migration.
--
-- Body-only replacement of an existing function: CREATE OR REPLACE keeps the
-- signature (and its grants / revokes).

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
  -- type='npc' is the RPC's signal, but a direct insert could set the snapshot
  -- fields on a 'regular' row, so key on either.
  IF (NEW.type = 'npc' OR NEW.npc_name IS NOT NULL OR NEW.npc_avatar_url IS NOT NULL)
     AND NOT v_npc THEN
    RAISE EXCEPTION 'NPCs are turned off in this room.';
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
