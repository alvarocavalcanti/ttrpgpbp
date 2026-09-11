-- Seed data for help screenshots. Idempotent: safe to re-run (existing shot
-- users are reused, the screenshot channel is recreated fresh).
--
-- Usage:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f scripts/help-screenshots/seed.sql
--
-- Users, password `shots-pass-1`: shot.gm@local.test (GM of "The Sunless
-- Citadel"), shot.p1/p2/p3@local.test (players), shot.new@local.test (no
-- channels — for the empty lobby shot).
do $$
declare
  gm uuid; p1 uuid; p2 uuid; p3 uuid; fresh uuid; ch uuid;
begin
  -- Create any missing auth.users with a known password (idempotent).
  select id into gm from auth.users where email = 'shot.gm@local.test';
  if gm is null then
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, created_at, updated_at)
    values (gen_random_uuid(), 'authenticated', 'authenticated', 'shot.gm@local.test',
            crypt('shots-pass-1', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', now(), now())
    returning id into gm;
  end if;

  select id into p1 from auth.users where email = 'shot.p1@local.test';
  if p1 is null then
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, created_at, updated_at)
    values (gen_random_uuid(), 'authenticated', 'authenticated', 'shot.p1@local.test',
            crypt('shots-pass-1', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', now(), now())
    returning id into p1;
  end if;

  select id into p2 from auth.users where email = 'shot.p2@local.test';
  if p2 is null then
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, created_at, updated_at)
    values (gen_random_uuid(), 'authenticated', 'authenticated', 'shot.p2@local.test',
            crypt('shots-pass-1', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', now(), now())
    returning id into p2;
  end if;

  select id into p3 from auth.users where email = 'shot.p3@local.test';
  if p3 is null then
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, created_at, updated_at)
    values (gen_random_uuid(), 'authenticated', 'authenticated', 'shot.p3@local.test',
            crypt('shots-pass-1', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', now(), now())
    returning id into p3;
  end if;

  select id into fresh from auth.users where email = 'shot.new@local.test';
  if fresh is null then
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, created_at, updated_at)
    values (gen_random_uuid(), 'authenticated', 'authenticated', 'shot.new@local.test',
            crypt('shots-pass-1', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', now(), now())
    returning id into fresh;
  end if;

  -- GoTrue refuses password logins for rows missing instance_id or with NULL
  -- token columns, so normalise every shot user (covers pre-existing rows too).
  update auth.users set
    instance_id = '00000000-0000-0000-0000-000000000000',
    confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change = coalesce(email_change, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
  where email like 'shot.%@local.test';

  insert into public.profiles (id, display_name) values
    (gm,'Mira GM'),(p1,'Dorn'),(p2,'Kess'),(p3,'Pip')
  on conflict (id) do update set display_name = excluded.display_name;

  -- Recreate the screenshot channel so re-runs stay deterministic. Constrain
  -- by the fixture-only invite code too, so a real channel that happens to
  -- share the name is never deleted.
  delete from public.channels where name = 'The Sunless Citadel' and invite_code = 'A1B2C3D4';

  insert into public.channels (id, name, gm_id, invite_code, game_system, status_text, map_url, resources_url)
  values (gen_random_uuid(), 'The Sunless Citadel', gm, 'A1B2C3D4', 'shadowdark',
    '**Active Player:** Dorn — exploring the grove
⏳ Next session: Friday 20:00
🐉 The dragon whispers in dreams…',
    'https://example.com/map', 'https://example.com/resources')
  returning id into ch;

  insert into public.channel_members (channel_id, user_id, character_name, is_active_player, attributes, last_read_at) values
    (ch, gm, 'Mira GM', false, '{"STR":2,"DEX":1,"CON":2,"INT":0,"WIS":3,"CHA":1}', now() - interval '3 hours'),
    (ch, p1, 'Dorn', true, '{"STR":3,"DEX":0,"CON":2,"INT":-1,"WIS":1,"CHA":0}', now()),
    (ch, p2, 'Kess', false, '{"STR":0,"DEX":3,"CON":1,"INT":2,"WIS":0,"CHA":2}', now()),
    (ch, p3, 'Pip', false, '{"STR":-1,"DEX":2,"CON":0,"INT":3,"WIS":1,"CHA":1}', now());

  insert into public.channel_npcs (channel_id, name, avatar_url) values
    (ch, 'Goblin King', 'https://game-icons.net/icons/ffffff/delapouite/originals/svg/delapouite-goblin-head.svg');

  insert into public.channel_safety_tools (channel_id, lines, veils) values (ch,
    'No harm to children or animals.', 'Torture, betrayal by trusted allies.');

  insert into public.messages (channel_id, sender_id, type, content, created_at) values
    (ch, gm, 'scene', 'The ancient grove opens before you. Twisted roots guard a yawning shaft descending into darkness.', now() - interval '2 hours'),
    (ch, gm, 'npc', 'None shall pass without paying tribute to the Goblin King!', now() - interval '90 minutes'),
    (ch, p1, 'regular', 'We could try to sneak past the guards. Make a [DC 12 DEX Check](check:DEX:12) to move silently.', now() - interval '80 minutes'),
    (ch, p2, 'regular', 'I''ll check the walls for secret doors first. Anybody have a torch?', now() - interval '70 minutes'),
    (ch, p3, 'regular', 'Rolling perception @Mira GM — I want to listen at the door.', now() - interval '60 minutes');
end $$;