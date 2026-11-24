-- #768: reach an affected viewer's Lobby after a private-room invite changes.
--
-- The Lobby keeps its per-viewer previews and unread counts live from message
-- events only, so granting or revoking room access left the list stale until an
-- unrelated message, push, foreground event, or reopen.
--
-- Copying the invites table into the realtime publication would be the direct
-- signal, but Postgres Changes does not apply RLS to DELETE events: every
-- signed-in client that subscribed without a filter would receive the room id
-- and user id of every revoked invite, across every game. Instead the RPCs touch
-- the parent channel row — already published and readable by exactly the
-- channel's members — which the Lobby already watches. Every member of that
-- channel refetches (one throttled fetch through the existing per-viewer RPCs
-- get_user_channel_previews / get_user_channels_unread, never the shared
-- channel preview); invites are rare GM actions, so the extra wake is cheap and
-- nothing new is exposed.
--
-- Bodies copied from 20261014210410 / 20261106172813; the only changes are the
-- channel touch and its no-op guards.

-- clock_timestamp(), not now(): now() is frozen for the whole transaction, and a
-- grant must move the mark even when it shares a transaction with the channel
-- write that created it (create_sub_channel with p_member_ids).
CREATE OR REPLACE FUNCTION public.add_sub_channel_member(
  p_sub_channel_id UUID,
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_channel_id UUID;
  v_inserted INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT channel_id INTO v_channel_id FROM sub_channels
  WHERE id = p_sub_channel_id AND visibility = 'private';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found, or it is not private.';
  END IF;
  IF NOT is_channel_gm(v_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can manage rooms.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM channel_members cm
    WHERE cm.channel_id = v_channel_id AND cm.user_id = p_user_id AND NOT cm.is_blocked
  ) THEN
    RAISE EXCEPTION 'That player is not a member of this channel.';
  END IF;

  INSERT INTO sub_channel_members (sub_channel_id, user_id, added_by)
  VALUES (p_sub_channel_id, p_user_id, v_uid)
  ON CONFLICT (sub_channel_id, user_id) DO NOTHING;

  -- Re-adding an existing invite changed nothing; do not wake the channel.
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted > 0 THEN
    UPDATE public.channels SET updated_at = clock_timestamp() WHERE id = v_channel_id;
  END IF;
END;
$func$;

CREATE OR REPLACE FUNCTION public.remove_sub_channel_member(
  p_sub_channel_id UUID,
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_channel_id UUID;
  v_deleted INTEGER;
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

  DELETE FROM sub_channel_members
  WHERE sub_channel_id = p_sub_channel_id AND user_id = p_user_id;

  -- Revoking an invite the player did not have changed nothing.
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted > 0 THEN
    UPDATE public.channels SET updated_at = clock_timestamp() WHERE id = v_channel_id;
  END IF;
END;
$func$;
