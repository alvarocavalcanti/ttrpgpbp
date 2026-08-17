-- Issue #198 Part 3: transactional send_message + moderation + settings commands.
--
-- send_message makes the server authoritative for message semantics:
--   * member + archived-channel checks
--   * mention resolution + @all authorization (GM-only) + mention_user_ids
--     persisted canonically
--   * reply target must belong to the same channel
--   * whisper target must be an active channel member
--   * NPC messages are GM-only and the snapshot name/avatar are validated
--     against the roster (existing NPC wins for the avatar)
--   * scene messages are GM-only
--   * content length limits
--   * optional active-player flip bundled in the same transaction
--   * idempotent on client_request_id
--
-- moderate_member makes block/kick/leave + their system messages atomic.
-- update_channel_settings folds channels + channel_secrets + safety tools into
-- one transactional save.

CREATE OR REPLACE FUNCTION resolve_mention_user_ids(p_channel_id UUID, p_content TEXT)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[] := '{}';
  v_chip TEXT;
  v_raw TEXT;
  v_uid UUID;
BEGIN
  -- Chips are persisted as `[@Name](user:uuid)` markdown links; @all uses the
  -- reserved `user:all` sentinel. Extracted from the content itself, never from
  -- a client-supplied list, so a fabricated recipient can't be routed to.
  FOR v_chip IN
    SELECT (regexp_matches(p_content, '\(user:([a-z0-9-]+)\)', 'g'))[1]
  LOOP
    IF v_chip = 'all' THEN
      IF NOT is_channel_gm(p_channel_id) THEN
        RAISE EXCEPTION 'Only the GM can mention everyone with @all.';
      END IF;
      -- Expand to every active member (excluding the sender is done by callers).
      SELECT array_agg(cm.user_id) INTO v_ids
      FROM channel_members cm
      WHERE cm.channel_id = p_channel_id AND NOT cm.is_blocked AND cm.user_id <> auth.uid();
    ELSE
      BEGIN
        v_uid := v_chip::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid mention target.';
      END;
      IF NOT EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = p_channel_id AND user_id = v_uid AND NOT is_blocked
      ) THEN
        RAISE EXCEPTION 'Mention target is not a member of this channel.';
      END IF;
      IF v_uid <> auth.uid() THEN
        v_ids := array_append(v_ids, v_uid);
      END IF;
    END IF;
  END LOOP;
  RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION send_message(
  p_channel_id UUID,
  p_content TEXT,
  p_type TEXT DEFAULT 'regular',
  p_reply_to UUID DEFAULT NULL,
  p_whisper_to UUID DEFAULT NULL,
  p_active_player_ids UUID[] DEFAULT NULL,
  p_npc_name TEXT DEFAULT NULL,
  p_npc_avatar_url TEXT DEFAULT NULL,
  p_client_request_id UUID DEFAULT NULL
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

  -- Reply target must exist, not be deleted, and live in the same channel.
  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM messages
    WHERE id = p_reply_to AND channel_id = p_channel_id AND NOT is_deleted
  ) THEN
    RAISE EXCEPTION 'Reply target is not in this channel.';
  END IF;

  -- Whisper target must be an active channel member.
  IF p_whisper_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = p_whisper_to AND NOT is_blocked
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
        WHERE channel_id = p_channel_id AND user_id = t.uid AND NOT is_blocked
      )
    ) THEN
      RAISE EXCEPTION 'Active player must be a member of this channel.';
    END IF;
    UPDATE channel_members SET is_active_player = false WHERE channel_id = p_channel_id;
    UPDATE channel_members SET is_active_player = true
    WHERE channel_id = p_channel_id AND user_id = ANY(p_active_player_ids);
  END IF;

  INSERT INTO messages (
    channel_id, sender_id, type, content, reply_to, whisper_to,
    npc_name, npc_avatar_url, mention_user_ids, client_request_id
  )
  VALUES (
    p_channel_id, v_uid, p_type, v_content, p_reply_to, p_whisper_to,
    v_npc_name, v_npc_avatar_url,
    CASE WHEN array_length(v_mention_ids, 1) > 0 THEN v_mention_ids ELSE NULL END,
    p_client_request_id
  )
  RETURNING id INTO v_msg_id;

  RETURN QUERY SELECT v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID) TO authenticated;

-- ==========================================
-- moderate_member: block / unblock / kick / leave + system message, atomic
-- ==========================================

