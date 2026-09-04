-- Track a short preview of the most recent message so the lobby channel list
-- can show it without a per-channel messages query (issue #382).
alter table public.channels add column if not exists last_message_preview text;

-- Backfill from the most recent message per channel.
update public.channels c
set last_message_preview = (
  select left(m.content, 120)
  from public.messages m
  where m.channel_id = c.id
  order by m.created_at desc
  limit 1
);

-- Extend the existing insert trigger (set_channel_last_message_at) so new
-- messages also refresh the preview. Replaced here so both columns stay in
-- sync; the trigger is dropped/recreated idempotently.
create or replace function public.set_channel_last_message_at()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.channels
  set last_message_at = new.created_at,
      last_message_preview = left(new.content, 120)
  where id = new.channel_id;
  return new;
end;
$$;

drop trigger if exists on_message_inserted_last_message_at on public.messages;

create trigger on_message_inserted_last_message_at
  after insert on public.messages
  for each row
  execute function public.set_channel_last_message_at();