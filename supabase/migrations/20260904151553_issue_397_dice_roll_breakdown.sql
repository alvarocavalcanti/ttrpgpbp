-- Issue #397: show the roll breakdown in plain (non-ADV/DIS) roll messages.
--
-- build_dice_content is the canonical roll-message formatter. Previously the
-- non-ADV/DIS branch rendered only the total (e.g. `Rolled 1d20+3: **13**`),
-- hiding how it was reached. Redefine it so that branch breaks the total down
-- into its dice + modifier components (e.g. `Rolled 1d20+3: 10 + 3 = **13**`).
--
-- The breakdown is only shown when no dice were dropped: sum(rolls) + modifier
-- equals the total, which holds exactly when every rolled die was kept. Rolls
-- with a dropped die (dh/dl) fall back to the plain total, so the breakdown is
-- never wrong. It also requires something to break down — a non-zero modifier
-- or more than one die — so a single no-modifier d20 keeps its terse format.
-- The ADV/DIS branch and the Critical Success/Failure label are unchanged.

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
    SELECT
      -- Normalize whitespace like roll_dice_unchecked does, so spaced
      -- notation such as "1 d 20 + 5" is still recognized as a d20.
      (regexp_match(regexp_replace(lower(p_notation), '\s+', '', 'g'),
        '^(\d+)d(\d+)((?:kh|kl|dh|dl)\d*)?(?:[+-]\d+)?$')) AS m
  ),
  calc AS (
    SELECT
      (m[1])::INTEGER AS count,
      (m[2])::INTEGER AS sides,
      m[3] AS keepdrop
    FROM parsed
    WHERE m IS NOT NULL
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
      (p_total - p_modifier) AS natural_die
    FROM calc
  ),
  crit AS (
    SELECT CASE
      WHEN kept_count = 1 AND sides = 20 AND natural_die = 20 THEN E'\n\n**Critical Success**'
      WHEN kept_count = 1 AND sides = 20 AND natural_die = 1 THEN E'\n\n**Critical Failure**'
      ELSE ''
    END AS label
    FROM kept
  ),
  breakdown AS (
    SELECT
      array_length(p_rolls, 1) IS NOT NULL
        AND coalesce((SELECT sum(x) FROM unnest(p_rolls) AS x), 0) + p_modifier = p_total
        AND (p_modifier <> 0 OR array_length(p_rolls, 1) > 1) AS show_breakdown
  )
  SELECT
    CASE
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