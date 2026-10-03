-- Issue #634: let players mark messages as favourites to find them again
-- later. Personal like dice_roll_favorites (20260923164100): own-row RLS,
-- direct client access (no RPC — there is no join to compute). The channel_id
-- is denormalized so the client can fetch a channel's favourites in one
-- scoped query and the membership check stays cheap.
CREATE TABLE public.message_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_favorites_unique UNIQUE (user_id, message_id)
);

-- Scoped fetch: a user's favourites for one channel, oldest first.
CREATE INDEX message_favorites_user_channel_idx
  ON public.message_favorites (user_id, channel_id, created_at);

-- Postgres does not index foreign keys; without this, deleting a message
-- scans the whole table to find the rows to cascade.
CREATE INDEX message_favorites_message_idx
  ON public.message_favorites (message_id);

ALTER TABLE public.message_favorites ENABLE ROW LEVEL SECURITY;

-- Own rows only, and only for a message that is actually visible to the user:
-- the message must belong to the claimed channel, the user must be a member,
-- and a whisper must be one they sent or received. Checking the row instead of
-- trusting the client's channel_id stops favouriting another channel's message
-- (or a hidden whisper) by pairing its id with an accessible channel.
CREATE POLICY "Users manage their own message favorites"
  ON public.message_favorites FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.channel_members cm
        ON cm.channel_id = m.channel_id
       AND cm.user_id = auth.uid()
      WHERE m.id = message_favorites.message_id
        AND m.channel_id = message_favorites.channel_id
        AND (
          m.whisper_to IS NULL
          OR m.whisper_to = auth.uid()
          OR m.sender_id = auth.uid()
        )
    )
  );

-- DML grants on new tables come from the default-privilege sweeps
-- (20260905195245, 20260907115918); RLS gates access.
