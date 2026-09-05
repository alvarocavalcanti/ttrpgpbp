-- Issue #406 [P0]: the lobby preview leaked whisper content. The trigger
-- copied the first 120 chars of every new message — whispers included — onto
-- the member-readable channels row (REST + realtime), bypassing the whisper
-- restriction enforced by messages RLS.
--
-- Fix:
--   * Trigger writes the preview only for non-whisper messages. The CASE form
--     still advances last_message_at on whisper inserts so unread counts keep
--     working; a whisper leaves last_message_preview NULL.
--   * One-time scrub of historical previews whose producing message was a
--     whisper (the 20260904111055 backfill exposed them).

-- Scrub: NULL out previews copied from a whisper (backfill leak). The preview
-- is always written from the channel's most recent message — the 20260904111055
-- backfill ordered by created_at desc, and the trigger fires per insert — so
-- correlate on created_at = last_message_at instead of prefix matching: a later
-- regular message with coincidentally identical content keeps its valid
-- preview. A created_at tie between a whisper and a regular message resolves
-- to NULL (the safe direction); production inserts one message per
-- transaction so ties do not occur in practice.
update public.channels c
set last_message_preview = null
where exists (
  select 1
  from public.messages m
  where m.channel_id = c.id
    and m.created_at = c.last_message_at
    and m.whisper_to is not null
);

create or replace function public.set_channel_last_message_at()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.channels
  set last_message_at = new.created_at,
      last_message_preview = case
        when new.whisper_to is null then left(new.content, 120)
      end
  where id = new.channel_id;
  return new;
end;
$$;

drop trigger if exists on_message_inserted_last_message_at on public.messages;

create trigger on_message_inserted_last_message_at
  after insert on public.messages
  for each row
  execute function public.set_channel_last_message_at();
