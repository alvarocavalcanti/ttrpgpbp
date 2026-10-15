-- #674 Phase A: public-facing channels — RPCs, admin surface, lifecycle guards.
--
-- All channel writes stay server-owned. Discovery is a safe projection
-- (id/name/GM/game_system/description/constraints/member_count/activity only —
-- never messages, member identities, invite_code, channel_secrets, or
-- last_message_preview), following the get_join_channel_preview precedent: the
-- channels SELECT policy is NOT broadened.

-- ==========================================
-- 1. Discovery (signed-in)
-- ==========================================

CREATE OR REPLACE FUNCTION public.list_public_channels(
  p_search TEXT DEFAULT NULL,
  p_game_system TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  gm_display_name TEXT,
  game_system TEXT,
  description TEXT,
  constraints TEXT,
  member_count BIGINT,
  last_message_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_search TEXT;
  v_game_system TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_search := NULLIF(btrim(p_search), '');
  v_game_system := NULLIF(btrim(p_game_system), '');

  RETURN QUERY
  SELECT c.id, c.name, gm.display_name, c.game_system, c.description, c.constraints,
    COALESCE(m.members, 0) AS member_count, c.last_message_at
  FROM channels c
  LEFT JOIN profiles gm ON gm.id = c.gm_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS members
    FROM channel_members cm
    WHERE cm.channel_id = c.id AND NOT cm.is_blocked
  ) m ON true
  WHERE c.join_mode = 'approval'
    AND NOT c.is_archived
    -- A blocked caller never discovers the channel.
    AND NOT EXISTS (
      SELECT 1 FROM channel_members cm
      WHERE cm.channel_id = c.id AND cm.user_id = v_uid AND cm.is_blocked
    )
    AND (
      v_search IS NULL
      OR c.name ILIKE '%' || v_search || '%'
      OR c.description ILIKE '%' || v_search || '%'
    )
    AND (v_game_system IS NULL OR c.game_system = v_game_system)
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
  -- A NULL p_limit must not become LIMIT ALL (an unbounded read): default to
  -- the page size and cap it.
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 0), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_channel(p_channel_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  gm_display_name TEXT,
  game_system TEXT,
  description TEXT,
  constraints TEXT,
  application_prompt TEXT,
  member_count BIGINT,
  last_message_at TIMESTAMPTZ,
  is_member BOOLEAN,
  pending_request_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, gm.display_name, c.game_system, c.description,
    c.constraints, c.application_prompt,
    COALESCE(m.members, 0) AS member_count, c.last_message_at,
    EXISTS (
      SELECT 1 FROM channel_members cm
      WHERE cm.channel_id = c.id AND cm.user_id = v_uid AND NOT cm.is_blocked
    ) AS is_member,
    (
      SELECT cjr.id FROM channel_join_requests cjr
      WHERE cjr.channel_id = c.id AND cjr.user_id = v_uid AND cjr.status = 'pending'
      LIMIT 1
    ) AS pending_request_id
  FROM channels c
  LEFT JOIN profiles gm ON gm.id = c.gm_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS members
    FROM channel_members cm
    WHERE cm.channel_id = c.id AND NOT cm.is_blocked
  ) m ON true
  WHERE c.id = p_channel_id
    AND c.join_mode = 'approval'
    AND NOT c.is_archived
    AND NOT EXISTS (
      SELECT 1 FROM channel_members cm
      WHERE cm.channel_id = c.id AND cm.user_id = v_uid AND cm.is_blocked
    );
END;
$$;

-- ==========================================
-- 2. Apply / withdraw / decide
-- ==========================================

