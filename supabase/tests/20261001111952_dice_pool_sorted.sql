-- Issue #623: sorted dice pools. Locks the `s` suffix contract: valid on
-- raw pools (`ps`) and success pools (`>=Ts`), invalid everywhere else, and
-- `sorted: true` appearing only when the flag is present so unsorted
-- notations keep their exact legacy JSON. Both branches sort faces
-- highest-first; build_dice_content only prints given order, so its sorted
-- expectations pass it pre-sorted input (the sort lives in
-- roll_dice_unchecked).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(11);

-- Sorted raw pool parses as pool with the sorted flag.
SELECT is(
  parse_dice_notation('5d6ps'),
  '{"valid": true, "count": 5, "sides": 6, "keepdrop": "", "mode": "pool", "target": null, "modifier": 0, "sorted": true}'::jsonb,
  'sorted raw pool parses with pool mode and the sorted flag'
);

-- Sorted success pool parses with target and the sorted flag.
SELECT is(
  parse_dice_notation('5d6>=4s'),
  '{"valid": true, "count": 5, "sides": 6, "keepdrop": "", "mode": "successes", "target": 4, "modifier": 0, "sorted": true}'::jsonb,
  'sorted success pool parses with its target and the sorted flag'
);

-- Unsorted notations keep their exact shape: no `sorted` key appears.
SELECT is(
  parse_dice_notation('5d6p'),
  '{"valid": true, "count": 5, "sides": 6, "keepdrop": "", "mode": "pool", "target": null, "modifier": 0}'::jsonb,
  'unsorted pool carries no sorted key'
);
SELECT is(
  parse_dice_notation('5d6>=4'),
  '{"valid": true, "count": 5, "sides": 6, "keepdrop": "", "mode": "successes", "target": 4, "modifier": 0}'::jsonb,
  'unsorted success pool carries no sorted key'
);

-- `s` on a bare sum is meaningless: rejected instead of guessing.
SELECT is(
  (parse_dice_notation('5d6s')->>'valid')::boolean,
  false,
  'bare sort flag without a pool mode is invalid'
);

-- Pools carry no modifier, so sorting plus a modifier stays invalid.
SELECT is(
  (parse_dice_notation('5d6ps+2')->>'valid')::boolean,
  false,
  'sorted pool with a modifier is invalid'
);

-- `p` and `>=` never combine, sorted or not.
SELECT is(
  (parse_dice_notation('5d6ps>=4')->>'valid')::boolean,
  false,
  'sorted pool with a target is invalid'
);
SELECT is(
  (parse_dice_notation('5d6>=4ps')->>'valid')::boolean,
  false,
  'success pool with a pool flag is invalid'
);

-- keep/drop never combines with a pool mode, sorted or not.
SELECT is(
  (parse_dice_notation('5d6kh1ps')->>'valid')::boolean,
  false,
  'sorted pool with keep/drop is invalid'
);

-- Sorted pool content lists faces highest-first with no total.
SELECT is(
  build_dice_content('5d6ps', '{6,5,3,2,1}', 0, 0),
  'Rolled 5d6ps: 6, 5, 3, 2, 1',
  'sorted raw pool lists faces highest-first with no total'
);

-- Sorted success content lists faces highest-first plus the derived count.
SELECT is(
  build_dice_content('5d6>=4s', '{6,5,3,2,1}', 0, 2),
  'Rolled 5d6>=4s: 6, 5, 3, 2, 1 — **2 successes (≥4)**',
  'sorted success pool lists faces highest-first with the success count'
);

SELECT * FROM finish();
ROLLBACK;
