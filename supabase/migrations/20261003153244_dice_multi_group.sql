-- Issue #622/#629: chained dice groups. A sum roll may now combine several
-- dice types (`2d8+1d6+2`): each group is rolled and kept/dropped on its own,
-- then all kept faces are summed with one trailing modifier. Pools and success
-- pools stay a single group (their faces are read, not summed).
--
-- parse_dice_notation keeps its scalar fields (count/sides/keepdrop = the
-- FIRST group) for every existing consumer, and gains a `groups` array only
-- for chained sums; single-group notations keep their exact legacy JSON. The
-- single-group grammar and all its pool/keep-drop rules are unchanged; only
-- when it does not match do we try the chain grammar.
--
-- roll_dice_unchecked rolls each group independently and concatenates the
-- faces in group order (flat `rolls`, matching the stored breakdown shape).
-- build_dice_content only changes its critical gate: a crit needs exactly one
-- group, otherwise a `1d20+1d6` whose dice happen to sum to 20 would fake one.

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
  ),
  single AS (
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM fields) THEN jsonb_build_object('valid', false)
      WHEN EXISTS (
        SELECT 1 FROM fields
        WHERE (mode <> 'sum' AND (keepdrop <> '' OR modifier <> 0))
          OR (mode = 'successes' AND has_pool_flag)
          OR (has_sort_flag AND mode = 'sum')
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
    END AS result
  ),
  -- Chain grammar: group( +group )* plus an optional single trailing modifier.
  -- The modifier is only stripped when what remains still matches the group
  -- list (`+1d8` is a group, not a modifier).
  base AS (
    SELECT
      regexp_replace(n, '[+-]\d+$', '') AS body,
      regexp_match(n, '([+-])(\d+)$') AS mod
    FROM norm
  ),
  chain AS (
    SELECT
      CASE WHEN mod IS NULL THEN 0
           ELSE (CASE WHEN mod[1] = '-' THEN -1 ELSE 1 END) * (mod[2])::INTEGER END AS modifier,
      (SELECT jsonb_agg(jsonb_build_object(
          'count', g[1]::INTEGER,
          'sides', g[2]::INTEGER,
          'keepdrop', COALESCE(g[3], '')))
         FROM regexp_matches(body, '(\d+)d(\d+)((?:kh|kl|dh|dl)\d*)?', 'g') AS g) AS groups
    FROM base
    WHERE body ~ '^\d+d\d+((kh|kl|dh|dl)\d*)?(\+\d+d\d+((kh|kl|dh|dl)\d*)?)*$'
  )
  SELECT CASE
    WHEN COALESCE(((SELECT result FROM single)->>'valid')::BOOLEAN, FALSE)
      THEN (SELECT result FROM single)
    WHEN (SELECT groups FROM chain) IS NOT NULL
      THEN (SELECT jsonb_build_object(
        'valid', true,
        'count', (groups->0->>'count')::INTEGER,
        'sides', (groups->0->>'sides')::INTEGER,
        'keepdrop', groups->0->>'keepdrop',
        'mode', 'sum',
        'target', NULL,
        'modifier', modifier,
        'groups', groups
      ) FROM chain)
    ELSE jsonb_build_object('valid', false)
  END;
$$;

