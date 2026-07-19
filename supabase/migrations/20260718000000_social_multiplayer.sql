-- Usernames, friend connections, opt-in strategy sharing, and two-hop
-- multiplayer discovery. Simulations remain owned by their creator; friends
-- expose only the learned policy they explicitly publish here.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (
    username ~ '^[a-z0-9_]{3,24}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.profiles (user_id) on delete cascade,
  user_high uuid not null references public.profiles (user_id) on delete cascade,
  requested_by uuid not null references public.profiles (user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_distinct_users check (user_low <> user_high),
  constraint friendships_canonical_pair check (user_low::text < user_high::text),
  constraint friendships_requester_in_pair check (
    requested_by = user_low or requested_by = user_high
  ),
  constraint friendships_pair_key unique (user_low, user_high)
);

create table public.multiplayer_strategies (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  calibration_id text not null,
  strategy_name text not null check (char_length(strategy_name) between 1 and 120),
  strategy_method text,
  hands_played integer not null check (hands_played >= 0),
  policy jsonb not null check (jsonb_typeof(policy) = 'object'),
  updated_at timestamptz not null default now(),
  constraint multiplayer_strategies_calibration_owner_fkey
    foreign key (calibration_id, user_id)
    references public.calibrations (id, user_id)
    on update cascade
    on delete cascade
);

create index friendships_low_status_idx
  on public.friendships (user_low, status);
create index friendships_high_status_idx
  on public.friendships (user_high, status);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function public.set_updated_at();

create trigger multiplayer_strategies_set_updated_at
before update on public.multiplayer_strategies
for each row execute function public.set_updated_at();

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  if requested_username !~ '^[a-z0-9_]{3,24}$'
     or exists (
       select 1 from public.profiles where username = requested_username
     ) then
    requested_username := 'player_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  insert into public.profiles (user_id, username)
  values (new.id, requested_username)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

insert into public.profiles (user_id, username, created_at)
select
  users.id,
  'player_' || substr(replace(users.id::text, '-', ''), 1, 12),
  users.created_at
from auth.users as users
on conflict (user_id) do nothing;

create trigger auth_user_created_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(trim(p_username)) ~ '^[a-z0-9_]{3,24}$'
    and not exists (
      select 1
      from public.profiles
      where username = lower(trim(p_username))
        and user_id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
    );
$$;

create function public.change_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(trim(p_username));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if normalized !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must use 3-24 lowercase letters, numbers, or underscores';
  end if;
  if exists (
    select 1 from public.profiles
    where username = normalized and user_id <> (select auth.uid())
  ) then
    raise exception 'That username is already taken';
  end if;

  update public.profiles
  set username = normalized, updated_at = now()
  where user_id = (select auth.uid());
  return normalized;
end;
$$;

create function public.is_multiplayer_connection(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with edges as (
    select user_low as source_id, user_high as target_id
    from public.friendships where status = 'accepted'
    union all
    select user_high, user_low
    from public.friendships where status = 'accepted'
  )
  select
    p_viewer = p_target
    or exists (
      select 1 from edges
      where source_id = p_viewer and target_id = p_target
    )
    or exists (
      select 1
      from edges first_hop
      join edges second_hop on second_hop.source_id = first_hop.target_id
      where first_hop.source_id = p_viewer
        and second_hop.target_id = p_target
    );
$$;

create function public.request_friend(p_username text)
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
  where username = lower(trim(p_username));
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

create function public.respond_to_friend_request(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if p_accept then
    update public.friendships
      set status = 'accepted', updated_at = now()
      where id = p_friendship_id
        and status = 'pending'
        and requested_by <> me
        and (user_low = me or user_high = me);
  else
    delete from public.friendships
      where id = p_friendship_id
        and status = 'pending'
        and requested_by <> me
        and (user_low = me or user_high = me);
  end if;
  if not found then raise exception 'Friend request not found'; end if;
end;
$$;

create function public.remove_friend(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
  where id = p_friendship_id
    and (user_low = (select auth.uid()) or user_high = (select auth.uid()));
  if not found then raise exception 'Friend connection not found'; end if;
end;
$$;

create function public.get_multiplayer_social_graph()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as user_id
  ),
  edges as (
    select user_low as source_id, user_high as target_id, id
    from public.friendships where status = 'accepted'
    union all
    select user_high, user_low, id
    from public.friendships where status = 'accepted'
  ),
  distances as (
    select target_id as user_id, 1 as degree from edges, me
    where source_id = me.user_id
    union
    select second_hop.target_id, 2
    from edges first_hop
    join edges second_hop on second_hop.source_id = first_hop.target_id
    cross join me
    where first_hop.source_id = me.user_id
      and second_hop.target_id <> me.user_id
  ),
  nearest as (
    select user_id, min(degree) as degree from distances group by user_id
  )
  select jsonb_build_object(
    'profile', (
      select jsonb_build_object('userId', profile.user_id, 'username', profile.username)
      from public.profiles profile, me where profile.user_id = me.user_id
    ),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object(
        'friendshipId', friendship.id,
        'userId', profile.user_id,
        'username', profile.username
      ) order by friendship.created_at)
      from public.friendships friendship
      cross join me
      join public.profiles profile on profile.user_id = case
        when friendship.user_low = me.user_id then friendship.user_high else friendship.user_low end
      where friendship.status = 'pending'
        and friendship.requested_by <> me.user_id
        and (friendship.user_low = me.user_id or friendship.user_high = me.user_id)
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'friendshipId', friendship.id,
        'userId', profile.user_id,
        'username', profile.username
      ) order by friendship.created_at)
      from public.friendships friendship
      cross join me
      join public.profiles profile on profile.user_id = case
        when friendship.user_low = me.user_id then friendship.user_high else friendship.user_low end
      where friendship.status = 'pending'
        and friendship.requested_by = me.user_id
    ), '[]'::jsonb),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'friendshipId', edges.id,
        'userId', profile.user_id,
        'username', profile.username
      ) order by profile.username)
      from edges
      cross join me
      join public.profiles profile on profile.user_id = edges.target_id
      where edges.source_id = me.user_id
    ), '[]'::jsonb),
    'eligiblePlayers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', profile.user_id,
        'username', profile.username,
        'relationshipDegree', nearest.degree,
        'strategy', case when strategy.user_id is null then null else jsonb_build_object(
          'calibrationId', strategy.calibration_id,
          'name', strategy.strategy_name,
          'method', strategy.strategy_method,
          'handsPlayed', strategy.hands_played,
          'policy', strategy.policy,
          'updatedAt', strategy.updated_at
        ) end
      ) order by nearest.degree, profile.username)
      from nearest
      join public.profiles profile on profile.user_id = nearest.user_id
      left join public.multiplayer_strategies strategy on strategy.user_id = nearest.user_id
    ), '[]'::jsonb),
    'publishedStrategy', (
      select jsonb_build_object(
        'calibrationId', strategy.calibration_id,
        'name', strategy.strategy_name,
        'method', strategy.strategy_method,
        'handsPlayed', strategy.hands_played,
        'updatedAt', strategy.updated_at
      )
      from public.multiplayer_strategies strategy, me
      where strategy.user_id = me.user_id
    )
  );
