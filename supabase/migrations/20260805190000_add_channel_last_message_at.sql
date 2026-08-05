-- Track the last message time per channel so the lobby can sort by recent activity
alter table public.channels add column if not exists last_message_at timestamp with time zone;

-- Backfill from existing messages
update public.channels c
set last_message_at = (
  select max(m.created_at)
  from public.messages m
  where m.channel_id = c.id
);

-- Keep it fresh as messages are inserted
create or replace function public.set_channel_last_message_at()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.channels
  set last_message_at = new.created_at
  where id = new.channel_id;
  return new;
end;
$$;

drop trigger if exists on_message_inserted_last_message_at on public.messages;

create trigger on_message_inserted_last_message_at
  after insert on public.messages
  for each row
  execute function public.set_channel_last_message_at();
