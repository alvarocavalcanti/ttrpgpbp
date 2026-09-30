-- #631: the GM could edit the channel status, but the table had no signal it
-- happened. Members saw the status line refresh at best; nothing durable
-- reached the timeline. Post ONE generic channel-level system message when the
-- status actually changes, so every member receives it through the normal
-- message pipeline (zero new subscriptions).
--
-- The message carries no change details by design — it only signals that the
-- status was updated. Clearing the status counts as a change too.
--
-- system messages are server-only (the messages INSERT policy allows clients
-- regular/scene/npc only), so the status write + announcement must live behind
-- a SECURITY DEFINER RPC, mirroring resolve_safety_card_events. Archived
-- channels are intentionally NOT blocked, matching update_channel_settings.

CREATE OR REPLACE FUNCTION public.update_channel_status(
  p_channel_id UUID,
  p_status_text TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_channel RECORD;
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
  -- must not spam the chat.
  IF v_new IS DISTINCT FROM v_channel.status_text THEN
    UPDATE channels
    SET status_text = v_new, updated_at = now()
    WHERE id = p_channel_id;

    INSERT INTO messages (channel_id, sender_id, type, content)
    VALUES (p_channel_id, v_uid, 'system', 'The GM updated the channel status.');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_channel_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_channel_status(UUID, TEXT) TO authenticated;
