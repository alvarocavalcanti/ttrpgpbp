-- Issue #335: authz & enumeration fixes from the Phase 4 audit
-- (docs/audit/20260831/phase4_audit.md).
--
-- 1. Suspension bypass: the command RPCs (send_message, roll_dice,
--    set_active_players, update_channel_settings) checked membership/GM status
--    inline without consulting is_suspended, so a suspended account kept
--    posting, rolling and mutating channel state over the RPC path. Each
--    function now refuses suspended callers up front (and refuses suspended
--    whisper/active-player targets, same hole one hop out).
-- 2. Unthrottled join password oracle: join_channel compared the channel
--    password/invite code with no attempt limiting (the TODO left in
--    20260819130000_abuse_controls.sql was never implemented). Failed
--    attempts are now counted per user+channel in a windowed table and the
--    oracle shuts after 5 failures in 10 minutes.
-- 3. PUBLIC-executable SECURITY DEFINER helpers: is_suspended, is_active_gm,
--    resolve_mention_user_ids and get_admin_unread_count had no REVOKE, so
--    any caller could poll suspension flags, enumerate GMs, probe membership
--    or read another user's admin-thread unread state. Revoked from PUBLIC;
--    only the two functions the frontend legitimately calls are granted back
--    to authenticated. get_admin_unread_count now refuses to report on
--    another user unless the caller is a server admin. is_active_gm also
--    stops counting suspended GMs.

-- ==========================================
-- 1. Suspension guards on command RPCs
-- ==========================================

