-- Issue #337: realtime privacy & DB hardening from the Phase 4 audit
-- (docs/audit/20260831/phase4_audit.md).
--
-- 1. X-Card realtime privacy: safety_card_events SELECT was member-wide;
--    every player's websocket received every flag. GM-only surfacing was
--    client-side only. Back to a GM-only SELECT policy — but with the
--    predicate inlined (no SECURITY DEFINER helper), because the definer
--    helper is exactly what broke realtime delivery for the GM before
--    (20260811130000). Players can still INSERT (anonymity preserved);
--    they just can no longer read the event stream back.
-- 2. Consent on membership: the GM FOR ALL policy on channel_members allowed
--    INSERT of a member row for ANY profile — force-adding users without
--    their consent. A trigger now requires authenticated INSERTs to be
--    self-joins (user_id = auth.uid()); definer-side server paths
--    (auth.uid() IS NULL) are unaffected.
-- 3. member.attributes JSONB unclamped on self-update: the field-bounds
--    trigger now clamps attribute modifiers to the game system's bounds and
--    drops non-numeric values (same contract as join_channel).
-- 4. search_path pinned on the auth.signup definer triggers
--    (Supabase linter function_search_path_mutable).
-- 5. roll_dice: notation length cap + DC bounds.
-- 6. Idempotency race: send_message / roll_dice replayed SELECT-then-INSERT;
--    concurrent same-key calls hit a unique violation instead of returning
--    the existing row. Both now catch unique_violation on the insert and
--    fall back to the replay SELECT.
-- 7. admin_messages RLS: thread visibility relied on a nested RLS-filtered
--    subquery (fragile). Predicate inlined into each policy.
-- 8. Misc: invite_code format validation, URL scheme validation on
--    channel/map/resource URLs, abuse_reports.reason length cap,
--    mark_admin_thread_read no longer writes rows for invisible threads.

-- ==========================================
-- 1. X-Card: GM-only realtime
-- ==========================================

DROP POLICY "Members can view X-Card events" ON safety_card_events;

CREATE POLICY "GM can view X-Card events"
  ON safety_card_events FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = channel_id AND c.gm_id = auth.uid()
    )
  );

-- ==========================================
-- 2. channel_members: no force-adding other users
-- ==========================================

CREATE OR REPLACE FUNCTION enforce_member_insert_consent()
RETURNS TRIGGER AS $$
BEGIN
  -- Authenticated writers may only add themselves. Definer contexts
  -- (auth.uid() IS NULL) are server-side joins and stay allowed.
  IF auth.uid() IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only join a channel as yourself.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS channel_members_insert_consent ON channel_members;
CREATE TRIGGER channel_members_insert_consent
  BEFORE INSERT ON channel_members
  FOR EACH ROW EXECUTE FUNCTION enforce_member_insert_consent();

-- ==========================================
-- 3. Clamp member.attributes on authenticated writes
-- ==========================================

CREATE OR REPLACE FUNCTION enforce_member_field_bounds()
RETURNS TRIGGER AS $$
DECLARE
  v_game_system TEXT;
  v_min_mod INTEGER := -4;
  v_max_mod INTEGER := 5;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF char_length(NEW.character_name) > 20 THEN
      RAISE EXCEPTION 'Character name is too long (max 20 characters).';
    END IF;
    IF char_length(COALESCE(NEW.character_notes, '')) > 500 THEN
      RAISE EXCEPTION 'Character notes are too long (max 500 characters).';
    END IF;
    IF char_length(COALESCE(NEW.away_message, '')) > 200 THEN
      RAISE EXCEPTION 'Away message is too long (max 200 characters).';
    END IF;
    IF char_length(COALESCE(NEW.character_avatar_url, '')) > 500
       OR char_length(COALESCE(NEW.character_sheet_url, '')) > 500 THEN
      RAISE EXCEPTION 'Character URL is too long (max 500 characters).';
    END IF;
    -- Attributes are stat modifiers only: numeric values clamped to the
    -- game system's bounds, everything else dropped (same contract as
    -- join_channel).
    IF NEW.attributes IS NOT NULL THEN
      SELECT c.game_system INTO v_game_system
      FROM channels c WHERE c.id = NEW.channel_id;
      IF v_game_system = 'shadowdark' THEN
        v_max_mod := 4;
      END IF;
      -- COALESCE: an aggregate over zero rows returns NULL, which would
      -- violate the NOT NULL constraint for empty attributes objects.
      SELECT COALESCE(
        jsonb_object_agg(k, LEAST(GREATEST(v::int, v_min_mod), v_max_mod)),
        NEW.attributes
      )
      INTO NEW.attributes
      FROM jsonb_each_text(NEW.attributes) AS e(k, v)
      WHERE v ~ '^-?\d{1,4}$';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 4. Pin search_path on auth signup triggers
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_prefs()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- ==========================================
-- 5. roll_dice: notation length cap + DC bounds
-- ==========================================

