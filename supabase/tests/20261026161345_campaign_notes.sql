-- #762 campaign notes: scope visibility, author-only writes, archived
-- read-only, blocking, length limits, cascade and account-deletion anonymity.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(27);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notesgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notesp1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notesp2@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notesout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code, is_archived)
VALUES
  ('00000000-0000-0000-0000-00000000f001', 'Notes One', '00000000-0000-0000-0000-00000000e001', '0e000001', false),
  ('00000000-0000-0000-0000-00000000f002', 'Notes Archived', '00000000-0000-0000-0000-00000000e001', '0e000002', true),
  ('00000000-0000-0000-0000-00000000f003', 'Notes Cascade', '00000000-0000-0000-0000-00000000e001', '0e000003', false);

INSERT INTO channel_members (id, channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-000000200001', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'GM'),
  ('00000000-0000-0000-0000-000000200002', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'P1'),
  ('00000000-0000-0000-0000-000000200003', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e003', 'P2'),
  ('00000000-0000-0000-0000-000000200004', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e001', 'GM'),
  ('00000000-0000-0000-0000-000000200005', '00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e001', 'GM');

INSERT INTO channel_notes (id, channel_id, author_id, scope, body)
VALUES
  ('00000000-0000-0000-0000-000000300001', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'character', 'p1-private'),
  ('00000000-0000-0000-0000-000000300002', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'party', 'p1-party'),
  ('00000000-0000-0000-0000-000000300003', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e003', 'party', 'p2-party'),
  ('00000000-0000-0000-0000-000000300004', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'gm', 'gm-secret'),
  ('00000000-0000-0000-0000-000000300005', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e001', 'party', 'archived-party'),
  ('00000000-0000-0000-0000-000000300006', '00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e001', 'party', 'cascade-party');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ---- Author reads own character note + every party note ---------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE channel_id = '00000000-0000-0000-0000-00000000f001'),
  3::bigint,
  'a player reads their own character note and all party notes'
);

-- ---- Scope enforcement on insert -------------------------------------------
SELECT throws_ok(
  $$INSERT INTO channel_notes (channel_id, author_id, scope, body)
    VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'gm', 'not allowed')$$,
  '42501', NULL,
  'a player cannot create a GM note'
);

SELECT lives_ok(
  $$INSERT INTO channel_notes (channel_id, author_id, scope, body)
    VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'character', 'my backstory')$$,
  'a player creates their own character note'
);

SELECT lives_ok(
  $$INSERT INTO channel_notes (channel_id, author_id, scope, body)
    VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'party', 'shared clue')$$,
  'a player creates a party note'
);

-- ---- Other player sees party notes, not private character notes ------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE channel_id = '00000000-0000-0000-0000-00000000f001'),
  3::bigint,
  'another player sees the party notes but not the private character note'
);

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE channel_id = '00000000-0000-0000-0000-00000000f001' AND scope = 'gm'),
  0::bigint,
  'a player cannot read GM notes'
);

UPDATE channel_notes SET body = 'hijacked'
WHERE id = '00000000-0000-0000-0000-000000300002';

SELECT is(
  (SELECT count(*) FROM channel_notes
   WHERE id = '00000000-0000-0000-0000-000000300002' AND body = 'hijacked'),
  0::bigint,
  'another player cannot edit a note'
);

DELETE FROM channel_notes
WHERE id = '00000000-0000-0000-0000-000000300002';

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE id = '00000000-0000-0000-0000-000000300002'),
  1::bigint,
  'another player cannot delete a note'
);

-- ---- GM reads every scope and writes GM notes -------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE channel_id = '00000000-0000-0000-0000-00000000f001'),
  6::bigint,
  'the GM reads character, party and GM notes'
);

SELECT lives_ok(
  $$INSERT INTO channel_notes (channel_id, author_id, scope, body)
    VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'gm', 'the trap is in room two')$$,
  'the GM creates a GM note'
);

SELECT is(
  (SELECT count(*) FROM channel_notes
   WHERE channel_id = '00000000-0000-0000-0000-00000000f001'
     AND scope = 'character'
     AND author_id = '00000000-0000-0000-0000-00000000e002'),
  2::bigint,
  'the GM reads every player character note'
);

