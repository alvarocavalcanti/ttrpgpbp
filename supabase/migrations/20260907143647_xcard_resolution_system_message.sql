-- X-Card resolution closure (issue #434): when the GM resolves flagged
-- events, the dismissal path posts ONE identity-free 'system' message so
-- every channel member sees the loop closed. The direct-insert RLS policy
-- on messages forbids 'system' from clients (command-only), so this
-- security-definer function is the only door — GM-gated, with the copy
-- fixed server-side so nobody can forge arbitrary system messages.
-- The message carries sender_id NULL: neither the presser nor the
-- resolving GM is identifiable. Dedupe lives client-side: the dismissal
-- only calls this when its UPDATE actually transitioned rows
-- (resolved_at null -> set), so double-dismissals and second devices
-- cannot repost.

CREATE OR REPLACE FUNCTION notify_xcard_resolved(p_channel_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT COALESCE(is_channel_gm(p_channel_id), false) THEN
    RAISE EXCEPTION 'Only the channel GM can post the resolution notice';
  END IF;

  IF EXISTS (
    SELECT 1 FROM channels
    WHERE id = p_channel_id AND is_archived
  ) THEN
    RAISE EXCEPTION 'This channel has been archived';
  END IF;

  INSERT INTO messages (channel_id, sender_id, type, content)
  VALUES (
    p_channel_id,
    NULL,
    'system',
    'A flagged scene has been resolved. Carry on — the X-Card is always there if you need it again.'
  );
END;
$$;

REVOKE ALL ON FUNCTION notify_xcard_resolved(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify_xcard_resolved(UUID) TO authenticated;
