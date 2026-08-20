-- Add server report settings
INSERT INTO app_settings (key, value) VALUES ('recurring_report_frequency', '"off"');
INSERT INTO app_settings (key, value) VALUES ('recurring_report_last_sent_at', 'null');

CREATE OR REPLACE FUNCTION admin_get_image_storage_total()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total BIGINT;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' AND NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
  INTO total
  FROM storage.objects
  WHERE bucket_id = 'images';

  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION admin_get_image_storage_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_image_storage_total() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_image_storage_total() TO service_role;
