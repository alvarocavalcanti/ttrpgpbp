-- Add last_read_at to channel_members if it doesn't exist
alter table public.channel_members add column if not exists last_read_at timestamp with time zone default timezone('utc'::text, now()) not null;

-- Notification Preferences
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  push_enabled boolean default true not null,
  badge_enabled boolean default true not null,
  email_enabled boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id)
);

alter table public.notification_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'notification_preferences' 
    and policyname = 'Users can manage their own notification preferences'
  ) then
    create policy "Users can manage their own notification preferences"
      on public.notification_preferences
      for all using (auth.uid() = user_id);
  end if;
end
$$;
