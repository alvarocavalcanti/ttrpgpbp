-- Issue #198 Part 2: authoritative dice rolling.
--
-- roll_dice replaces the browser-side parseAndRoll + two non-atomic inserts.
-- The server validates notation and limits, rolls server-side, clamps the
-- modifier to the game system's bounds, computes DC success (meets beats), and
-- inserts the message + dice_rolls row in one transaction. Idempotent on
-- client_request_id. Direct client INSERT into dice_rolls was revoked in the
-- schema migration.

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

REVOKE ALL ON FUNCTION roll_dice(UUID, TEXT, UUID, TEXT, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION roll_dice(UUID, TEXT, UUID, TEXT, INTEGER, UUID) TO authenticated;

-- Shared helper that formats the canonical dice message content. Kept separate
-- so tests can lock the exact copy contract independently of the RNG.
CREATE OR REPLACE FUNCTION build_dice_content(
  p_notation TEXT,
  p_rolls INTEGER[],
  p_modifier INTEGER,
  p_total INTEGER
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_notation ~* '^(\d+)d(\d+)(kh|kl)\d*(?:([+-])(\d+))?$' THEN
      'Rolled ' || regexp_replace(p_notation, '^(\d+)d(\d+).*$', '\1d\2', 'i')
        || ' with ' || CASE WHEN p_notation ~* 'kh' THEN 'ADV' ELSE 'DIS' END
        || CASE WHEN array_length(p_rolls, 1) > 0 THEN ' [' || array_to_string(p_rolls, ', ') || ']' ELSE '' END
        || CASE
             WHEN p_modifier > 0 THEN '+' || p_modifier
             WHEN p_modifier < 0 THEN p_modifier::text
             ELSE ''
           END
        || ': **' || p_total || '**'
    ELSE
      'Rolled ' || p_notation || ': **' || p_total || '**'
  END;
$$;

REVOKE ALL ON FUNCTION build_dice_content(TEXT, INTEGER[], INTEGER, INTEGER) FROM PUBLIC;