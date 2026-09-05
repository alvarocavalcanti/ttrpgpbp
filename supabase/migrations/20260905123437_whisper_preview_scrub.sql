-- Issue #406 [P0]: the lobby preview leaked whisper content. The trigger
-- copied the first 120 chars of every new message — whispers included — onto
-- the member-readable channels row (REST + realtime), bypassing the whisper
-- restriction enforced by messages RLS.
--
-- Fix:
--   * Trigger writes the preview only for non-whisper messages. The CASE form
--     still advances last_message_at on whisper inserts so unread counts keep
--     working; a whisper leaves last_message_preview NULL.
--   * One-time scrub of historical previews that match a whisper's first 120
--     chars (the 20260904111055 backfill exposed them).

-- Scrub: NULL out previews copied from a whisper (backfill leak).
update public.channels c
set last_message_preview = null
where c.last_message_preview is not null
  and exists (
    select 1
    from public.messages m
    where m.channel_id = c.id
      and m.whisper_to is not null
      and left(m.content, 120) = c.last_message_preview
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
