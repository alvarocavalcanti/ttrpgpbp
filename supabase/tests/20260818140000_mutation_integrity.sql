BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Fixed users keep this test independent of auth helper packages.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000214', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue214-author@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000215', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue214-other@example.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, is_public, invite_code)
VALUES ('00000000-0000-0000-0000-000000000216', 'Issue 214', '00000000-0000-0000-0000-000000000214', false, 'issue214');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000217', '00000000-0000-0000-0000-000000000216', '00000000-0000-0000-0000-000000000214', 'Author', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000218', '00000000-0000-0000-0000-000000000216', '00000000-0000-0000-0000-000000000215', 'Other', now() - interval '1 hour');

INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES
  ('00000000-0000-0000-0000-000000000219', '00000000-0000-0000-0000-000000000216', '00000000-0000-0000-0000-000000000214', 'regular', 'original'),
  ('00000000-0000-0000-0000-000000000220', '00000000-0000-0000-0000-000000000216', '00000000-0000-0000-0000-000000000214', 'regular', 'expired');

UPDATE messages
SET created_at = now() - interval '16 minutes'
WHERE id = '00000000-0000-0000-0000-000000000220';

SELECT plan(10);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000214', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000214","role":"authenticated"}', true);

SELECT lives_ok(
  $$UPDATE public.messages
    SET content = 'edited', is_edited = true, updated_at = now()
    WHERE id = '00000000-0000-0000-0000-000000000219'$$,
  'author can edit within 15 minutes'
);

SELECT throws_ok(
  $$UPDATE public.messages
    SET content = repeat('x', 4001)
    WHERE id = '00000000-0000-0000-0000-000000000219'$$,
  'P0001',
  'message edits reject content over 4000 characters'
);

SELECT throws_ok(
  $$UPDATE public.messages
    SET roll_dc = 20
    WHERE id = '00000000-0000-0000-0000-000000000219'$$,
  'P0001',
  'message roll metadata is immutable'
);

SELECT throws_ok(
  $$SELECT * FROM public.roll_dice(
    '00000000-0000-0000-0000-000000000216', '1d20', NULL,
    repeat('x', 501), NULL, NULL
  )$$,
  'P0001',
  'roll warnings reject content over 500 characters'
);

SELECT throws_ok(
  $$SELECT * FROM public.get_user_channels_unread(
    '00000000-0000-0000-0000-000000000215'
  )$$,
  'P0001',
  'unread RPC rejects another user id'
);

SELECT throws_ok(
  $$UPDATE public.profiles
    SET display_name = repeat('x', 41)
    WHERE id = '00000000-0000-0000-0000-000000000214'$$,
  '23514',
  'display names reject content over 40 characters'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000215', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000215","role":"authenticated"}', true);

SELECT lives_ok(
  $$UPDATE public.messages SET content = 'intruder' WHERE id = '00000000-0000-0000-0000-000000000219'$$,
  'non-author update does not raise'
);

SELECT is(
  (SELECT content FROM public.messages WHERE id = '00000000-0000-0000-0000-000000000219'),
  'edited',
  'non-author cannot change message content'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000214', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000214","role":"authenticated"}', true);

SELECT lives_ok(
  $$UPDATE public.messages SET content = 'late edit' WHERE id = '00000000-0000-0000-0000-000000000220'$$,
  'expired update does not raise'
);

SELECT is(
  (SELECT content FROM public.messages WHERE id = '00000000-0000-0000-0000-000000000220'),
  'expired',
  'expired author cannot change message content'
);

SELECT * FROM finish();
ROLLBACK;
