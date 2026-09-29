-- Issue #614: dice pools. Locks the parse_dice_notation contract and the new
-- build_dice_content pool/success branches. Both are deterministic (no RNG,
-- no auth), so the exact contracts are locked here. The pre-existing sum
-- behavior is locked by 20260904151600_issue_397_roll_breakdown.sql and must
-- stay green untouched.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(22);

-- Raw pool parses, keeps no modifier/keepdrop, reports no target.
SELECT is(
  parse_dice_notation('5d6p'),
  '{"valid": true, "count": 5, "sides": 6, "keepdrop": "", "mode": "pool", "target": null, "modifier": 0}'::jsonb,
  'raw pool parses with pool mode and no target'
);

-- Success pools parse with their target.
SELECT is(
  parse_dice_notation('5d6>=4'),
  '{"valid": true, "count": 5, "sides": 6, "keepdrop": "", "mode": "successes", "target": 4, "modifier": 0}'::jsonb,
  'success pool parses with its target'
);

-- Plain sums still parse as sum.
SELECT is(
  parse_dice_notation('2d20kh1+3'),
  '{"valid": true, "count": 2, "sides": 20, "keepdrop": "kh1", "mode": "sum", "target": null, "modifier": 3}'::jsonb,
  'advantage sum still parses as sum mode'
);

-- Notation is case- and space-insensitive like the old regex.
SELECT is(
  parse_dice_notation(' 5D6 >= 4 ')->>'mode',
  'successes',
  'success pool parses case- and space-insensitively'
);

-- Ambiguous combinations are rejected, not guessed.
SELECT is(
  (parse_dice_notation('5d6p+2')->>'valid')::boolean,
  false,
  'pool with a modifier is invalid'
);
SELECT is(
  (parse_dice_notation('5d6kh1p')->>'valid')::boolean,
  false,
  'pool with keep/drop is invalid'
);
SELECT is(
  (parse_dice_notation('5d6>=4p')->>'valid')::boolean,
  false,
  'success target combined with pool flag is invalid'
);
SELECT is(
  (parse_dice_notation('5d6kh1>=4')->>'valid')::boolean,
  false,
  'success target combined with keep/drop is invalid'
);
SELECT is(
  (parse_dice_notation('5d6>=4+2')->>'valid')::boolean,
  false,
  'success target combined with a modifier is invalid'
);

-- The target must be a reachable face.
SELECT is(
  (parse_dice_notation('5d6>=0')->>'valid')::boolean,
  false,
  'target below 1 is invalid'
);
SELECT is(
  (parse_dice_notation('5d6>=7')->>'valid')::boolean,
  false,
  'target above the die size is invalid'
);
SELECT is(
  (parse_dice_notation('5d6>=')->>'valid')::boolean,
  false,
  'bare >= is invalid'
);

-- Garbage stays garbage.
SELECT is(
  (parse_dice_notation('banana')->>'valid')::boolean,
  false,
  'non-notation is invalid'
);
SELECT is(
  (parse_dice_notation('5d6x')->>'valid')::boolean,
  false,
  'unknown suffix is invalid'
);

-- Raw pool content lists every face and shows no total.
SELECT is(
  build_dice_content('5d6p', '{2,5,3,6,1}', 0, 0),
  'Rolled 5d6p: 2, 5, 3, 6, 1',
  'raw pool lists faces with no total'
);

-- Success content lists faces plus the derived count, no sum.
SELECT is(
  build_dice_content('5d6>=4', '{2,5,3,6,1}', 0, 2),
  'Rolled 5d6>=4: 2, 5, 3, 6, 1 — **2 successes (≥4)**',
  'success pool lists faces with the success count'
);
SELECT is(
  build_dice_content('5d6>=6', '{2,5,3,2,1}', 0, 0),
  'Rolled 5d6>=6: 2, 5, 3, 2, 1 — **0 successes (≥6)**',
  'zero successes reads explicitly'
);
SELECT is(
  build_dice_content('3d10>=8', '{8,9,10}', 0, 3),
  'Rolled 3d10>=8: 8, 9, 10 — **3 successes (≥8)**',
  'all-success pool counts every face'
);

-- Pools never crit, even on a natural 20 / 1.
SELECT is(
  build_dice_content('1d20p', '{20}', 0, 0),
  'Rolled 1d20p: 20',
  'raw pool on a natural 20 gets no critical label'
);
SELECT is(
  build_dice_content('2d20>=10', '{1,20}', 0, 1),
  'Rolled 2d20>=10: 1, 20 — **1 successes (≥10)**',
  'success pool gets no critical label'
);

-- Sum behavior is untouched (one representative each, full matrix lives in
-- the #397 test).
SELECT is(
  build_dice_content('2d6', '{3,5}', 0, 8),
  'Rolled 2d6: 3 + 5 = **8**',
  'plain sum breakdown unchanged'
);
SELECT is(
  build_dice_content('1d20+5', '{20}', 5, 25),
  'Rolled 1d20+5: 20 + 5 = **25**' || E'\n\n**Critical Success**',
  'sum crit label unchanged'
);

SELECT * FROM finish();
ROLLBACK;
