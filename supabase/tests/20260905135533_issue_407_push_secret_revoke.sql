-- Issue #407 [P1]: push_notification_config_value(text) (which returns
-- PUSH_INTERNAL_SECRET) was revoked only FROM PUBLIC; Supabase default
-- privileges left EXECUTE granted to anon/authenticated, so anyone with the
-- public anon key could read the shared push secret over PostgREST RPC.
-- Locks the privilege contract: no API role may call the helper.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(3);

SELECT is(
  has_function_privilege('anon', 'public.push_notification_config_value(text)', 'EXECUTE'),
  false,
  'anon cannot call push_notification_config_value'
);
SELECT is(
  has_function_privilege('authenticated', 'public.push_notification_config_value(text)', 'EXECUTE'),
  false,
  'authenticated cannot call push_notification_config_value'
);
SELECT is(
  has_function_privilege('service_role', 'public.push_notification_config_value(text)', 'EXECUTE'),
  false,
  'service_role cannot call push_notification_config_value'
);

SELECT * FROM finish();
ROLLBACK;
