-- =====================================================================
-- Phase 2 tests: matches, training load, recovery plans, recovery sessions,
-- attendance, contraindications, athlete schedule.
-- Accounts: physician 1111, assistant 2222, manager 3333, coach 4444 (c001);
-- athlete b1b1 → d2 (c001); athlete a2a2 → e9 (c002); clubB assistant 7777 (c002).
-- =====================================================================
\set QUIET on
reset role;
select set_config('request.jwt.claim.sub', '', false);
create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

-- Q1. Coach plans a match and a training session with participation (load = RPE × min)
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
insert into public.matches (id, club_id, opponent, competition, match_date, match_time, home_away)
values ('00000000-0000-4000-8000-0000000c0a01', '00000000-0000-4000-8000-00000000c001', 'Al Ahly', 'League', current_date + 3, '19:00', 'Away');
insert into public.training_sessions (id, club_id, session_date, session_type, duration_minutes, planned_rpe)
values ('00000000-0000-4000-8000-0000000c0b01', '00000000-0000-4000-8000-00000000c001', current_date, 'Evening training', 90, 6);
insert into public.training_participation (session_id, player_id, status, duration_minutes, rpe)
values ('00000000-0000-4000-8000-0000000c0b01', '00000000-0000-4000-8000-0000000000d2', 'Full', 90, 7),
       ('00000000-0000-4000-8000-0000000c0b01', '00000000-0000-4000-8000-0000000000d3', 'Modified', 45, 4);
do $$ begin
  assert (select session_load = 630 from public.training_participation where player_id = '00000000-0000-4000-8000-0000000000d2'), 'session load';
  assert (select club_id = '00000000-0000-4000-8000-00000000c001' from public.training_participation limit 1), 'participation club';
  begin
    insert into public.training_participation (session_id, player_id) values ('00000000-0000-4000-8000-0000000c0b01', '00000000-0000-4000-8000-0000000000e9');
    raise exception 'player of another club accepted in a session';
  exception when check_violation then null; end;
  begin
    insert into public.recovery_sessions (club_id, kind, session_date) values ('00000000-0000-4000-8000-00000000c001', 'Ice bath', current_date);
    raise exception 'coach created a recovery session';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Q2. Athletes have no table access; other club staff see nothing
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$ begin
  assert (select count(*) from public.matches) = 0, 'athlete reads matches table';
  assert (select count(*) from public.training_participation) = 0, 'athlete reads participation';
end $$;
reset role;
select pg_temp.act_as('77777777-7777-4777-8777-777777777777');
do $$ begin
  assert (select count(*) from public.matches) = 0, 'other club staff read matches';
  assert (select count(*) from public.training_sessions) = 0, 'other club staff read training';
end $$;
reset role;

