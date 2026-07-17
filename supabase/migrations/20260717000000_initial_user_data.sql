-- User-owned persistence for calibration profiles and simulation experiments.

create table public.calibrations (
  id text primary key,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hands_played integer not null check (hands_played >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  constraint calibrations_id_user_id_key unique (id, user_id)
);

create table public.experiments (
  id text primary key,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  calibration_id text,
  hand_set_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null check (
    status in ('pending', 'running', 'complete', 'cancelled')
  ),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  constraint experiments_id_user_id_key unique (id, user_id),
  constraint experiments_calibration_owner_fkey
    foreign key (calibration_id, user_id)
    references public.calibrations (id, user_id)
    on update cascade
    on delete set null (calibration_id)
);

create table public.experiment_hands (
  experiment_id text not null,
  user_id uuid not null default auth.uid(),
  hand_set_id uuid not null,
  hand_number integer not null check (hand_number > 0),
  history jsonb not null check (jsonb_typeof(history) = 'object'),
  primary key (experiment_id, hand_set_id, hand_number),
  constraint experiment_hands_experiment_owner_fkey
    foreign key (experiment_id, user_id)
    references public.experiments (id, user_id)
    on update cascade
    on delete cascade
);

create index calibrations_user_created_at_idx
  on public.calibrations (user_id, created_at desc);

create index experiments_user_created_at_idx
  on public.experiments (user_id, created_at desc);

create index experiments_user_calibration_idx
  on public.experiments (user_id, calibration_id)
  where calibration_id is not null;

create index experiment_hands_user_experiment_idx
  on public.experiment_hands (user_id, experiment_id, hand_set_id, hand_number);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger calibrations_set_updated_at
before update on public.calibrations
for each row execute function public.set_updated_at();

create trigger experiments_set_updated_at
before update on public.experiments
for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public;

create function public.finalize_experiment_run(
  p_experiment_id text,
  p_hand_set_id uuid,
  p_status text,
  p_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_hand_set_id uuid;
begin
  if p_status not in ('pending', 'running', 'complete', 'cancelled') then
    raise exception 'Invalid experiment status';
  end if;

  select hand_set_id
    into previous_hand_set_id
    from public.experiments
    where id = p_experiment_id
      and user_id = (select auth.uid())
    for update;

  if not found then
    raise exception 'Experiment not found or not owned by the current user';
  end if;

  update public.experiments
    set hand_set_id = p_hand_set_id,
        status = p_status,
        payload = p_payload,
        updated_at = now()
    where id = p_experiment_id
      and user_id = (select auth.uid());

  if previous_hand_set_id is not null and previous_hand_set_id <> p_hand_set_id then
    delete from public.experiment_hands
      where experiment_id = p_experiment_id
        and user_id = (select auth.uid())
        and hand_set_id = previous_hand_set_id;
  end if;
end;
$$;

revoke all on function public.finalize_experiment_run(text, uuid, text, jsonb) from public, anon;
grant execute on function public.finalize_experiment_run(text, uuid, text, jsonb) to authenticated, service_role;

alter table public.calibrations enable row level security;
alter table public.experiments enable row level security;
alter table public.experiment_hands enable row level security;

create policy "calibrations_select_own"
on public.calibrations
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "calibrations_insert_own"
on public.calibrations
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "calibrations_update_own"
on public.calibrations
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "calibrations_delete_own"
on public.calibrations
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "experiments_select_own"
on public.experiments
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "experiments_insert_own"
on public.experiments
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "experiments_update_own"
on public.experiments
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "experiments_delete_own"
on public.experiments
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "experiment_hands_select_own"
on public.experiment_hands
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "experiment_hands_insert_own"
on public.experiment_hands
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "experiment_hands_update_own"
on public.experiment_hands
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "experiment_hands_delete_own"
on public.experiment_hands
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.calibrations from anon, authenticated;
revoke all on table public.experiments from anon, authenticated;
revoke all on table public.experiment_hands from anon, authenticated;

grant select, insert, update, delete on table public.calibrations to authenticated;
grant select, insert, update, delete on table public.experiments to authenticated;
grant select, insert, update, delete on table public.experiment_hands to authenticated;

grant all on table public.calibrations to service_role;
grant all on table public.experiments to service_role;
grant all on table public.experiment_hands to service_role;
