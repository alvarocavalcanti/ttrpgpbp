-- Issue #517: the launcher badge must count only actionable unread.
--
-- Archived channels can never be opened by a non-GM member (the archived
-- page lists only the GM's channels), so their unread could never be read
-- or cleared — a permanent badge number exactly like the whisper gap (#437)
-- and the blocked/suspended gap (#441). Both channel unread functions must
-- now skip archived channels; restoring a channel brings its unread back.
--
-- The badge also totals admin unread now: get_user_unread_total (channels +
-- admin threads) for the app, get_admin_unread_totals (batch, service_role)
-- for the push pipeline. The batch must match get_admin_unread_count for
-- every audience shape (all_users, gms, dm, read thread, server admin).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000500', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue517-gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue517-player@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue517-admin@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue517-plain@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000000503';

INSERT INTO channels (id, name, gm_id, invite_code, is_archived)
VALUES
  ('00000000-0000-0000-0000-000000000510', 'Issue 517 active', '00000000-0000-0000-0000-000000000500', '517abf12', false),
  ('00000000-0000-0000-0000-000000000511', 'Issue 517 archived', '00000000-0000-0000-0000-000000000500', '517abf13', true);

INSERT INTO channel_members (id, channel_id, user_id, character_name, last_read_at, is_blocked)
VALUES
  ('00000000-0000-0000-0000-000000000512', '00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000501', 'Player', now() - interval '1 hour', false),
  ('00000000-0000-0000-0000-000000000513', '00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000501', 'Player', now() - interval '1 hour', false);

INSERT INTO messages (id, channel_id, sender_id, type, content)
VALUES
  ('00000000-0000-0000-0000-000000000514', '00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000500', 'regular', 'active channel message'),
  ('00000000-0000-0000-0000-000000000515', '00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000500', 'regular', 'archived channel message');

-- T1: all_users announcement, unread for everyone non-suspended.
-- T2: dm to the player, unread.
-- T3: gms announcement — visible only to active GMs (and the server admin).
-- T4: all_users announcement the player already read.
INSERT INTO admin_threads (id, type, subject, gm_id, audience, created_by, last_message_at)
VALUES
  ('00000000-0000-0000-0000-000000000520', 'announcement', 'T1 all users', NULL, 'all_users', '00000000-0000-0000-0000-000000000500', now() - interval '10 minutes'),
  ('00000000-0000-0000-0000-000000000521', 'dm', NULL, '00000000-0000-0000-0000-000000000501', NULL, '00000000-0000-0000-0000-000000000500', now() - interval '10 minutes'),
  ('00000000-0000-0000-0000-000000000522', 'announcement', 'T3 gms only', NULL, 'gms', '00000000-0000-0000-0000-000000000500', now() - interval '10 minutes'),
  ('00000000-0000-0000-0000-000000000523', 'announcement', 'T4 read', NULL, 'all_users', '00000000-0000-0000-0000-000000000500', now() - interval '2 hours');

INSERT INTO admin_thread_reads (thread_id, user_id, last_read_at)
VALUES ('00000000-0000-0000-0000-000000000523', '00000000-0000-0000-0000-000000000501', now() - interval '1 hour');

SELECT plan(15);

-- pgTAP test runner needs explicit grants that Supabase usually provides by default
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
-- The blanket routine grant above re-opens the service_role-only batch
-- function; restore its real privilege boundary for the assertions below.
REVOKE ALL ON FUNCTION public.get_admin_unread_totals(UUID[]) FROM authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);

-- 1. Active channel unread still counts.
SELECT is(
  (SELECT COALESCE(SUM(unread_count), 0)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-000000000501')),
  1::BIGINT,
  'active channel unread counts'
);

-- 2. Archived channel contributes no row at all, so nothing can re-inflate
-- the badge on a refresh.
SELECT is(
  (SELECT COUNT(*) FROM public.get_user_channels_unread('00000000-0000-0000-0000-000000000501')),
  1::BIGINT,
  'archived channel has no unread row'
);

-- 3. Push batch totals exclude the archived channel too.
SET LOCAL ROLE service_role;

SELECT is(
  (SELECT unread_count FROM public.get_unread_totals(
    ARRAY['00000000-0000-0000-0000-000000000501'::UUID]
  )),
  1::BIGINT,
  'batch channel total excludes archived channel'
);

-- 4. Sanity: restoring the channel brings its unread back. Proves the empty
-- result above comes from the filter, not the fixture. Both archive flips
-- run as service_role: the player has no UPDATE grant on channels, so an
-- RLS-filtered write would silently flip nothing and poison the rest.
SET LOCAL ROLE service_role;
UPDATE channels SET is_archived = false WHERE id = '00000000-0000-0000-0000-000000000511';

SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT COALESCE(SUM(unread_count), 0)::BIGINT FROM public.get_user_channels_unread('00000000-0000-0000-0000-000000000501')),
  2::BIGINT,
  'restored channel unread returns'
);

SET LOCAL ROLE service_role;
UPDATE channels SET is_archived = true WHERE id = '00000000-0000-0000-0000-000000000511';

-- 5. Batch admin: player sees T1 + T2 (T3 gms-only, T4 already read).
SELECT is(
  (SELECT unread_count FROM public.get_admin_unread_totals(
    ARRAY['00000000-0000-0000-0000-000000000501'::UUID]
  )),
  2::BIGINT,
  'batch admin counts all_users announcement and dm, not gms-only or read'
);

-- 6. Batch admin matches the single-user function for the same user.
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT public.get_admin_unread_count('00000000-0000-0000-0000-000000000501')),
  2,
  'single-user admin count agrees with batch'
);

