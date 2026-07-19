begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

select has_table('public', 'calibrations', 'calibrations table exists');
select has_table('public', 'experiments', 'experiments table exists');
select has_table('public', 'experiment_hands', 'experiment_hands table exists');
select has_table('public', 'strategy_reviews', 'strategy_reviews table exists');

select ok(
  to_regprocedure('public.get_strategy_leaderboard(integer)') is not null,
  'strategy leaderboard function exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_strategy_leaderboard(integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.get_strategy_leaderboard(integer)',
    'execute'
  ),
  'only authenticated clients can execute the leaderboard function'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.calibrations'::regclass),
  'calibrations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.experiments'::regclass),
  'experiments has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.experiment_hands'::regclass),
  'experiment_hands has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.strategy_reviews'::regclass),
  'strategy_reviews has RLS enabled'
);

select is(
  (select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename in ('calibrations', 'experiments', 'experiment_hands', 'strategy_reviews')),
  16,
  'each user-owned table has CRUD policies'
);

select ok(
  not has_table_privilege('anon', 'public.calibrations', 'select')
  and not has_table_privilege('anon', 'public.experiments', 'select')
  and not has_table_privilege('anon', 'public.experiment_hands', 'select')
  and not has_table_privilege('anon', 'public.strategy_reviews', 'select'),
  'anonymous users have no table read grants'
);

select ok(
  has_table_privilege('authenticated', 'public.calibrations', 'select,insert,update,delete')
  and has_table_privilege('authenticated', 'public.experiments', 'select,insert,update,delete')
  and has_table_privilege('authenticated', 'public.experiment_hands', 'select,insert,update,delete')
  and has_table_privilege('authenticated', 'public.strategy_reviews', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.calibrations', 'truncate')
  and not has_table_privilege('authenticated', 'public.experiments', 'truncate')
  and not has_table_privilege('authenticated', 'public.experiment_hands', 'truncate')
  and not has_table_privilege('authenticated', 'public.strategy_reviews', 'truncate'),
  'authenticated users have CRUD grants without unrestricted truncation'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'experiments_calibration_owner_fkey'
      and conrelid = 'public.experiments'::regclass
      and confdeltype = 'n'
  ),
  'experiment calibration ownership FK uses SET NULL'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'experiment_hands_experiment_owner_fkey'
      and conrelid = 'public.experiment_hands'::regclass
      and confdeltype = 'c'
  ),
  'experiment hand ownership FK uses CASCADE'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'strategy_reviews_experiment_owner_fkey'
      and conrelid = 'public.strategy_reviews'::regclass
      and confdeltype = 'c'
  ),
  'strategy review experiment ownership FK uses CASCADE'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'strategy_reviews_calibration_owner_fkey'
      and conrelid = 'public.strategy_reviews'::regclass
      and confdeltype = 'n'
  ),
  'strategy review calibration ownership FK uses SET NULL'
);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'schema-test-a@example.invalid'),
  ('20000000-0000-0000-0000-000000000002', 'schema-test-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into public.calibrations (id, name, hands_played, payload)
values ('cal_a', 'User A calibration', 25, '{}');

select is(
  (select user_id from public.calibrations where id = 'cal_a'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'new rows default to the authenticated user'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);

insert into public.calibrations (id, name, hands_played, payload)
values ('cal_b', 'User B calibration', 50, '{}');

insert into public.experiments (
  id, calibration_id, status, payload
) values (
  'exp_rank_b',
  'cal_b',
  'complete',
  '{"strategyName":"User B strategy","results":{"bb100":12,"totalHands":1000}}'
);

select is(
  (select count(*) from public.calibrations),
  1::bigint,
  'a user sees only their own calibrations'
);

select is(
  (select count(*) from public.calibrations where id = 'cal_a'),
  0::bigint,
  'another user calibration is hidden by RLS'
);

reset role;

create function pg_temp.cross_owner_link_is_blocked()
returns boolean
language plpgsql
as $$
begin
  insert into public.experiments (
    id, user_id, calibration_id, status, payload
  ) values (
    'exp_cross_owner',
    '10000000-0000-0000-0000-000000000001',
    'cal_b',
    'pending',
    '{}'
  );
  return false;
exception when foreign_key_violation then
  return true;
end;
$$;

select ok(
  pg_temp.cross_owner_link_is_blocked(),
  'the composite FK rejects cross-owner calibration links'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into public.experiments (id, calibration_id, status, payload)
values ('exp_a', 'cal_a', 'pending', '{}');

insert into public.experiments (id, calibration_id, status, payload)
values (
  'exp_rank_a',
  'cal_a',
  'complete',
  '{"strategyName":"User A strategy","results":{"bb100":5,"totalHands":2000}}'
);

select is(
  (select username from public.get_strategy_leaderboard(3) where rank = 1),
  (select username from public.profiles
    where user_id = '20000000-0000-0000-0000-000000000002'),
  'leaderboard ranks the best hand-weighted strategy across users'
);

select is(
  (select calibration_id from public.experiments where id = 'exp_a'),
  'cal_a',
  'an experiment can reference its owner calibration'
);

insert into public.experiment_hands (experiment_id, hand_set_id, hand_number, history)
values ('exp_a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, '{}');

select is(
  (select count(*) from public.experiment_hands where experiment_id = 'exp_a'),
  1::bigint,
  'a user can store a hand for their experiment'
);

insert into public.strategy_reviews (
  id, experiment_id, calibration_id, round_number, simulation_version,
  reviewed_decisions, agreed_decisions, corrected_decisions, accuracy, accepted, payload
) values (
  'review_a', 'exp_a', 'cal_a', 1, '1.3.0', 8, 7, 1, 0.875, false, '{}'
);

select is(
  (select count(*) from public.strategy_reviews where experiment_id = 'exp_a'),
  1::bigint,
  'a user can store strategy feedback for their experiment'
);

select public.save_experiment_strategy_review(
  'exp_a',
  'complete',
  '{"status":"complete","review_saved":true}',
  'review_rpc',
  '{"id":"review_rpc","experimentId":"exp_a","roundNumber":2,"createdAt":"2026-07-17T00:00:00.000Z","simulationVersion":"1.3.0","answers":[{}],"agreedCount":1,"correctedCount":0,"accuracy":1,"accepted":true}'
);

select is(
  (select count(*) from public.strategy_reviews where experiment_id = 'exp_a'),
  2::bigint,
  'atomic review finalizer stores the normalized feedback row'
);

select is(
  (select payload ->> 'review_saved' from public.experiments where id = 'exp_a'),
  'true',
  'atomic review finalizer stores the matching experiment payload'
);

delete from public.calibrations where id = 'cal_a';

select ok(
  exists (
    select 1 from public.experiments
    where id = 'exp_a' and calibration_id is null
  ),
  'deleting a calibration retains the experiment and clears its link'
);

select ok(
  exists (
    select 1 from public.strategy_reviews
    where id = 'review_a' and calibration_id is null
  ),
  'deleting a calibration retains strategy feedback and clears its link'
);

delete from public.experiments where id = 'exp_a';

select is(
  (select count(*) from public.experiment_hands where experiment_id = 'exp_a'),
  0::bigint,
  'deleting an experiment cascades to its hands'
);

select is(
  (select count(*) from public.strategy_reviews where experiment_id = 'exp_a'),
  0::bigint,
  'deleting an experiment cascades to its strategy reviews'
);

select * from finish();
rollback;
