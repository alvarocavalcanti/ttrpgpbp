-- Issue #450: regression test for the default-privilege pin
-- (20260907200109). A function created by postgres in public after the pin
-- must not inherit EXECUTE for anon (the drift that broke the sec1 sweep on
-- long-lived local stacks) nor for PUBLIC (Postgres's built-in function
-- default — suppressed by the pin's global default-privilege revoke,
-- verified on PG 17.6.1). The probe function is dropped by the closing
-- ROLLBACK.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(2);

CREATE FUNCTION public.pgtap_default_privs_probe() RETURNS void
LANGUAGE plpgsql AS $probe$ BEGIN END $probe$;

SELECT is(
  has_function_privilege('anon', 'public.pgtap_default_privs_probe()', 'EXECUTE'),
  false,
  'anon does not inherit EXECUTE on a function created after the pin'
);
SELECT is(
  has_function_privilege('public', 'public.pgtap_default_privs_probe()', 'EXECUTE'),
  false,
  'PUBLIC does not inherit EXECUTE on a function created after the pin'
);

SELECT * FROM finish();
ROLLBACK;