CREATE OR REPLACE FUNCTION moderate_member(
  p_channel_id UUID,
  p_member_id UUID,
  p_action TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_member RECORD;
  v_gm_id UUID;
  v_message TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_member FROM channel_members WHERE id = p_member_id AND channel_id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in this channel.';
  END IF;

  SELECT gm_id INTO v_gm_id FROM channels WHERE id = p_channel_id;

  -- The GM cannot be removed by anyone, and players cannot moderate others.
  IF v_member.user_id = v_gm_id AND p_action <> 'leave' THEN
    RAISE EXCEPTION 'Cannot moderate the GM.';
  END IF;

  IF p_action = 'leave' THEN
    IF v_member.user_id <> v_uid THEN
      RAISE EXCEPTION 'You can only leave as yourself.';
    END IF;
    v_message := v_member.character_name || ' left the channel';
    DELETE FROM channel_members WHERE id = p_member_id;
  ELSIF p_action = 'block' THEN
    IF NOT is_channel_gm(p_channel_id) THEN
      RAISE EXCEPTION 'Only the GM can block players.';
    END IF;
    UPDATE channel_members SET is_blocked = true WHERE id = p_member_id;
    v_message := v_member.character_name || ' was blocked by the GM';
  ELSIF p_action = 'unblock' THEN
    IF NOT is_channel_gm(p_channel_id) THEN
      RAISE EXCEPTION 'Only the GM can unblock players.';
    END IF;
    UPDATE channel_members SET is_blocked = false WHERE id = p_member_id;
    v_message := v_member.character_name || ' was unblocked by the GM';
  ELSIF p_action = 'kick' THEN
    IF NOT is_channel_gm(p_channel_id) THEN
      RAISE EXCEPTION 'Only the GM can kick players.';
    END IF;
    v_message := v_member.character_name || ' was kicked from the channel';
    DELETE FROM channel_members WHERE id = p_member_id;
  ELSE
    RAISE EXCEPTION 'Unknown moderation action: %', p_action;
  END IF;

  INSERT INTO messages (channel_id, sender_id, type, content)
  VALUES (p_channel_id, v_uid, 'system', v_message);
END;
$$;

REVOKE ALL ON FUNCTION moderate_member(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION moderate_member(UUID, UUID, TEXT) TO authenticated;

-- ==========================================
-- update_channel_settings: channels + secrets + safety tools, transactional
-- ==========================================

-- NULL semantics (match the ChannelSettings form, the only caller): the
-- always-present fields (name, game_system, the three URLs, gm_only URL) are
-- set to what the client sends — NULL clears them. Password is only written
-- when p_password_hash or p_clear_password is set, so an unrelated save can't
-- clobber a secret it didn't touch.
CREATE OR REPLACE FUNCTION update_channel_settings(
  p_channel_id UUID,
  p_name TEXT DEFAULT NULL,
  p_game_system TEXT DEFAULT NULL,
  p_map_url TEXT DEFAULT NULL,
  p_resources_url TEXT DEFAULT NULL,
  p_safety_tools_url TEXT DEFAULT NULL,
  p_gm_only_resources_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_password_salt TEXT DEFAULT NULL,
  p_clear_password BOOLEAN DEFAULT false,
  p_safety_lines TEXT DEFAULT NULL,
  p_safety_veils TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_channel RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
  IF v_channel.gm_id <> v_uid THEN
    RAISE EXCEPTION 'Only the GM can change channel settings.';
  END IF;

  -- Channel identity fields. name is NOT NULL, so a blank falls back to the
  -- existing value instead of erroring.
  UPDATE channels SET
    name = COALESCE(NULLIF(p_name, ''), name),
    game_system = COALESCE(p_game_system, game_system),
    map_url = p_map_url,
    resources_url = p_resources_url,
    safety_tools_url = p_safety_tools_url,
    updated_at = now()
  WHERE id = p_channel_id;

  -- Secrets are GM-only at the RLS level; the definer writes them directly.
  -- The client always sends gm_only_resources_url, so NULL clears it.
  INSERT INTO channel_secrets (channel_id, gm_only_resources_url)
  VALUES (p_channel_id, NULLIF(p_gm_only_resources_url, ''))
  ON CONFLICT (channel_id) DO UPDATE SET
    gm_only_resources_url = NULLIF(EXCLUDED.gm_only_resources_url, '');

  IF p_clear_password OR p_password_hash IS NOT NULL OR p_password_salt IS NOT NULL THEN
    INSERT INTO channel_secrets (channel_id, password_hash, password_salt)
    VALUES (p_channel_id,
      CASE WHEN p_clear_password THEN NULL ELSE p_password_hash END,
      CASE WHEN p_clear_password THEN NULL ELSE p_password_salt END)
    ON CONFLICT (channel_id) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      password_salt = EXCLUDED.password_salt;
  END IF;

  IF p_safety_lines IS NOT NULL OR p_safety_veils IS NOT NULL THEN
    INSERT INTO channel_safety_tools (channel_id, lines, veils, updated_at)
    VALUES (p_channel_id, COALESCE(p_safety_lines, ''), COALESCE(p_safety_veils, ''), now())
    ON CONFLICT (channel_id) DO UPDATE SET
      lines = COALESCE(p_safety_lines, channel_safety_tools.lines),
      veils = COALESCE(p_safety_veils, channel_safety_tools.veils),
      updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION update_channel_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_channel_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;