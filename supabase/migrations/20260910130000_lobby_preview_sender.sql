-- #468: Lobby row polish. The lobby preview showed only the raw message text;
-- it now leads with the sender so a glance at the lobby reads like a chat list.
-- The sender label resolution matches the chat UI (MessageItem): npc_name,
-- else the sender's channel character_name (non-empty), else display_name. No
-- label (system messages, sender_id NULL, missing profile) leaves the content
-- unprefixed. Whisper inserts still write NULL (issue #406 — no leak), and the
-- total is capped at 120 chars.

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
    select coalesce(
      nullif(new.npc_name, ''),
      (select nullif(cm.character_name, '')
         from public.channel_members cm
        where cm.channel_id = new.channel_id
          and cm.user_id = new.sender_id),
      (select p.display_name from public.profiles p where p.id = new.sender_id)
    ) into v_label;

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

-- Backfill historical previews with the sender prefix. The preview always
-- corresponds to the message at last_message_at (20260904111055 filled it that
-- way and the trigger keeps it in sync), so correlate on created_at. A tie
-- (multiple messages at that instant) or a whisper producer resolves to NULL —
-- the #406 safe direction; production inserts one message per transaction so
-- ties do not occur in practice.
update public.channels c
set last_message_preview = (
  select case
    when s.label is null then left(s.content, 120)
    else left(s.label || ': ' || s.content, 120)
  end
  from (
    select m.content,
           coalesce(
             nullif(m.npc_name, ''),
             nullif(cm.character_name, ''),
             p.display_name
           ) as label
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
