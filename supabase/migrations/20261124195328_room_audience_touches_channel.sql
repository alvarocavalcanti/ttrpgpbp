-- #768: a whole-room audience flip must reach the viewer who lost access.
--
-- Leaving 'all' for 'gm' or 'private' (without an invite) removes every
-- message of that room from the viewer's Lobby, but it changes no invite row
-- and realtime evaluates SELECT policies against the NEW row for an UPDATE: the
-- viewer stops passing can_view_sub_channel(id), so the sub_channels event is
-- never delivered to them. Touch the parent channel row instead — channels is
-- already published and readable by every member, so the Lobby still hears
-- about it.
--
-- Body copied from 20261014210410; the only change is the channel touch.

-- clock_timestamp(), not now(): now() is frozen for the whole transaction, and
-- a flip must move the mark even when it shares a transaction with the channel
-- write that created it.
--
-- FOR UPDATE on that read: a concurrent save of the same room must compare
-- against the audience that actually committed before it, or it can skip the
-- channel touch a viewer needs.
CREATE OR REPLACE FUNCTION public.set_sub_channel_visibility(
  p_sub_channel_id UUID,
  p_visibility TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_channel_id UUID;
  v_current_visibility TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT channel_id, visibility INTO v_channel_id, v_current_visibility
  FROM sub_channels WHERE id = p_sub_channel_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF NOT is_channel_gm(v_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can manage rooms.';
  END IF;
  IF p_visibility NOT IN ('all', 'gm', 'private') THEN
    RAISE EXCEPTION 'Invalid audience.';
  END IF;

  UPDATE sub_channels SET visibility = p_visibility, updated_at = now()
  WHERE id = p_sub_channel_id;

  -- Invites only matter for a private room: clear them when leaving private so
  -- re-privating does not resurrect a stale audience.
  IF p_visibility <> 'private' THEN
    DELETE FROM sub_channel_members WHERE sub_channel_id = p_sub_channel_id;
  END IF;

  -- A no-op save must not wake every Lobby in the channel.
  IF p_visibility IS DISTINCT FROM v_current_visibility THEN
    UPDATE public.channels SET updated_at = clock_timestamp() WHERE id = v_channel_id;
  END IF;
END;
$func$;
