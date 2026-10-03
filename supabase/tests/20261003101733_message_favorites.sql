BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(7);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfgm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfp1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfp2@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfout@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-000000000410', 'Favorites One', '00000000-0000-0000-0000-000000000400', 'abcdef12'),
  ('00000000-0000-0000-0000-000000000411', 'Favorites Two', '00000000-0000-0000-0000-000000000400', 'abcdef34');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000420', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000400', 'GM', now()),
  ('00000000-0000-0000-0000-000000000421', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'P1', now()),
  ('00000000-0000-0000-0000-000000000422', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000402', 'P2', now()),
  ('00000000-0000-0000-0000-000000000423', '00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000400', 'GM2', now());

INSERT INTO messages (id, channel_id, sender_id, type, content, whisper_to)
VALUES
  ('00000000-0000-0000-0000-000000000430', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'regular', 'hello', NULL),
  ('00000000-0000-0000-0000-000000000431', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'regular', 'psst', '00000000-0000-0000-0000-000000000400'),
  ('00000000-0000-0000-0000-000000000432', '00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000400', 'regular', 'other channel', NULL);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- P1 favourites a visible message.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
SELECT lives_ok(
  $$INSERT INTO public.message_favorites (user_id, channel_id, message_id) VALUES ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000430')$$,
  'A member can favorite a visible message'
);

-- P1 cannot favourite a message in a channel they are not a member of.
SELECT throws_ok(
  $$INSERT INTO public.message_favorites (user_id, channel_id, message_id) VALUES ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000432')$$,
  '42501', NULL,
  'A non-member cannot favorite a message'
);

-- P2 cannot favourite a whisper that was not sent to them.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);
SELECT throws_ok(
  $$INSERT INTO public.message_favorites (user_id, channel_id, message_id) VALUES ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000431')$$,
  '42501', NULL,
  'A member cannot favorite a whisper hidden from them'
);

-- The message must actually belong to the claimed channel.
SELECT throws_ok(
  $$INSERT INTO public.message_favorites (user_id, channel_id, message_id) VALUES ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000432')$$,
  '42501', NULL,
  'A message from another channel cannot be favorited'
);

-- Own-row isolation: P2 cannot read P1's favourite.
SELECT is_empty(
  $$SELECT id FROM public.message_favorites$$,
  'A user cannot read another user''s favourites'
);

-- A whisper's sender can favourite it.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
SELECT lives_ok(
  $$INSERT INTO public.message_favorites (user_id, channel_id, message_id) VALUES ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000431')$$,
  'A whisper sender can favorite their own whisper'
);

-- Deleting a message cascades to its favourites.
RESET ROLE;
DELETE FROM public.messages WHERE id = '00000000-0000-0000-0000-000000000430';
SELECT is_empty(
  $$SELECT id FROM public.message_favorites WHERE message_id = '00000000-0000-0000-0000-000000000430'$$,
  'Deleting a message removes its favourites'
);

SELECT * FROM finish();
ROLLBACK;
