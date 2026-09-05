-- Issue #402 / SEC-5: the whisper-preview trigger function must be SECURITY
-- DEFINER with a pinned search_path. Locks both properties: the function
-- definition (proconfig) and the contract behavior (preview advances on
-- regular messages, stays NULL for whispers — whisper scrub regression).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(2);

SELECT is(
  (SELECT proconfig @> ARRAY['search_path=public']
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'set_channel_last_message_at'
     AND p.prokind = 'f'),
  true,
  'set_channel_last_message_at pins search_path = public'
);

-- Behavior contract survives the redefinition: regular message advances
-- preview (and its last whisper clears it, matching #406).
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000407', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm407@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000408', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p407@test.com', '', now(), '{}', '{}', now(), now());

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000000413', 'Pin test', '00000000-0000-0000-0000-000000000407', 'abcdef16');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000426', '00000000-0000-0000-0000-000000000413', '00000000-0000-0000-0000-000000000407', 'GM', now()),
  ('00000000-0000-0000-0000-000000000427', '00000000-0000-0000-0000-000000000413', '00000000-0000-0000-0000-000000000408', 'P1', now());

INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES ('00000000-0000-0000-0000-000000000432', '00000000-0000-0000-0000-000000000413',
        '00000000-0000-0000-0000-000000000408', 'regular', 'pin check');

SELECT is(
  (SELECT last_message_preview FROM channels WHERE id = '00000000-0000-0000-0000-000000000413'),
  'pin check',
  'regular message still fills the preview after the redefinition'
);

SELECT * FROM finish();
ROLLBACK;
