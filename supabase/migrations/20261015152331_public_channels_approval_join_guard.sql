-- #674 approval-path hardening: closing the two rules the apply flow was not
-- enforcing, both of which only matter once a channel is listed.
--
-- 1. join_channel honoured an invite code or channel password on an
--    approval-mode channel, so anyone holding a shared invite link — or who
--    guessed the password — became a member without the GM ever deciding. Phase
--    B puts that listing in the Discover tab, so the gap was reachable from the
--    UI. A listed channel is apply-only: membership is granted solely by
--    decide_join_request.
--
-- 2. decide_join_request skipped the per-user channel cap that join_channel
--    enforces, so a GM approval could push an applicant past
--    max_channels_per_user. The cap belongs where membership is created, which
--    is why neither RPC checks it at application time: an applicant may queue an
--    application while at the limit and still be approved later if they leave a
--    channel in the meantime.
--
-- Body-only replacement of both functions; no signature, grant, or schema
-- change (ACLs survive CREATE OR REPLACE), so the regenerated types are
-- byte-identical.

-- ==========================================
-- 1. A listed channel cannot be joined by secret
-- ==========================================

CREATE OR REPLACE FUNCTION join_channel(
  p_channel_id UUID,
  p_character_name TEXT,
  p_character_avatar_url TEXT DEFAULT NULL,
  p_character_sheet_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_invite_code TEXT DEFAULT NULL,
  p_character_attributes JSONB DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel record;
  v_secret record;
  v_character_name TEXT;
  v_channel_count INTEGER;
  v_is_admin BOOLEAN;
  v_max_channels INTEGER;
  v_attributes JSONB;
  v_min_mod INTEGER := -4;
  v_max_mod INTEGER := 5;
  v_uid UUID := auth.uid();
  -- ponytail: throttle constants; tighten/relax here if abuse patterns shift.
  v_max_attempts INTEGER := 5;
  v_window INTERVAL := interval '10 minutes';
  v_auth_ok BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_suspended(v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account suspended.');
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Channel not found');
  END IF;

  IF v_channel.is_archived THEN
    RETURN jsonb_build_object('success', false, 'error', 'This channel has been archived and can no longer be joined.');
  END IF;

  -- #674: an approval-mode (listed) channel is apply-only. Checked before the
  -- secret comparison below so the invite code and password are not even an
  -- oracle for it. The GM keeps their own path, which never grants new access.
  IF v_channel.join_mode = 'approval' AND v_channel.gm_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This game only accepts applications. Apply from the Discover tab.');
  END IF;

  -- Throttle check: shut the password/invite oracle after too many failures.
  IF EXISTS (
    SELECT 1 FROM channel_join_failures
    WHERE user_id = v_uid AND channel_id = p_channel_id
      AND window_start > now() - v_window
      AND fail_count >= v_max_attempts
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many failed attempts. Try again later.');
  END IF;

  SELECT * INTO v_secret FROM channel_secrets WHERE channel_id = p_channel_id;

  IF v_channel.gm_id = v_uid THEN
    v_auth_ok := true;
  ELSIF v_channel.invite_code IS NOT NULL AND v_channel.invite_code = p_invite_code THEN
    v_auth_ok := true;
  ELSIF v_secret.password_hash IS NOT NULL
        AND v_secret.password_hash = p_password_hash THEN
    v_auth_ok := true;
  END IF;

  IF NOT v_auth_ok THEN
    -- Count the failure (invite code or password) in the current window.
    INSERT INTO channel_join_failures (user_id, channel_id, window_start, fail_count)
    VALUES (v_uid, p_channel_id, now(), 1)
    ON CONFLICT (user_id, channel_id) DO UPDATE SET
      window_start = CASE
        WHEN channel_join_failures.window_start < now() - v_window THEN now()
        ELSE channel_join_failures.window_start
      END,
      fail_count = CASE
        WHEN channel_join_failures.window_start < now() - v_window THEN 1
        ELSE channel_join_failures.fail_count + 1
      END;
    RETURN jsonb_build_object('success', false, 'error', 'Invalid password or invite code');
  END IF;

  -- Successful auth clears the failure history.
  DELETE FROM channel_join_failures WHERE user_id = v_uid AND channel_id = p_channel_id;

  v_character_name := LEFT(COALESCE(p_character_name, ''), 20);

  SELECT server_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    v_max_channels := 10;
    SELECT (value #>> '{}')::int INTO v_max_channels
    FROM app_settings WHERE key = 'max_channels_per_user';
    v_max_channels := COALESCE(v_max_channels, 10);

    SELECT COUNT(*) INTO v_channel_count
    FROM channel_members cm
    JOIN channels c ON c.id = cm.channel_id
    WHERE cm.user_id = v_uid AND NOT c.is_archived;
    IF v_channel_count >= v_max_channels THEN
      RETURN jsonb_build_object('success', false, 'error', format('Channel limit reached. You can join at most %s channels.', v_max_channels));
    END IF;
  END IF;

  IF v_channel.game_system = 'shadowdark' THEN
    v_min_mod := -4;
    v_max_mod := 4;
  END IF;

  v_attributes := '{}'::jsonb;
  IF p_character_attributes IS NOT NULL AND jsonb_typeof(p_character_attributes) = 'object' THEN
    SELECT jsonb_object_agg(k, least(greatest(v::int, v_min_mod), v_max_mod))
    INTO v_attributes
    FROM jsonb_each_text(p_character_attributes) AS e(k, v)
    WHERE v ~ '^-?\d+$';
  END IF;
  -- An empty/filtered object leaves jsonb_object_agg NULL; keep {} so the
  -- NOT NULL channel_members.attributes constraint is never violated.
  v_attributes := COALESCE(v_attributes, '{}'::jsonb);

  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url, attributes)
  VALUES (p_channel_id, v_uid, v_character_name, p_character_avatar_url, p_character_sheet_url, v_attributes);

  INSERT INTO messages (channel_id, sender_id, type, content)
  VALUES (p_channel_id, v_uid, 'system', v_character_name || ' joined the channel');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ==========================================
-- 2. Approval respects the per-user channel cap
-- ==========================================

CREATE OR REPLACE FUNCTION public.decide_join_request(
  p_request_id UUID,
  p_approve BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req RECORD;
  v_name TEXT;
  v_channel_count INTEGER;
  v_is_admin BOOLEAN;
  v_max_channels INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  -- Lock the row so two concurrent decisions cannot both apply.
  SELECT * INTO v_req FROM channel_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found.';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This application has already been decided.';
  END IF;
  IF NOT is_channel_gm(v_req.channel_id) THEN
    RAISE EXCEPTION 'Only the GM can decide applications.';
  END IF;

  IF p_approve THEN
    IF EXISTS (SELECT 1 FROM channels WHERE id = v_req.channel_id AND is_archived) THEN
      RAISE EXCEPTION 'This channel is archived.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_id = v_req.channel_id AND user_id = v_req.user_id AND is_blocked
    ) THEN
      RAISE EXCEPTION 'The applicant is blocked from this channel.';
    END IF;

    -- #674: approve only ever creates a membership, so the per-user cap is
    -- enforced here too, with the same limit join_channel reads. Skipped when
    -- the applicant is already a member (the insert below is a no-op then) and
    -- for server admins, matching join_channel.
    IF NOT EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_id = v_req.channel_id AND user_id = v_req.user_id
    ) THEN
      SELECT server_admin INTO v_is_admin FROM profiles WHERE id = v_req.user_id;
      IF NOT COALESCE(v_is_admin, false) THEN
        v_max_channels := 10;
        SELECT (value #>> '{}')::int INTO v_max_channels
        FROM app_settings WHERE key = 'max_channels_per_user';
        v_max_channels := COALESCE(v_max_channels, 10);

        SELECT COUNT(*) INTO v_channel_count
        FROM channel_members cm
        JOIN channels c ON c.id = cm.channel_id
        WHERE cm.user_id = v_req.user_id AND NOT c.is_archived;
        IF v_channel_count >= v_max_channels THEN
          RAISE EXCEPTION 'The applicant has reached their channel limit.';
        END IF;
      END IF;
    END IF;

    UPDATE channel_join_requests
    SET status = 'approved', decided_at = now(), decided_by = v_uid
    WHERE id = p_request_id;

    -- Name from the request, respecting the 20-char member limit. The
    -- transaction-local marker below is the consent that
    -- enforce_member_insert_consent accepts for this one insert; it is cleared
    -- immediately after, so a historical approved request can never re-add a
    -- member later.
    v_name := LEFT(v_req.character_name, 20);
    PERFORM set_config('app.approving_request', p_request_id::text, true);
    INSERT INTO channel_members (channel_id, user_id, character_name)
    VALUES (v_req.channel_id, v_req.user_id, v_name)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
    PERFORM set_config('app.approving_request', '', true);

    INSERT INTO messages (channel_id, sender_id, type, content)
    VALUES (v_req.channel_id, v_req.user_id, 'system', v_name || ' joined the channel');

    -- Approval is the successful outcome: clear the application throttle.
    DELETE FROM channel_join_failures
    WHERE user_id = v_req.user_id AND channel_id = v_req.channel_id;
  ELSE
    UPDATE channel_join_requests
    SET status = 'rejected', decided_at = now(), decided_by = v_uid
    WHERE id = p_request_id;
  END IF;
END;
$$;

-- ACLs survive CREATE OR REPLACE; restated so the boundary is explicit here too.
REVOKE ALL ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.decide_join_request(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_join_request(UUID, BOOLEAN) TO authenticated, service_role;
