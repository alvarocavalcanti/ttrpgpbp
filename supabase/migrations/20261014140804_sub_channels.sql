-- #621: Rooms (sub-channels). A room is a message-scoping dimension on top of
-- the existing channel, not a child channels row. Membership, character
-- identity, joins, the channel cap, the lobby, invite/password, and
-- channel_members.last_read_at all stay keyed on the parent channel_id; only
-- the message room is new. messages.sub_channel_id is nullable (NULL = Main),
-- so historical and system messages need zero backfill and zero insert-site
-- changes. Realtime cannot filter on NULL, so clients subscribe at channel_id
-- and filter the room in the handler.
--
-- All room writes are GM-only and server-owned: the sub_channels table has a
-- SELECT-only policy, so create/rename/archive/delete go through the
-- SECURITY DEFINER RPCs below. A direct client INSERT on messages is still
-- possible (the "Members can insert messages" policy), so that policy is
-- extended with the room-belongs-to-this-channel invariant as a backstop.

-- ==========================================
-- 1. sub_channels table
-- ==========================================

CREATE TABLE public.sub_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sub_channels_name_length CHECK (char_length(trim(name)) BETWEEN 1 AND 40)
);

-- One room name per channel, case-insensitive (the RPC stores trimmed names).
CREATE UNIQUE INDEX sub_channels_channel_lower_name_idx
  ON public.sub_channels (channel_id, lower(trim(name)));
CREATE INDEX sub_channels_channel_created_idx
  ON public.sub_channels (channel_id, created_at);

ALTER TABLE public.sub_channels ENABLE ROW LEVEL SECURITY;

-- Members may read the rooms of their channels; every write goes through an RPC.
CREATE POLICY "Members can view channel rooms"
  ON public.sub_channels FOR SELECT
  USING (is_channel_member(channel_id));

-- ==========================================
-- 2. messages.sub_channel_id (NULL = Main)
-- ==========================================

-- ON DELETE RESTRICT backs the "cannot delete a non-empty room" rule; no
-- default and no backfill, so existing rows stay on Main.
ALTER TABLE public.messages
  ADD COLUMN sub_channel_id uuid NULL
  REFERENCES public.sub_channels(id) ON DELETE RESTRICT;

CREATE INDEX messages_channel_sub_channel_created_idx
  ON public.messages (channel_id, sub_channel_id, created_at DESC);

-- Realtime: a DELETE echo carries only the primary key unless the replica
-- identity is FULL, so the client's channel_id=eq. filter would drop it.
ALTER TABLE public.sub_channels REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_channels;

-- ==========================================
-- 3. messages INSERT policy backstop
-- ==========================================

-- A member can insert a message directly (not every write goes through an
-- RPC). Nothing else stops them from pointing sub_channel_id at a room that
-- belongs to a different channel, so pin the invariant here too. Latest prior
-- text: 20260817144037_backend_command_schema.sql.
DROP POLICY IF EXISTS "Members can insert messages" ON messages;

CREATE POLICY "Members can insert messages"
  ON messages FOR INSERT WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM channels c WHERE c.id = channel_id AND c.is_archived
    )
    AND is_channel_member(channel_id)
    AND sender_id = auth.uid()
    AND type IN ('regular', 'scene', 'npc')
    AND (type NOT IN ('scene', 'npc') OR is_channel_gm(channel_id))
    AND (
      sub_channel_id IS NULL
      OR EXISTS (
        SELECT 1 FROM sub_channels sc
        WHERE sc.id = sub_channel_id AND sc.channel_id = messages.channel_id
      )
    )
    AND (
      reply_to IS NULL
      OR EXISTS (
        SELECT 1 FROM messages m
        WHERE m.id = reply_to AND m.channel_id = messages.channel_id AND NOT m.is_deleted
      )
    )
    AND (
      whisper_to IS NULL
      OR EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = messages.channel_id AND cm.user_id = whisper_to AND NOT cm.is_blocked
      )
    )
  );

