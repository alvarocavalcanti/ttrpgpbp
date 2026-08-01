-- Function to get unread message count for a member
create or replace function public.get_unread_count(channel_id uuid, last_read_at timestamp with time zone)
returns integer as $$
declare
  unread_count integer;
begin
  select count(*)
  into unread_count
  from public.messages
  where messages.channel_id = $1
    and messages.created_at > $2;
    
  return unread_count;
end;
$$ language plpgsql security definer;
