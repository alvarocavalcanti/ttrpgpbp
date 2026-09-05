-- Issue #402 / SEC-1: grant-sweep verification.
--   * anon has EXECUTE on no user-defined function in public (blanket sweep;
--     extension-owned functions such as pgtap itself are excluded)
--   * server-only helpers are EXECUTE-blocked for authenticated/service_role
--   * client-facing RPCs keep authenticated EXECUTE
--   * the push pipeline's service_role call into get_unread_totals survives

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(10);

SELECT is(
  (SELECT count(*)
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.oid NOT IN (SELECT objid FROM pg_depend WHERE deptype = 'e')
     AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  0::bigint,
  'anon has EXECUTE on no user-defined function in public'
);

SELECT is(
  has_function_privilege('authenticated', 'public.retry_failed_push_invocations(integer)', 'EXECUTE'),
  false,
  'authenticated cannot call retry_failed_push_invocations'
);
SELECT is(
  has_function_privilege('service_role', 'public.retry_failed_push_invocations(integer)', 'EXECUTE'),
  false,
  'service_role cannot call retry_failed_push_invocations'
);
SELECT is(
  has_function_privilege('authenticated', 'public.push_notification_config_value(text)', 'EXECUTE'),
  false,
  'authenticated cannot call push_notification_config_value'
);
SELECT is(
  has_function_privilege('authenticated', 'public.build_dice_content(text,integer[],integer,integer)', 'EXECUTE'),
  false,
  'authenticated cannot call build_dice_content'
);
SELECT is(
  has_function_privilege('authenticated', 'public.roll_dice_unchecked(uuid,text,uuid,text,integer,uuid)', 'EXECUTE'),
  false,
  'authenticated cannot call roll_dice_unchecked'
);
SELECT is(
  has_function_privilege('authenticated', 'public.is_suspended(uuid)', 'EXECUTE'),
  false,
  'authenticated cannot call is_suspended'
);
SELECT is(
  has_function_privilege('authenticated', 'public.resolve_mention_user_ids(uuid,text)', 'EXECUTE'),
  false,
  'authenticated cannot call resolve_mention_user_ids'
);

SELECT is(
  has_function_privilege('authenticated', 'public.send_message(uuid,text,text,uuid,uuid,uuid[],text,text,uuid)', 'EXECUTE'),
  true,
  'authenticated keeps send_message (client RPC)'
);
SELECT is(
  has_function_privilege('service_role', 'public.get_unread_totals(uuid[])', 'EXECUTE'),
  true,
  'service_role keeps get_unread_totals (push pipeline uses it)'
);

SELECT * FROM finish();
ROLLBACK;
