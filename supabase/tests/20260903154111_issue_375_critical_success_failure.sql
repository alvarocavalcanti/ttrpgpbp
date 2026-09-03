-- Issue #375: Critical Success / Critical Failure on d20 rolls.
--
-- build_dice_content is deterministic (no RNG, no auth), so the crit rules are
-- locked here directly. The label must appear on a natural d20 of 20 or 1,
-- survive modifiers, apply to ADV (2d20kh1) / DIS (2d20kl1), and never fire on
-- mid rolls, non-d20 dice, or multi-kept d20 rolls (2d20kh2 summing to 20).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(14);

-- Crit success on a natural 20
SELECT ok(
  build_dice_content('1d20', '{20}', 0, 20) LIKE '%**Critical Success**%',
  'plain nat 20 shows Critical Success'
);
-- Crit failure on a natural 1
SELECT ok(
  build_dice_content('1d20', '{1}', 0, 1) LIKE '%**Critical Failure**%',
  'plain nat 1 shows Critical Failure'
);
-- Natural die is independent of the modifier
SELECT ok(
  build_dice_content('1d20+5', '{20}', 5, 25) LIKE '%**Critical Success**%',
  'nat 20 with +5 modifier shows Critical Success'
);
SELECT ok(
  build_dice_content('1d20-4', '{1}', -4, -3) LIKE '%**Critical Failure**%',
  'nat 1 with -4 modifier shows Critical Failure'
);
-- ADV / DIS keep the higher / lower die
SELECT ok(
  build_dice_content('2d20kh1', '{12,20}', 0, 20) LIKE '%**Critical Success**%',
  'advantage keeping a 20 shows Critical Success'
);
SELECT ok(
  build_dice_content('2d20kl1', '{20,1}', 0, 1) LIKE '%**Critical Failure**%',
  'disadvantage keeping a 1 shows Critical Failure'
);
-- No crit on mid rolls or modifier-only totals
SELECT ok(
  build_dice_content('1d20', '{15}', 0, 15) NOT LIKE '%**Critical%',
  'mid d20 roll shows no critical label'
);
SELECT ok(
  build_dice_content('1d20', '{10}', 3, 13) NOT LIKE '%**Critical%',
  'modifier pushing total to 13 shows no critical label'
);
-- ADV without a natural 20 is not a crit
SELECT ok(
  build_dice_content('2d20kh1', '{12,5}', 0, 12) NOT LIKE '%**Critical%',
  'advantage with no natural 20 shows no critical label'
);
-- Two kept d20 dice summing to 20 is not a crit (guard)
SELECT ok(
  build_dice_content('2d20kh2', '{10,10}', 0, 20) NOT LIKE '%**Critical%',
  'two kept d20 dice summing to 20 shows no critical label'
);
-- Non-d20 rolls never crit
SELECT ok(
  build_dice_content('2d6', '{6,6}', 0, 12) NOT LIKE '%**Critical%',
  '2d6 roll shows no critical label'
);
SELECT ok(
  build_dice_content('1d6', '{6}', 0, 6) NOT LIKE '%**Critical%',
  'single d6 max roll shows no critical label'
);
-- Non-crit format stays byte-identical (ADV breakdown preserved)
SELECT is(
  build_dice_content('2d20kh1', '{12,5}', 0, 12),
  'Rolled 2d20 with ADV [12, 5]: **12**',
  'non-crit advantage roll keeps the existing format'
);
-- Non-crit plain format stays byte-identical
SELECT is(
  build_dice_content('1d20', '{15}', 0, 15),
  'Rolled 1d20: **15**',
  'non-crit plain roll keeps the existing format'
);

SELECT * FROM finish();
ROLLBACK;