-- #621 Phase 4: the roll history carries the room a roll was made in, so the
-- history can badge each roll with its room. Return type changes, so the
-- function is dropped and recreated (grants restored identically).
--
-- Latest prior text: 20261014210410_private_rooms.sql (which added the
-- room-visibility gate — carried forward here).

DROP FUNCTION IF EXISTS public.get_channel_roll_history(UUID);

CREATE FUNCTION public.get_channel_roll_history(p_channel_id UUID)
RETURNS TABLE (
  id UUID,
  notation TEXT,
  result INTEGER,
  breakdown JSONB,
  created_at TIMESTAMPTZ,
  roller_id UUID,
  roller_character_name TEXT,
  sub_channel_id UUID,
  sub_channel_name TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.id, d.notation, d.result, d.breakdown, d.created_at, d.roller_id,
         COALESCE(cm.character_name, p.display_name),
         m.sub_channel_id, sc.name
  FROM dice_rolls d
  JOIN messages m ON m.id = d.message_id
  LEFT JOIN sub_channels sc ON sc.id = m.sub_channel_id
  LEFT JOIN profiles p ON p.id = d.roller_id
  LEFT JOIN channel_members cm
    ON cm.channel_id = d.channel_id AND cm.user_id = d.roller_id
  WHERE d.channel_id = p_channel_id AND NOT m.is_deleted
    AND (m.sub_channel_id IS NULL OR can_view_sub_channel(m.sub_channel_id))
  ORDER BY d.created_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_channel_roll_history(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_channel_roll_history(UUID) TO authenticated;
