-- Issue #302: direct message inserts could persist fabricated mention_user_ids
-- (the INSERT policies validated whisper/reply targets but not the mention
-- list). A fabricated mention isn't the push-leak vector (the push function
-- re-parses content and intersects with membership), but the canonical column
-- must not hold an outsider's id, so constrain it at the data layer.
--
-- Enforced with a SECURITY DEFINER BEFORE INSERT trigger rather than an INSERT
-- policy clause: messages carries several permissive INSERT policies across
-- migrations, and RLS insert passes if ANY of them is satisfied, so a policy
-- clause alone is not a reliable gate. The trigger is authoritative on every
-- insert path. send_message already resolves mentions against membership, so
-- its rows pass; only direct writes with an outsider id are rejected.

create or replace function public.validate_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mention_user_ids is not null and exists (
    select 1 from unnest(new.mention_user_ids) as t(uid)
    where not exists (
      select 1 from channel_members cm
      where cm.channel_id = new.channel_id
        and cm.user_id = t.uid
        and not cm.is_blocked
    )
  ) then
    raise exception 'Mention target is not a member of this channel.';
  end if;
  return new;
end;
$$;

create trigger messages_mention_membership
  before insert on public.messages
  for each row
  execute function public.validate_message_mentions();

revoke all on function public.validate_message_mentions() from public;