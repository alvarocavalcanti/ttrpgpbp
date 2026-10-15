-- #621 Phase 4: the roll history reports the room a roll was made in.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(2);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rollgm@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-00000000d201', 'Rolls', '00000000-0000-0000-0000-00000000d101', 'fab00002');

INSERT INTO channel_members (id, channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000d101', 'Hero');

INSERT INTO sub_channels (id, channel_id, name, created_by)
VALUES ('00000000-0000-0000-0000-00000000d401', '00000000-0000-0000-0000-00000000d201', 'OOC', '00000000-0000-0000-0000-00000000d101');

INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-00000000d501', '00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000d101', 'regular', 'main');

INSERT INTO messages (id, channel_id, sender_id, type, content, sub_channel_id)
VALUES ('00000000-0000-0000-0000-00000000d502', '00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000d101', 'dice_roll', 'rolled', '00000000-0000-0000-0000-00000000d401');

INSERT INTO dice_rolls (message_id, channel_id, roller_id, notation, result, breakdown)
VALUES ('00000000-0000-0000-0000-00000000d501', '00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000d101', '1d20', 5, '{}'::jsonb);

INSERT INTO dice_rolls (message_id, channel_id, roller_id, notation, result, breakdown)
VALUES ('00000000-0000-0000-0000-00000000d502', '00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000d101', '1d6', 3, '{}'::jsonb);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d101","role":"authenticated"}', true);

SELECT is(
  (SELECT sub_channel_name FROM get_channel_roll_history('00000000-0000-0000-0000-00000000d201') WHERE notation = '1d6'),
  'OOC',
  'A room roll reports its room name'
);

SELECT is(
  (SELECT sub_channel_name FROM get_channel_roll_history('00000000-0000-0000-0000-00000000d201') WHERE notation = '1d20'),
  NULL,
  'A Main roll reports no room'
);

SELECT * FROM finish();
ROLLBACK;
