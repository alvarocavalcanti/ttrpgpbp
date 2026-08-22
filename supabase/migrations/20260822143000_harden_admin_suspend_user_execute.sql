-- Harden admin suspend RPC privileges to match other admin_* RPCs.
REVOKE ALL ON FUNCTION admin_suspend_user(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_suspend_user(UUID, BOOLEAN, TEXT) TO authenticated;
