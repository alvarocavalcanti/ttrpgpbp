-- #621 Phase 4: a room message leads the lobby preview with its room name, so
-- a glance at the lobby shows where the message landed. Main stays unchanged.
-- Body-only replacement of the trigger function (signature and grants kept).
--
-- Latest prior text: 20260910150000_lobby_preview_system_messages.sql (which
-- added the system-message bypass — carried forward here).

create or replace function public.set_channel_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_room text;
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

    if new.sub_channel_id is not null then
      select sc.name into v_room
      from public.sub_channels sc
      where sc.id = new.sub_channel_id;
    end if;

    v_preview := case
      when v_room is not null and v_label is not null
        then left(v_room || ' · ' || v_label || ': ' || new.content, 120)
      when v_room is not null
        then left(v_room || ' · ' || new.content, 120)
      when v_label is not null
        then left(v_label || ': ' || new.content, 120)
      else left(new.content, 120)
    end;
  end if;

  update public.channels
  set last_message_at = new.created_at,
      last_message_preview = v_preview
  where id = new.channel_id;
  return new;
end;
$$;

-- Backfill existing previews with the room prefix. Same correlation and tie
-- guard as 20260910150000, so it is idempotent and safe for whisper producers.
update public.channels c
set last_message_preview = (
  select case
    when s.room_name is not null and s.label is not null
      then left(s.room_name || ' · ' || s.label || ': ' || s.content, 120)
    when s.room_name is not null
      then left(s.room_name || ' · ' || s.content, 120)
    when s.label is not null
      then left(s.label || ': ' || s.content, 120)
    else left(s.content, 120)
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
           end as label,
           sc.name as room_name
    from public.messages m
    left join public.channel_members cm
      on cm.channel_id = c.id and cm.user_id = m.sender_id
    left join public.profiles p on p.id = m.sender_id
    left join public.sub_channels sc on sc.id = m.sub_channel_id
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