-- Q3. Recovery plan: assistant proposes, cannot approve; physician approves; staff see only approved
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
insert into public.recovery_plans (id, club_id, match_id, title) values ('00000000-0000-4000-8000-0000000c0c01', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000c0a01', 'Recovery – Al Ahly');
insert into public.recovery_plan_items (plan_id, day_label, item_date, category, recommendation, player_overrides)
values ('00000000-0000-4000-8000-0000000c0c01', 'MD+1', current_date + 4, 'Cold water immersion', 'Ice bath 11–15 °C, 10 min', '{"00000000-0000-4000-8000-0000000000d3":"EXCLUDED"}'),
       ('00000000-0000-4000-8000-0000000c0c01', 'MD-1', current_date + 2, 'Sleep', 'Sleep 8–9 h', '{}');
do $$ begin
  begin
    update public.recovery_plans set status = 'Approved' where id = '00000000-0000-4000-8000-0000000c0c01';
    raise exception 'assistant approved a plan';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert (select count(*) from public.recovery_plans) = 0, 'coach sees a proposed plan';
  assert (select count(*) from public.recovery_plan_items) = 0, 'coach sees proposed plan items';
end $$;
reset role;
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$ begin
  assert jsonb_array_length(public.my_schedule(current_date, current_date + 7) -> 'plan') = 0, 'athlete sees a proposed plan';
end $$;
reset role;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
update public.recovery_plans set status = 'Approved' where id = '00000000-0000-4000-8000-0000000c0c01';
do $$ begin
  assert (select approved_by = auth.uid() from public.recovery_plans where id = '00000000-0000-4000-8000-0000000c0c01'), 'approval not recorded';
end $$;
reset role;
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert (select count(*) from public.recovery_plan_items) = 2, 'coach should see the approved plan';
end $$;
reset role;

-- Q4. Athlete schedule: training, match, approved plan; exclusion respected for another player
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$
declare j jsonb := public.my_schedule(current_date, current_date + 7);
begin
  assert jsonb_array_length(j -> 'training') = 1, 'athlete schedule training';
  assert jsonb_array_length(j -> 'matches') = 1, 'athlete schedule match';
  assert jsonb_array_length(j -> 'plan') = 2, format('athlete plan items %s', jsonb_array_length(j -> 'plan'));
end $$;
reset role;
-- d3 is excluded from the ice bath item
do $$ begin
  assert not exists (select 1 from public.recovery_plan_items i where i.category = 'Cold water immersion'
    and coalesce(i.player_overrides ->> '00000000-0000-4000-8000-0000000000d3', '') <> 'EXCLUDED'), 'exclusion not stored';
end $$;

-- Q5. Contraindication: physician restricts d3 from ice baths; assignment refused; coach sees flag without reason
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
insert into public.recovery_restrictions (player_id, intervention, level, instructions, reason)
values ('00000000-0000-4000-8000-0000000000d3', 'Ice bath', 'Contraindicated', 'No cold-water immersion', 'Cold urticaria');
insert into public.recovery_sessions (id, club_id, kind, session_date, start_time, recommended_temp_c, recommended_minutes)
values ('00000000-0000-4000-8000-0000000c0d01', '00000000-0000-4000-8000-00000000c001', 'Ice bath', current_date, '20:00', 12, 10);
insert into public.recovery_attendance (session_id, player_id) values ('00000000-0000-4000-8000-0000000c0d01', '00000000-0000-4000-8000-0000000000d2');
do $$ begin
  begin
    insert into public.recovery_attendance (session_id, player_id) values ('00000000-0000-4000-8000-0000000c0d01', '00000000-0000-4000-8000-0000000000d3');
    raise exception 'contraindicated player assigned to ice bath';
  exception when check_violation then null; end;
  -- recording that he was excused is allowed
  insert into public.recovery_attendance (session_id, player_id, status) values ('00000000-0000-4000-8000-0000000c0d01', '00000000-0000-4000-8000-0000000000d3', 'Excused');
  update public.recovery_attendance set status = 'Completed', start_time = '20:05', end_time = '20:15', water_temp_c = 12.5
   where player_id = '00000000-0000-4000-8000-0000000000d2';
  assert (select duration_minutes = 10 from public.recovery_attendance where player_id = '00000000-0000-4000-8000-0000000000d2'), 'duration not calculated';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications n join public.profiles p on p.id = n.user_id where p.player_id = '00000000-0000-4000-8000-0000000000d2' and n.title like 'جلسة استشفاء%'), 'athlete not notified of recovery session';
end $$;
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$
declare r record;
begin
  assert (select count(*) from public.recovery_restrictions) = 0, 'coach reads restriction reasons';
  select * into r from public.get_recovery_flags('00000000-0000-4000-8000-00000000c001') where player_id = '00000000-0000-4000-8000-0000000000d3';
  assert r.level = 'Contraindicated' and r.instructions = 'No cold-water immersion', 'coach restriction flag';
  assert not (to_jsonb(r)::text like '%urticaria%'), 'clinical reason leaked';
  assert (select count(*) from public.recovery_attendance) = 2, 'coach should see attendance';
  begin
    update public.recovery_attendance set status = 'Absent';
    if exists (select 1 from public.recovery_attendance where status = 'Absent') then raise exception 'coach edited attendance'; end if;
  end;
end $$;
reset role;

-- Q6. Athlete sees own recovery session
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$ begin
  assert (public.my_schedule(current_date, current_date + 1) -> 'recovery' -> 0 ->> 'status') = 'Completed', 'athlete recovery session';
end $$;
reset role;
\echo phase 2 tests passed
