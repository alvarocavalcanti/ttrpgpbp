-- #468 review follow-up: system messages carry a populated sender_id
-- (join_channel inserts "<character> joined the channel" with the joining
-- user's id), so the sender-prefix logic from 20260910130000 labelled them
-- e.g. "Hero: Hero joined the channel". System messages must stay content-only
-- regardless of sender_id; every other type keeps the sender label. The
-- backfill is re-run so already-written rows are corrected too.

create or replace function public.set_channel_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_preview text;
begin
  if new.whisper_to is null then
    if new.type <> 'system' then
      select coalesce(
        nullif(new.npc_name, ''),
        (select nullif(cm.character_name, '')
           from public.channel_members cm
          where cm.channel_id = new.channel_id
            and cm.user_id = new.sender_id),
        (select p.display_name from public.profiles p where p.id = new.sender_id)
      ) into v_label;
    end if;

    v_preview := case
      when v_label is null then left(new.content, 120)
      else left(v_label || ': ' || new.content, 120)
    end;
  end if;

  update public.channels
  set last_message_at = new.created_at,
      last_message_preview = v_preview
  where id = new.channel_id;
  return new;
end;
$$;

-- Backfill again with the system bypass, same correlation as 20260910130000.
update public.channels c
set last_message_preview = (
  select case
    when s.label is null then left(s.content, 120)
    else left(s.label || ': ' || s.content, 120)
  end
  from (
    select m.content,
           case
             when m.type = 'system' then null
             else coalesce(
               nullif(m.npc_name, ''),
               nullif(cm.character_name, ''),
               p.display_name
             )
           end as label
    from public.messages m
    left join public.channel_members cm
      on cm.channel_id = c.id and cm.user_id = m.sender_id
    left join public.profiles p on p.id = m.sender_id
    where m.channel_id = c.id
      and m.created_at = c.last_message_at
      and m.whisper_to is null
      and (select count(*)
             from public.messages m2
            where m2.channel_id = c.id
              and m2.created_at = c.last_message_at) = 1
  ) s
  limit 1
)
where c.last_message_at is not null;
