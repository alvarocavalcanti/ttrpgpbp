-- Verification for 20261021091717_mirror_data_api_grant_revoke.
--
-- The migration mirrors Supabase's 2026-10-30 Data API change: the postgres
-- role no longer hands Data API roles table (or sequence) privileges through
-- default privileges, so a table created in public needs explicit GRANTs.
-- This file pins that state and proves the blast radius is empty:
--   * the default privileges really are revoked (catalog level),
--   * existing objects keep the grants they already had, including the
--     deliberate anon revoke on profiles,
--   * a new table and its new sequence get nothing, and an explicit GRANT is
--     what makes them reachable again.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(15);

-- The postgres role's table defaults no longer carry DML for the API roles.
SELECT is(
  (SELECT count(*)
   FROM pg_default_acl d
   JOIN pg_namespace n ON n.oid = d.defaclnamespace
   CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
   WHERE n.nspname = 'public'
     AND d.defaclrole = 'postgres'::regrole
     AND d.defaclobjtype = 'r'
     AND acl.grantee IN ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
     AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  0::bigint,
  'default table privileges no longer grant DML to the Data API roles'
);

-- The postgres role's sequence defaults no longer carry USAGE/SELECT either.
SELECT is(
  (SELECT count(*)
   FROM pg_default_acl d
   JOIN pg_namespace n ON n.oid = d.defaclnamespace
   CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
   WHERE n.nspname = 'public'
     AND d.defaclrole = 'postgres'::regrole
     AND d.defaclobjtype = 'S'
     AND acl.grantee IN ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
     AND acl.privilege_type IN ('USAGE', 'SELECT')),
  0::bigint,
  'default sequence privileges no longer grant USAGE or SELECT to the Data API roles'
);

-- Existing objects keep the grants they already had.
SELECT is(
  has_table_privilege('authenticated', 'public.channels', 'SELECT'),
  true,
  'authenticated still has SELECT on channels'
);
SELECT is(
  has_table_privilege('service_role', 'public.messages', 'INSERT'),
  true,
  'service_role still has INSERT on messages'
);

-- ...including the deliberate revokes.
SELECT is(
  has_table_privilege('anon', 'public.profiles', 'SELECT'),
  false,
  'anon still has no SELECT on profiles'
);

-- A table created now gets nothing from the defaults.
CREATE TABLE public.probe_grant_mirror (id bigserial primary key);

SELECT is(
  has_table_privilege('anon', 'public.probe_grant_mirror', 'SELECT'),
  false,
  'a new table grants no SELECT to anon'
);
SELECT is(
  has_table_privilege('anon', 'public.probe_grant_mirror', 'INSERT'),
  false,
  'a new table grants no INSERT to anon'
);
SELECT is(
  has_table_privilege('authenticated', 'public.probe_grant_mirror', 'SELECT'),
  false,
  'a new table grants no SELECT to authenticated'
);
SELECT is(
  has_table_privilege('authenticated', 'public.probe_grant_mirror', 'INSERT'),
  false,
  'a new table grants no INSERT to authenticated'
);
SELECT is(
  has_table_privilege('service_role', 'public.probe_grant_mirror', 'SELECT'),
  false,
  'a new table grants no SELECT to service_role'
);
SELECT is(
  has_table_privilege('service_role', 'public.probe_grant_mirror', 'INSERT'),
  false,
  'a new table grants no INSERT to service_role'
);

-- The sequence behind the serial column needs its own grant.
SELECT is(
  has_sequence_privilege('anon', 'public.probe_grant_mirror_id_seq', 'USAGE'),
  false,
  'a new sequence grants no USAGE to anon'
);
SELECT is(
  has_sequence_privilege('authenticated', 'public.probe_grant_mirror_id_seq', 'USAGE'),
  false,
  'a new sequence grants no USAGE to authenticated'
);
SELECT is(
  has_sequence_privilege('service_role', 'public.probe_grant_mirror_id_seq', 'USAGE'),
  false,
  'a new sequence grants no USAGE to service_role'
);

-- An explicit grant is what makes the table reachable again.
GRANT SELECT ON public.probe_grant_mirror TO authenticated;

SELECT is(
  has_table_privilege('authenticated', 'public.probe_grant_mirror', 'SELECT'),
  true,
  'an explicit GRANT makes a new table reachable'
);

DROP TABLE public.probe_grant_mirror;

SELECT * FROM finish();
ROLLBACK;
