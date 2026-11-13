-- Scene messages: make the last-paragraph emphasis optional (#806).
--
-- Every scene used to close with the shaded/bold/italic "dramatic question"
-- block, which is wrong for a scene that simply ends. The GM now chooses per
-- scene, so the choice has to persist with the message: a column plus a
-- send_message parameter. Default true keeps every existing scene rendering
-- exactly as it did (PG >= 11 stores the default in the catalog, so this is a
-- metadata-only change with no table rewrite and no backfill).
--
-- Only the scene renderer reads the column, so regular/NPC messages ignore it
-- rather than being rejected for carrying it — that keeps the retry path a
-- straight replay of the original payload.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS emphasize_last_paragraph BOOLEAN NOT NULL DEFAULT true;

-- Body copied from 20261014140804 (newest) with p_emphasize_last_paragraph
-- threaded into the insert. Drop + recreate because a new parameter changes
-- the signature and would otherwise leave the old 10-arg overload callable.
DROP FUNCTION IF EXISTS public.send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID, UUID);

CREATE FUNCTION public.send_message(
  p_channel_id UUID,
  p_content TEXT,
  p_type TEXT DEFAULT 'regular',
  p_reply_to UUID DEFAULT NULL,
  p_whisper_to UUID DEFAULT NULL,
  p_active_player_ids UUID[] DEFAULT NULL,
  p_npc_name TEXT DEFAULT NULL,
  p_npc_avatar_url TEXT DEFAULT NULL,
  p_client_request_id UUID DEFAULT NULL,
  p_sub_channel_id UUID DEFAULT NULL,
  p_emphasize_last_paragraph BOOLEAN DEFAULT true
)
RETURNS TABLE (message_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_msg_id UUID;
  v_mention_ids UUID[];
  v_content TEXT;
  v_npc_name TEXT := NULL;
  v_npc_avatar_url TEXT := NULL;
  v_existing_msg UUID;
  v_member_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  -- Idempotent retry.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing_msg
    FROM messages
    WHERE client_request_id = p_client_request_id
      AND channel_id = p_channel_id
      AND sender_id = v_uid;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing_msg;
      RETURN;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This channel is archived and can no longer receive messages.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = v_uid AND is_blocked = false
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'You are not a member of this channel.';
  END IF;

  -- The room, when given, must belong to this channel.
  IF p_sub_channel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sub_channels
    WHERE id = p_sub_channel_id AND channel_id = p_channel_id
  ) THEN
    RAISE EXCEPTION 'Room not found in this channel.';
  END IF;

  -- Type authorization: scene / NPC are GM-only.
  IF p_type NOT IN ('regular', 'scene', 'npc') THEN
    RAISE EXCEPTION 'Invalid message type.';
  END IF;
  IF p_type IN ('scene', 'npc') AND NOT is_channel_gm(p_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can send % messages.', p_type;
  END IF;

  -- Content limits: trim and cap.
  v_content := trim(p_content);
  IF v_content = '' THEN
    RAISE EXCEPTION 'Message cannot be empty.';
  END IF;
  IF char_length(v_content) > 4000 THEN
    RAISE EXCEPTION 'Message is too long (max 4000 characters).';
  END IF;

  -- Reply target must exist, not be deleted, and live in the same room.
  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM messages
    WHERE id = p_reply_to AND channel_id = p_channel_id AND NOT is_deleted
      AND sub_channel_id IS NOT DISTINCT FROM p_sub_channel_id
  ) THEN
    RAISE EXCEPTION 'Reply target is not in this room.';
  END IF;

  -- Whisper target must be an active (non-blocked, non-suspended) member.
  IF p_whisper_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = p_whisper_to
      AND NOT is_blocked AND NOT is_suspended(p_whisper_to)
  ) THEN
    RAISE EXCEPTION 'Whisper target is not a member of this channel.';
  END IF;

  -- NPC: snapshot against the roster. Existing NPC wins the avatar; a new name
  -- persists the roster row with the client-supplied portrait.
  IF p_type = 'npc' THEN
    IF p_npc_name IS NULL OR trim(p_npc_name) = '' THEN
      RAISE EXCEPTION 'Enter an NPC name to speak as.';
    END IF;
    v_npc_name := LEFT(trim(p_npc_name), 40);
    SELECT avatar_url INTO v_npc_avatar_url
    FROM channel_npcs
    WHERE channel_id = p_channel_id AND name = v_npc_name;
    IF v_npc_avatar_url IS NULL THEN
      v_npc_avatar_url := p_npc_avatar_url;
      INSERT INTO channel_npcs (channel_id, name, avatar_url)
      VALUES (p_channel_id, v_npc_name, v_npc_avatar_url)
      ON CONFLICT (channel_id, name) DO NOTHING;
    END IF;
  END IF;

  -- Mention resolution is server-owned; @all is GM-only (checked inside).
  v_mention_ids := resolve_mention_user_ids(p_channel_id, v_content);

  -- Optionally flip active players in the same transaction (GM-only).
  IF p_active_player_ids IS NOT NULL THEN
    IF NOT is_channel_gm(p_channel_id) THEN
      RAISE EXCEPTION 'Only the GM can change active players.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(p_active_player_ids) AS t(uid)
      WHERE NOT EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = p_channel_id AND user_id = t.uid
          AND NOT is_blocked AND NOT is_suspended(t.uid)
      )
    ) THEN
      RAISE EXCEPTION 'Active player must be a member of this channel.';
    END IF;
    UPDATE channel_members SET is_active_player = false WHERE channel_id = p_channel_id;
    UPDATE channel_members SET is_active_player = true
    WHERE channel_id = p_channel_id AND user_id = ANY(p_active_player_ids);
  END IF;

  BEGIN
    INSERT INTO messages (
      channel_id, sender_id, type, content, reply_to, whisper_to,
      npc_name, npc_avatar_url, mention_user_ids, client_request_id, sub_channel_id,
      emphasize_last_paragraph
    )
    VALUES (
      p_channel_id, v_uid, p_type, v_content, p_reply_to, p_whisper_to,
      v_npc_name, v_npc_avatar_url,
      CASE WHEN array_length(v_mention_ids, 1) > 0 THEN v_mention_ids ELSE NULL END,
      p_client_request_id, p_sub_channel_id,
      -- Only a scene reads this; anything else stores the default so the column
      -- never carries a meaningless false.
      CASE WHEN p_type = 'scene' THEN COALESCE(p_emphasize_last_paragraph, true) ELSE true END
    )
    RETURNING id INTO v_msg_id;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent same-key call won the race; replay its row. If there is no
    -- key (or the row vanished), re-raise: never return a NULL id.
    IF p_client_request_id IS NULL THEN
      RAISE EXCEPTION 'Concurrent request conflict; please retry.';
    END IF;
    SELECT id INTO v_existing_msg
    FROM messages
    WHERE client_request_id = p_client_request_id
      AND channel_id = p_channel_id
      AND sender_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Concurrent request conflict; please retry.';
    END IF;
    RETURN QUERY SELECT v_existing_msg;
    RETURN;
  END;

  RETURN QUERY SELECT v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID, UUID, BOOLEAN) TO authenticated, service_role;