CREATE OR REPLACE FUNCTION roll_dice_unchecked(
  p_channel_id UUID,
  p_notation TEXT,
  p_reply_to UUID DEFAULT NULL,
  p_warning TEXT DEFAULT NULL,
  p_dc INTEGER DEFAULT NULL,
  p_client_request_id UUID DEFAULT NULL
)
RETURNS TABLE (message_id UUID, dice_roll_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_game_system TEXT;
  v_min_mod INTEGER := -4;
  v_max_mod INTEGER := 5;
  v_norm TEXT;
  v_match TEXT[];
  v_count INTEGER;
  v_sides INTEGER;
  v_keepdrop TEXT;
  v_sign TEXT;
  v_mod_str TEXT;
  v_modifier INTEGER := 0;
  v_rolls INTEGER[] := '{}';
  v_kept INTEGER[] := '{}';
  v_dropped INTEGER[] := '{}';
  v_total INTEGER;
  v_success BOOLEAN := NULL;
  v_content TEXT;
  v_msg_id UUID;
  v_roll_id UUID;
  v_i INTEGER;
  v_existing_msg UUID;
  v_existing_roll UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  -- Idempotent retry: replay of the same request returns the existing rows.
  IF p_client_request_id IS NOT NULL THEN
    SELECT m.id, dr.id INTO v_existing_msg, v_existing_roll
    FROM messages m
    JOIN dice_rolls dr ON dr.message_id = m.id
    WHERE m.client_request_id = p_client_request_id
      AND m.channel_id = p_channel_id
      AND m.sender_id = v_uid;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing_msg, v_existing_roll;
      RETURN;
    END IF;
  END IF;

  SELECT c.game_system INTO v_game_system FROM channels c WHERE c.id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This channel is archived and can no longer receive messages.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = v_uid AND is_blocked = false
  ) THEN
    RAISE EXCEPTION 'You are not a member of this channel.';
  END IF;

  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM messages WHERE id = p_reply_to AND channel_id = p_channel_id AND NOT is_deleted
  ) THEN
    RAISE EXCEPTION 'Reply target is not in this channel.';
  END IF;

  -- Parse and validate notation (mirrors src/features/dice/parser.ts).
  v_norm := lower(regexp_replace(p_notation, '\s+', '', 'g'));
  v_match := regexp_match(v_norm, '^(\d+)d(\d+)((?:kh|kl|dh|dl)\d*)?(?:([+-])(\d+))?$');
  IF v_match IS NULL THEN
    RAISE EXCEPTION 'Invalid dice notation: %', p_notation;
  END IF;

  v_count := v_match[1]::INTEGER;
  v_sides := v_match[2]::INTEGER;
  v_keepdrop := v_match[3];
  v_sign := v_match[4];
  v_mod_str := v_match[5];

  IF v_count <= 0 OR v_sides <= 0 THEN
    RAISE EXCEPTION 'Invalid dice notation: %', p_notation;
  END IF;
  IF v_count > 100 THEN
    RAISE EXCEPTION 'Too many dice';
  END IF;
  IF v_sides > 1000 THEN
    RAISE EXCEPTION 'Too many sides';
  END IF;

  IF v_mod_str IS NOT NULL THEN
    v_modifier := v_mod_str::INTEGER;
    IF v_sign = '-' THEN v_modifier := -v_modifier; END IF;
  END IF;

  -- Game-system modifier bounds (mirror clampModifier: DEFAULT -4..5,
  -- shadowdark -4..4). A client can never roll with an out-of-bounds modifier.
  IF v_game_system = 'shadowdark' THEN
    v_min_mod := -4;
    v_max_mod := 4;
  END IF;
  v_modifier := LEAST(GREATEST(v_modifier, v_min_mod), v_max_mod);

  -- Roll server-side.
  FOR v_i IN 1..v_count LOOP
    v_rolls := array_append(v_rolls, floor(random() * v_sides) + 1);
  END LOOP;

  -- Keep/drop rules.
  v_kept := v_rolls;
  IF v_keepdrop IS NOT NULL AND v_keepdrop <> '' THEN
    DECLARE
      v_kd_type TEXT := substring(v_keepdrop FROM 1 FOR 2);
      v_kd_amount INTEGER := NULLIF(substring(v_keepdrop FROM 3), '')::INTEGER;
      v_sorted INTEGER[];
      v_to_drop INTEGER[];
      v_d INTEGER;
    BEGIN
      IF v_kd_amount IS NULL THEN v_kd_amount := 1; END IF;
      IF v_kd_amount >= v_count THEN
        IF v_kd_type IN ('dl', 'dh') THEN
          v_dropped := v_kept;
          v_kept := '{}';
        END IF;
      ELSE
        v_sorted := (SELECT array_agg(x ORDER BY x) FROM unnest(v_rolls) AS x);
        IF v_kd_type = 'kh' THEN
          v_to_drop := v_sorted[1:v_count - v_kd_amount];
        ELSIF v_kd_type = 'kl' THEN
          v_to_drop := v_sorted[v_kd_amount + 1:v_count];
        ELSIF v_kd_type = 'dh' THEN
          v_to_drop := v_sorted[v_count - v_kd_amount + 1:v_count];
        ELSIF v_kd_type = 'dl' THEN
          v_to_drop := v_sorted[1:v_kd_amount];
        END IF;
        -- Remove dropped values while preserving the original order of kept dice.
        FOREACH v_d IN ARRAY v_to_drop LOOP
          DECLARE
            v_idx INTEGER := array_position(v_kept, v_d);
          BEGIN
            IF v_idx IS NOT NULL THEN
              v_kept := v_kept[1:v_idx-1] || v_kept[v_idx+1:array_length(v_kept, 1)];
              v_dropped := array_append(v_dropped, v_d);
            END IF;
          END;
        END LOOP;
      END IF;
    END;
  END IF;

  v_total := COALESCE((SELECT sum(x) FROM unnest(v_kept) AS x), 0) + v_modifier;

  -- DC success: meets beats.
  IF p_dc IS NOT NULL THEN
    v_success := v_total >= p_dc;
  END IF;

  -- Build the persisted content server-side (mirrors formatDiceRoll).
  v_content := build_dice_content(p_notation, v_rolls, v_modifier, v_total);
  IF p_dc IS NOT NULL THEN
    v_content := v_content || E'\n\n**' || CASE WHEN v_success THEN 'Success' ELSE 'Failure' END
      || '** (DC ' || p_dc || ')';
  END IF;
  IF p_warning IS NOT NULL AND p_warning <> '' THEN
    v_content := v_content || E'\n\n' || p_warning;
  END IF;

  INSERT INTO messages (channel_id, sender_id, type, content, reply_to, roll_dc, roll_success, client_request_id)
  VALUES (p_channel_id, v_uid, 'dice_roll', v_content, p_reply_to, p_dc, v_success, p_client_request_id)
  RETURNING id INTO v_msg_id;

  INSERT INTO dice_rolls (message_id, channel_id, roller_id, notation, result, breakdown)
  VALUES (v_msg_id, p_channel_id, v_uid, p_notation, v_total,
    jsonb_build_object('rolls', to_jsonb(v_rolls), 'dropped', to_jsonb(v_dropped), 'modifier', v_modifier))
  RETURNING id INTO v_roll_id;

  RETURN QUERY SELECT v_msg_id, v_roll_id;
