-- Mark a message as unread (#806).
--
-- Unread is derived, never stored per message: Main's count reads
-- channel_members.main_last_read_at, a room's count reads that room's
-- sub_channel_reads row, and every reader (get_user_channels_unread,
-- get_channel_room_unread, get_unread_totals for push, get_user_unread_total
-- for the launcher badge) compares message timestamps against those marks.
-- Every existing write path only moves a mark FORWARD (now()), so nothing could
-- ever create unread state. This RPC moves the mark for the message's surface
-- backwards to just before the message:
--
--   * LEAST(existing, created_at - 1 microsecond) — an already-unread older
--     state wins, and a mark can never move forward (which would hide messages
--     the viewer has not seen);
--   * the cutoff is one microsecond before the message, so the message itself
--     counts as unread;
--   * Main writes main_last_read_at only. last_read_at is left alone because it
--     feeds the room "New messages" divider.
--
-- Counters exclude the viewer's own messages, so marking your own message is
-- rejected rather than silently doing nothing. The visibility checks mirror the
-- counter predicates (whisper audience, room visibility) so a message the
-- caller cannot see can never drag a whole surface unread.
--
-- Known semantics: marking a message older than the viewer's joined_at writes a
-- read row below joined_at, so the COALESCE(scr.last_read_at, joined_at)
-- fallback no longer applies and pre-join history counts too — "unread from
-- this message onward", the same way Messenger treats it.

CREATE OR REPLACE FUNCTION public.mark_message_unread(p_message_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_msg public.messages%ROWTYPE;
  v_cutoff TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
  -- One message for every not-visible case, so existence never leaks.
  IF NOT FOUND OR v_msg.is_deleted THEN
    RAISE EXCEPTION 'Message not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = v_msg.channel_id AND user_id = v_uid AND is_blocked = false
  ) THEN
    RAISE EXCEPTION 'You are not a member of this channel.';
  END IF;

  IF v_msg.sender_id = v_uid THEN
    RAISE EXCEPTION 'You cannot mark your own message as unread.';
  END IF;

  -- Whisper audience, identical to the unread counters.
  IF v_msg.whisper_to IS NOT NULL
     AND v_msg.whisper_to <> v_uid
     AND v_msg.sender_id <> v_uid
     AND NOT is_channel_gm(v_msg.channel_id) THEN
    RAISE EXCEPTION 'Message not found.';
  END IF;

  -- Room visibility, identical to can_view_sub_channel.
  IF v_msg.sub_channel_id IS NOT NULL AND NOT can_view_sub_channel(v_msg.sub_channel_id) THEN
    RAISE EXCEPTION 'Message not found.';
  END IF;

  v_cutoff := v_msg.created_at - interval '1 microsecond';

  IF v_msg.sub_channel_id IS NULL THEN
    UPDATE public.channel_members
    SET main_last_read_at = LEAST(COALESCE(main_last_read_at, last_read_at), v_cutoff)
    WHERE channel_id = v_msg.channel_id AND user_id = v_uid;
  ELSE
    INSERT INTO public.sub_channel_reads (sub_channel_id, user_id, last_read_at)
    VALUES (v_msg.sub_channel_id, v_uid, v_cutoff)
    ON CONFLICT (sub_channel_id, user_id)
    DO UPDATE SET last_read_at = LEAST(public.sub_channel_reads.last_read_at, EXCLUDED.last_read_at);
  END IF;
END;
$func$;

REVOKE ALL ON FUNCTION public.mark_message_unread(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_message_unread(UUID) TO authenticated;
