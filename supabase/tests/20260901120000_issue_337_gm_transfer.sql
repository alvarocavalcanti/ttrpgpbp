-- Issue #337 residual: gm_id transfer guard.
--
-- Note: the channels UPDATE RLS policy ("GM can update channels", USING with
-- no WITH CHECK) already rejects reassignment on authenticated writes — the
-- new-row check reuses the USING expression, so setting gm_id to another
-- profile fails RLS. This trigger is defense-in-depth for SECURITY DEFINER
-- paths (the exact class of bypass the audit worried about) and for a future
-- policy change: a gm_id change may only clear the GM, claim an orphan, or
-- hand over to an existing channel member.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(7);

-- ===== Fixture =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000609', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test337xgm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test337xa@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test337xb@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test337xadmin@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000000621';

-- 609 = GM of 610; 610 member, 611 NOT a member. Channel 620 is orphaned.
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000610', 'Channel GM guard', '00000000-0000-0000-0000-000000000609');
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000620', 'Orphan channel', NULL);
INSERT INTO channel_members (channel_id, user_id, character_name)
VALUES ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000610', 'Player A');

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

GRANT UPDATE (gm_id) ON public.channels TO authenticated;
GRANT SELECT ON public.channels TO authenticated;

-- ===== 1. Trigger: transfer to a non-member is rejected (definer context) =====
SELECT throws_ok(
  $$ UPDATE channels SET gm_id = '00000000-0000-0000-0000-000000000611'
     WHERE id = '00000000-0000-0000-0000-000000000610' $$,
  'New GM must be a channel member',
  'gm_id transfer to a non-member is rejected'
);

-- ===== 2. Trigger: handover to an existing member succeeds =====
SELECT lives_ok(
  $$ UPDATE channels SET gm_id = '00000000-0000-0000-0000-000000000610'
     WHERE id = '00000000-0000-0000-0000-000000000610' $$,
  'gm_id handover to a member succeeds'
);
SELECT is(
  (SELECT gm_id FROM channels WHERE id = '00000000-0000-0000-0000-000000000610'),
  '00000000-0000-0000-0000-000000000610'::uuid,
  'handover took effect'
);

-- ===== 3. Trigger: clearing gm_id (orphaning) is allowed =====
SELECT lives_ok(
  $$ UPDATE channels SET gm_id = NULL WHERE id = '00000000-0000-0000-0000-000000000610' $$,
  'clearing gm_id is allowed'
);

-- ===== 4. Definer claim on an orphan is allowed =====
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000621');
SELECT lives_ok(
  $$ SELECT admin_claim_channel('00000000-0000-0000-0000-000000000620') $$,
  'admin claim on orphan succeeds'
);
SELECT is(
  (SELECT gm_id FROM channels WHERE id = '00000000-0000-0000-0000-000000000620'),
  '00000000-0000-0000-0000-000000000621'::uuid,
  'orphan claimed by admin'
);

-- ===== 5. RLS: authenticated GM cannot reassign gm_id at all =====
-- (restore a sitting GM first: UPDATE USING filters rows the caller does not
-- currently own, so the caller must be the GM for the policy to even see the row)
UPDATE channels SET gm_id = '00000000-0000-0000-0000-000000000609'
WHERE id = '00000000-0000-0000-0000-000000000610';
SELECT pg_temp.jwt('00000000-0000-0000-0000-000000000609');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ UPDATE channels SET gm_id = '00000000-0000-0000-0000-000000000610'
     WHERE id = '00000000-0000-0000-0000-000000000610' $$,
  '42501',
  'new row violates row-level security policy for table "channels"',
  'authenticated gm_id reassignment is RLS-blocked'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;