END;
$$;

REVOKE ALL ON FUNCTION roll_dice_unchecked(UUID, TEXT, UUID, TEXT, INTEGER, UUID) FROM PUBLIC, authenticated;
-- The roll_dice wrapper (warning-length check, 20260818140000) keeps its
-- existing grants; this migration must not clobber it.

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

CREATE OR REPLACE FUNCTION set_active_players(
  p_channel_id UUID,
  p_active_player_ids UUID[]
)
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

  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

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
END;
$$;

REVOKE ALL ON FUNCTION set_active_players(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_active_players(UUID, UUID[]) TO authenticated;

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

  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
  IF v_channel.gm_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the GM can change channel settings.';
  END IF;

  UPDATE channels SET
    name = COALESCE(NULLIF(p_name, ''), name),
    game_system = COALESCE(p_game_system, game_system),
    map_url = p_map_url,
    resources_url = p_resources_url,
    safety_tools_url = p_safety_tools_url,
    updated_at = now()
  WHERE id = p_channel_id;

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

-- ==========================================
-- 2. Join attempt throttle
-- ==========================================

-- ponytail: flat windowed counter, one row per (user, channel); swap for a
-- partitioned log if forensics on join abuse ever matter.
CREATE TABLE public.channel_join_failures (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  fail_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, channel_id)
);
-- ponytail: no retention job — rows self-clean on successful join, cascade
-- away on account/channel deletion, and are bounded by one row per
-- (user, channel) pair; add a scheduled cleanup only if that ever grows.

ALTER TABLE public.channel_join_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.channel_join_failures FROM anon, authenticated, service_role;
-- RLS with no policies denies whatever grants remain; the explicit REVOKE
-- strips the Supabase default-privilege grants. Only the SECURITY DEFINER
-- join_channel touches this table.

