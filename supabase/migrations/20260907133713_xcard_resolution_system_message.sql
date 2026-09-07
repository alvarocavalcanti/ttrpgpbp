-- #434 / P1-2: X-Card resolution was silent for the table. The GM dismissed
-- the alert, but nothing reached the players — the presser saw "X-Card sent
-- to the GM" and then a black hole, which for a safety tool reads as
-- "ignored". On dismissal, post ONE channel-level, identity-free system
-- message so every member already receives the all-clear through the normal
-- message pipeline (zero new subscriptions), and mark the channel's
-- unresolved events resolved in the same transaction.
--
-- The presser stays anonymous: no event data, no reporter identity — the
-- message is a GM-authored system note about the channel, not about anyone.

CREATE OR REPLACE FUNCTION resolve_safety_card_events(p_channel_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- One generic guard for not-found / not-GM / archived so the error can't
  -- be used to probe whether an arbitrary channel ID exists.
  IF NOT EXISTS (
    SELECT 1
    FROM channels c
    WHERE c.id = p_channel_id
      AND NOT c.is_archived
      AND is_channel_gm(p_channel_id)
  ) THEN
    RAISE EXCEPTION 'Unable to resolve X-Card events for this channel.';
  END IF;

  UPDATE safety_card_events
  SET resolved_at = now()
  WHERE channel_id = p_channel_id AND resolved_at IS NULL;

  -- Announce only when something was actually resolved, so a stray or
  -- repeated dismissal can't spam the chat.
  IF FOUND THEN
    INSERT INTO messages (channel_id, sender_id, type, content)
    VALUES (
      p_channel_id,
      v_uid,
      'system',
      'A flagged scene has been resolved. Carry on — the X-Card is always there if you need it again.'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION resolve_safety_card_events(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_safety_card_events(UUID) TO authenticated;
