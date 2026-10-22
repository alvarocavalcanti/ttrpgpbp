-- #752: update_channel_status is per-room. Main (NULL room) keeps writing
-- channels.status_text and posting in Main; a named room writes
-- sub_channels.status_text and posts the note into that room. Covers the happy
-- paths, the no-op re-save, clearing, per-room isolation, the non-GM and
-- suspended gates, cross-channel room ids, archived channels, the length cap,
-- and that a GM-only room's status never leaks to a player.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(26);

-- ===== Seed =====
-- 0752…0001 = GM, …0002 = player, …0003 = suspended user
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000075201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm752@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000075202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'player752@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000075203', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'suspended752@test.com', '', now(), '{}', '{}', now(), now());
UPDATE profiles SET is_suspended = true WHERE id = '00000000-0000-0000-0000-000000075203';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-000000075211', 'Room Status', '00000000-0000-0000-0000-000000075201', 'a7521001'),
  ('00000000-0000-0000-0000-000000075212', 'Other Channel', '00000000-0000-0000-0000-000000075201', 'a7521002');

INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-000000075211', '00000000-0000-0000-0000-000000075201', 'GM'),
  ('00000000-0000-0000-0000-000000075211', '00000000-0000-0000-0000-000000075202', 'Hero'),
  ('00000000-0000-0000-0000-000000075212', '00000000-0000-0000-0000-000000075201', 'GM');

-- R1 = visible room, R2 = GM-only room (visibility leak check), RX = another
-- channel's room (cross-channel write check).
INSERT INTO sub_channels (id, channel_id, name, created_by)
VALUES
  ('00000000-0000-0000-0000-000000075221', '00000000-0000-0000-0000-000000075211', 'R1', '00000000-0000-0000-0000-000000075201'),
  ('00000000-0000-0000-0000-000000075222', '00000000-0000-0000-0000-000000075211', 'R2', '00000000-0000-0000-0000-000000075201'),
  ('00000000-0000-0000-0000-000000075223', '00000000-0000-0000-0000-000000075212', 'RX', '00000000-0000-0000-0000-000000075201');
UPDATE sub_channels SET visibility = 'gm' WHERE id = '00000000-0000-0000-0000-000000075222';

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ===== 1. Main keeps today's behaviour (2-arg call still valid) =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000075201', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000075201","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000075211', 'Main status')$$,
  'the GM can still update the Main status with two arguments'
);
SELECT is(
  (SELECT status_text FROM channels WHERE id = '00000000-0000-0000-0000-000000075211'),
  'Main status',
  'Main writes channels.status_text'
);
SELECT is(
  (SELECT count(*) FROM messages
    WHERE channel_id = '00000000-0000-0000-0000-000000075211' AND type = 'system' AND sub_channel_id IS NULL),
  1::bigint,
  'the Main announcement stays in Main'
);

-- ===== 2. A room owns its own status and its own announcement =====
SELECT lives_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000075211', 'Room one', '00000000-0000-0000-0000-000000075221')$$,
  'the GM can update a room status'
);
SELECT is(
  (SELECT status_text FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000075221'),
  'Room one',
  'the room status is persisted on sub_channels'
);
SELECT is(
  (SELECT status_text FROM channels WHERE id = '00000000-0000-0000-0000-000000075211'),
  'Main status',
  'a room write does not touch the Main status'
);
SELECT is(
  (SELECT count(*) FROM messages
    WHERE channel_id = '00000000-0000-0000-0000-000000075211'
      AND type = 'system' AND sub_channel_id = '00000000-0000-0000-0000-000000075221'),
  1::bigint,
  'one announcement is posted into the room'
);
SELECT is(
  (SELECT content FROM messages
    WHERE channel_id = '00000000-0000-0000-0000-000000075211'
      AND type = 'system' AND sub_channel_id = '00000000-0000-0000-0000-000000075221'),
  'The GM updated the channel status.',
  'the room announcement keeps the generic copy'
);
SELECT is(
  (SELECT count(*) FROM messages
    WHERE channel_id = '00000000-0000-0000-0000-000000075211' AND type = 'system' AND sub_channel_id IS NULL),
  1::bigint,
  'the room write adds nothing to Main'
);

-- ===== 3. Re-saving the same room text is a no-op =====
SELECT lives_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000075211', 'Room one', '00000000-0000-0000-0000-000000075221')$$,
  're-saving identical room text succeeds'
);
SELECT is(
  (SELECT count(*) FROM messages
    WHERE channel_id = '00000000-0000-0000-0000-000000075211'
      AND type = 'system' AND sub_channel_id = '00000000-0000-0000-0000-000000075221'),
  1::bigint,
  'an unchanged room status posts no extra message'
);

-- ===== 4. Clearing a room status counts as a change =====
SELECT lives_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000075211', '   ', '00000000-0000-0000-0000-000000075221')$$,
  'a whitespace-only room status is accepted'
);
SELECT is(
  (SELECT status_text FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000075221'),
  NULL,
  'a blank room status is stored as NULL'
);
SELECT is(
  (SELECT count(*) FROM messages
    WHERE channel_id = '00000000-0000-0000-0000-000000075211'
      AND type = 'system' AND sub_channel_id = '00000000-0000-0000-0000-000000075221'),
  2::bigint,
  'clearing the room status posts one more message'
);

-- ===== 5. Rooms are independent =====
SELECT is(
  (SELECT status_text FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000075222'),
  NULL,
  'the other room keeps its own (empty) status'
);

-- ===== 6. A non-GM cannot write a room status =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000075202', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000075202","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000075211', 'hacked', '00000000-0000-0000-0000-000000075221')$$,
  NULL,
  'a non-GM cannot update a room status'
);
SELECT is(
  (SELECT status_text FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000075221'),
  NULL,
  'the non-GM attempt changed nothing'
);

-- ===== 7. A room from another channel is rejected =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000075201', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000075201","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000075211', 'crossed', '00000000-0000-0000-0000-000000075223')$$,
  NULL,
  'Room not found in this channel.',
  'a room from another channel is rejected by name'
);
SELECT is(
  (SELECT status_text FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000075223'),
  NULL,
  'the other channel''s room is untouched'
);

-- ===== 8. A suspended user is blocked =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000075203', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000075203","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000075211', 'from suspended', '00000000-0000-0000-0000-000000075221')$$,
  NULL,
  'Account suspended.',
  'a suspended user cannot update a room status'
);

-- ===== 9. Archived channels stay editable (matches Main / settings) =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000075201', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000075201","role":"authenticated"}', true);
UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-000000075212';
SELECT lives_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000075212', 'Archived room status', '00000000-0000-0000-0000-000000075223')$$,
  'the GM can still update a room status on an archived channel'
);
SELECT is(
  (SELECT status_text FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000075223'),
  'Archived room status',
  'the archived channel room status is persisted'
);

-- ===== 10. The length cap is enforced at the DB boundary =====
SELECT throws_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000075211', repeat('x', 2001), '00000000-0000-0000-0000-000000075221')$$,
  NULL,
  'a room status over 2000 characters is rejected'
);
SELECT is(
  (SELECT status_text FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000075221'),
  NULL,
  'the rejected oversized status changed nothing'
);

-- ===== 11. A GM-only room's status never leaks to a player =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000075202', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000075202","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000075221'),
  1::bigint,
  'a member can read an open room row (and its status)'
);
SELECT is(
  (SELECT count(*) FROM sub_channels WHERE id = '00000000-0000-0000-0000-000000075222'),
  0::bigint,
  'a GM-only room row is invisible, so its status never leaks'
);

SELECT * FROM finish();
ROLLBACK;
