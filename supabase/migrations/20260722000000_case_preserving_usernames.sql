-- Preserve the capitalization users choose while keeping identity, availability,
-- and friend lookup case-insensitive. Existing lowercase usernames remain valid.

alter table public.profiles
  drop constraint profiles_username_check;

alter table public.profiles
  add constraint profiles_username_check
  check (username ~ '^[A-Za-z0-9_]{3,24}$');

alter table public.profiles
  drop constraint profiles_username_key;

create unique index profiles_username_lower_key
  on public.profiles (lower(username));

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if requested_username !~ '^[A-Za-z0-9_]{3,24}$'
     or exists (
       select 1
       from public.profiles
       where lower(username) = lower(requested_username)
     ) then
    requested_username := 'player_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  insert into public.profiles (user_id, username)
  values (new.id, requested_username)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    trim(p_username) ~ '^[A-Za-z0-9_]{3,24}$'
    and not exists (
      select 1
      from public.profiles
      where lower(username) = lower(trim(p_username))
        and user_id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
    );
$$;

create or replace function public.change_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := trim(p_username);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if normalized !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Username must use 3-24 letters, numbers, or underscores';
  end if;
  if exists (
    select 1
    from public.profiles
    where lower(username) = lower(normalized)
      and user_id <> (select auth.uid())
  ) then
    raise exception 'That username is already taken';
  end if;

  update public.profiles
  set username = normalized, updated_at = now()
  where user_id = (select auth.uid());
  return normalized;
end;
$$;

create or replace function public.request_friend(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
  low_id uuid;
  high_id uuid;
  existing public.friendships%rowtype;
begin
  if me is null then raise exception 'Authentication required'; end if;
  select user_id into target
  from public.profiles
  where lower(username) = lower(trim(p_username));
  if target is null then raise exception 'No user has that username'; end if;
  if target = me then raise exception 'You cannot add yourself as a friend'; end if;

  if me::text < target::text then low_id := me; high_id := target;
  else low_id := target; high_id := me; end if;

  select * into existing
  from public.friendships
  where user_low = low_id and user_high = high_id
  for update;

  if found then
    if existing.status = 'accepted' then raise exception 'You are already friends'; end if;
    if existing.requested_by = me then raise exception 'Friend request already sent'; end if;
    update public.friendships
      set status = 'accepted', updated_at = now()
      where id = existing.id;
    return 'accepted';
  end if;

  insert into public.friendships (user_low, user_high, requested_by)
  values (low_id, high_id, me);
  return 'pending';
end;
$$;
