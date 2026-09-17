-- Trust & safety P0-A: admin content inspection.
--
-- The report workflow (abuse_reports + admin_list/resolve) shipped without a
-- way for a server admin to actually READ the reported message — reports could
-- be actioned but not investigated. These SECURITY DEFINER RPCs close that gap.
-- Every read is written to audit_logs (reading user content is itself a privacy
-- event), gated by is_server_admin().
--
-- The storage policy change at the bottom lets an admin sign an image the
-- admin console may need to triage a report. Unlike the message reads it is not
-- individually audited at the DB layer (the investigation action that surfaced
-- the path — admin_read_message — is); per-read image auditing would need a
-- service-role edge function, deliberately deferred.

CREATE OR REPLACE FUNCTION public.admin_read_message(p_message_id UUID)
RETURNS TABLE (
  id UUID,
  channel_id UUID,
  channel_name TEXT,
  sender_id UUID,
  sender_display_name TEXT,
  type TEXT,
  content TEXT,
  is_deleted BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM messages WHERE messages.id = p_message_id) THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (auth.uid(), 'read_message', p_message_id, NULL);

  RETURN QUERY
    SELECT
      m.id,
      m.channel_id,
      c.name,
      m.sender_id,
      p.display_name,
      m.type,
      m.content,
      m.is_deleted,
      m.created_at
    FROM messages m
    LEFT JOIN channels c ON c.id = m.channel_id
    LEFT JOIN profiles p ON p.id = m.sender_id
    WHERE m.id = p_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_read_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_read_message(UUID) TO authenticated;

-- Paged message history for a user, newest first. Includes soft-deleted rows:
-- moderation needs to see what was removed. The caller pages by passing the
-- oldest created_at it has seen as p_before.
CREATE OR REPLACE FUNCTION public.admin_list_user_messages(
  p_user_id UUID,
  p_before TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  channel_id UUID,
  channel_name TEXT,
  content TEXT,
  type TEXT,
  is_deleted BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (auth.uid(), 'list_user_messages', p_user_id, jsonb_build_object('limit', v_limit));

  RETURN QUERY
    SELECT
      m.id,
      m.channel_id,
      c.name,
      m.content,
      m.type,
      m.is_deleted,
      m.created_at
    FROM messages m
    LEFT JOIN channels c ON c.id = m.channel_id
    WHERE m.sender_id = p_user_id
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_messages(UUID, TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_messages(UUID, TIMESTAMPTZ, INT) TO authenticated;

-- Resolve an image object path to its channel for context, and record the
-- inspection. The first path segment is the owning channel id (see
-- useImageUpload: `${channelId}/...`).
CREATE OR REPLACE FUNCTION public.admin_read_image(p_object_path TEXT)
RETURNS TABLE (object_path TEXT, channel_id UUID, channel_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  BEGIN
    v_channel_id := split_part(p_object_path, '/', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid image path';
  END;

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (auth.uid(), 'read_image', v_channel_id, jsonb_build_object('object_path', p_object_path));

  RETURN QUERY
    SELECT p_object_path, v_channel_id, (SELECT c.name FROM channels c WHERE c.id = v_channel_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_read_image(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_read_image(TEXT) TO authenticated;

-- Admins are not channel members, so the membership-gated image read policy
-- blocked them from signing a reported image. Allow the server admin through.
DROP POLICY IF EXISTS "images_select" ON storage.objects;
CREATE POLICY "images_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'images'
    AND (
      is_channel_member((storage.foldername(name))[1]::uuid)
      OR is_server_admin()
    )
  );
