-- Issue #429 / SEC-1 follow-up: the 20260905141623 grant sweep's blanket
-- `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated,
-- service_role` (and its explicit revoke list) predates several functions and
-- missed others: trigger functions created AFTER the sweep (e.g.
-- enforce_url_scheme, whose migration only revoked url_scheme_allowed and
-- enforce_member_url_scheme) and SECURITY DEFINER helpers stayed EXECUTE-able
-- by authenticated. This extends the sweep's revoke list.
--
-- Safe by construction: these functions are (a) wired via CREATE TRIGGER and
-- cannot be invoked directly ("trigger functions can only be fired via
-- triggers"), or (b) SECURITY DEFINER helpers whose only caller
-- (get_join_channel_preview) itself runs as owner. None are referenced in RLS
-- policy expressions (pg_policies) — is_active_gm, is_channel_gm,
-- is_channel_member, is_server_admin (policy helpers) and get_channel_salt
-- (authenticated client RPC used pre-join) are deliberately NOT revoked.
-- Verified supabase/tests/20260905141623_sec1_grant_sweep.sql.

-- 1. Trigger functions: row-level guards wired via CREATE TRIGGER only; the
-- trigger fires as the table owner, so no API role needs direct EXECUTE.
REVOKE ALL ON FUNCTION public.enforce_gm_transfer_validity()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_image_upload_rules()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_member_field_bounds()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_member_insert_consent()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_url_scheme()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_member_identity_change()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_member_self_block_toggle()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_message_routing_change()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_message_update_tampering()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_non_gm_active_player_change()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_self_suspension_change()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_server_admin_escalation()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_channel_last_message_at()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_message_mentions()
  FROM PUBLIC, anon, authenticated, service_role;

-- 2. Notification/user hooks: only ever invoked by their triggers (auth hook
-- for handle_new_user; messaging triggers for the others).
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user_prefs()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_active_player_notification()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_admin_message_inserted()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_message_notification()
  FROM PUBLIC, anon, authenticated, service_role;

-- 3. SECURITY DEFINER helper: its only caller, get_join_channel_preview, is
-- itself SECURITY DEFINER and runs as owner. Direct calls would let any
-- authenticated session probe channel password state.
REVOKE ALL ON FUNCTION public.has_password(channels)
  FROM PUBLIC, anon, authenticated, service_role;