CREATE OR REPLACE FUNCTION public.request_to_join_channel(
  p_channel_id UUID,
  p_character_name TEXT,
  p_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_channel RECORD;
  v_name TEXT;
  v_message TEXT;
  v_request_id UUID;
  -- ponytail: reuse channel_join_failures as an application-attempt throttle
  -- (same per-user/channel windowed counter join_channel uses for password
  -- attempts); swap for a dedicated table only if the two throttles need to
  -- diverge.
  v_max_attempts INTEGER := 5;
  v_window INTERVAL := interval '10 minutes';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found.';
  END IF;
  IF v_channel.join_mode <> 'approval' THEN
    RAISE EXCEPTION 'This channel is not accepting applications.';
  END IF;
  IF v_channel.is_archived THEN
    RAISE EXCEPTION 'This channel is archived and is not accepting applications.';
  END IF;
  IF v_channel.gm_id = v_uid THEN
    RAISE EXCEPTION 'You already run this channel.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM channel_members cm
    WHERE cm.channel_id = p_channel_id AND cm.user_id = v_uid AND cm.is_blocked
  ) THEN
    RAISE EXCEPTION 'You cannot apply to this channel.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM channel_members cm
    WHERE cm.channel_id = p_channel_id AND cm.user_id = v_uid AND NOT cm.is_blocked
  ) THEN
    RAISE EXCEPTION 'You are already a member of this channel.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM channel_join_failures
    WHERE user_id = v_uid AND channel_id = p_channel_id
      AND window_start > now() - v_window
      AND fail_count >= v_max_attempts
  ) THEN
    RAISE EXCEPTION 'Too many applications. Try again later.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM channel_join_requests
    WHERE channel_id = p_channel_id AND user_id = v_uid AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending application for this channel.';
  END IF;

  v_name := LEFT(btrim(COALESCE(p_character_name, '')), 20);
  IF v_name = '' THEN
    RAISE EXCEPTION 'Enter a character name.';
  END IF;
  v_message := NULLIF(btrim(p_message), '');
  IF v_message IS NOT NULL AND char_length(v_message) > 1000 THEN
    RAISE EXCEPTION 'Your answer is too long (max 1000 characters).';
  END IF;

  INSERT INTO channel_join_requests (channel_id, user_id, character_name, message)
  VALUES (p_channel_id, v_uid, v_name, v_message)
  RETURNING id INTO v_request_id;

  -- Count the attempt for throttling (rolling window, mirrors join_channel).
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

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_join_request(p_request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE channel_join_requests
  SET status = 'withdrawn', decided_at = now()
  WHERE id = p_request_id AND user_id = v_uid AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending application to withdraw.';
  END IF;
END;
$$;

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

    UPDATE channel_join_requests
    SET status = 'approved', decided_at = now(), decided_by = v_uid
    WHERE id = p_request_id;

    -- Name from the request, respecting the 20-char member limit.
    v_name := LEFT(v_req.character_name, 20);
    INSERT INTO channel_members (channel_id, user_id, character_name)
    VALUES (v_req.channel_id, v_req.user_id, v_name)
    ON CONFLICT (channel_id, user_id) DO NOTHING;

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

-- The consent trigger (20260831150000) lets an authenticated writer add only
-- themselves, which is what stops a GM force-adding a stranger. decide_join_request
-- legitimately adds the APPLICANT, so extend the trigger to also allow the insert
-- when an approved request exists for that (channel, user). A GM still cannot
-- force-add: the only path to an approved request is the applicant-initiated
-- apply -> GM-approve flow (clients hold no INSERT on channel_join_requests).
CREATE OR REPLACE FUNCTION public.enforce_member_insert_consent()
RETURNS TRIGGER AS $$
BEGIN
  -- Authenticated writers may only add themselves, unless completing an
  -- approved join request. Definer contexts (auth.uid() IS NULL) are server-side
  -- joins and stay allowed.
  IF auth.uid() IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM channel_join_requests cjr
      WHERE cjr.channel_id = NEW.channel_id
        AND cjr.user_id = NEW.user_id
        AND cjr.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'You can only join a channel as yourself.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 3. Moderation
-- ==========================================

CREATE OR REPLACE FUNCTION public.report_channel_listing(
  p_channel_id UUID,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_reason TEXT;
  v_gm UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Enter a reason.';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Reason is too long (max 500 characters).';
  END IF;

  SELECT gm_id INTO v_gm FROM channels
  WHERE id = p_channel_id AND join_mode = 'approval' AND NOT is_archived;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found.';
  END IF;

  -- The channel's GM is the reported party (message_id stays NULL: this is a
  -- listing report, and the null-message integrity path preserves the target).
  INSERT INTO abuse_reports (reporter_id, reported_user_id, channel_id, message_id, reason)
  VALUES (v_uid, v_gm, p_channel_id, NULL, v_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_takedown_channel(
  p_channel_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id) THEN
    RAISE EXCEPTION 'Channel not found.';
  END IF;

  -- Delist only: the channel and its history stay intact. The channels
  -- listing-lifecycle trigger closes any open applications.
  UPDATE channels SET join_mode = 'invite', updated_at = now()
  WHERE id = p_channel_id;

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (v_uid, 'takedown_channel_listing', p_channel_id, jsonb_build_object('reason', p_reason));
END;
$$;

-- ==========================================
-- 4. update_channel_settings: add listing fields
-- ==========================================

-- DROP first: a new parameter changes the signature, so CREATE OR REPLACE would
-- leave the old overload in place.
DROP FUNCTION IF EXISTS public.update_channel_settings(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_channel_settings(
  p_channel_id UUID,
  p_name TEXT DEFAULT NULL,
  p_game_system TEXT DEFAULT NULL,
  p_map_url TEXT DEFAULT NULL,
  p_resources_url TEXT DEFAULT NULL,
  p_safety_tools_url TEXT DEFAULT NULL,
  p_gm_only_resources_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_password_salt TEXT DEFAULT NULL,
  p_clear_password BOOLEAN DEFAULT false,
  p_safety_lines TEXT DEFAULT NULL,
  p_safety_veils TEXT DEFAULT NULL,
  p_join_mode TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_constraints TEXT DEFAULT NULL,
  p_application_prompt TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_channel RECORD;
  v_description TEXT;
  v_constraints TEXT;
  v_prompt TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
  IF v_channel.gm_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the GM can change channel settings.';
  END IF;

  UPDATE channels SET
    name = COALESCE(NULLIF(p_name, ''), name),
    game_system = COALESCE(p_game_system, game_system),
    map_url = p_map_url,
    resources_url = p_resources_url,
    safety_tools_url = p_safety_tools_url,
    updated_at = now()
  WHERE id = p_channel_id;

  -- Discovery / listing copy. Only touched when the caller passes a join mode;
  -- flipping back to 'invite' delists (the lifecycle trigger closes open
  -- applications).
  IF p_join_mode IS NOT NULL THEN
    IF p_join_mode NOT IN ('invite', 'approval') THEN
      RAISE EXCEPTION 'Invalid join mode.';
    END IF;

    v_description := NULLIF(btrim(p_description), '');
    v_constraints := NULLIF(btrim(p_constraints), '');
    v_prompt := NULLIF(btrim(p_application_prompt), '');

    IF p_join_mode = 'approval' THEN
      IF v_description IS NULL OR v_constraints IS NULL THEN
        RAISE EXCEPTION 'A listed channel needs a description and constraints.';
      END IF;
      IF char_length(v_description) > 600 OR char_length(v_constraints) > 600 THEN
        RAISE EXCEPTION 'Description and constraints must be 600 characters or fewer.';
      END IF;
    END IF;
    IF v_prompt IS NOT NULL AND char_length(v_prompt) > 300 THEN
      RAISE EXCEPTION 'The application prompt must be 300 characters or fewer.';
    END IF;

    UPDATE channels SET
      join_mode = p_join_mode::public.channel_join_mode,
      description = v_description,
      constraints = v_constraints,
      application_prompt = v_prompt,
      updated_at = now()
    WHERE id = p_channel_id;
  END IF;

  INSERT INTO channel_secrets (channel_id, gm_only_resources_url)
  VALUES (p_channel_id, NULLIF(p_gm_only_resources_url, ''))
  ON CONFLICT (channel_id) DO UPDATE SET
    gm_only_resources_url = NULLIF(EXCLUDED.gm_only_resources_url, '');

  IF p_clear_password OR p_password_hash IS NOT NULL OR p_password_salt IS NOT NULL THEN
    INSERT INTO channel_secrets (channel_id, password_hash, password_salt)
    VALUES (p_channel_id,
      CASE WHEN p_clear_password THEN NULL ELSE p_password_hash END,
      CASE WHEN p_clear_password THEN NULL ELSE p_password_salt END)
    ON CONFLICT (channel_id) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      password_salt = EXCLUDED.password_salt;
  END IF;

  IF p_safety_lines IS NOT NULL OR p_safety_veils IS NOT NULL THEN
    INSERT INTO channel_safety_tools (channel_id, lines, veils, updated_at)
    VALUES (p_channel_id, COALESCE(p_safety_lines, ''), COALESCE(p_safety_veils, ''), now())
    ON CONFLICT (channel_id) DO UPDATE SET
      lines = COALESCE(p_safety_lines, channel_safety_tools.lines),
      veils = COALESCE(p_safety_veils, channel_safety_tools.veils),
      updated_at = now();
  END IF;
END;
$$;

-- ==========================================
-- 5. admin_list_channels: expose listing state
-- ==========================================

-- DROP first: the return type changes (SQLSTATE 42P13).
DROP FUNCTION IF EXISTS public.admin_list_channels();
CREATE OR REPLACE FUNCTION public.admin_list_channels()
RETURNS TABLE (
  id UUID,
  name TEXT,
  game_system TEXT,
  gm_id UUID,
  member_count BIGINT,
  created_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  gm_display_name TEXT,
  human_sender_count BIGINT,
  human_message_count BIGINT,
  join_mode public.channel_join_mode,
  pending_request_count BIGINT
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
    SELECT c.id, c.name, c.game_system, c.gm_id,
      COALESCE(m.members, 0) AS member_count,
      c.created_at,
      c.last_message_at,
      gm.display_name AS gm_display_name,
      COALESCE(a.senders, 0) AS human_sender_count,
      COALESCE(a.messages, 0) AS human_message_count,
      c.join_mode,
      COALESCE(p.pending, 0) AS pending_request_count
    FROM channels c
    LEFT JOIN profiles gm ON gm.id = c.gm_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS members
      FROM channel_members cm
      WHERE cm.channel_id = c.id
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT msg.sender_id) AS senders, COUNT(*) AS messages
      FROM messages msg
      WHERE msg.channel_id = c.id
        AND msg.sender_id IS NOT NULL
        AND msg.type <> 'system'
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS pending
      FROM channel_join_requests cjr
      WHERE cjr.channel_id = c.id AND cjr.status = 'pending'
    ) p ON true
    WHERE NOT c.is_archived
    ORDER BY c.created_at DESC;
END;
$$;

-- ==========================================
-- 6. Listing lifecycle guards
-- ==========================================

-- An archived channel is never listed, and closing a listing closes its open
-- applications. Scoped to is_archived / join_mode so the hot last_message_at
-- update path never runs this.
CREATE OR REPLACE FUNCTION public.enforce_channel_listing_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_archived THEN
    NEW.join_mode := 'invite';
  END IF;

  IF NEW.join_mode = 'invite' AND OLD.join_mode = 'approval' THEN
    UPDATE channel_join_requests
    SET status = 'rejected', decided_at = now()
    WHERE channel_id = NEW.id AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER channels_listing_lifecycle
  BEFORE UPDATE OF is_archived, join_mode ON public.channels
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_channel_listing_lifecycle();

-- A suspended GM cannot vet applicants (is_channel_gm is false), so their
-- listings are closed.
CREATE OR REPLACE FUNCTION public.delist_channels_on_gm_suspend()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE channels SET join_mode = 'invite'
  WHERE gm_id = NEW.id AND join_mode = 'approval';
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_suspend_delists_channels
  AFTER UPDATE OF is_suspended ON public.profiles
  FOR EACH ROW
  WHEN (NEW.is_suspended AND NOT OLD.is_suspended)
  EXECUTE FUNCTION public.delist_channels_on_gm_suspend();

-- A deleted GM's channel is orphaned (gm_id SET NULL), so delist BEFORE the FK
-- nulls it — otherwise the listing would sit unapprovable in /directory.
CREATE OR REPLACE FUNCTION public.delist_channels_on_gm_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE channels SET join_mode = 'invite'
  WHERE gm_id = OLD.id AND join_mode = 'approval';
  RETURN OLD;
END;
$$;

CREATE TRIGGER profiles_delete_delists_channels
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.delist_channels_on_gm_delete();

-- ==========================================
-- 7. Grants
-- ==========================================

REVOKE ALL ON FUNCTION public.list_public_channels(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_public_channels(TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_public_channel(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_channel(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.request_to_join_channel(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_to_join_channel(UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.withdraw_join_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_join_request(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.decide_join_request(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_join_request(UUID, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.report_channel_listing(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_channel_listing(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_takedown_channel(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_takedown_channel(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_channels() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_channels() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_channel_settings(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_channel_settings(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Trigger helpers: never directly callable by an API role (grant-sweep class
-- guard). enforce_abuse_report_integrity's revoke already exists.
REVOKE ALL ON FUNCTION public.enforce_channel_listing_lifecycle()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delist_channels_on_gm_suspend()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delist_channels_on_gm_delete()
  FROM PUBLIC, anon, authenticated, service_role;
