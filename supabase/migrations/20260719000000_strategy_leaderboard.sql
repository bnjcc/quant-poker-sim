-- Public-safe aggregate rankings derived from private completed experiments.
-- The function exposes only strategy presentation metadata and aggregate
-- performance; experiment payloads and hand histories remain protected by RLS.

create function public.get_strategy_leaderboard(p_limit integer default 3)
returns table (
  rank bigint,
  username text,
  strategy_name text,
  win_rate double precision,
  experiment_count bigint,
  total_hands bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with strategy_runs as (
    select
      experiment.user_id,
      coalesce(
        experiment.calibration_id,
        nullif(experiment.payload ->> 'calibrationId', ''),
        experiment.id
      ) as strategy_id,
      experiment.created_at,
      coalesce(
        calibration.name,
        nullif(experiment.payload ->> 'strategyName', ''),
        'Unnamed strategy'
      ) as strategy_name,
      case
        when jsonb_typeof(experiment.payload #> '{results,bb100}') = 'number'
          then (experiment.payload #>> '{results,bb100}')::double precision
      end as win_rate,
      case
        when jsonb_typeof(experiment.payload #> '{results,totalHands}') = 'number'
          then (experiment.payload #>> '{results,totalHands}')::bigint
      end as total_hands
    from public.experiments as experiment
    left join public.calibrations as calibration
      on calibration.id = experiment.calibration_id
      and calibration.user_id = experiment.user_id
    where experiment.status = 'complete'
  ),
  eligible_runs as (
    select *
    from strategy_runs
    where win_rate is not null and total_hands > 0
  ),
  strategy_totals as (
    select
      user_id,
      strategy_id,
      (array_agg(strategy_name order by created_at desc))[1] as strategy_name,
      sum(win_rate * total_hands) / nullif(sum(total_hands), 0) as win_rate,
      count(*) as experiment_count,
      sum(total_hands)::bigint as total_hands
    from eligible_runs
    group by user_id, strategy_id
  ),
  ranked as (
    select
      row_number() over (
        order by totals.win_rate desc, totals.total_hands desc,
          totals.strategy_name asc, totals.strategy_id asc
      ) as rank,
      coalesce(profile.username, 'player_' || substr(replace(totals.user_id::text, '-', ''), 1, 12)) as username,
      totals.strategy_name,
      totals.win_rate,
      totals.experiment_count,
      totals.total_hands
    from strategy_totals as totals
    left join public.profiles as profile on profile.user_id = totals.user_id
  )
  select
    ranked.rank,
    ranked.username,
    ranked.strategy_name,
    ranked.win_rate,
    ranked.experiment_count,
    ranked.total_hands
  from ranked
  where ranked.rank <= least(greatest(coalesce(p_limit, 3), 1), 100)
  order by ranked.rank;
$$;

revoke all on function public.get_strategy_leaderboard(integer) from public, anon;
grant execute on function public.get_strategy_leaderboard(integer) to authenticated, service_role;
