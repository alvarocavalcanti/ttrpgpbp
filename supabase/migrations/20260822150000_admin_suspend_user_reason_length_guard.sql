-- Add server-side reason length guard to admin_suspend_user to prevent audit_logs bloat.
CREATE OR REPLACE FUNCTION admin_suspend_user(p_user_id UUID, p_suspend BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Requires server admin privileges';
  END IF;

  IF p_reason IS NOT NULL AND char_length(trim(p_reason)) > 200 THEN
    RAISE EXCEPTION 'Reason must not exceed 200 characters';
  END IF;

  UPDATE profiles SET is_suspended = p_suspend WHERE id = p_user_id;

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_suspend THEN 'suspend_user' ELSE 'unsuspend_user' END,
    p_user_id,
    jsonb_build_object('reason', trim(p_reason))
  );
END;
$$;
