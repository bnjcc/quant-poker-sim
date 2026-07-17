-- Tester judgments of simulated strategy decisions, normalized for model analysis.

create table public.strategy_reviews (
  id text primary key,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  experiment_id text not null,
  calibration_id text,
  round_number integer not null check (round_number > 0),
  created_at timestamptz not null default now(),
  simulation_version text not null,
  reviewed_decisions integer not null check (reviewed_decisions > 0),
  agreed_decisions integer not null check (agreed_decisions >= 0),
  corrected_decisions integer not null check (corrected_decisions >= 0),
  accuracy double precision not null check (accuracy between 0 and 1),
  accepted boolean not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  constraint strategy_reviews_experiment_owner_fkey
    foreign key (experiment_id, user_id)
    references public.experiments (id, user_id)
    on update cascade
    on delete cascade,
  constraint strategy_reviews_calibration_owner_fkey
    foreign key (calibration_id, user_id)
    references public.calibrations (id, user_id)
    on update cascade
    on delete set null (calibration_id),
  constraint strategy_reviews_counts_match
    check (agreed_decisions + corrected_decisions = reviewed_decisions),
  constraint strategy_reviews_experiment_round_key
    unique (experiment_id, round_number)
);

create index strategy_reviews_user_created_at_idx
  on public.strategy_reviews (user_id, created_at desc);

alter table public.strategy_reviews enable row level security;

create policy "strategy_reviews_select_own"
on public.strategy_reviews
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "strategy_reviews_insert_own"
on public.strategy_reviews
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "strategy_reviews_update_own"
on public.strategy_reviews
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "strategy_reviews_delete_own"
on public.strategy_reviews
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.strategy_reviews from anon, authenticated;
grant select, insert, update, delete on table public.strategy_reviews to authenticated;
grant all on table public.strategy_reviews to service_role;

create function public.save_experiment_strategy_review(
  p_experiment_id text,
  p_experiment_status text,
  p_experiment_payload jsonb,
  p_review_id text,
  p_review_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owned_user_id uuid;
  owned_calibration_id text;
begin
  if p_experiment_status not in ('pending', 'running', 'complete', 'cancelled') then
    raise exception 'Invalid experiment status';
  end if;
  if jsonb_typeof(p_experiment_payload) is distinct from 'object'
     or jsonb_typeof(p_review_payload) is distinct from 'object' then
    raise exception 'Experiment and review payloads must be JSON objects';
  end if;
  if p_review_payload ->> 'id' is distinct from p_review_id
     or p_review_payload ->> 'experimentId' is distinct from p_experiment_id then
    raise exception 'Review identifiers do not match the requested experiment';
  end if;

  select user_id, calibration_id
    into owned_user_id, owned_calibration_id
    from public.experiments
    where id = p_experiment_id
      and user_id = (select auth.uid())
    for update;

  if not found then
    raise exception 'Experiment not found or not owned by the current user';
  end if;

  insert into public.strategy_reviews (
    id,
    user_id,
    experiment_id,
    calibration_id,
    round_number,
    created_at,
    simulation_version,
    reviewed_decisions,
    agreed_decisions,
    corrected_decisions,
    accuracy,
    accepted,
    payload
  ) values (
    p_review_id,
    owned_user_id,
    p_experiment_id,
    owned_calibration_id,
    (p_review_payload ->> 'roundNumber')::integer,
    (p_review_payload ->> 'createdAt')::timestamptz,
    p_review_payload ->> 'simulationVersion',
    jsonb_array_length(p_review_payload -> 'answers'),
    (p_review_payload ->> 'agreedCount')::integer,
    (p_review_payload ->> 'correctedCount')::integer,
    (p_review_payload ->> 'accuracy')::double precision,
    (p_review_payload ->> 'accepted')::boolean,
    p_review_payload
  )
  on conflict (id) do update
    set calibration_id = excluded.calibration_id,
        round_number = excluded.round_number,
        created_at = excluded.created_at,
        simulation_version = excluded.simulation_version,
        reviewed_decisions = excluded.reviewed_decisions,
        agreed_decisions = excluded.agreed_decisions,
        corrected_decisions = excluded.corrected_decisions,
        accuracy = excluded.accuracy,
        accepted = excluded.accepted,
        payload = excluded.payload
    where public.strategy_reviews.user_id = (select auth.uid())
      and public.strategy_reviews.experiment_id = p_experiment_id;

  update public.experiments
    set status = p_experiment_status,
        payload = p_experiment_payload,
        updated_at = now()
    where id = p_experiment_id
      and user_id = owned_user_id;
end;
$$;

revoke all on function public.save_experiment_strategy_review(text, text, jsonb, text, jsonb)
  from public, anon;
grant execute on function public.save_experiment_strategy_review(text, text, jsonb, text, jsonb)
  to authenticated, service_role;
