BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(3);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES 
  ('00000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p1@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p2@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000310', 'Test', '00000000-0000-0000-0000-000000000300', 'code');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000310', '00000000-0000-0000-0000-000000000301', 'P1', now()),
  ('00000000-0000-0000-0000-000000000322', '00000000-0000-0000-0000-000000000310', '00000000-0000-0000-0000-000000000302', 'P2', now());

INSERT INTO messages (id, channel_id, sender_id, type, content, is_whisper, target_user_ids)
VALUES
  ('00000000-0000-0000-0000-000000000330', '00000000-0000-0000-0000-000000000310', '00000000-0000-0000-0000-000000000301', 'regular', 'whisper to GM', true, ARRAY['00000000-0000-0000-0000-000000000300']::uuid[]);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- P1 can see the whisper they sent
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT id FROM public.messages WHERE is_whisper = true$$,
  $$VALUES ('00000000-0000-0000-0000-000000000330'::uuid)$$,
  'Sender can see their own whisper'
);

-- GM can see the whisper
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000300', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000300","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT id FROM public.messages WHERE is_whisper = true$$,
  $$VALUES ('00000000-0000-0000-0000-000000000330'::uuid)$$,
  'GM can see whispers to them'
);

-- P2 cannot see the whisper
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
SELECT is_empty(
  $$SELECT id FROM public.messages WHERE is_whisper = true$$,
  'Uninvolved party cannot see whisper'
);

SELECT * FROM finish();
ROLLBACK;
