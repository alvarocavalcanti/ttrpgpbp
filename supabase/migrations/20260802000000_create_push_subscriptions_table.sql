create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'push_subscriptions' 
    and policyname = 'Users can manage their own push subscriptions'
  ) then
    create policy "Users can manage their own push subscriptions"
      on public.push_subscriptions
      for all using (auth.uid() = user_id);
  end if;
end
$$;
