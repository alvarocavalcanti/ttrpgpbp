-- Admin: get total image storage bytes used
CREATE OR REPLACE FUNCTION admin_get_image_storage_bytes()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint
    FROM storage.objects
    WHERE bucket_id = 'images'
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_get_image_storage_bytes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_image_storage_bytes() TO authenticated;
