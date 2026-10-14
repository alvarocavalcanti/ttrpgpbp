-- #621 Phase 3: private rooms. A room's audience is Everyone ('all'), Only the
-- GM ('gm'), or Invited players ('private'). Non-viewers do not see the room or
-- its messages at all; channel membership is still required for every audience.
-- Main (NULL sub_channel_id) is always visible to channel members.

-- ==========================================
-- 1. visibility column
-- ==========================================

ALTER TABLE public.sub_channels
  ADD COLUMN visibility text NOT NULL DEFAULT 'all';

ALTER TABLE public.sub_channels
  ADD CONSTRAINT sub_channels_visibility_check CHECK (visibility IN ('all', 'gm', 'private'));

-- ==========================================
-- 2. invited players (only meaningful for visibility = 'private')
-- ==========================================

CREATE TABLE public.sub_channel_members (
  sub_channel_id uuid NOT NULL REFERENCES public.sub_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sub_channel_id, user_id)
);

ALTER TABLE public.sub_channel_members ENABLE ROW LEVEL SECURITY;

-- The room's GM, or the invited member themselves. No client write policy: all
-- changes go through set_sub_channel_audience.
CREATE POLICY "Members can view their room membership"
  ON public.sub_channel_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM sub_channels sc
      WHERE sc.id = sub_channel_id AND is_channel_gm(sc.channel_id)
    )
  );

-- ==========================================
-- 3. can the caller view this room?
-- ==========================================