CREATE OR REPLACE FUNCTION roll_dice(
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
AS $func$
BEGIN
  IF p_warning IS NOT NULL AND char_length(p_warning) > 500 THEN
    RAISE EXCEPTION 'Roll warning is too long (max 500 characters).';
  END IF;
  IF char_length(p_notation) > 50 THEN
    RAISE EXCEPTION 'Dice notation is too long (max 50 characters).';
  END IF;
  IF p_dc IS NOT NULL AND (p_dc < 1 OR p_dc > 100) THEN
    RAISE EXCEPTION 'DC must be between 1 and 100.';
  END IF;
  RETURN QUERY SELECT * FROM roll_dice_unchecked(
    p_channel_id, p_notation, p_reply_to, p_warning, p_dc, p_client_request_id
  );
END;
$func$;

-- Idempotency race: on a concurrent same-key insert, catch the unique
-- violation and return the winning row instead of erroring.
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

  BEGIN
    INSERT INTO messages (channel_id, sender_id, type, content, reply_to, roll_dc, roll_success, client_request_id)
    VALUES (p_channel_id, v_uid, 'dice_roll', v_content, p_reply_to, p_dc, v_success, p_client_request_id)
    RETURNING id INTO v_msg_id;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent same-key call won the race; replay its row.
    SELECT m.id, dr.id INTO v_existing_msg, v_existing_roll
    FROM messages m
    JOIN dice_rolls dr ON dr.message_id = m.id
    WHERE m.client_request_id = p_client_request_id
      AND m.channel_id = p_channel_id
      AND m.sender_id = v_uid;
    RETURN QUERY SELECT v_existing_msg, v_existing_roll;
    RETURN;
  END;

  INSERT INTO dice_rolls (message_id, channel_id, roller_id, notation, result, breakdown)
  VALUES (v_msg_id, p_channel_id, v_uid, p_notation, v_total,
    jsonb_build_object('rolls', to_jsonb(v_rolls), 'dropped', to_jsonb(v_dropped), 'modifier', v_modifier))
  RETURNING id INTO v_roll_id;

  RETURN QUERY SELECT v_msg_id, v_roll_id;
END;
$$;

-- ==========================================
-- 6. send_message: idempotency race
-- ==========================================

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

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent same-key call won the race; replay its row.
    SELECT id INTO v_existing_msg
    FROM messages
    WHERE client_request_id = p_client_request_id
      AND channel_id = p_channel_id
      AND sender_id = v_uid;
    RETURN QUERY SELECT v_existing_msg;
    RETURN;
  END;

  RETURN QUERY SELECT v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID) TO authenticated;

-- ==========================================
-- 7. admin_messages: inline the thread-visibility predicate
-- ==========================================

DROP POLICY "Can view messages in readable threads" ON public.admin_messages;
DROP POLICY "Can insert messages in readable threads" ON public.admin_messages;

CREATE POLICY "Can view messages in readable threads" ON public.admin_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_threads t
    WHERE t.id = admin_messages.thread_id
      AND (
        (t.type = 'announcement' AND (is_server_admin() OR is_active_gm(auth.uid())))
        OR
        (t.type = 'dm' AND (is_server_admin() OR auth.uid() = t.gm_id))
      )
  )
);

CREATE POLICY "Can insert messages in readable threads" ON public.admin_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_threads t
    WHERE t.id = admin_messages.thread_id
      AND (
        (t.type = 'announcement' AND (is_server_admin() OR is_active_gm(auth.uid())))
        OR
        (t.type = 'dm' AND (is_server_admin() OR auth.uid() = t.gm_id))
      )
  ) AND sender_id = auth.uid()
);

-- mark_admin_thread_read: refuse threads the caller cannot see instead of
-- writing noise rows.
CREATE OR REPLACE FUNCTION public.mark_admin_thread_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_threads t
    WHERE t.id = p_thread_id
      AND (
        (t.type = 'announcement' AND (is_server_admin() OR is_active_gm(auth.uid())))
        OR
        (t.type = 'dm' AND (is_server_admin() OR auth.uid() = t.gm_id))
      )
  ) THEN
    RAISE EXCEPTION 'Thread not found.';
  END IF;

  INSERT INTO public.admin_thread_reads (thread_id, user_id, last_read_at)
  VALUES (p_thread_id, auth.uid(), now())
  ON CONFLICT (thread_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$$;

-- ==========================================
-- 8. Misc hardening
-- ==========================================

-- Invite codes are 8-hex-char strings generated by the client; reject
-- anything else server-side so garbage/oversized values never reach the
-- unique index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channels_invite_code_format'
  ) THEN
    -- Normalize legacy rows that don't match the 8-hex format before adding
    -- the constraint (code is voided rather than blocking the migration).
    UPDATE channels SET invite_code = NULL
    WHERE invite_code IS NOT NULL AND invite_code !~ '^[A-Fa-f0-9]{8}$';
    ALTER TABLE channels ADD CONSTRAINT channels_invite_code_format
      CHECK (invite_code IS NULL OR invite_code ~ '^[A-Fa-f0-9]{8}$');
  END IF;
END;
$$;

-- URL fields must be http(s) (or blank); javascript:/data: URIs would render
-- into <a> tags. Cap validated by the existing *_length constraints.
CREATE OR REPLACE FUNCTION enforce_url_scheme()
RETURNS TRIGGER AS $$
DECLARE
  v_url TEXT;
BEGIN
  FOREACH v_url IN ARRAY ARRAY[
    NEW.map_url, NEW.resources_url, NEW.safety_tools_url, NEW.avatar_url
  ] LOOP
    IF v_url IS NOT NULL AND v_url <> ''
       AND v_url !~* '^https?://' THEN
      RAISE EXCEPTION 'URLs must start with http:// or https://';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS channels_url_scheme ON channels;
CREATE TRIGGER channels_url_scheme
  BEFORE INSERT OR UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION enforce_url_scheme();

-- abuse_reports.reason: cap length (normalize existing rows first).
UPDATE abuse_reports SET reason = LEFT(reason, 1000) WHERE char_length(reason) > 1000;
ALTER TABLE abuse_reports
  ADD CONSTRAINT abuse_reports_reason_length CHECK (char_length(reason) <= 1000);
