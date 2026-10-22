-- #752: the channel status belongs to a room, not to the channel.
--
-- A room is a message-scoping dimension on top of the channel, so its status
-- (initiative order, timers, "who's up") must be scoped the same way. Main has
-- no sub_channels row, so channels.status_text stays Main's status — existing
-- data is already correct and needs no backfill. Named rooms get their own
-- column, defaulting to NULL.
--
-- Writes stay GM-only, server-owned and announced: update_channel_status writes
-- the room's column and posts the system message INTO that room (so the note is
-- visible where the change happened, never in Main). The table is SELECT-only
-- for clients, so the new column is unreachable by direct writes, and the
-- existing visibility policy (can_view_sub_channel) keeps a private or GM-only
-- room's status out of other members' hands.

ALTER TABLE public.sub_channels ADD COLUMN status_text TEXT;

-- Same bound as channels_status_text_length (20260818140000).
ALTER TABLE public.sub_channels
  ADD CONSTRAINT sub_channels_status_text_length
  CHECK (status_text IS NULL OR char_length(status_text) <= 2000);

-- Adding a parameter changes the signature, so drop + recreate (a trailing
-- default does not make CREATE OR REPLACE reuse the old two-argument function)
-- and re-apply the grants, which are dropped with the old function.
DROP FUNCTION IF EXISTS public.update_channel_status(UUID, TEXT);

CREATE FUNCTION public.update_channel_status(
  p_channel_id UUID,
  p_status_text TEXT,
  p_sub_channel_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_channel RECORD;
  v_old TEXT;
  v_new TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
  IF v_channel.gm_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the GM can update the channel status.';
  END IF;

  -- Blank and whitespace-only input collapse to NULL (matches the client's
  -- `statusText || null`), so a whitespace-only save is a no-op, not a change.
  v_new := NULLIF(btrim(p_status_text), '');

  -- Announce only when the value actually changed: re-saving the same text
  -- must not spam the timeline.
  IF p_sub_channel_id IS NULL THEN
    -- Main: the channel row owns the status, and the note lands in Main.
    v_old := v_channel.status_text;

    IF v_new IS DISTINCT FROM v_old THEN
      UPDATE channels
      SET status_text = v_new, updated_at = now()
      WHERE id = p_channel_id;

      INSERT INTO messages (channel_id, sender_id, type, content)
      VALUES (p_channel_id, v_uid, 'system', 'The GM updated the channel status.');
    END IF;
  ELSE
    -- Room: pin the room to this channel before touching it, so a GM can never
    -- write another channel's room. FOUND must be checked immediately, before
    -- any other query resets it.
    SELECT status_text INTO v_old
    FROM sub_channels
    WHERE id = p_sub_channel_id AND channel_id = p_channel_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Room not found in this channel.';
    END IF;

    IF v_new IS DISTINCT FROM v_old THEN
      UPDATE sub_channels
      SET status_text = v_new, updated_at = now()
      WHERE id = p_sub_channel_id;

      INSERT INTO messages (channel_id, sender_id, type, content, sub_channel_id)
      VALUES (p_channel_id, v_uid, 'system', 'The GM updated the channel status.', p_sub_channel_id);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_channel_status(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_channel_status(UUID, TEXT, UUID) TO authenticated;
