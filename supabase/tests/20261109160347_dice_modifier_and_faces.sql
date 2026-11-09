-- Issue #796: dice notation modifiers are no longer clamped to the game
-- system's character-attribute bounds, and rolled faces are wrapped in inline
-- code so the client can box the die apart from the modifier and total.
--
-- Locks:
--   * the modifier grammar accepts 1-4 digits (±9999) and rejects longer ones,
--     mirroring src/features/dice/parser.ts;
--   * roll_dice keeps +6 in a plain `chat` channel AND in a `shadowdark`
--     channel (the regression: both used to store 5 / 4);
--   * build_dice_content wraps faces in backticks for sums and ADV/DIS, while
--     terse single-die, pool, and success rolls keep their existing shapes.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(29);

-- ===== 1. Grammar: modifier digits =====
SELECT is(
  parse_dice_notation('1d20+6')->>'modifier',
  '6',
  'single notation keeps a +6 modifier'
);
SELECT is(
  parse_dice_notation('2d6+1d8+12')->>'modifier',
  '12',
  'chain keeps a two-digit modifier'
);
SELECT is(
  (parse_dice_notation('1d20+10000')->>'valid')::boolean,
  false,
  'five-digit modifier is rejected, not truncated'
);
SELECT is(
  (parse_dice_notation('2d6+1d8+10000')->>'valid')::boolean,
  false,
  'five-digit chain modifier is rejected'
);

-- Both signs and the 3/4-digit forms are accepted (single and chain).
SELECT is(parse_dice_notation('1d20+123')->>'modifier', '123', 'three-digit modifier is accepted');
SELECT is(parse_dice_notation('1d20-1234')->>'modifier', '-1234', 'four-digit negative modifier is accepted');
SELECT is(parse_dice_notation('2d6+1d8+123')->>'modifier', '123', 'three-digit chain modifier is accepted');
SELECT is(parse_dice_notation('2d6+1d8-1234')->>'modifier', '-1234', 'four-digit negative chain modifier is accepted');

-- ===== 2. Content: faces are wrapped, other shapes unchanged =====
SELECT is(
  build_dice_content('1d20+6', '{6}', 6, 12),
  'Rolled 1d20+6: `6` + 6 = **12**',
  'sum with modifier boxes the die'
);
SELECT is(
  build_dice_content('2d6', '{3,5}', 0, 8),
  'Rolled 2d6: `3` + `5` = **8**',
  'multi-die sum boxes every kept face'
);
SELECT is(
  build_dice_content('1d20-4', '{15}', -4, 11),
  'Rolled 1d20-4: `15` - 4 = **11**',
  'negative modifier keeps the minus sign and boxes the die'
);
SELECT is(
  build_dice_content('2d20kh1', '{12,5}', 0, 12),
  'Rolled 2d20 with ADV [`12`, `5`]: **12**',
  'advantage boxes both faces inside the bracket list'
);
-- Accepted spacing is normalized, so the ADV branch still matches (#796 review).
SELECT is(
  build_dice_content('2d20 kh1 +6', '{12,5}', 6, 18),
  'Rolled 2d20 with ADV [`12`, `5`]+6: **18**',
  'spaced advantage notation keeps the ADV label and face list'
);
SELECT is(
  build_dice_content('1d20', '{15}', 0, 15),
  'Rolled 1d20: **15**',
  'terse single die is unchanged'
);
SELECT is(
  build_dice_content('5d6p', '{2,5,3,6,1}', 0, 0),
  'Rolled 5d6p: 2, 5, 3, 6, 1',
  'pool faces are unchanged'
);
SELECT is(
  build_dice_content('1d20+5', '{20}', 5, 25),
  'Rolled 1d20+5: `20` + 5 = **25**' || E'\n\n**Critical Success**',
  'modifier breakdown combines with the critical label'
);

-- ===== 3. Integration: roll_dice stores the real modifier =====
-- 07a1 = GM, 07a2 = player.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000079a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test796gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000079a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test796player@example.com', '', now(), '{}', '{}', now(), now());

-- 07b1 = plain channel, 07b2 = Shadowdark channel.
INSERT INTO channels (id, name, gm_id, game_system) VALUES
  ('00000000-0000-0000-0000-0000000079b1', 'Plain Rolls', '00000000-0000-0000-0000-0000000079a1', 'none'),
  ('00000000-0000-0000-0000-0000000079b2', 'Shadowdark Rolls', '00000000-0000-0000-0000-0000000079a1', 'shadowdark');

INSERT INTO channel_members (channel_id, user_id, character_name) VALUES
  ('00000000-0000-0000-0000-0000000079b1', '00000000-0000-0000-0000-0000000079a2', 'Tester'),
  ('00000000-0000-0000-0000-0000000079b2', '00000000-0000-0000-0000-0000000079a2', 'Tester');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000079a2', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000079a2","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM roll_dice('00000000-0000-0000-0000-0000000079b1', '1d20+6')),
  1::bigint,
  'plain channel roll returns one row'
);
SELECT is(
  (SELECT (breakdown->>'modifier')::int FROM dice_rolls
    WHERE channel_id = '00000000-0000-0000-0000-0000000079b1' AND notation = '1d20+6'),
  6,
  'plain channel stores the +6 modifier'
);
SELECT ok(
  (SELECT split_part(m.content, E'\n', 1) = 'Rolled 1d20+6: `' || (dr.result - (dr.breakdown->>'modifier')::int)
        || '` + 6 = **' || dr.result || '**'
    FROM messages m
    JOIN dice_rolls dr ON dr.message_id = m.id
    WHERE dr.channel_id = '00000000-0000-0000-0000-0000000079b1' AND dr.notation = '1d20+6'),
  'plain channel message boxes the die and keeps the modifier'
);
SELECT ok(
  (SELECT (dr.result - (dr.breakdown->>'modifier')::int) BETWEEN 1 AND 20
    FROM dice_rolls dr
    WHERE dr.channel_id = '00000000-0000-0000-0000-0000000079b1' AND dr.notation = '1d20+6'),
  'the stored natural roll is a single d20 face'
);

