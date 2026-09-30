-- #631: update_channel_status posts a generic system message when the GM
-- actually changes the channel status. Covers the happy path (status + one
-- system row + sender + exact copy), the no-op re-save, clearing, the non-GM
-- and suspended gates, and that archived channels are intentionally allowed
-- (matching update_channel_settings).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(15);

-- ===== Seed =====
-- 0701 = GM, 0702 = player, 0703 = suspended GM
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gm631@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'player631@test.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'suspended631@test.com', '', now(), '{}', '{}', now(), now());
UPDATE profiles SET is_suspended = true WHERE id = '00000000-0000-0000-0000-000000000703';

INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-000000000710', 'Status Test', '00000000-0000-0000-0000-000000000701', 'abcdef63'),
  ('00000000-0000-0000-0000-000000000711', 'Archived Status', '00000000-0000-0000-0000-000000000701', 'abcdef64'),
  ('00000000-0000-0000-0000-000000000712', 'Suspended GM', '00000000-0000-0000-0000-000000000703', 'abcdef65');
UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-000000000711';

INSERT INTO channel_members (id, channel_id, user_id, character_name)
VALUES
  ('00000000-0000-0000-0000-000000000720', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000702', 'Hero');

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ===== 1. GM changes the status =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000000710', 'On the road')$$,
  'GM can update the channel status'
);
SELECT is(
  (SELECT status_text FROM channels WHERE id = '00000000-0000-0000-0000-000000000710'),
  'On the road',
  'status_text is persisted'
);
SELECT is(
  (SELECT count(*) FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000710' AND type = 'system'),
  1::bigint,
  'one system message is posted'
);
SELECT is(
  (SELECT sender_id FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000710' AND type = 'system'),
  '00000000-0000-0000-0000-000000000701'::uuid,
  'the system message is authored by the GM'
);
SELECT is(
  (SELECT content FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000710' AND type = 'system'),
  'The GM updated the channel status.',
  'the system message carries the fixed generic copy'
);

-- ===== 2. Re-saving the same text is a no-op =====
SELECT lives_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000000710', 'On the road')$$,
  're-saving identical text succeeds'
);
SELECT is(
  (SELECT count(*) FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000710' AND type = 'system'),
  1::bigint,
  'an unchanged status posts no extra message'
);

-- ===== 3. Clearing the status counts as a change =====
SELECT lives_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000000710', '')$$,
  'clearing the status succeeds'
);
SELECT is(
  (SELECT status_text FROM channels WHERE id = '00000000-0000-0000-0000-000000000710'),
  NULL,
  'a blank status is stored as NULL'
);
SELECT is(
  (SELECT count(*) FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000710' AND type = 'system'),
  2::bigint,
  'clearing the status posts one more system message'
);

-- ===== 4. Non-GM cannot change the status =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000000710', 'hacked')$$,
  NULL,
  'a non-GM cannot update the channel status'
);
SELECT is(
  (SELECT status_text FROM channels WHERE id = '00000000-0000-0000-0000-000000000710'),
  NULL,
  'the non-GM attempt changed nothing'
);

-- ===== 5. Suspended GM is blocked =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000703","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000000712', 'from suspended')$$,
  NULL,
  'a suspended GM cannot update the channel status'
);
SELECT is(
  (SELECT count(*) FROM messages WHERE channel_id = '00000000-0000-0000-0000-000000000712' AND type = 'system'),
  0::bigint,
  'the suspended GM posted no message'
);

-- ===== 6. Archived channels are intentionally editable (decision: allow) =====
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT update_channel_status('00000000-0000-0000-0000-000000000711', 'Frozen but editable')$$,
  'the GM can still update an archived channel status'
);

SELECT * FROM finish();
ROLLBACK;
