-- Issue #640: roll history showed the roller's account-wide display name
-- (seeded from the Google account) instead of the per-channel character name
-- used on every post and inline dice-roll message. Attribute each roll to the
-- channel_members.character_name, falling back to profiles.display_name for
-- rollers who have since left or been removed from the channel.
--
-- The RETURNS TABLE output column is renamed (roller_display_name ->
-- roller_character_name), so the function must be dropped first: CREATE OR
-- REPLACE cannot change an output column's name.

DROP FUNCTION IF EXISTS public.get_channel_roll_history(UUID);

CREATE FUNCTION public.get_channel_roll_history(p_channel_id UUID)
RETURNS TABLE (
  id UUID,
  notation TEXT,
  result INTEGER,
  breakdown JSONB,
  created_at TIMESTAMPTZ,
  roller_id UUID,
  roller_character_name TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.id, d.notation, d.result, d.breakdown, d.created_at, d.roller_id,
         COALESCE(cm.character_name, p.display_name)
  FROM dice_rolls d
  JOIN messages m ON m.id = d.message_id
  LEFT JOIN profiles p ON p.id = d.roller_id
  LEFT JOIN channel_members cm
    ON cm.channel_id = d.channel_id AND cm.user_id = d.roller_id
  WHERE d.channel_id = p_channel_id AND NOT m.is_deleted
  ORDER BY d.created_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_channel_roll_history(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_channel_roll_history(UUID) TO authenticated;