-- Internal helper consumed only by SECURITY DEFINER command functions.
REVOKE ALL ON FUNCTION public.parse_dice_notation(text)
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_groups JSONB;
  v_group JSONB;
  v_count INTEGER;
  v_sides INTEGER;
  v_keepdrop TEXT;
  v_g_count INTEGER;
  v_g_sides INTEGER;
  v_g_keepdrop TEXT;
  v_total_dice INTEGER := 0;
  v_mode TEXT;
  v_target INTEGER;
  v_modifier INTEGER := 0;
  v_rolls INTEGER[] := '{}';
  v_group_rolls INTEGER[] := '{}';
  v_group_kept INTEGER[] := '{}';
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

  v_groups := v_parsed->'groups';
  v_mode := v_parsed->>'mode';
  v_target := (v_parsed->>'target')::INTEGER;
  v_modifier := COALESCE((v_parsed->>'modifier')::INTEGER, 0);

  -- Single-group notations carry no `groups`; synthesize one from the scalars
  -- so the roll loop has a single shape to handle.
  IF v_groups IS NULL THEN
    v_count := (v_parsed->>'count')::INTEGER;
    v_sides := (v_parsed->>'sides')::INTEGER;
    v_keepdrop := v_parsed->>'keepdrop';
    v_groups := jsonb_build_array(jsonb_build_object(
      'count', v_count, 'sides', v_sides, 'keepdrop', v_keepdrop));
  END IF;

  -- Pools carry no totals, so the meets-beats DC is meaningless for them.
  -- Reject loudly instead of silently ignoring the player's DC.
  IF p_dc IS NOT NULL AND v_mode <> 'sum' THEN
    RAISE EXCEPTION 'DC is not supported for dice pools.';
  END IF;

  -- Game-system modifier bounds (mirror clampModifier: DEFAULT -4..5,
  -- shadowdark -4..4). Pools cannot carry a modifier, so this only ever binds
  -- on sum rolls.
  IF v_game_system = 'shadowdark' THEN
    v_min_mod := -4;
    v_max_mod := 4;
  END IF;
  v_modifier := LEAST(GREATEST(v_modifier, v_min_mod), v_max_mod);

  -- Roll every group independently. Keep/drop applies within its own group so
  -- chains keep each die type's rule; faces are concatenated in group order.
  FOR v_group IN SELECT * FROM jsonb_array_elements(v_groups) LOOP
    v_g_count := (v_group->>'count')::INTEGER;
    v_g_sides := (v_group->>'sides')::INTEGER;
    v_g_keepdrop := COALESCE(v_group->>'keepdrop', '');

    IF v_g_count <= 0 OR v_g_sides <= 0 THEN
      RAISE EXCEPTION 'Invalid dice notation: %', p_notation;
    END IF;
    IF v_g_sides > 1000 THEN
      RAISE EXCEPTION 'Too many sides';
    END IF;
    v_total_dice := v_total_dice + v_g_count;
    IF v_total_dice > 100 THEN
      RAISE EXCEPTION 'Too many dice';
    END IF;

    v_group_rolls := '{}';
    FOR v_i IN 1..v_g_count LOOP
      v_group_rolls := array_append(v_group_rolls, floor(random() * v_g_sides) + 1);
    END LOOP;
    v_rolls := v_rolls || v_group_rolls;

    v_group_kept := v_group_rolls;
    IF v_g_keepdrop <> '' THEN
      DECLARE
        v_kd_type TEXT := substring(v_g_keepdrop FROM 1 FOR 2);
        v_kd_amount INTEGER := NULLIF(substring(v_g_keepdrop FROM 3), '')::INTEGER;
        v_sorted INTEGER[];
        v_to_drop INTEGER[];
        v_d INTEGER;
      BEGIN
        IF v_kd_amount IS NULL THEN v_kd_amount := 1; END IF;
        IF v_kd_amount >= v_g_count THEN
          IF v_kd_type IN ('dl', 'dh') THEN
            v_dropped := v_dropped || v_group_kept;
            v_group_kept := '{}';
          END IF;
        ELSE
          v_sorted := (SELECT array_agg(x ORDER BY x) FROM unnest(v_group_rolls) AS x);
          IF v_kd_type = 'kh' THEN
            v_to_drop := v_sorted[1:v_g_count - v_kd_amount];
          ELSIF v_kd_type = 'kl' THEN
            v_to_drop := v_sorted[v_kd_amount + 1:v_g_count];
          ELSIF v_kd_type = 'dh' THEN
            v_to_drop := v_sorted[v_g_count - v_kd_amount + 1:v_g_count];
          ELSIF v_kd_type = 'dl' THEN
            v_to_drop := v_sorted[1:v_kd_amount];
          END IF;
          -- Remove dropped values while preserving the original order.
          FOREACH v_d IN ARRAY v_to_drop LOOP
            DECLARE
              v_idx INTEGER := array_position(v_group_kept, v_d);
            BEGIN
              IF v_idx IS NOT NULL THEN
                v_group_kept := v_group_kept[1:v_idx-1] || v_group_kept[v_idx+1:array_length(v_group_kept, 1)];
                v_dropped := array_append(v_dropped, v_d);
              END IF;
            END;
          END LOOP;
        END IF;
      END;
    END IF;

    v_kept := v_kept || v_group_kept;
  END LOOP;

  -- Sorted pools (`ps` / `>=Ts`): faces listed highest-first. Only pool modes
  -- can carry the flag (the parser rejects it on sums).
  IF COALESCE((v_parsed->>'sorted')::BOOLEAN, FALSE) THEN
    v_rolls := (SELECT COALESCE(array_agg(x ORDER BY x DESC), '{}') FROM unnest(v_rolls) AS x);
  END IF;

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

