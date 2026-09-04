-- Issue #397: plain (non-ADV/DIS) roll messages break down into dice +
-- modifier = total. build_dice_content is deterministic (no RNG, no auth), so
-- the exact copy contract is locked here.
--
-- Rules locked:
--   * modifier rolls break down:  `Rolled 1d20+3: 10 + 3 = **13**`
--   * multi-die no-modifier rolls break down: `Rolled 2d6: 3 + 5 = **8**`
--   * a single no-modifier die stays terse: `Rolled 1d20: **15**`
--   * dropped-die rolls (dh/dl) never show a wrong breakdown: fall back to
--     the plain total.
--   * ADV/DIS and Critical labels are unchanged.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(9);

-- Modifier rolls break down into kept dice + modifier = total.
SELECT is(
  build_dice_content('1d20+3', '{10}', 3, 13),
  'Rolled 1d20+3: 10 + 3 = **13**',
  'single die with positive modifier shows breakdown'
);
SELECT is(
  build_dice_content('2d6+2', '{3,5}', 2, 10),
  'Rolled 2d6+2: 3 + 5 + 2 = **10**',
  'multi-die with modifier shows summed breakdown'
);
SELECT is(
  build_dice_content('1d20-4', '{15}', -4, 11),
  'Rolled 1d20-4: 15 - 4 = **11**',
  'negative modifier breaks down with a minus sign'
);

-- Multi-die no-modifier rolls break down too.
SELECT is(
  build_dice_content('2d6', '{3,5}', 0, 8),
  'Rolled 2d6: 3 + 5 = **8**',
  'multi-die no-modifier roll breaks down'
);

-- A single no-modifier die keeps the terse total format.
SELECT is(
  build_dice_content('1d20', '{15}', 0, 15),
  'Rolled 1d20: **15**',
  'single no-modifier die stays terse'
);

-- A modifier roll that also crits breaks down AND keeps the critical label.
SELECT is(
  build_dice_content('1d20+5', '{20}', 5, 25),
  'Rolled 1d20+5: 20 + 5 = **25**' || E'\n\n**Critical Success**',
  'modifier breakdown combines with the critical success label'
);

-- Dropped-die rolls (dh/dl) never show a wrong breakdown: the guard compares
-- sum(all rolls) + modifier against the total, which only matches when no die
-- was dropped. Here sum(3,5,2,4) + 0 = 14 != 12, so it falls back.
SELECT is(
  build_dice_content('4d6dl1', '{3,5,2,4}', 0, 12),
  'Rolled 4d6dl1: **12**',
  'dropped-die roll falls back to the plain total'
);

-- ADV/DIS breakdown format is unchanged.
SELECT is(
  build_dice_content('2d20kh1', '{12,5}', 0, 12),
  'Rolled 2d20 with ADV [12, 5]: **12**',
  'advantage keeps the existing ADV breakdown'
);
SELECT is(
  build_dice_content('2d20kl1', '{15,5}', 0, 5),
  'Rolled 2d20 with DIS [15, 5]: **5**',
  'disadvantage keeps the existing DIS breakdown'
);

SELECT * FROM finish();
ROLLBACK;