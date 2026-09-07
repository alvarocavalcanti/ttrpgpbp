-- Issue #402 / SEC-1: grant-sweep verification.
--   * anon has EXECUTE on no user-defined function in public (blanket sweep;
--     extension-owned functions such as pgtap itself are excluded)
--   * server-only helpers are EXECUTE-blocked for authenticated/service_role
--   * client-facing RPCs keep authenticated EXECUTE
--   * the push pipeline's service_role call into get_unread_totals survives

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(54);

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

-- Issue #429: trigger helpers left EXECUTE-able by the blanket
-- sweep grant (created after it, or missed by its explicit list). Trigger
-- functions cannot be invoked directly. Policy helpers (is_active_gm,
-- is_channel_gm, is_channel_member, is_server_admin), the client RPC
-- get_channel_salt and the computed-column helper has_password are
-- deliberately NOT revoked — policies, the pre-join flow and channel reads
-- call them with the invoking user's privileges.

-- 1. Trigger functions (row guards, wired via CREATE TRIGGER only).
SELECT is(
  has_function_privilege('authenticated', 'public.enforce_gm_transfer_validity()', 'EXECUTE'),
  false,
  'authenticated cannot call enforce_gm_transfer_validity'
);
SELECT is(
  has_function_privilege('service_role', 'public.enforce_gm_transfer_validity()', 'EXECUTE'),
  false,
  'service_role cannot call enforce_gm_transfer_validity'
);
SELECT is(
  has_function_privilege('authenticated', 'public.enforce_image_upload_rules()', 'EXECUTE'),
  false,
  'authenticated cannot call enforce_image_upload_rules'
);
SELECT is(
  has_function_privilege('service_role', 'public.enforce_image_upload_rules()', 'EXECUTE'),
  false,
  'service_role cannot call enforce_image_upload_rules'
);
SELECT is(
  has_function_privilege('authenticated', 'public.enforce_member_field_bounds()', 'EXECUTE'),
  false,
  'authenticated cannot call enforce_member_field_bounds'
);
SELECT is(
  has_function_privilege('service_role', 'public.enforce_member_field_bounds()', 'EXECUTE'),
  false,
  'service_role cannot call enforce_member_field_bounds'
);
SELECT is(
  has_function_privilege('authenticated', 'public.enforce_member_insert_consent()', 'EXECUTE'),
  false,
  'authenticated cannot call enforce_member_insert_consent'
);
SELECT is(
  has_function_privilege('service_role', 'public.enforce_member_insert_consent()', 'EXECUTE'),
  false,
  'service_role cannot call enforce_member_insert_consent'
);
SELECT is(
  has_function_privilege('authenticated', 'public.enforce_url_scheme()', 'EXECUTE'),
  false,
  'authenticated cannot call enforce_url_scheme'
);
SELECT is(
  has_function_privilege('service_role', 'public.enforce_url_scheme()', 'EXECUTE'),
  false,
  'service_role cannot call enforce_url_scheme'
);
SELECT is(
  has_function_privilege('authenticated', 'public.prevent_member_identity_change()', 'EXECUTE'),
  false,
  'authenticated cannot call prevent_member_identity_change'
);
SELECT is(
  has_function_privilege('service_role', 'public.prevent_member_identity_change()', 'EXECUTE'),
  false,
  'service_role cannot call prevent_member_identity_change'
);
SELECT is(
  has_function_privilege('authenticated', 'public.prevent_member_self_block_toggle()', 'EXECUTE'),
  false,
  'authenticated cannot call prevent_member_self_block_toggle'
);
SELECT is(
  has_function_privilege('service_role', 'public.prevent_member_self_block_toggle()', 'EXECUTE'),
  false,
  'service_role cannot call prevent_member_self_block_toggle'
);
SELECT is(
  has_function_privilege('authenticated', 'public.prevent_message_routing_change()', 'EXECUTE'),
  false,
  'authenticated cannot call prevent_message_routing_change'
);
SELECT is(
  has_function_privilege('service_role', 'public.prevent_message_routing_change()', 'EXECUTE'),
  false,
  'service_role cannot call prevent_message_routing_change'
);
SELECT is(
  has_function_privilege('authenticated', 'public.prevent_message_update_tampering()', 'EXECUTE'),
  false,
  'authenticated cannot call prevent_message_update_tampering'
);
SELECT is(
  has_function_privilege('service_role', 'public.prevent_message_update_tampering()', 'EXECUTE'),
  false,
  'service_role cannot call prevent_message_update_tampering'
);
SELECT is(
  has_function_privilege('authenticated', 'public.prevent_non_gm_active_player_change()', 'EXECUTE'),
  false,
  'authenticated cannot call prevent_non_gm_active_player_change'
);
SELECT is(
  has_function_privilege('service_role', 'public.prevent_non_gm_active_player_change()', 'EXECUTE'),
  false,
  'service_role cannot call prevent_non_gm_active_player_change'
);
SELECT is(
  has_function_privilege('authenticated', 'public.prevent_self_suspension_change()', 'EXECUTE'),
  false,
  'authenticated cannot call prevent_self_suspension_change'
);
SELECT is(
  has_function_privilege('service_role', 'public.prevent_self_suspension_change()', 'EXECUTE'),
  false,
  'service_role cannot call prevent_self_suspension_change'
);
SELECT is(
  has_function_privilege('authenticated', 'public.prevent_server_admin_escalation()', 'EXECUTE'),
  false,
  'authenticated cannot call prevent_server_admin_escalation'
);
SELECT is(
  has_function_privilege('service_role', 'public.prevent_server_admin_escalation()', 'EXECUTE'),
  false,
  'service_role cannot call prevent_server_admin_escalation'
);
SELECT is(
  has_function_privilege('authenticated', 'public.set_channel_last_message_at()', 'EXECUTE'),
  false,
  'authenticated cannot call set_channel_last_message_at'
);
SELECT is(
  has_function_privilege('service_role', 'public.set_channel_last_message_at()', 'EXECUTE'),
  false,
  'service_role cannot call set_channel_last_message_at'
);
SELECT is(
  has_function_privilege('authenticated', 'public.validate_message_mentions()', 'EXECUTE'),
  false,
  'authenticated cannot call validate_message_mentions'
);
SELECT is(
  has_function_privilege('service_role', 'public.validate_message_mentions()', 'EXECUTE'),
  false,
  'service_role cannot call validate_message_mentions'
);

