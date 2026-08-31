BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Fixed users keep this test independent of auth helper packages.
-- Insert into auth.users; the on_auth_user_created trigger auto-creates each
-- profile row (server_admin defaults false), then we promote one to admin.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue300-admin@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue300-gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue300-p1@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue300-outsider@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000000401';

-- One GM-owned channel and one orphaned channel (gm_id NULL, as left behind by
-- account deletion).
INSERT INTO channels (id, name, gm_id, invite_code)
VALUES
  ('00000000-0000-0000-0000-000000000410', 'Issue 300', '00000000-0000-0000-0000-000000000402', 'issue300'),
  ('00000000-0000-0000-0000-000000000411', 'Orphan', NULL, 'orphan300');

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at)
VALUES
  ('00000000-0000-0000-0000-000000000420', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000402', 'GM', now()),
  ('00000000-0000-0000-0000-000000000421', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000403', 'P1', now());

SELECT plan(12);

-- pgTAP test runner needs explicit grants that Supabase usually provides by default
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

SET LOCAL ROLE authenticated;

-- ==========================================
-- 1. Suspension bypass
-- ==========================================

-- A player cannot flip their own is_suspended through the self-update policy.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000403","role":"authenticated"}', true);
SELECT throws_ok(
  $$UPDATE public.profiles SET is_suspended = true WHERE id = '00000000-0000-0000-0000-000000000403'$$,
  'P0001',
  'is_suspended can only be changed by a server admin',
  'player cannot self-suspend'
);

-- An admin can suspend via the RPC.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT public.admin_suspend_user('00000000-0000-0000-0000-000000000403', true)$$,
  'admin can suspend a user'
);
SELECT is(
  (SELECT is_suspended FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000403'),
  true,
  'player is suspended after admin action'
);

-- A suspended player cannot unsuspend themselves.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000403","role":"authenticated"}', true);
SELECT throws_ok(
  $$UPDATE public.profiles SET is_suspended = false WHERE id = '00000000-0000-0000-0000-000000000403'$$,
  'P0001',
  'is_suspended can only be changed by a server admin',
  'suspended player cannot self-unsuspend'
);

-- 403 is still suspended at this point (the self-unsuspend above is blocked).
-- Un-suspend via the admin path so the later sections run as a regular
-- unsuspended player — set_active_players / whisper checks treat suspended
-- players as inactive members (#335).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
SELECT is(
  (SELECT is_suspended FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000403'),
  true,
  'player still suspended after blocked self-unsuspend'
);
SELECT admin_suspend_user('00000000-0000-0000-0000-000000000403', false);

-- ==========================================
-- 2. Active-player bypass
-- ==========================================

-- A non-GM member cannot flip their own is_active_player.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000403","role":"authenticated"}', true);
SELECT throws_ok(
  $$UPDATE public.channel_members SET is_active_player = true WHERE user_id = '00000000-0000-0000-0000-000000000403'$$,
  'P0001',
  'Only the GM can change active player status',
  'player cannot self-activate'
);

-- A non-GM member can still update their own character info (flag untouched).
SELECT lives_ok(
  $$UPDATE public.channel_members SET character_name = 'P1 Renamed' WHERE user_id = '00000000-0000-0000-0000-000000000403'$$,
  'player can still update own character info'
);

-- The GM flips active players via the sanctioned RPC.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT public.set_active_players(
    '00000000-0000-0000-0000-000000000410',
    ARRAY['00000000-0000-0000-0000-000000000403']::uuid[]
  )$$,
  'GM can set active players'
);
SELECT is(
  (SELECT is_active_player FROM public.channel_members WHERE user_id = '00000000-0000-0000-0000-000000000403'),
  true,
  'GM-set player is active'
);

-- ==========================================
-- 3. Orphan channel takeover
-- ==========================================

-- Any authenticated caller must be rejected from editing an orphan channel.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000404', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000404","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.update_channel_settings('00000000-0000-0000-0000-000000000411', 'Stolen')$$,
  'P0001',
  'Only the GM can change channel settings.',
  'orphan channel cannot be modified'
);

-- A legitimate GM can still update their own channel (regression).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT public.update_channel_settings('00000000-0000-0000-0000-000000000410', 'Issue 300 Renamed')$$,
  'GM can update own channel settings'
);

-- ==========================================
-- 4. Unrestricted unread RPC is removed
-- ==========================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000403","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.get_unread_count('00000000-0000-0000-0000-000000000410', now())$$,
  '42883',
  NULL,
  'get_unread_count is dropped'
);

SELECT * FROM finish();
ROLLBACK;