-- build_dice_content: only the critical gate changes. A critical roll needs a
-- single group; a chained sum never crits even if its total lands on 20.
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
  WITH parsed AS (
    SELECT parse_dice_notation(p_notation) AS p
  ),
  mode AS (
    SELECT
      (p->>'valid')::BOOLEAN AS valid,
      p->>'mode' AS mode,
      (p->>'count')::INTEGER AS count,
      (p->>'sides')::INTEGER AS sides,
      p->>'keepdrop' AS keepdrop,
      (p->>'target')::INTEGER AS target,
      COALESCE(jsonb_array_length(p->'groups'), 1) AS group_count
    FROM parsed
  ),
  kept AS (
    SELECT
      -- Cap kept/dropped amounts at the rolled count, matching roll_dice_unchecked:
      -- e.g. 1d20kh2 keeps the single rolled die (kept count 1), not 2.
      CASE
        WHEN keepdrop IS NULL OR keepdrop = '' THEN count
        WHEN keepdrop ~* '^(kh|kl)' THEN LEAST(COALESCE(NULLIF(substring(keepdrop FROM 3), '')::INTEGER, 1), count)
        ELSE count - LEAST(COALESCE(NULLIF(substring(keepdrop FROM 3), '')::INTEGER, 1), count)
      END AS kept_count,
      sides,
      mode AS roll_mode,
      (p_total - p_modifier) AS natural_die,
      target,
      group_count
    FROM mode
    WHERE valid
  ),
  crit AS (
    SELECT CASE
      WHEN roll_mode = 'sum' AND group_count = 1 AND kept_count = 1 AND sides = 20 AND natural_die = 20 THEN E'\n\n**Critical Success**'
      WHEN roll_mode = 'sum' AND group_count = 1 AND kept_count = 1 AND sides = 20 AND natural_die = 1 THEN E'\n\n**Critical Failure**'
      ELSE ''
    END AS label
    FROM kept
  ),
  breakdown AS (
    SELECT
      array_length(p_rolls, 1) IS NOT NULL
        AND coalesce((SELECT sum(x) FROM unnest(p_rolls) AS x), 0) + p_modifier = p_total
        AND (p_modifier <> 0 OR array_length(p_rolls, 1) > 1) AS show_breakdown
  ),
  successes AS (
    SELECT COALESCE(
      (SELECT count(*)::INTEGER FROM unnest(p_rolls) AS x WHERE x >= (SELECT target FROM kept)),
      0
    ) AS n
  )
  SELECT
    CASE
      WHEN (SELECT roll_mode FROM kept) = 'pool' THEN
        'Rolled ' || p_notation || ': ' || array_to_string(p_rolls, ', ')
      WHEN (SELECT roll_mode FROM kept) = 'successes' THEN
        'Rolled ' || p_notation || ': ' || array_to_string(p_rolls, ', ')
          || ' — **' || (SELECT n FROM successes)
          || CASE WHEN (SELECT n FROM successes) = 1 THEN ' success' ELSE ' successes' END
          || ' (≥' || (SELECT target FROM kept) || ')**'
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
      WHEN (SELECT show_breakdown FROM breakdown) THEN
        'Rolled ' || p_notation || ': '
          || array_to_string(p_rolls, ' + ')
          || CASE
               WHEN p_modifier > 0 THEN ' + ' || p_modifier
               WHEN p_modifier < 0 THEN ' - ' || abs(p_modifier)
               ELSE ''
             END
          || ' = **' || p_total || '**'
      ELSE
        'Rolled ' || p_notation || ': **' || p_total || '**'
    END
    || COALESCE((SELECT label FROM crit), '');
$$;