-- 2. Auth hook / notification trigger functions.
SELECT is(
  has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'authenticated cannot call handle_new_user'
);
SELECT is(
  has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'service_role cannot call handle_new_user'
);
SELECT is(
  has_function_privilege('authenticated', 'public.handle_new_user_prefs()', 'EXECUTE'),
  false,
  'authenticated cannot call handle_new_user_prefs'
);
SELECT is(
  has_function_privilege('service_role', 'public.handle_new_user_prefs()', 'EXECUTE'),
  false,
  'service_role cannot call handle_new_user_prefs'
);
SELECT is(
  has_function_privilege('authenticated', 'public.handle_active_player_notification()', 'EXECUTE'),
  false,
  'authenticated cannot call handle_active_player_notification'
);
SELECT is(
  has_function_privilege('service_role', 'public.handle_active_player_notification()', 'EXECUTE'),
  false,
  'service_role cannot call handle_active_player_notification'
);
SELECT is(
  has_function_privilege('authenticated', 'public.handle_admin_message_inserted()', 'EXECUTE'),
  false,
  'authenticated cannot call handle_admin_message_inserted'
);
SELECT is(
  has_function_privilege('service_role', 'public.handle_admin_message_inserted()', 'EXECUTE'),
  false,
  'service_role cannot call handle_admin_message_inserted'
);
SELECT is(
  has_function_privilege('authenticated', 'public.handle_new_message_notification()', 'EXECUTE'),
  false,
  'authenticated cannot call handle_new_message_notification'
);
SELECT is(
  has_function_privilege('service_role', 'public.handle_new_message_notification()', 'EXECUTE'),
  false,
  'service_role cannot call handle_new_message_notification'
);

-- 3. has_password(channels) KEEPS authenticated EXECUTE: it backs the
-- has_password computed column, which PostgREST invokes during reads —
-- including plain `select=*` queries (verified live: revoking fails every
-- channels read that expands the computed column). Row visibility is RLS's
-- job; the helper stays callable.

-- Policy helpers must KEEP authenticated EXECUTE: RLS policy expressions run
-- with the invoking user's privileges, so revoking them breaks every policy.
SELECT is(
  has_function_privilege('authenticated', 'public.is_active_gm(uuid)', 'EXECUTE'),
  true,
  'authenticated keeps is_active_gm (referenced in RLS policies)'
);
SELECT is(
  has_function_privilege('authenticated', 'public.is_channel_gm(uuid)', 'EXECUTE'),
  true,
  'authenticated keeps is_channel_gm (referenced in RLS policies)'
);
SELECT is(
  has_function_privilege('authenticated', 'public.is_channel_member(uuid)', 'EXECUTE'),
  true,
  'authenticated keeps is_channel_member (referenced in RLS policies)'
);
SELECT is(
  has_function_privilege('authenticated', 'public.is_server_admin()', 'EXECUTE'),
  true,
  'authenticated keeps is_server_admin (referenced in RLS policies)'
);
SELECT is(
  has_function_privilege('authenticated', 'public.get_channel_salt(uuid)', 'EXECUTE'),
  true,
  'authenticated keeps get_channel_salt (client RPC, pre-join flow)'
);
SELECT is(
  has_function_privilege('authenticated', 'public.has_password(channels)', 'EXECUTE'),
  true,
  'authenticated keeps has_password (computed column, invoked by channel reads)'
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