SELECT is(
  (SELECT count(*) FROM roll_dice('00000000-0000-0000-0000-0000000079b2', '1d20+6')),
  1::bigint,
  'shadowdark roll returns one row'
);
SELECT is(
  (SELECT (breakdown->>'modifier')::int FROM dice_rolls
    WHERE channel_id = '00000000-0000-0000-0000-0000000079b2' AND notation = '1d20+6'),
  6,
  'shadowdark channel also stores +6 instead of clamping to 4'
);
SELECT ok(
  (SELECT dr.result = (dr.breakdown->'rolls'->>0)::int + 6
    FROM dice_rolls dr
    WHERE dr.channel_id = '00000000-0000-0000-0000-0000000079b2' AND dr.notation = '1d20+6'),
  'shadowdark roll total includes the full modifier'
);

SELECT is(
  (SELECT count(*) FROM roll_dice('00000000-0000-0000-0000-0000000079b1', '1d20-7')),
  1::bigint,
  'negative modifier roll returns one row'
);
SELECT is(
  (SELECT (breakdown->>'modifier')::int FROM dice_rolls
    WHERE channel_id = '00000000-0000-0000-0000-0000000079b1' AND notation = '1d20-7'),
  -7,
  'negative modifier is stored, not clamped to -4'
);
SELECT ok(
  (SELECT split_part(m.content, E'\n', 1) = 'Rolled 1d20-7: `' || (dr.result - (dr.breakdown->>'modifier')::int)
        || '` - 7 = **' || dr.result || '**'
    FROM messages m
    JOIN dice_rolls dr ON dr.message_id = m.id
    WHERE dr.channel_id = '00000000-0000-0000-0000-0000000079b1' AND dr.notation = '1d20-7'),
  'negative modifier message boxes the die'
);

-- Replaying the same client_request_id returns the original rows (both the
-- message insert and the roll insert share one exception handler).
CREATE TEMP TABLE first_roll ON COMMIT DROP AS
  SELECT message_id FROM roll_dice('00000000-0000-0000-0000-0000000079b1', '2d6+1', NULL, NULL, NULL, '00000000-0000-0000-0000-0000000079c1');
SELECT is(
  (SELECT message_id FROM roll_dice('00000000-0000-0000-0000-0000000079b1', '2d6+1', NULL, NULL, NULL, '00000000-0000-0000-0000-0000000079c1')),
  (SELECT message_id FROM first_roll),
  'replaying the same client_request_id returns the original message'
);
SELECT is(
  (SELECT count(*) FROM dice_rolls WHERE message_id = (SELECT message_id FROM first_roll)),
  1::bigint,
  'replaying does not create a second dice roll'
);

SELECT throws_ok(
  $$SELECT roll_dice('00000000-0000-0000-0000-0000000079b1', '1d20+10000')$$,
  NULL,
  'roll_dice rejects a five-digit modifier instead of truncating it'
);

SELECT * FROM finish();
ROLLBACK;