SET LOCAL ROLE service_role;

-- 7. The GM (active GM of a live channel) also sees the gms announcement.
SELECT is(
  (SELECT unread_count FROM public.get_admin_unread_totals(
    ARRAY['00000000-0000-0000-0000-000000000500'::UUID]
  )),
  3::BIGINT,
  'batch admin counts gms announcement for an active GM'
);

-- 8. The server admin sees the gms announcement without GMing a channel
-- (the inline server_admin check replaces is_server_admin()).
SELECT is(
  (SELECT unread_count FROM public.get_admin_unread_totals(
    ARRAY['00000000-0000-0000-0000-000000000503'::UUID]
  )),
  3::BIGINT,
  'batch admin counts gms announcement for the server admin'
);

-- 9. A plain user never sees the gms announcement.
SELECT is(
  (SELECT unread_count FROM public.get_admin_unread_totals(
    ARRAY['00000000-0000-0000-0000-000000000504'::UUID]
  )),
  2::BIGINT,
  'batch admin excludes gms announcement for a plain user'
);

-- 10. The app badge total: 1 channel message + 2 admin threads.
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT public.get_user_unread_total('00000000-0000-0000-0000-000000000501')),
  3::BIGINT,
  'badge total sums channels and admin threads'
);

-- 11. Cross-user reads stay forbidden (same contract as the channel RPC).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000500', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000500","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT public.get_user_unread_total('00000000-0000-0000-0000-000000000501')$$,
  'P0001',
  'User id must match authenticated user.',
  'badge total rejects a mismatched user id'
);

-- 12-15. Privilege boundary: the batch is service_role-only; the total is
-- authenticated-only.
SELECT is(
  has_function_privilege('anon', 'public.get_admin_unread_totals(uuid[])', 'EXECUTE'),
  false,
  'anon cannot execute the admin batch'
);

SELECT is(
  has_function_privilege('authenticated', 'public.get_admin_unread_totals(uuid[])', 'EXECUTE'),
  false,
  'authenticated cannot execute the admin batch'
);

SELECT is(
  has_function_privilege('authenticated', 'public.get_user_unread_total(uuid)', 'EXECUTE'),
  true,
  'authenticated keeps the badge total'
);

SELECT is(
  has_function_privilege('anon', 'public.get_user_unread_total(uuid)', 'EXECUTE'),
  false,
  'anon cannot execute the badge total'
);

SELECT * FROM finish();
ROLLBACK;
