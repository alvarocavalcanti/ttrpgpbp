-- Rooms split one channel into several read surfaces, but the channel-level
-- unread count still used a single channel_members.last_read_at for every
-- message, so opening Main (or any room) zeroed the Lobby pill for rooms the
-- player never read while the room dots — which use sub_channel_reads — stayed
-- lit. The pulse of this migration:
--   * channel unread becomes Main + per-room, with the same predicate the room
--     dots use, so the Lobby pill, the launcher badge and the push badge agree;
--   * Main gets its own read mark (channel_members.main_last_read_at) so
--     reading a room never clears it, and vice versa;
--   * rooms the viewer cannot see stop counting (the service-role push path
--     bypassed RLS and inflated badges nobody could clear);
--   * a room with no read row falls back to the member's joined_at instead of
--     -infinity, so a player who joins a campaign with existing room history
--     starts caught up, exactly like channel_members.last_read_at does.
-- Plus get_user_channel_previews: the Lobby preview is now the last message the
-- VIEWER can see (WhatsApp/Telegram semantics), not the channel-wide
-- channels.last_message_preview, which is deliberately NULL for whispers and
-- restricted rooms (#406, #621 Phase 4). That column stays as-is for
-- channel-wide readers; the Lobby no longer uses it.

-- ---------------------------------------------------------------- read marks
-- Main's read mark. Every other room has its own row in sub_channel_reads; Main
-- needs its own or a room visit would keep clearing it through the shared
-- last_read_at.
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS main_last_read_at TIMESTAMPTZ;

-- Existing rows start where their old read state was: before this migration one
-- last_read_at covered Main too, so this changes nobody's unread count on deploy.
UPDATE public.channel_members SET main_last_read_at = last_read_at WHERE main_last_read_at IS NULL;

-- Every membership insert path (join_channel, create_channel, approved join
-- requests, listings) starts Main read where the row's read state starts. A
-- per-call fix would leave the next join path broken; the reader below keeps a
-- COALESCE fallback for rows that somehow bypass this trigger.
CREATE OR REPLACE FUNCTION public.set_main_last_read_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.main_last_read_at := COALESCE(NEW.main_last_read_at, NEW.last_read_at, now());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_main_last_read_at() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_channel_member_inserted_main_read ON public.channel_members;
CREATE TRIGGER on_channel_member_inserted_main_read
  BEFORE INSERT ON public.channel_members
  FOR EACH ROW EXECUTE FUNCTION public.set_main_last_read_at();

-- Drop + recreate rather than overload: leaving the one-arg version alive would
-- keep the buggy path callable. One-argument calls (a cached bundle) still
-- resolve through the default, and the default is true on purpose: a client
-- that does not know about rooms is reading the channel as it always did, so
-- its read must clear Main or the badge would stick forever.
DROP FUNCTION IF EXISTS public.mark_channel_read(UUID);

CREATE OR REPLACE FUNCTION public.mark_channel_read(p_channel_id UUID, p_mark_main BOOLEAN DEFAULT true)
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

  -- last_read_at keeps advancing the way it always has (the "New messages"
  -- divider and the members fetch read it). main_last_read_at only moves when
  -- the caller says it is looking at Main.
  UPDATE public.channel_members
  SET last_read_at = GREATEST(last_read_at, now()),
      main_last_read_at = CASE
        WHEN p_mark_main THEN GREATEST(COALESCE(main_last_read_at, last_read_at), now())
        ELSE main_last_read_at
      END
  WHERE channel_id = p_channel_id AND user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_channel_read(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_channel_read(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------- unread
-- Room visibility predicate inlined and parameterised by user, mirroring
-- public.can_view_sub_channel() exactly (keep in sync): that helper reads
-- auth.uid(), which is NULL for the service_role batch caller below.
--
-- get_user_channels_unread is SECURITY INVOKER (RLS applies), get_unread_totals
-- is called by the push edge function as service_role (RLS bypassed), so the
-- explicit predicates — own messages, deleted, whispers, room visibility — must
-- be complete here or the two paths disagree.
CREATE OR REPLACE FUNCTION get_user_channels_unread(p_user_id UUID)
RETURNS TABLE (channel_id UUID, unread_count BIGINT)
LANGUAGE plpgsql
STABLE
AS $func$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'User id must match authenticated user.';
  END IF;

  RETURN QUERY
  SELECT cm.channel_id, (
    COALESCE((
      -- Main: the channel row's own messages.
      SELECT COUNT(*) FROM messages m
      WHERE m.channel_id = cm.channel_id
        AND m.sub_channel_id IS NULL
        AND m.created_at > COALESCE(cm.main_last_read_at, cm.last_read_at)
        AND m.sender_id <> cm.user_id
        AND m.is_deleted = false
        AND (
          m.whisper_to IS NULL
          OR m.whisper_to = cm.user_id
          OR m.sender_id = cm.user_id
          OR ch.gm_id = cm.user_id
        )
    ), 0)
    +
    COALESCE((
      -- Every room this member can see (#621 private rooms, GM sees all).
      SELECT COUNT(*) FROM messages m
      JOIN sub_channels sc ON sc.id = m.sub_channel_id
      LEFT JOIN sub_channel_reads scr
        ON scr.sub_channel_id = sc.id AND scr.user_id = cm.user_id
      WHERE m.channel_id = cm.channel_id
        AND m.sub_channel_id IS NOT NULL
        AND m.created_at > COALESCE(scr.last_read_at, cm.joined_at)
        AND m.sender_id <> cm.user_id
        AND m.is_deleted = false
        AND (
          m.whisper_to IS NULL
          OR m.whisper_to = cm.user_id
          OR m.sender_id = cm.user_id
          OR ch.gm_id = cm.user_id
        )
        AND (
          sc.visibility = 'all'
          OR ch.gm_id = cm.user_id
          OR (
            sc.visibility = 'private'
            AND EXISTS (
              SELECT 1 FROM sub_channel_members scm
              WHERE scm.sub_channel_id = sc.id AND scm.user_id = cm.user_id
            )
          )
        )
    ), 0)
  )::BIGINT
  FROM channel_members cm
  JOIN channels ch ON ch.id = cm.channel_id
  WHERE cm.user_id = v_uid
    AND cm.is_blocked = false
    AND NOT ch.is_archived
    AND NOT COALESCE((SELECT p.is_suspended FROM profiles p WHERE p.id = cm.user_id), false);
END;
$func$;

REVOKE ALL ON FUNCTION get_user_channels_unread(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_channels_unread(UUID) TO authenticated;

-- Batch unread totals for the push edge function (service_role caller). Same
-- expression as above with cm.user_id as the subject (auth.uid() is NULL here).
CREATE OR REPLACE FUNCTION get_unread_totals(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT cm.user_id, COALESCE(SUM(
    COALESCE((
      SELECT COUNT(*) FROM messages m
      WHERE m.channel_id = cm.channel_id
        AND m.sub_channel_id IS NULL
        AND m.created_at > COALESCE(cm.main_last_read_at, cm.last_read_at)
        AND m.sender_id <> cm.user_id
        AND m.is_deleted = false
        AND (
          m.whisper_to IS NULL
          OR m.whisper_to = cm.user_id
          OR m.sender_id = cm.user_id
          OR ch.gm_id = cm.user_id
        )
    ), 0)
    +
    COALESCE((
      SELECT COUNT(*) FROM messages m
      JOIN sub_channels sc ON sc.id = m.sub_channel_id
      LEFT JOIN sub_channel_reads scr
        ON scr.sub_channel_id = sc.id AND scr.user_id = cm.user_id
      WHERE m.channel_id = cm.channel_id
        AND m.sub_channel_id IS NOT NULL
        AND m.created_at > COALESCE(scr.last_read_at, cm.joined_at)
        AND m.sender_id <> cm.user_id
        AND m.is_deleted = false
        AND (
          m.whisper_to IS NULL
          OR m.whisper_to = cm.user_id
          OR m.sender_id = cm.user_id
          OR ch.gm_id = cm.user_id
        )
        AND (
          sc.visibility = 'all'
          OR ch.gm_id = cm.user_id
          OR (
            sc.visibility = 'private'
            AND EXISTS (
              SELECT 1 FROM sub_channel_members scm
              WHERE scm.sub_channel_id = sc.id AND scm.user_id = cm.user_id
            )
          )
        )
    ), 0)
  ), 0)::BIGINT
  FROM channel_members cm
  JOIN channels ch ON ch.id = cm.channel_id
  WHERE cm.user_id = ANY(p_user_ids)
    AND cm.is_blocked = false
    AND NOT ch.is_archived
    AND NOT COALESCE((SELECT p.is_suspended FROM profiles p WHERE p.id = cm.user_id), false)
  GROUP BY cm.user_id
$$;

REVOKE ALL ON FUNCTION get_unread_totals(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_unread_totals(UUID[]) TO service_role;

-- Per-room unread for the room tabs. Body copied from 20261014210410; only the
-- read marks change: Main follows main_last_read_at, and a room without a read
-- row follows joined_at (never -infinity).
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
  v_joined_at TIMESTAMPTZ;
  v_is_gm BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_channel_member(p_channel_id) THEN
    RAISE EXCEPTION 'You are not a member of this channel.';
  END IF;

  v_is_gm := is_channel_gm(p_channel_id);

  SELECT COALESCE(cm.main_last_read_at, cm.last_read_at), cm.joined_at
  INTO v_my_last_read, v_joined_at
  FROM channel_members cm
  WHERE cm.channel_id = p_channel_id AND cm.user_id = v_uid;

  RETURN QUERY
  WITH rooms AS (
    SELECT NULL::UUID AS sub_channel_id, v_my_last_read AS last_read_at
    UNION ALL
    SELECT sc.id, COALESCE(scr.last_read_at, v_joined_at)
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

-- ----------------------------------------------------------------- previews
-- The Lobby preview must be the last message THIS viewer can see, read or not
-- (WhatsApp/Telegram semantics). channels.last_message_preview cannot do that:
-- it is one shared string, so it is NULL for whispers and restricted rooms to
-- protect other members (#406), and identical for a GM and an outsider.
--
-- Room-visible content is intentional here: the row is per-viewer, so a
-- whisper recipient or a private-room member sees their own message. Nobody
-- else does. SECURITY INVOKER: RLS already filters messages/rooms the same way;
-- the explicit predicates keep it correct independently of policy drift and
-- mirror can_view_sub_channel (keep in sync).
CREATE OR REPLACE FUNCTION public.get_user_channel_previews(p_user_id UUID)
RETURNS TABLE (channel_id UUID, last_message_at TIMESTAMPTZ, last_message_preview TEXT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'User id must match authenticated user.';
  END IF;

  RETURN QUERY
  SELECT cm.channel_id, pv.created_at, pv.preview
  FROM channel_members cm
  JOIN channels ch ON ch.id = cm.channel_id
  LEFT JOIN LATERAL (
    SELECT m.created_at,
           CASE
             WHEN sc.id IS NOT NULL AND lbl.label IS NOT NULL
               THEN LEFT(sc.name || ' · ' || lbl.label || ': ' || m.content, 120)
             WHEN sc.id IS NOT NULL
               THEN LEFT(sc.name || ' · ' || m.content, 120)
             WHEN lbl.label IS NOT NULL
               THEN LEFT(lbl.label || ': ' || m.content, 120)
             ELSE LEFT(m.content, 120)
           END AS preview
    FROM messages m
    LEFT JOIN sub_channels sc ON sc.id = m.sub_channel_id
    -- Sender label, same precedence as the channel-wide preview trigger
    -- (20261015080204): impersonated NPC, then character name, then account
    -- name; system messages carry no label.
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN m.type = 'system' THEN NULL
        ELSE COALESCE(
          NULLIF(m.npc_name, ''),
          (SELECT NULLIF(cmem.character_name, '')
             FROM channel_members cmem
            WHERE cmem.channel_id = m.channel_id AND cmem.user_id = m.sender_id),
          (SELECT pr.display_name FROM profiles pr WHERE pr.id = m.sender_id)
        )
      END AS label
    ) lbl ON true
    WHERE m.channel_id = cm.channel_id
      AND m.is_deleted = false
      AND (
        m.sub_channel_id IS NULL
        OR sc.visibility = 'all'
        OR ch.gm_id = cm.user_id
        OR (
          sc.visibility = 'private'
          AND EXISTS (
            SELECT 1 FROM sub_channel_members scm
            WHERE scm.sub_channel_id = sc.id AND scm.user_id = cm.user_id
          )
        )
      )
      AND (
        m.whisper_to IS NULL
        OR m.whisper_to = cm.user_id
        OR m.sender_id = cm.user_id
        OR ch.gm_id = cm.user_id
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) pv ON true
  WHERE cm.user_id = v_uid
    AND cm.is_blocked = false
    AND NOT ch.is_archived
    AND NOT COALESCE((SELECT p.is_suspended FROM profiles p WHERE p.id = cm.user_id), false);
END;
$func$;

REVOKE ALL ON FUNCTION public.get_user_channel_previews(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_channel_previews(UUID) TO authenticated;
