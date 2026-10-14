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
-- 6. audience RPC (GM-only): sets visibility and replaces the invited set
-- ==========================================

CREATE OR REPLACE FUNCTION public.set_sub_channel_audience(
  p_sub_channel_id UUID,
  p_visibility TEXT,
  p_member_ids UUID[] DEFAULT NULL
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

  -- Replace the invited set; it only matters for 'private'.
  DELETE FROM sub_channel_members WHERE sub_channel_id = p_sub_channel_id;
  IF p_visibility = 'private' AND p_member_ids IS NOT NULL THEN
    INSERT INTO sub_channel_members (sub_channel_id, user_id, added_by)
    SELECT p_sub_channel_id, uid, v_uid
    FROM unnest(p_member_ids) AS uid
    WHERE EXISTS (
      SELECT 1 FROM channel_members cm
      WHERE cm.channel_id = v_channel_id AND cm.user_id = uid AND NOT cm.is_blocked
    );
  END IF;
END;
$func$;

REVOKE ALL ON FUNCTION public.set_sub_channel_audience(UUID, TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sub_channel_audience(UUID, TEXT, UUID[]) TO authenticated, service_role;
