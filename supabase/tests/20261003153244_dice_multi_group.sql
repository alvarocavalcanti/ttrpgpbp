-- Issue #622/#629: chained dice groups. Locks the contract that a sum may
-- combine several dice types, each group keeps/drops on its own, and the
-- single trailing modifier applies to the whole chain. Single-group notations
-- must keep their exact legacy JSON (no `groups` key), and a chained sum must
-- never show a critical label even when its total happens to be 20.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(10);

-- A chain parses into groups plus a shared modifier.
SELECT is(
  parse_dice_notation('2d8+1d6+2'),
  '{"valid": true, "count": 2, "sides": 8, "keepdrop": "", "mode": "sum", "target": null, "modifier": 2, "groups": [{"count": 2, "sides": 8, "keepdrop": ""}, {"count": 1, "sides": 6, "keepdrop": ""}]}'::jsonb,
  'chained sum parses into groups with the trailing modifier'
);

-- The trailing modifier may be negative and applies to the whole chain.
SELECT is(
  parse_dice_notation('1d20+2d6-3')->>'modifier',
  '-3',
  'negative chain modifier is kept'
);

-- Keep/drop is carried per group.
SELECT is(
  parse_dice_notation('2d20kh1+1d8')->'groups'->0->>'keepdrop',
  'kh1',
  'keep/drop is per group'
);

-- Single-group notations must not grow a `groups` key.
SELECT is(
  parse_dice_notation('5d6') ? 'groups',
  false,
  'single-group notation keeps its legacy JSON shape'
);

-- Dice are only ever added between groups.
SELECT is(
  (parse_dice_notation('2d6-1d8')->>'valid')::boolean,
  false,
  'subtracting a group is invalid'
);

-- Pools stay a single group and never chain.
SELECT is(
  (parse_dice_notation('2d6p+1d8')->>'valid')::boolean,
  false,
  'chaining a pool is invalid'
);

-- A chained sum breaks its dice down flat, group order preserved.
SELECT is(
  build_dice_content('2d6+1d8+3', '{4,2,6}', 3, 15),
  'Rolled 2d6+1d8+3: 4 + 2 + 6 + 3 = **15**',
  'chained sum prints a flat breakdown'
);

-- A chained sum never crits, even when its total lands on 20.
SELECT is(
  build_dice_content('1d20+1d6', '{14,6}', 0, 20),
  'Rolled 1d20+1d6: 14 + 6 = **20**',
  'chained sum with a natural-20 total shows no critical label'
);

-- A single d20 still crits.
SELECT is(
  build_dice_content('1d20', '{20}', 0, 20),
  E'Rolled 1d20: **20**\n\n**Critical Success**',
  'single d20 still shows the critical label'
);

-- A chained sum with no modifier still breaks down when it has more than one die.
SELECT is(
  build_dice_content('2d6+1d8', '{3,5,1}', 0, 9),
  'Rolled 2d6+1d8: 3 + 5 + 1 = **9**',
  'chained sum breaks down without a modifier'
);

SELECT * FROM finish();
ROLLBACK;
