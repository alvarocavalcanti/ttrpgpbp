-- Issue #623: sorted dice pools. The `s` suffix lists pool faces
-- highest-first on either pool mode (`NdMps`) or success pool (`NdM>=Ts`),
-- so players can read at a glance how many dice beat a threshold. `s` never
-- combines with sums, keep/drop, or modifiers (same ambiguity rule that
-- already governs `p` / `>=`). Success counting is order-independent, so the
-- only behavioral delta is face order in the message and in
-- dice_rolls.breakdown.rolls.
--
-- parse_dice_notation emits `sorted: true` only when the flag is present, so
-- existing notations keep their exact JSON shape (mirrors the
-- jsonb_strip_nulls philosophy of the breakdown column) and no pre-existing
-- pgTAP expectation changes. roll_dice_unchecked sorts before the formatter
-- and the breakdown insert, so the single display-order site stays the
-- formatter's input; build_dice_content is untouched.

CREATE OR REPLACE FUNCTION parse_dice_notation(p_notation TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH norm AS (
    SELECT lower(regexp_replace(p_notation, '\s+', '', 'g')) AS n
  ),
  m AS (
    SELECT regexp_match(
      n,
      '^(\d+)d(\d+)((?:kh|kl|dh|dl)\d*)?(?:(>=)(\d+))?(p)?(s)?(?:([+-])(\d+))?$'
    ) AS parts
    FROM norm
  ),
  fields AS (
    SELECT
      (parts[1])::INTEGER AS count,
      (parts[2])::INTEGER AS sides,
      COALESCE(parts[3], '') AS keepdrop,
      CASE WHEN parts[4] IS NOT NULL THEN 'successes'
           WHEN parts[6] IS NOT NULL THEN 'pool'
           ELSE 'sum' END AS mode,
      (parts[6] IS NOT NULL) AS has_pool_flag,
      (parts[7] IS NOT NULL) AS has_sort_flag,
      CASE WHEN parts[4] IS NOT NULL THEN (parts[5])::INTEGER ELSE NULL END AS target,
      CASE WHEN parts[8] IS NOT NULL
           THEN (CASE WHEN parts[8] = '-' THEN -1 ELSE 1 END) * (parts[9])::INTEGER
           ELSE 0 END AS modifier
    FROM m
    WHERE parts IS NOT NULL
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM fields) THEN jsonb_build_object('valid', false)
    WHEN EXISTS (
      SELECT 1 FROM fields
      -- keep/drop and modifiers are meaningless (ambiguous) on pools.
      WHERE (mode <> 'sum' AND (keepdrop <> '' OR modifier <> 0))
        -- `p` and `>=` never combine.
        OR (mode = 'successes' AND has_pool_flag)
        -- `s` rides on a pool mode, never on a bare sum.
        OR (has_sort_flag AND mode = 'sum')
        -- the target must be a reachable face.
        OR (mode = 'successes' AND (target < 1 OR target > sides))
    ) THEN jsonb_build_object('valid', false)
    ELSE (
      SELECT jsonb_build_object(
        'valid', true,
        'count', count,
        'sides', sides,
        'keepdrop', keepdrop,
        'mode', mode,
        'target', target,
        'modifier', modifier
      ) || CASE WHEN has_sort_flag THEN jsonb_build_object('sorted', true)
                ELSE '{}'::jsonb END
      FROM fields
    )
  END;
$$;

-- Internal helper consumed only by SECURITY DEFINER command functions.
REVOKE ALL ON FUNCTION public.parse_dice_notation(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- roll_dice_unchecked: same guards, same auth, same idempotency, same
-- keep/drop engine. Only addition: sorted pool notations reorder the faces
-- highest-first before the content build and the breakdown insert, so the
-- message and the roll history agree.
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
  v_parsed JSONB;
  v_count INTEGER;
  v_sides INTEGER;
  v_keepdrop TEXT;
  v_mode TEXT;
  v_target INTEGER;
  v_modifier INTEGER := 0;
  v_rolls INTEGER[] := '{}';
  v_kept INTEGER[] := '{}';
  v_dropped INTEGER[] := '{}';
  v_total INTEGER;
  v_successes INTEGER := NULL;
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

  -- Parse and validate notation via the shared parser (mirrors
  -- src/features/dice/parser.ts). Error copy is unchanged.
  v_parsed := parse_dice_notation(p_notation);
  IF NOT COALESCE((v_parsed->>'valid')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'Invalid dice notation: %', p_notation;
  END IF;

  v_count := (v_parsed->>'count')::INTEGER;
  v_sides := (v_parsed->>'sides')::INTEGER;
  v_keepdrop := v_parsed->>'keepdrop';
  v_mode := v_parsed->>'mode';
  v_target := (v_parsed->>'target')::INTEGER;
  v_modifier := COALESCE((v_parsed->>'modifier')::INTEGER, 0);

  IF v_count <= 0 OR v_sides <= 0 THEN
    RAISE EXCEPTION 'Invalid dice notation: %', p_notation;
  END IF;
  IF v_count > 100 THEN
    RAISE EXCEPTION 'Too many dice';
  END IF;
  IF v_sides > 1000 THEN
    RAISE EXCEPTION 'Too many sides';
  END IF;

  -- Pools carry no totals, so the meets-beats DC is meaningless for them.
  -- Reject loudly instead of silently ignoring the player's DC.
  IF p_dc IS NOT NULL AND v_mode <> 'sum' THEN
    RAISE EXCEPTION 'DC is not supported for dice pools.';
  END IF;

  -- Game-system modifier bounds (mirror clampModifier: DEFAULT -4..5,
  -- shadowdark -4..4). A client can never roll with an out-of-bounds modifier.
  -- Pool notations cannot carry a modifier (the parser rejects them), so this
  -- only ever binds on sum rolls.
  IF v_game_system = 'shadowdark' THEN
    v_min_mod := -4;
    v_max_mod := 4;
  END IF;
  v_modifier := LEAST(GREATEST(v_modifier, v_min_mod), v_max_mod);

  -- Roll server-side.
  FOR v_i IN 1..v_count LOOP
    v_rolls := array_append(v_rolls, floor(random() * v_sides) + 1);
  END LOOP;

  -- Keep/drop rules (sum rolls only — pool notations cannot carry one).
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

  -- Sorted pools (`ps` / `>=Ts`): faces listed highest-first. Only pool
  -- modes can carry the flag (the parser rejects it on sums), so keep/drop
  -- state needs no reorder and the success count is unaffected.
  IF COALESCE((v_parsed->>'sorted')::BOOLEAN, FALSE) THEN
    v_rolls := (SELECT COALESCE(array_agg(x ORDER BY x DESC), '{}') FROM unnest(v_rolls) AS x);
  END IF;

  -- Mode-aware evaluation. Sum is byte-for-byte the old behavior.
  IF v_mode = 'successes' THEN
    v_successes := (SELECT count(*)::INTEGER FROM unnest(v_rolls) AS x WHERE x >= v_target);
    v_total := v_successes;
  ELSIF v_mode = 'pool' THEN
    v_total := 0;
  ELSE
    v_total := COALESCE((SELECT sum(x) FROM unnest(v_kept) AS x), 0) + v_modifier;
  END IF;

  -- DC success: meets beats (sum rolls only — pools reject p_dc above).
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

  BEGIN
    INSERT INTO dice_rolls (message_id, channel_id, roller_id, notation, result, breakdown)
    VALUES (v_msg_id, p_channel_id, v_uid, p_notation, v_total,
      jsonb_strip_nulls(jsonb_build_object(
        'rolls', to_jsonb(v_rolls),
        'dropped', to_jsonb(v_dropped),
        'modifier', v_modifier,
        'mode', v_mode,
        'target', to_jsonb(v_target),
        'successes', to_jsonb(v_successes)
      )))
    RETURNING id INTO v_roll_id;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent same-key call won the race; replay its row. If there is no
    -- key (or the row vanished), re-raise: never return NULL ids.
    IF p_client_request_id IS NULL THEN
      RAISE EXCEPTION 'Concurrent request conflict; please retry.';
    END IF;
    SELECT m.id, dr.id INTO v_existing_msg, v_existing_roll
    FROM messages m
    JOIN dice_rolls dr ON dr.message_id = m.id
    WHERE m.client_request_id = p_client_request_id
      AND m.channel_id = p_channel_id
      AND m.sender_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Concurrent request conflict; please retry.';
    END IF;
    RETURN QUERY SELECT v_existing_msg, v_existing_roll;
    RETURN;
  END;

  RETURN QUERY SELECT v_msg_id, v_roll_id;
END;
$$;