CREATE OR REPLACE FUNCTION join_channel(
  p_channel_id UUID,
  p_character_name TEXT,
  p_character_avatar_url TEXT DEFAULT NULL,
  p_character_sheet_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_invite_code TEXT DEFAULT NULL,
  p_character_attributes JSONB DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel record;
  v_secret record;
  v_character_name TEXT;
  v_channel_count INTEGER;
  v_is_admin BOOLEAN;
  v_max_channels INTEGER;
  v_attributes JSONB;
  v_min_mod INTEGER := -4;
  v_max_mod INTEGER := 5;
  v_uid UUID := auth.uid();
  -- ponytail: throttle constants; tighten/relax here if abuse patterns shift.
  v_max_attempts INTEGER := 5;
  v_window INTERVAL := interval '10 minutes';
  v_auth_ok BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_suspended(v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account suspended.');
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Channel not found');
  END IF;

  IF v_channel.is_archived THEN
    RETURN jsonb_build_object('success', false, 'error', 'This channel has been archived and can no longer be joined.');
  END IF;

  -- Throttle check: shut the password/invite oracle after too many failures.
  IF EXISTS (
    SELECT 1 FROM channel_join_failures
    WHERE user_id = v_uid AND channel_id = p_channel_id
      AND window_start > now() - v_window
      AND fail_count >= v_max_attempts
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many failed attempts. Try again later.');
  END IF;

  SELECT * INTO v_secret FROM channel_secrets WHERE channel_id = p_channel_id;

  IF v_channel.gm_id = v_uid THEN
    v_auth_ok := true;
  ELSIF v_channel.invite_code IS NOT NULL AND v_channel.invite_code = p_invite_code THEN
    v_auth_ok := true;
  ELSIF v_secret.password_hash IS NOT NULL
        AND v_secret.password_hash = p_password_hash THEN
    v_auth_ok := true;
  END IF;

  IF NOT v_auth_ok THEN
    -- Count the failure (invite code or password) in the current window.
    INSERT INTO channel_join_failures (user_id, channel_id, window_start, fail_count)
    VALUES (v_uid, p_channel_id, now(), 1)
    ON CONFLICT (user_id, channel_id) DO UPDATE SET
      window_start = CASE
        WHEN channel_join_failures.window_start < now() - v_window THEN now()
        ELSE channel_join_failures.window_start
      END,
      fail_count = CASE
        WHEN channel_join_failures.window_start < now() - v_window THEN 1
        ELSE channel_join_failures.fail_count + 1
      END;
    RETURN jsonb_build_object('success', false, 'error', 'Invalid password or invite code');
  END IF;

  -- Successful auth clears the failure history.
  DELETE FROM channel_join_failures WHERE user_id = v_uid AND channel_id = p_channel_id;

  v_character_name := LEFT(COALESCE(p_character_name, ''), 20);

  SELECT server_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    v_max_channels := 10;
    SELECT (value #>> '{}')::int INTO v_max_channels
    FROM app_settings WHERE key = 'max_channels_per_user';
    v_max_channels := COALESCE(v_max_channels, 10);

    SELECT COUNT(*) INTO v_channel_count
    FROM channel_members cm
    JOIN channels c ON c.id = cm.channel_id
    WHERE cm.user_id = v_uid AND NOT c.is_archived;
    IF v_channel_count >= v_max_channels THEN
      RETURN jsonb_build_object('success', false, 'error', format('Channel limit reached. You can join at most %s channels.', v_max_channels));
    END IF;
  END IF;

  IF v_channel.game_system = 'shadowdark' THEN
    v_min_mod := -4;
    v_max_mod := 4;
  END IF;

  v_attributes := '{}'::jsonb;
  IF p_character_attributes IS NOT NULL AND jsonb_typeof(p_character_attributes) = 'object' THEN
    SELECT jsonb_object_agg(k, least(greatest(v::int, v_min_mod), v_max_mod))
    INTO v_attributes
    FROM jsonb_each_text(p_character_attributes) AS e(k, v)
    WHERE v ~ '^-?\d+$';
  END IF;

  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url, attributes)
  VALUES (p_channel_id, v_uid, v_character_name, p_character_avatar_url, p_character_sheet_url, v_attributes);

  INSERT INTO messages (channel_id, sender_id, type, content)
  VALUES (p_channel_id, v_uid, 'system', v_character_name || ' joined the channel');

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ==========================================
-- 3. Lock down PUBLIC-executable definer helpers
-- ==========================================

-- is_active_gm also ignores suspension today; a suspended GM must stop
-- reading announcements and DMing the admin.
CREATE OR REPLACE FUNCTION is_active_gm(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channels
    WHERE gm_id = p_user_id AND is_archived = false
  ) AND NOT is_suspended(p_user_id);
$$;

-- get_admin_unread_count must not leak another user's admin-thread state.
CREATE OR REPLACE FUNCTION get_admin_unread_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(t.id)::integer
  FROM public.admin_threads t
  LEFT JOIN public.admin_thread_reads r ON r.thread_id = t.id AND r.user_id = p_user_id
  WHERE (
    auth.uid() IS NOT NULL
    AND (is_server_admin() OR p_user_id = auth.uid())
  )
  AND (
    (t.type = 'announcement' AND (is_server_admin() OR is_active_gm(p_user_id)))
    OR
    (t.type = 'dm' AND (is_server_admin() OR p_user_id = t.gm_id))
  )
  AND (r.last_read_at IS NULL OR t.last_message_at > r.last_read_at);
$$;
-- REVOKE FROM PUBLIC alone is not enough: Supabase default privileges grant
-- EXECUTE on new functions to anon/authenticated/service_role explicitly.
REVOKE ALL ON FUNCTION is_suspended(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION is_active_gm(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION resolve_mention_user_ids(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION get_admin_unread_count(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- is_active_gm is referenced by admin_threads RLS policies, which evaluate
-- with the caller's privileges — authenticated needs EXECUTE. The frontend
-- hook (useIsActiveGM) calls it for the caller's own id.
GRANT EXECUTE ON FUNCTION is_active_gm(UUID) TO authenticated;
-- Frontend unread badge calls it for the caller's own id (useAdminUnread).
GRANT EXECUTE ON FUNCTION get_admin_unread_count(UUID) TO authenticated;
-- is_suspended and resolve_mention_user_ids have no legitimate direct caller:
-- they run only inside definer functions and triggers (owner privileges).

