-- #762: campaign notes.
--
-- One channel-level notes table (not per-room) with three visibility scopes:
--   character — the author and the channel GM can read it; the author writes.
--   party     — every member (and the GM) can read it; each member writes
--               their own entries.
--   gm        — only the GM can read or write it.
--
-- Notes are plain text. Writes are rejected on an archived channel, while the
-- existing rows stay readable (archived channels are read-only, not deleted).

CREATE TABLE public.channel_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  -- Nullable so an account deletion anonymises the note instead of destroying
  -- a party notebook the rest of the table may still be reading.
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scope TEXT NOT NULL CHECK (scope IN ('character', 'party', 'gm')),
  body TEXT NOT NULL CHECK (body ~ '[^[:space:]]' AND char_length(body) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX channel_notes_channel_created_idx
  ON public.channel_notes (channel_id, created_at DESC);

ALTER TABLE public.channel_notes ENABLE ROW LEVEL SECURITY;

-- Reads ---------------------------------------------------------------------

CREATE POLICY "Party notes are readable by channel members"
  ON public.channel_notes FOR SELECT
  USING (
    scope = 'party'
    AND (is_channel_member(channel_id) OR is_channel_gm(channel_id))
  );

CREATE POLICY "Character notes are readable by their author and the GM"
  ON public.channel_notes FOR SELECT
  USING (
    scope = 'character'
    AND (is_channel_member(channel_id) OR is_channel_gm(channel_id))
    AND (author_id = auth.uid() OR is_channel_gm(channel_id))
  );

CREATE POLICY "GM notes are readable by the GM"
  ON public.channel_notes FOR SELECT
  USING (scope = 'gm' AND is_channel_gm(channel_id));

-- Inserts -------------------------------------------------------------------

CREATE POLICY "Members can add character and party notes"
  ON public.channel_notes FOR INSERT
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_notes.channel_id AND c.is_archived
    )
    AND (is_channel_member(channel_id) OR is_channel_gm(channel_id))
    AND author_id = auth.uid()
    AND scope IN ('character', 'party')
  );

CREATE POLICY "GM can add GM notes"
  ON public.channel_notes FOR INSERT
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_notes.channel_id AND c.is_archived
    )
    AND is_channel_gm(channel_id)
    AND author_id = auth.uid()
    AND scope = 'gm'
  );

-- Updates -------------------------------------------------------------------

CREATE POLICY "Authors can update their character and party notes"
  ON public.channel_notes FOR UPDATE
  USING (
    author_id = auth.uid()
    AND scope IN ('character', 'party')
    AND (is_channel_member(channel_id) OR is_channel_gm(channel_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_notes.channel_id AND c.is_archived
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    AND scope IN ('character', 'party')
    AND (is_channel_member(channel_id) OR is_channel_gm(channel_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_notes.channel_id AND c.is_archived
    )
  );

CREATE POLICY "GM can update GM notes"
  ON public.channel_notes FOR UPDATE
  USING (
    author_id = auth.uid()
    AND scope = 'gm'
    AND is_channel_gm(channel_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_notes.channel_id AND c.is_archived
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    AND scope = 'gm'
    AND is_channel_gm(channel_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_notes.channel_id AND c.is_archived
    )
  );

-- Deletes -------------------------------------------------------------------

CREATE POLICY "Authors can delete their notes"
  ON public.channel_notes FOR DELETE
  USING (
    author_id = auth.uid()
    AND (is_channel_member(channel_id) OR is_channel_gm(channel_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_notes.channel_id AND c.is_archived
    )
  );

-- A note never changes channel or scope: RLS lets an author update their own
-- row, so without this guard a character note could be promoted into a party
-- note (or moved into another channel) by a crafted client call. author_id is
-- intentionally not guarded: the profiles FK sets it to NULL on account
-- deletion, and RLS already pins it to auth.uid() for client writes.
CREATE OR REPLACE FUNCTION public.guard_channel_note_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.channel_id IS DISTINCT FROM OLD.channel_id
     OR NEW.scope IS DISTINCT FROM OLD.scope THEN
    RAISE EXCEPTION 'A note cannot change channel or scope'
      USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER channel_notes_guard_update
  BEFORE UPDATE ON public.channel_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_channel_note_update();

-- Trigger helpers are never called directly; the house sweep expects no API
-- role to hold EXECUTE on a RETURNS trigger function in public.
REVOKE ALL ON FUNCTION public.guard_channel_note_update() FROM PUBLIC, anon, authenticated, service_role;

-- Data API grants (new public tables are not auto-exposed). No anon grant:
-- notes are always behind a signed-in channel membership or GM role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_notes TO service_role;

-- Live updates for everyone who can read the row. FULL identity means DELETE
-- echoes carry channel_id so the realtime channel filter matches.
ALTER TABLE public.channel_notes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_notes;
