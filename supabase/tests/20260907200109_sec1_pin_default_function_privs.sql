-- Issue #450: regression test for the default-privilege pin
-- (20260907200109). The pin revokes anon from postgres's default function
-- privileges in schema public, so functions created after it must not
-- inherit a DIRECT anon EXECUTE grant (the drift that broke the sec1 sweep
-- on long-lived local stacks).
--
-- Postgres's built-in PUBLIC EXECUTE cannot be suppressed via default
-- privileges (verified: proacl falls back to the built-in default no matter
-- what pg_default_acl contains), so the probe first revokes PUBLIC to
-- isolate the anon path — has_function_privilege('anon', …) counts PUBLIC
-- membership. The probe function is dropped by the closing ROLLBACK.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(1);

CREATE FUNCTION public.pgtap_default_privs_probe() RETURNS void
LANGUAGE plpgsql AS $probe$ BEGIN END $probe$;
REVOKE EXECUTE ON FUNCTION public.pgtap_default_privs_probe() FROM PUBLIC;

SELECT is(
  has_function_privilege('anon', 'public.pgtap_default_privs_probe()', 'EXECUTE'),
  false,
  'anon does not inherit direct EXECUTE on a function created after the pin'
);

SELECT * FROM finish();
ROLLBACK;