-- STABLE so Postgres memoizes it per distinct sub_channel_id within a statement.
CREATE OR REPLACE FUNCTION public.can_view_sub_channel(p_sub_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM sub_channels sc
    WHERE sc.id = p_sub_channel_id
      AND is_channel_member(sc.channel_id)
      AND (
        sc.visibility = 'all'
        OR is_channel_gm(sc.channel_id)
        OR (
          sc.visibility = 'private'
          AND EXISTS (
            SELECT 1 FROM sub_channel_members scm
            WHERE scm.sub_channel_id = sc.id AND scm.user_id = auth.uid()
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_sub_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_sub_channel(uuid) TO authenticated, service_role;

-- ==========================================
-- 4. RLS: gate rooms + messages on visibility
-- ==========================================

DROP POLICY IF EXISTS "Members can view channel rooms" ON public.sub_channels;
CREATE POLICY "Members can view channel rooms"
  ON public.sub_channels FOR SELECT
  USING (can_view_sub_channel(id));

DROP POLICY IF EXISTS "Messages are viewable by channel members, restricted by whispers" ON messages;
CREATE POLICY "Messages are viewable by channel members, restricted by whispers"
  ON messages FOR SELECT USING (
    is_channel_member(channel_id)
    AND (sub_channel_id IS NULL OR can_view_sub_channel(sub_channel_id))
    AND (
      whisper_to IS NULL
      OR whisper_to = auth.uid()
      OR sender_id = auth.uid()
      OR is_channel_gm(channel_id)
    )
  );

-- Latest prior text: 20261014180012_npc_impersonation_policy.sql.
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
      (npc_name IS NULL AND npc_avatar_url IS NULL)
      OR (type = 'npc' AND is_channel_gm(channel_id))
    )
    AND (
      sub_channel_id IS NULL
      OR (
        EXISTS (
          SELECT 1 FROM sub_channels sc
          WHERE sc.id = sub_channel_id AND sc.channel_id = messages.channel_id
        )
        AND can_view_sub_channel(sub_channel_id)
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
-- 5. trigger: the SECURITY DEFINER commands bypass RLS, so also refuse a post
--    into a room the caller cannot view (same copy as a missing room).
-- ==========================================

CREATE OR REPLACE FUNCTION public.enforce_room_capabilities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_dice BOOLEAN;
  v_scenes BOOLEAN;
  v_npc BOOLEAN;
  v_whispers BOOLEAN;
BEGIN
  IF NEW.sub_channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Private-room access (#621 Phase 3). Only a real caller is checked; an owner
  -- insert (migration, fixture, service role) has no JWT and is trusted, the
  -- same guard the routing-immutability trigger uses. A room in another channel
  -- is left to the INSERT policy (it rejects it as 42501).
  IF auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM sub_channels sc WHERE sc.id = NEW.sub_channel_id AND sc.channel_id = NEW.channel_id)
     AND NOT can_view_sub_channel(NEW.sub_channel_id) THEN
    RAISE EXCEPTION 'Room not found in this channel.';
  END IF;

  SELECT allow_dice, allow_scenes, allow_npc, allow_whispers
  INTO v_dice, v_scenes, v_npc, v_whispers
  FROM sub_channels WHERE id = NEW.sub_channel_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'scene' AND NOT v_scenes THEN
    RAISE EXCEPTION 'Scenes are turned off in this room.';
  END IF;
  IF (NEW.type = 'npc' OR NEW.npc_name IS NOT NULL OR NEW.npc_avatar_url IS NOT NULL)
     AND NOT v_npc THEN
    RAISE EXCEPTION 'NPCs are turned off in this room.';
  END IF;
  IF NEW.type = 'dice_roll' AND NOT v_dice THEN
    RAISE EXCEPTION 'Dice are turned off in this room.';
  END IF;
  IF NEW.whisper_to IS NOT NULL AND NOT v_whispers THEN
    RAISE EXCEPTION 'Whispers are turned off in this room.';
  END IF;

  RETURN NEW;
END;
$func$;

-- ==========================================
-- 6. audience RPCs (GM-only). Partial updates only: a visibility change never
--    carries the invited set and a member toggle never carries the others, so
--    rapid toggles cannot clobber each other through a stale snapshot.
-- ==========================================

CREATE OR REPLACE FUNCTION public.set_sub_channel_visibility(
  p_sub_channel_id UUID,
  p_visibility TEXT
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
  IF p_visibility NOT IN ('all', 'gm', 'private') THEN
    RAISE EXCEPTION 'Invalid audience.';
  END IF;

  UPDATE sub_channels SET visibility = p_visibility, updated_at = now()
  WHERE id = p_sub_channel_id;

  -- Invites only matter for a private room: clear them when leaving private so
  -- re-privating does not resurrect a stale audience.
  IF p_visibility <> 'private' THEN
    DELETE FROM sub_channel_members WHERE sub_channel_id = p_sub_channel_id;
  END IF;
END;
$func$;

REVOKE ALL ON FUNCTION public.set_sub_channel_visibility(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sub_channel_visibility(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_sub_channel_member(
  p_sub_channel_id UUID,
  p_user_id UUID
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

  SELECT channel_id INTO v_channel_id FROM sub_channels
  WHERE id = p_sub_channel_id AND visibility = 'private';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found, or it is not private.';
  END IF;
  IF NOT is_channel_gm(v_channel_id) THEN
    RAISE EXCEPTION 'Only the GM can manage rooms.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM channel_members cm
    WHERE cm.channel_id = v_channel_id AND cm.user_id = p_user_id AND NOT cm.is_blocked
  ) THEN
    RAISE EXCEPTION 'That player is not a member of this channel.';
  END IF;

  INSERT INTO sub_channel_members (sub_channel_id, user_id, added_by)
  VALUES (p_sub_channel_id, p_user_id, v_uid)
  ON CONFLICT (sub_channel_id, user_id) DO NOTHING;
END;
$func$;

REVOKE ALL ON FUNCTION public.add_sub_channel_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_sub_channel_member(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remove_sub_channel_member(
  p_sub_channel_id UUID,
  p_user_id UUID
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

  DELETE FROM sub_channel_members
  WHERE sub_channel_id = p_sub_channel_id AND user_id = p_user_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.remove_sub_channel_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_sub_channel_member(UUID, UUID) TO authenticated, service_role;

-- ==========================================
-- 7. Gate derived data by the parent message's room visibility. Otherwise a
--    non-viewer reads a private room's rolls and reactions, and learns its
--    unread count.
-- ==========================================

-- Latest prior text: 20260801101940_fix_rls_recursion.sql.
DROP POLICY IF EXISTS "Dice rolls viewable by channel members" ON dice_rolls;
CREATE POLICY "Dice rolls viewable by channel members"
  ON dice_rolls FOR SELECT USING (
    is_channel_member(channel_id)
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_id
        AND (m.sub_channel_id IS NULL OR can_view_sub_channel(m.sub_channel_id))
    )
  );

-- Latest prior text: 20260806120000_add_replies_reactions.sql.
DROP POLICY IF EXISTS "Reactions viewable by channel members" ON message_reactions;
CREATE POLICY "Reactions viewable by channel members"
  ON message_reactions FOR SELECT USING (
    is_channel_member(channel_id)
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_id
        AND (m.sub_channel_id IS NULL OR can_view_sub_channel(m.sub_channel_id))
    )
  );

-- get_channel_room_unread: only rooms the caller can view (Main stays).
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
      AND can_view_sub_channel(sc.id)
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

-- get_channel_roll_history: only rolls from rooms the caller can view.
-- Latest prior text: 20261001131049_roll_history_character_name.sql.
CREATE OR REPLACE FUNCTION public.get_channel_roll_history(p_channel_id UUID)
RETURNS TABLE (
  id UUID,
  notation TEXT,
  result INTEGER,
  breakdown JSONB,
  created_at TIMESTAMPTZ,
  roller_id UUID,
  roller_character_name TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.id, d.notation, d.result, d.breakdown, d.created_at, d.roller_id,
         COALESCE(cm.character_name, p.display_name)
  FROM dice_rolls d
  JOIN messages m ON m.id = d.message_id
  LEFT JOIN profiles p ON p.id = d.roller_id
  LEFT JOIN channel_members cm
    ON cm.channel_id = d.channel_id AND cm.user_id = d.roller_id
  WHERE d.channel_id = p_channel_id AND NOT m.is_deleted
    AND (m.sub_channel_id IS NULL OR can_view_sub_channel(m.sub_channel_id))
  ORDER BY d.created_at DESC
  LIMIT 50;
$$;