-- ==========================================
-- 4. Routing immutability: a message never moves between rooms
-- ==========================================

-- Extends the trigger from 20260812120000 to pin sub_channel_id alongside the
-- other routing fields.
CREATE OR REPLACE FUNCTION prevent_message_routing_change()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NEW.channel_id IS DISTINCT FROM OLD.channel_id OR
    NEW.sender_id IS DISTINCT FROM OLD.sender_id OR
    NEW.type IS DISTINCT FROM OLD.type OR
    NEW.whisper_to IS DISTINCT FROM OLD.whisper_to OR
    NEW.sub_channel_id IS DISTINCT FROM OLD.sub_channel_id
  ) THEN
    RAISE EXCEPTION 'messages routing fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 5. Per-room read state
-- ==========================================

CREATE TABLE public.sub_channel_reads (
  sub_channel_id uuid NOT NULL REFERENCES public.sub_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sub_channel_id, user_id)
);

ALTER TABLE public.sub_channel_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own room reads"
  ON public.sub_channel_reads FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own room reads"
  ON public.sub_channel_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own room reads"
  ON public.sub_channel_reads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ==========================================
-- 6. Room CRUD RPCs (GM-only)
-- ==========================================

CREATE OR REPLACE FUNCTION public.create_sub_channel(
  p_channel_id UUID,
  p_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT;
  v_count INTEGER;
  v_is_admin BOOLEAN;
  v_room_id UUID;
  -- ponytail: hardcoded room cap of 10; promote to app_settings when a GM asks for a different limit.
  v_cap CONSTANT INTEGER := 10;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
  IF EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This channel is archived and can no longer receive new rooms.';
  END IF;
  IF NOT is_channel_gm(p_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can create rooms.';
  END IF;

  v_name := trim(p_name);
  IF v_name = '' THEN
    RAISE EXCEPTION 'Enter a room name.';
  END IF;
  IF char_length(v_name) > 40 THEN
    RAISE EXCEPTION 'Room name is too long (max 40 characters).';
  END IF;

  -- Server admins bypass the cap, mirroring create_channel. Count active rooms
  -- only: an archived room is retired (readable but off the tab bar), so
  -- archiving frees a slot and a GM can never be locked out at the cap.
  SELECT server_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    SELECT COUNT(*) INTO v_count FROM sub_channels
    WHERE channel_id = p_channel_id AND NOT is_archived;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'Room limit reached (%). Delete a room first.', v_cap;
    END IF;
  END IF;

  INSERT INTO sub_channels (channel_id, name, created_by)
  VALUES (p_channel_id, v_name, v_uid)
  RETURNING id INTO v_room_id;

  RETURN v_room_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.update_sub_channel(
  p_sub_channel_id UUID,
  p_name TEXT DEFAULT NULL,
  p_is_archived BOOLEAN DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_channel_id UUID;
  v_name TEXT;
  v_is_admin BOOLEAN;
  -- ponytail: hardcoded room cap of 10; keep in sync with create_sub_channel.
  v_cap CONSTANT INTEGER := 10;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT channel_id INTO v_channel_id FROM sub_channels WHERE id = p_sub_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF NOT is_channel_gm(v_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can manage rooms.';
  END IF;

  IF p_name IS NOT NULL THEN
    v_name := trim(p_name);
    IF v_name = '' THEN
      RAISE EXCEPTION 'Enter a room name.';
    END IF;
    IF char_length(v_name) > 40 THEN
      RAISE EXCEPTION 'Room name is too long (max 40 characters).';
    END IF;
    UPDATE sub_channels SET name = v_name, updated_at = now() WHERE id = p_sub_channel_id;
  END IF;

  IF p_is_archived IS NOT NULL THEN
    -- Restoring reactivates a room: enforce the active cap here too, or a
    -- create -> archive -> create -> restore loop bypasses it forever.
    IF p_is_archived = false AND EXISTS (
      SELECT 1 FROM sub_channels WHERE id = p_sub_channel_id AND is_archived
    ) THEN
      SELECT server_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
      IF NOT COALESCE(v_is_admin, false) THEN
        IF (SELECT COUNT(*) FROM sub_channels WHERE channel_id = v_channel_id AND NOT is_archived) >= v_cap THEN
          RAISE EXCEPTION 'Room limit reached (%). Archive or delete a room first.', v_cap;
        END IF;
      END IF;
    END IF;
    UPDATE sub_channels SET is_archived = p_is_archived, updated_at = now()
    WHERE id = p_sub_channel_id;
  END IF;
END;
$func$;

CREATE OR REPLACE FUNCTION public.delete_sub_channel(
  p_sub_channel_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_channel_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT channel_id INTO v_channel_id FROM sub_channels WHERE id = p_sub_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF NOT is_channel_gm(v_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can manage rooms.';
  END IF;

  -- Refuse rather than cascade: a room with history is retired by archiving.
  IF EXISTS (SELECT 1 FROM messages WHERE sub_channel_id = p_sub_channel_id) THEN
    RAISE EXCEPTION 'This room still has messages. Archive it instead.';
  END IF;

  DELETE FROM sub_channels WHERE id = p_sub_channel_id;
END;
$func$;

-- ==========================================
-- 7. Per-room read state RPCs
-- ==========================================

CREATE OR REPLACE FUNCTION public.mark_sub_channel_read(
  p_sub_channel_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_channel_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT channel_id INTO v_channel_id FROM sub_channels WHERE id = p_sub_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF NOT is_channel_member(v_channel_id) THEN
    RAISE EXCEPTION 'You are not a member of this channel.';
  END IF;

  INSERT INTO sub_channel_reads (sub_channel_id, user_id, last_read_at)
  VALUES (p_sub_channel_id, v_uid, now())
  ON CONFLICT (sub_channel_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$func$;

-- One call returns every room's unread for the caller, including the Main
-- (NULL sub_channel_id) group. The count predicate mirrors
-- get_user_channels_unread verbatim (sender excluded, not deleted, and the
-- whisper-visibility clause), so an unreadable whisper never lights a dot.
CREATE OR REPLACE FUNCTION public.get_channel_room_unread(
  p_channel_id UUID
)
RETURNS TABLE (sub_channel_id UUID, unread_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_my_last_read TIMESTAMPTZ;
  v_is_gm BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_channel_member(p_channel_id) THEN
    RAISE EXCEPTION 'You are not a member of this channel.';
  END IF;

  v_is_gm := is_channel_gm(p_channel_id);

  SELECT cm.last_read_at INTO v_my_last_read
  FROM channel_members cm
  WHERE cm.channel_id = p_channel_id AND cm.user_id = v_uid;

  RETURN QUERY
  WITH rooms AS (
    SELECT NULL::UUID AS sub_channel_id, v_my_last_read AS last_read_at
    UNION ALL
    SELECT sc.id, scr.last_read_at
    FROM sub_channels sc
    LEFT JOIN sub_channel_reads scr
      ON scr.sub_channel_id = sc.id AND scr.user_id = v_uid
    WHERE sc.channel_id = p_channel_id
  )
  SELECT r.sub_channel_id, COALESCE((
    SELECT COUNT(*) FROM messages m
    WHERE m.channel_id = p_channel_id
      AND m.sub_channel_id IS NOT DISTINCT FROM r.sub_channel_id
      AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
      AND m.sender_id <> v_uid
      AND m.is_deleted = false
      AND (
        m.whisper_to IS NULL
        OR m.whisper_to = v_uid
        OR m.sender_id = v_uid
        OR v_is_gm
      )
  ), 0)::BIGINT
  FROM rooms r;
END;
$func$;

-- ==========================================
-- 8. send_message: add p_sub_channel_id
-- ==========================================

-- Body copied from 20260831150000 (newest) with the room validation, the room
-- set on the insert, and the reply-target check tightened to the same room
-- (otherwise a reply crosses rooms and its preview is invisible in the
-- current timeline). Drop + recreate because a new parameter changes the
-- signature and would otherwise leave the old overload in place.
DROP FUNCTION IF EXISTS public.send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID);

CREATE FUNCTION public.send_message(
  p_channel_id UUID,
  p_content TEXT,
  p_type TEXT DEFAULT 'regular',
  p_reply_to UUID DEFAULT NULL,
  p_whisper_to UUID DEFAULT NULL,
  p_active_player_ids UUID[] DEFAULT NULL,
  p_npc_name TEXT DEFAULT NULL,
  p_npc_avatar_url TEXT DEFAULT NULL,
  p_client_request_id UUID DEFAULT NULL,
  p_sub_channel_id UUID DEFAULT NULL
)
RETURNS TABLE (message_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_msg_id UUID;
  v_mention_ids UUID[];
  v_content TEXT;
  v_npc_name TEXT := NULL;
  v_npc_avatar_url TEXT := NULL;
  v_existing_msg UUID;
  v_member_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  -- Idempotent retry.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing_msg
    FROM messages
    WHERE client_request_id = p_client_request_id
      AND channel_id = p_channel_id
      AND sender_id = v_uid;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing_msg;
      RETURN;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This channel is archived and can no longer receive messages.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = v_uid AND is_blocked = false
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'You are not a member of this channel.';
  END IF;

  -- The room, when given, must belong to this channel.
  IF p_sub_channel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sub_channels
    WHERE id = p_sub_channel_id AND channel_id = p_channel_id
  ) THEN
    RAISE EXCEPTION 'Room not found in this channel.';
  END IF;

  -- Type authorization: scene / NPC are GM-only.
  IF p_type NOT IN ('regular', 'scene', 'npc') THEN
    RAISE EXCEPTION 'Invalid message type.';
  END IF;
  IF p_type IN ('scene', 'npc') AND NOT is_channel_gm(p_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can send % messages.', p_type;
  END IF;

  -- Content limits: trim and cap.
  v_content := trim(p_content);
  IF v_content = '' THEN
    RAISE EXCEPTION 'Message cannot be empty.';
  END IF;
  IF char_length(v_content) > 4000 THEN
    RAISE EXCEPTION 'Message is too long (max 4000 characters).';
  END IF;

  -- Reply target must exist, not be deleted, and live in the same room.
  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM messages
    WHERE id = p_reply_to AND channel_id = p_channel_id AND NOT is_deleted
      AND sub_channel_id IS NOT DISTINCT FROM p_sub_channel_id
  ) THEN
    RAISE EXCEPTION 'Reply target is not in this room.';
  END IF;

  -- Whisper target must be an active (non-blocked, non-suspended) member.
  IF p_whisper_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = p_whisper_to
      AND NOT is_blocked AND NOT is_suspended(p_whisper_to)
  ) THEN
    RAISE EXCEPTION 'Whisper target is not a member of this channel.';
  END IF;

  -- NPC: snapshot against the roster. Existing NPC wins the avatar; a new name
  -- persists the roster row with the client-supplied portrait.
  IF p_type = 'npc' THEN
    IF p_npc_name IS NULL OR trim(p_npc_name) = '' THEN
      RAISE EXCEPTION 'Enter an NPC name to speak as.';
    END IF;
    v_npc_name := LEFT(trim(p_npc_name), 40);
    SELECT avatar_url INTO v_npc_avatar_url
    FROM channel_npcs
    WHERE channel_id = p_channel_id AND name = v_npc_name;
    IF v_npc_avatar_url IS NULL THEN
      v_npc_avatar_url := p_npc_avatar_url;
      INSERT INTO channel_npcs (channel_id, name, avatar_url)
      VALUES (p_channel_id, v_npc_name, v_npc_avatar_url)
      ON CONFLICT (channel_id, name) DO NOTHING;
    END IF;
  END IF;

  -- Mention resolution is server-owned; @all is GM-only (checked inside).
  v_mention_ids := resolve_mention_user_ids(p_channel_id, v_content);

  -- Optionally flip active players in the same transaction (GM-only).
  IF p_active_player_ids IS NOT NULL THEN
    IF NOT is_channel_gm(p_channel_id) THEN
      RAISE EXCEPTION 'Only the GM can change active players.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(p_active_player_ids) AS t(uid)
      WHERE NOT EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = p_channel_id AND user_id = t.uid
          AND NOT is_blocked AND NOT is_suspended(t.uid)
      )
    ) THEN
      RAISE EXCEPTION 'Active player must be a member of this channel.';
    END IF;
    UPDATE channel_members SET is_active_player = false WHERE channel_id = p_channel_id;
    UPDATE channel_members SET is_active_player = true
    WHERE channel_id = p_channel_id AND user_id = ANY(p_active_player_ids);
  END IF;

  BEGIN
    INSERT INTO messages (
      channel_id, sender_id, type, content, reply_to, whisper_to,
      npc_name, npc_avatar_url, mention_user_ids, client_request_id, sub_channel_id
    )
    VALUES (
      p_channel_id, v_uid, p_type, v_content, p_reply_to, p_whisper_to,
      v_npc_name, v_npc_avatar_url,
      CASE WHEN array_length(v_mention_ids, 1) > 0 THEN v_mention_ids ELSE NULL END,
      p_client_request_id, p_sub_channel_id
    )
    RETURNING id INTO v_msg_id;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent same-key call won the race; replay its row. If there is no
    -- key (or the row vanished), re-raise: never return a NULL id.
    IF p_client_request_id IS NULL THEN
      RAISE EXCEPTION 'Concurrent request conflict; please retry.';
    END IF;
    SELECT id INTO v_existing_msg
    FROM messages
    WHERE client_request_id = p_client_request_id
      AND channel_id = p_channel_id
      AND sender_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Concurrent request conflict; please retry.';
    END IF;
    RETURN QUERY SELECT v_existing_msg;
    RETURN;
  END;

  RETURN QUERY SELECT v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(UUID, TEXT, TEXT, UUID, UUID, UUID[], TEXT, TEXT, UUID, UUID) TO authenticated, service_role;

-- ==========================================
-- 9. roll_dice (+ roll_dice_unchecked): add p_sub_channel_id
-- ==========================================

-- roll_dice is a validated wrapper that forwards positionally to
-- roll_dice_unchecked (the newest body, from 20261003153244). Both must gain
-- the room parameter, or the wrapper silently drops it.
DROP FUNCTION IF EXISTS public.roll_dice(UUID, TEXT, UUID, TEXT, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.roll_dice_unchecked(UUID, TEXT, UUID, TEXT, INTEGER, UUID);

CREATE FUNCTION public.roll_dice_unchecked(
  p_channel_id UUID,
  p_notation TEXT,
  p_reply_to UUID DEFAULT NULL,
  p_warning TEXT DEFAULT NULL,
  p_dc INTEGER DEFAULT NULL,
  p_client_request_id UUID DEFAULT NULL,
  p_sub_channel_id UUID DEFAULT NULL
)
RETURNS TABLE (message_id UUID, dice_roll_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_game_system TEXT;
  v_min_mod INTEGER := -4;
  v_max_mod INTEGER := 5;
  v_parsed JSONB;
  v_groups JSONB;
  v_group JSONB;
  v_count INTEGER;
  v_sides INTEGER;
  v_keepdrop TEXT;
  v_g_count INTEGER;
  v_g_sides INTEGER;
  v_g_keepdrop TEXT;
  v_total_dice INTEGER := 0;
  v_mode TEXT;
  v_target INTEGER;
  v_modifier INTEGER := 0;
  v_rolls INTEGER[] := '{}';
  v_group_rolls INTEGER[] := '{}';
  v_group_kept INTEGER[] := '{}';
  v_kept INTEGER[] := '{}';
  v_dropped INTEGER[] := '{}';
  v_total INTEGER;
  v_successes INTEGER := NULL;
  v_success BOOLEAN := NULL;
  v_content TEXT;
  v_msg_id UUID;
  v_roll_id UUID;
  v_i INTEGER;
  v_existing_msg UUID;
  v_existing_roll UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF is_suspended(v_uid) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  -- Idempotent retry: replay of the same request returns the existing rows.
  IF p_client_request_id IS NOT NULL THEN
    SELECT m.id, dr.id INTO v_existing_msg, v_existing_roll
    FROM messages m
    JOIN dice_rolls dr ON dr.message_id = m.id
    WHERE m.client_request_id = p_client_request_id
      AND m.channel_id = p_channel_id
      AND m.sender_id = v_uid;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing_msg, v_existing_roll;
      RETURN;
    END IF;
  END IF;

  SELECT c.game_system INTO v_game_system FROM channels c WHERE c.id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF EXISTS (SELECT 1 FROM channels WHERE id = p_channel_id AND is_archived) THEN
    RAISE EXCEPTION 'This channel is archived and can no longer receive messages.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = v_uid AND is_blocked = false
  ) THEN
    RAISE EXCEPTION 'You are not a member of this channel.';
  END IF;

  -- The room, when given, must belong to this channel.
  IF p_sub_channel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sub_channels
    WHERE id = p_sub_channel_id AND channel_id = p_channel_id
  ) THEN
    RAISE EXCEPTION 'Room not found in this channel.';
  END IF;

  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM messages
    WHERE id = p_reply_to AND channel_id = p_channel_id AND NOT is_deleted
      AND sub_channel_id IS NOT DISTINCT FROM p_sub_channel_id
  ) THEN
    RAISE EXCEPTION 'Reply target is not in this room.';
  END IF;

  -- Parse and validate notation via the shared parser (mirrors
  -- src/features/dice/parser.ts). Error copy is unchanged.
  v_parsed := parse_dice_notation(p_notation);
  IF NOT COALESCE((v_parsed->>'valid')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'Invalid dice notation: %', p_notation;
  END IF;

  v_groups := v_parsed->'groups';
  v_mode := v_parsed->>'mode';
  v_target := (v_parsed->>'target')::INTEGER;
  v_modifier := COALESCE((v_parsed->>'modifier')::INTEGER, 0);

  -- Single-group notations carry no `groups`; synthesize one from the scalars
  -- so the roll loop has a single shape to handle.
  IF v_groups IS NULL THEN
    v_count := (v_parsed->>'count')::INTEGER;
    v_sides := (v_parsed->>'sides')::INTEGER;
    v_keepdrop := v_parsed->>'keepdrop';
    v_groups := jsonb_build_array(jsonb_build_object(
      'count', v_count, 'sides', v_sides, 'keepdrop', v_keepdrop));
  END IF;

  -- Pools carry no totals, so the meets-beats DC is meaningless for them.
  -- Reject loudly instead of silently ignoring the player's DC.
  IF p_dc IS NOT NULL AND v_mode <> 'sum' THEN
    RAISE EXCEPTION 'DC is not supported for dice pools.';
  END IF;

  -- Game-system modifier bounds (mirror clampModifier: DEFAULT -4..5,
  -- shadowdark -4..4). Pools cannot carry a modifier, so this only ever binds
  -- on sum rolls.
  IF v_game_system = 'shadowdark' THEN
    v_min_mod := -4;
    v_max_mod := 4;
  END IF;
  v_modifier := LEAST(GREATEST(v_modifier, v_min_mod), v_max_mod);

  -- Roll every group independently. Keep/drop applies within its own group so
  -- chains keep each die type's rule; faces are concatenated in group order.
  FOR v_group IN SELECT * FROM jsonb_array_elements(v_groups) LOOP
    v_g_count := (v_group->>'count')::INTEGER;
    v_g_sides := (v_group->>'sides')::INTEGER;
    v_g_keepdrop := COALESCE(v_group->>'keepdrop', '');

    IF v_g_count <= 0 OR v_g_sides <= 0 THEN
      RAISE EXCEPTION 'Invalid dice notation: %', p_notation;
    END IF;
    IF v_g_sides > 1000 THEN
      RAISE EXCEPTION 'Too many sides';
    END IF;
    v_total_dice := v_total_dice + v_g_count;
    IF v_total_dice > 100 THEN
      RAISE EXCEPTION 'Too many dice';
    END IF;

    v_group_rolls := '{}';
    FOR v_i IN 1..v_g_count LOOP
      v_group_rolls := array_append(v_group_rolls, floor(random() * v_g_sides) + 1);
    END LOOP;
    v_rolls := v_rolls || v_group_rolls;

    v_group_kept := v_group_rolls;
    IF v_g_keepdrop <> '' THEN
      DECLARE
        v_kd_type TEXT := substring(v_g_keepdrop FROM 1 FOR 2);
        v_kd_amount INTEGER := NULLIF(substring(v_g_keepdrop FROM 3), '')::INTEGER;
        v_sorted INTEGER[];
        v_to_drop INTEGER[];
        v_d INTEGER;
      BEGIN
        IF v_kd_amount IS NULL THEN v_kd_amount := 1; END IF;
        IF v_kd_amount >= v_g_count THEN
          IF v_kd_type IN ('dl', 'dh') THEN
            v_dropped := v_dropped || v_group_kept;
            v_group_kept := '{}';
          END IF;
        ELSE
          v_sorted := (SELECT array_agg(x ORDER BY x) FROM unnest(v_group_rolls) AS x);
          IF v_kd_type = 'kh' THEN
            v_to_drop := v_sorted[1:v_g_count - v_kd_amount];
          ELSIF v_kd_type = 'kl' THEN
            v_to_drop := v_sorted[v_kd_amount + 1:v_g_count];
          ELSIF v_kd_type = 'dh' THEN
            v_to_drop := v_sorted[v_g_count - v_kd_amount + 1:v_g_count];
          ELSIF v_kd_type = 'dl' THEN
            v_to_drop := v_sorted[1:v_kd_amount];
          END IF;
          -- Remove dropped values while preserving the original order.
          FOREACH v_d IN ARRAY v_to_drop LOOP
            DECLARE
              v_idx INTEGER := array_position(v_group_kept, v_d);
            BEGIN
              IF v_idx IS NOT NULL THEN
                v_group_kept := v_group_kept[1:v_idx-1] || v_group_kept[v_idx+1:array_length(v_group_kept, 1)];
                v_dropped := array_append(v_dropped, v_d);
              END IF;
            END;
          END LOOP;
        END IF;
      END;
    END IF;

    v_kept := v_kept || v_group_kept;
  END LOOP;

  -- Sorted pools (`ps` / `>=Ts`): faces listed highest-first. Only pool modes
  -- can carry the flag (the parser rejects it on sums).
  IF COALESCE((v_parsed->>'sorted')::BOOLEAN, FALSE) THEN
    v_rolls := (SELECT COALESCE(array_agg(x ORDER BY x DESC), '{}') FROM unnest(v_rolls) AS x);
  END IF;

  IF v_mode = 'successes' THEN
    v_successes := (SELECT count(*)::INTEGER FROM unnest(v_rolls) AS x WHERE x >= v_target);
    v_total := v_successes;
  ELSIF v_mode = 'pool' THEN
    v_total := 0;
  ELSE
    v_total := COALESCE((SELECT sum(x) FROM unnest(v_kept) AS x), 0) + v_modifier;
  END IF;

  -- DC success: meets beats (sum rolls only — pools reject p_dc above).
  IF p_dc IS NOT NULL THEN
    v_success := v_total >= p_dc;
  END IF;

  -- Build the persisted content server-side (mirrors formatDiceRoll).
  v_content := build_dice_content(p_notation, v_rolls, v_modifier, v_total);
  IF p_dc IS NOT NULL THEN
    v_content := v_content || E'\n\n**' || CASE WHEN v_success THEN 'Success' ELSE 'Failure' END
      || '** (DC ' || p_dc || ')';
  END IF;
  IF p_warning IS NOT NULL AND p_warning <> '' THEN
    v_content := v_content || E'\n\n' || p_warning;
  END IF;

  INSERT INTO messages (channel_id, sender_id, type, content, reply_to, roll_dc, roll_success, client_request_id, sub_channel_id)
  VALUES (p_channel_id, v_uid, 'dice_roll', v_content, p_reply_to, p_dc, v_success, p_client_request_id, p_sub_channel_id)
  RETURNING id INTO v_msg_id;

  BEGIN
    INSERT INTO dice_rolls (message_id, channel_id, roller_id, notation, result, breakdown)
    VALUES (v_msg_id, p_channel_id, v_uid, p_notation, v_total,
      jsonb_strip_nulls(jsonb_build_object(
        'rolls', to_jsonb(v_rolls),
        'dropped', to_jsonb(v_dropped),
        'modifier', v_modifier,
        'mode', v_mode,
        'target', to_jsonb(v_target),
        'successes', to_jsonb(v_successes)
      )))
    RETURNING id INTO v_roll_id;
  EXCEPTION WHEN unique_violation THEN
    IF p_client_request_id IS NULL THEN
      RAISE EXCEPTION 'Concurrent request conflict; please retry.';
    END IF;
    SELECT m.id, dr.id INTO v_existing_msg, v_existing_roll
    FROM messages m
    JOIN dice_rolls dr ON dr.message_id = m.id
    WHERE m.client_request_id = p_client_request_id
      AND m.channel_id = p_channel_id
      AND m.sender_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Concurrent request conflict; please retry.';
    END IF;
    RETURN QUERY SELECT v_existing_msg, v_existing_roll;
    RETURN;
  END;

  RETURN QUERY SELECT v_msg_id, v_roll_id;
END;
$$;

-- Server-only helper: callers run as owner. Fully revoked from every API role.
REVOKE ALL ON FUNCTION public.roll_dice_unchecked(UUID, TEXT, UUID, TEXT, INTEGER, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.roll_dice(
  p_channel_id UUID,
  p_notation TEXT,
  p_reply_to UUID DEFAULT NULL,
  p_warning TEXT DEFAULT NULL,
  p_dc INTEGER DEFAULT NULL,
  p_client_request_id UUID DEFAULT NULL,
  p_sub_channel_id UUID DEFAULT NULL
)
RETURNS TABLE (message_id UUID, dice_roll_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF p_warning IS NOT NULL AND char_length(p_warning) > 500 THEN
    RAISE EXCEPTION 'Roll warning is too long (max 500 characters).';
  END IF;
  IF char_length(p_notation) > 50 THEN
    RAISE EXCEPTION 'Dice notation is too long (max 50 characters).';
  END IF;
  IF p_dc IS NOT NULL AND (p_dc < 1 OR p_dc > 100) THEN
    RAISE EXCEPTION 'DC must be between 1 and 100.';
  END IF;
  RETURN QUERY SELECT * FROM roll_dice_unchecked(
    p_channel_id, p_notation, p_reply_to, p_warning, p_dc, p_client_request_id, p_sub_channel_id
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.roll_dice(UUID, TEXT, UUID, TEXT, INTEGER, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roll_dice(UUID, TEXT, UUID, TEXT, INTEGER, UUID, UUID) TO authenticated, service_role;

-- ==========================================
-- 10. Grants (new functions are not auto-granted)
-- ==========================================

REVOKE ALL ON FUNCTION public.create_sub_channel(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sub_channel(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_sub_channel(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_sub_channel(UUID, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_sub_channel(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_sub_channel(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_sub_channel_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sub_channel_read(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_channel_room_unread(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_channel_room_unread(UUID) TO authenticated, service_role;