$$;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.multiplayer_strategies enable row level security;

create policy "profiles_read_authenticated"
on public.profiles for select to authenticated using (true);
create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "friendships_read_participant"
on public.friendships for select to authenticated
using ((select auth.uid()) = user_low or (select auth.uid()) = user_high);

create policy "multiplayer_strategies_read_network"
on public.multiplayer_strategies for select to authenticated
using (public.is_multiplayer_connection((select auth.uid()), user_id));
create policy "multiplayer_strategies_insert_own"
on public.multiplayer_strategies for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "multiplayer_strategies_update_own"
on public.multiplayer_strategies for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "multiplayer_strategies_delete_own"
on public.multiplayer_strategies for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.friendships from anon, authenticated;
revoke all on table public.multiplayer_strategies from anon, authenticated;
grant select, update on table public.profiles to authenticated;
grant select on table public.friendships to authenticated;
grant select, insert, update, delete on table public.multiplayer_strategies to authenticated;
grant all on table public.profiles to service_role;
grant all on table public.friendships to service_role;
grant all on table public.multiplayer_strategies to service_role;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated, service_role;
revoke all on function public.change_username(text) from public, anon;
grant execute on function public.change_username(text) to authenticated, service_role;
revoke all on function public.is_multiplayer_connection(uuid, uuid) from public, anon;
grant execute on function public.is_multiplayer_connection(uuid, uuid) to authenticated, service_role;
revoke all on function public.request_friend(text) from public, anon;
grant execute on function public.request_friend(text) to authenticated, service_role;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated, service_role;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated, service_role;
revoke all on function public.get_multiplayer_social_graph() from public, anon;
grant execute on function public.get_multiplayer_social_graph() to authenticated, service_role;