-- ---- Author updates and deletes; scope/channel immutable --------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e002', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);

SELECT lives_ok(
  $$UPDATE channel_notes SET body = 'p1-party-edited'
    WHERE id = '00000000-0000-0000-0000-000000300002'$$,
  'an author edits their own note'
);

SELECT throws_ok(
  $$UPDATE channel_notes SET scope = 'character'
    WHERE id = '00000000-0000-0000-0000-000000300002'$$,
  'P0001', NULL,
  'a note cannot be promoted from party to character'
);

DELETE FROM channel_notes
WHERE id = '00000000-0000-0000-0000-000000300001';

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE id = '00000000-0000-0000-0000-000000300001'),
  0::bigint,
  'an author deletes their own note'
);

-- ---- Body constraints -------------------------------------------------------
SELECT throws_ok(
  $$INSERT INTO channel_notes (channel_id, author_id, scope, body)
    VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'party', E'\n\t ')$$,
  '23514', NULL,
  'a whitespace-only note is rejected'
);

SELECT throws_ok(
  $$INSERT INTO channel_notes (channel_id, author_id, scope, body)
    VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'party', repeat('x', 4001))$$,
  '23514', NULL,
  'a note over 4000 characters is rejected'
);

-- ---- Archived channel is read-only -----------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e001', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);

SELECT throws_ok(
  $$INSERT INTO channel_notes (channel_id, author_id, scope, body)
    VALUES ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e001', 'gm', 'archived write')$$,
  '42501', NULL,
  'an archived channel rejects new notes'
);

UPDATE channel_notes SET body = 'archived edit'
WHERE id = '00000000-0000-0000-0000-000000300005';

SELECT is(
  (SELECT count(*) FROM channel_notes
   WHERE id = '00000000-0000-0000-0000-000000300005' AND body = 'archived edit'),
  0::bigint,
  'an archived channel rejects note edits'
);

DELETE FROM channel_notes
WHERE id = '00000000-0000-0000-0000-000000300005';

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE id = '00000000-0000-0000-0000-000000300005'),
  1::bigint,
  'an archived channel rejects note deletes'
);

SELECT throws_ok(
  $$UPDATE channel_notes SET channel_id = '00000000-0000-0000-0000-00000000f003'
    WHERE id = '00000000-0000-0000-0000-000000300004'$$,
  'P0001', NULL,
  'a note cannot be moved to another channel'
);

-- ---- Blocking ---------------------------------------------------------------
SELECT lives_ok(
  $$UPDATE channel_members SET is_blocked = true
    WHERE channel_id = '00000000-0000-0000-0000-00000000f001'
      AND user_id = '00000000-0000-0000-0000-00000000e003'$$,
  'the GM can block a member'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e003', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE channel_id = '00000000-0000-0000-0000-00000000f001'),
  0::bigint,
  'a blocked member loses note access'
);

SELECT throws_ok(
  $$INSERT INTO channel_notes (channel_id, author_id, scope, body)
    VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e003', 'party', 'blocked write')$$,
  '42501', NULL,
  'a blocked member cannot add notes'
);

-- ---- Outsider ---------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e004', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e004","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE channel_id = '00000000-0000-0000-0000-00000000f001'),
  0::bigint,
  'a non-member cannot read notes'
);

SELECT throws_ok(
  $$INSERT INTO channel_notes (channel_id, author_id, scope, body)
    VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e004', 'party', 'outsider write')$$,
  '42501', NULL,
  'a non-member cannot add notes'
);

-- ---- Cascades and account deletion -----------------------------------------
RESET ROLE;

DELETE FROM channels WHERE id = '00000000-0000-0000-0000-00000000f003';

SELECT is(
  (SELECT count(*) FROM channel_notes WHERE channel_id = '00000000-0000-0000-0000-00000000f003'),
  0::bigint,
  'deleting a channel removes its notes'
);

DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-00000000e002';

SELECT ok(
  EXISTS (
    SELECT 1 FROM channel_notes
    WHERE scope = 'party' AND author_id IS NULL
      AND channel_id = '00000000-0000-0000-0000-00000000f001'
  ),
  'account deletion anonymises shared notes without deleting them'
);

SELECT * FROM finish();
ROLLBACK;
