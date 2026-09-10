-- #461: Server admin abuse-reports viewer. The abuse_reports table shipped in
-- 20260819130000 with RLS and the player submission UI landed in #467, but
-- there was no admin surface: reports were a black hole. These two RPCs give
-- the admin console a list (with reporter/reported/channel context) and a
-- status transition (resolved = actioned, dismissed). Both mirror the existing
-- admin_* shape: SECURITY DEFINER, is_server_admin() guard, execute granted to
-- authenticated only.
--
-- Status vocabulary stays as the table comment defines it (pending, resolved,
-- dismissed); the UI maps pending->Open, resolved->Actioned.

-- List every report, newest first, with the display names the admin needs to
-- act. Profile/channel joins are LEFT so rows survive a deleted user or
-- channel (both FKs are ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.admin_list_abuse_reports()
RETURNS TABLE (
  id UUID,
  reporter_id UUID,
  reporter_display_name TEXT,
  reported_user_id UUID,
  reported_display_name TEXT,
  channel_id UUID,
  channel_name TEXT,
  message_id UUID,
  reason TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT
      ar.id,
      ar.reporter_id,
      reporter.display_name,
      ar.reported_user_id,
      reported.display_name,
      ar.channel_id,
      c.name,
      ar.message_id,
      ar.reason,
      ar.status,
      ar.created_at,
      ar.updated_at
    FROM abuse_reports ar
    LEFT JOIN profiles reporter ON reporter.id = ar.reporter_id
    LEFT JOIN profiles reported ON reported.id = ar.reported_user_id
    LEFT JOIN channels c ON c.id = ar.channel_id
    ORDER BY ar.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_abuse_reports() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_abuse_reports() TO authenticated;

-- Move a report to its terminal state. Only resolved/dismissed are accepted so
-- the client can't resurrect a report or write arbitrary text; the status
-- transition is recorded in audit_logs (suspend/unsuspend already log there).
CREATE OR REPLACE FUNCTION public.admin_resolve_abuse_report(p_report_id UUID, p_status TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reported_user_id UUID;
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_status NOT IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid report status: %', p_status;
  END IF;

  UPDATE abuse_reports
     SET status = p_status, updated_at = NOW()
   WHERE id = p_report_id
   RETURNING reported_user_id INTO v_reported_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (
    auth.uid(),
    'resolve_abuse_report',
    p_report_id,
    jsonb_build_object('status', p_status, 'reported_user_id', v_reported_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_abuse_report(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_abuse_report(UUID, TEXT) TO authenticated;
