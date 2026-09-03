-- Issue #375: show Critical Success / Critical Failure on d20 rolls.
--
-- build_dice_content is the canonical roll-message formatter used by
-- roll_dice_unchecked. Re-define it to append a bold **Critical Success**
-- when a d20's natural die is 20, or **Critical Failure** when it is 1. The
-- natural die is the unmodified kept die (total - modifier), which for ADV/DIS
-- (2d20kh1 / 2d20kl1) is the higher / lower kept die. A crit only applies to
-- a d20 with exactly one kept die, so multi-kept d20 rolls (e.g. 2d20kh2) and
-- non-d20 rolls are never flagged.

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
      (regexp_match(lower(p_notation), '^(\d+)d(\d+)((?:kh|kl|dh|dl)\d*)?(?:[+-]\d+)?$')) AS m
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
      CASE
        WHEN keepdrop IS NULL OR keepdrop = '' THEN count
        WHEN keepdrop ~* '^(kh|kl)' THEN COALESCE(NULLIF(substring(keepdrop FROM 3), '')::INTEGER, 1)
        ELSE count - COALESCE(NULLIF(substring(keepdrop FROM 3), '')::INTEGER, 1)
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
      ELSE
        'Rolled ' || p_notation || ': **' || p_total || '**'
    END
    || COALESCE((SELECT label FROM crit), '');
$$;