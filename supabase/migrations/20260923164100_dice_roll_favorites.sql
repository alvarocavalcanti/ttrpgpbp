-- Issue #586: pin up to 3 favorite notations per user + channel, shown
-- first in the dice roller chip row. Server-side like the roll history
-- (dice_rolls), but personal like notification_preferences: own-row RLS,
-- direct client access (no RPC — there is no join to compute).
CREATE TABLE public.dice_roll_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  notation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Mirrors the server notation grammar (roll_dice) loosely: client writes
  -- this table directly, so keep malformed strings out at the DB too.
  CONSTRAINT dice_roll_favorites_notation_format
    CHECK (notation ~ '^[0-9]{1,3}d[0-9]{1,4}((kh|kl|dh|dl)[0-9]{0,3})?([+-][0-9]{1,4})?$'),
  CONSTRAINT dice_roll_favorites_unique UNIQUE (user_id, channel_id, notation)
);

ALTER TABLE public.dice_roll_favorites ENABLE ROW LEVEL SECURITY;

-- Own rows only, and only in channels the user still belongs to.
CREATE POLICY "Users manage their own dice favorites"
  ON public.dice_roll_favorites FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.channel_members cm
      WHERE cm.channel_id = dice_roll_favorites.channel_id
        AND cm.user_id = auth.uid()
    )
  );

-- Race-proof the 3-favorite cap (the UI disables the checkbox; this is the
-- backstop). SECURITY DEFINER so the count sees past RLS like
-- handle_new_user_prefs.
CREATE OR REPLACE FUNCTION public.enforce_dice_favorite_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.dice_roll_favorites
      WHERE user_id = NEW.user_id AND channel_id = NEW.channel_id) >= 3 THEN
    RAISE EXCEPTION 'You can only pin three favorite rolls per channel.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dice_roll_favorites_cap
  BEFORE INSERT ON public.dice_roll_favorites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dice_favorite_cap();

-- Trigger helpers are wired via CREATE TRIGGER only and must never be
-- directly callable by an API role (audit 2026-09-20 #558 pattern).
REVOKE ALL ON FUNCTION public.enforce_dice_favorite_cap()
  FROM PUBLIC, anon, authenticated, service_role;

-- DML grants on new tables come from the default-privilege sweeps
-- (20260905195245, 20260907115918); RLS gates access.
