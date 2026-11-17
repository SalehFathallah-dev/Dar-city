-- =====================================================================
-- Athlete portal, prescriptions, dose log and staff summary tests.
-- Run after rls_tests.sql (+ club_tests.sql) and migrations 6–7.
-- Dar City = c001 (players d1–d5), Kili = c002 (player e9).
-- =====================================================================
\set QUIET on
reset role;
select set_config('request.jwt.claim.sub', '', false);
create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

-- Athlete accounts: d1 (Dar City) and e9 (Kili)
insert into auth.users (id, email, raw_user_meta_data) values
 ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1','athlete.d1@dsf.local','{"full_name":"Athlete D1"}'),
 ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2','athlete.e9@dsf.local','{"full_name":"Athlete E9"}');
update public.profiles set role = 'athlete', is_active = true, player_id = '00000000-0000-4000-8000-0000000000d1' where email = 'athlete.d1@dsf.local';
update public.profiles set role = 'athlete', is_active = true, player_id = '00000000-0000-4000-8000-0000000000e9' where email = 'athlete.e9@dsf.local';

-- A1. Athlete without player link cannot be activated
do $$ begin
  begin
    update public.profiles set role = 'athlete', is_active = true, player_id = null where email = 'pending@test.local';
    raise exception 'athlete without player accepted';
  exception when check_violation then null; end;
end $$;

-- A2. Physician prescribes (club derived from player; injury must match player)
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
insert into public.prescriptions (id, player_id, club_id, kind, name, dose, schedule_times, start_date)
values ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000c002',
        'Supplement', 'Vitamin D3', '1 capsule', '{08:00,20:00}', current_date - 3);
insert into public.prescriptions (id, player_id, kind, name, dose, schedule_times, start_date, share_with_staff)
values ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-0000000000d1', 'Medication', 'Ibuprofen 400 mg', '1 tablet', '{14:00}', current_date - 3, false);
insert into public.prescriptions (id, player_id, kind, name, schedule_times, start_date)
values ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-0000000000d2', 'Exercise', 'Hamstring Nordic curls', '{}', current_date);
do $$ begin
  assert (select club_id = '00000000-0000-4000-8000-00000000c001' from public.prescriptions where id = '00000000-0000-4000-8000-00000000b001'), 'prescription club forged';
  begin
    insert into public.prescriptions (player_id, injury_id, kind, name)
    values ('00000000-0000-4000-8000-0000000000d2', (select id from public.injuries where player_id = '00000000-0000-4000-8000-0000000000d1' limit 1), 'Treatment', 'Ice');
    raise exception 'injury of another player accepted';
  exception when check_violation then null; end;
  begin
    insert into public.prescriptions (player_id, kind, name, schedule_times) values ('00000000-0000-4000-8000-0000000000d2', 'Supplement', 'Bad time', '{25:00}');
    raise exception 'invalid time accepted';
  exception when check_violation then null; end;
end $$;
reset role;

-- A3. Athlete: no direct table access at all
select pg_temp.act_as('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1');
do $$ begin
  assert not public.is_staff(), 'athlete counted as staff';
  assert (select count(*) from public.players) = 0, 'athlete can read players';
  assert (select count(*) from public.injuries) = 0, 'athlete can read injuries';
  assert (select count(*) from public.prescriptions) = 0, 'athlete can read prescriptions table';
  assert (select count(*) from public.dose_logs) = 0, 'athlete can read dose logs table';
  assert (select count(*) from public.clubs) = 0, 'athlete can read clubs';
  assert (select count(*) from public.application_settings) = 0, 'athlete can read settings';
  assert (select count(*) from public.profiles) = 1, 'athlete can read other profiles';
  begin
    perform * from public.get_team_availability(null);
    raise exception 'athlete can read team availability';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.get_team_summary('00000000-0000-4000-8000-00000000c001');
    raise exception 'athlete can read team summary';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.prescriptions (player_id, kind, name) values ('00000000-0000-4000-8000-0000000000d1', 'Supplement', 'Self-prescribed');
    raise exception 'athlete could prescribe';
  exception when insufficient_privilege then null; end;
end $$;

-- A4. Athlete portal shows only own data; confirms own doses
do $$
declare j jsonb;
begin
  j := public.get_my_portal(current_date - 3, current_date);
  assert j -> 'player' ->> 'id' = '00000000-0000-4000-8000-0000000000d1', 'portal shows wrong player';
  assert jsonb_array_length(j -> 'prescriptions') = 2, 'portal prescriptions count';
  assert not (j::text like '%Nordic%'), 'portal leaks another player''s prescription';
  -- 4 days × (2 + 1) doses
  assert jsonb_array_length(j -> 'doses') = 12, format('expected 12 doses, got %s', jsonb_array_length(j -> 'doses'));
  perform public.log_dose('00000000-0000-4000-8000-00000000b001', current_date, '08:00', 'taken');
  perform public.log_dose('00000000-0000-4000-8000-00000000b001', current_date, '08:00', 'taken', 'with breakfast'); -- idempotent
  perform public.log_dose('00000000-0000-4000-8000-00000000b002', current_date - 1, '14:00', 'skipped', 'stomach ache');
  begin
    perform public.log_dose('00000000-0000-4000-8000-00000000b003', current_date, 'any', 'taken');
    raise exception 'athlete confirmed another player''s dose';
  exception when insufficient_privilege then null; end;
  begin
    perform public.log_dose('00000000-0000-4000-8000-00000000b001', current_date - 30, '08:00', 'taken');
    raise exception 'old date accepted';
  exception when check_violation then null; end;
  j := public.get_my_portal(current_date, current_date);
  assert (select count(*) from jsonb_array_elements(j -> 'doses') d where d ->> 'status' = 'taken') = 1, 'taken dose not in portal';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.dose_logs) = 2, 'dose log rows';
  assert (select note = 'with breakfast' from public.dose_logs where prescription_id = '00000000-0000-4000-8000-00000000b001'), 'dose update not applied';
end $$;

-- A5. Athlete of another club cannot touch Dar City data
select pg_temp.act_as('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2');
do $$ begin
  assert (public.get_my_portal() -> 'player' ->> 'id') = '00000000-0000-4000-8000-0000000000e9', 'wrong portal player';
  begin
    perform public.log_dose('00000000-0000-4000-8000-00000000b001', current_date, '20:00', 'taken');
    raise exception 'cross-club dose confirmation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A6. Head coach: summary + adherence, medication name hidden when not shared, no notes
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert (select count(*) from public.get_team_summary('00000000-0000-4000-8000-00000000c001')) >= 4, 'coach summary empty';
  assert exists (select 1 from public.get_team_adherence('00000000-0000-4000-8000-00000000c001', current_date - 3, current_date) where name = 'Vitamin D3' and status = 'taken'), 'coach cannot see shared supplement adherence';
  assert not exists (select 1 from public.get_team_adherence('00000000-0000-4000-8000-00000000c001', current_date - 3, current_date) where name like 'Ibuprofen%'), 'private medication name leaked to coach';
  assert exists (select 1 from public.get_team_adherence('00000000-0000-4000-8000-00000000c001', current_date - 3, current_date) where name = 'Medication' and status = 'skipped'), 'masked medication adherence missing';
  assert not exists (select 1 from public.get_team_adherence('00000000-0000-4000-8000-00000000c001', current_date - 3, current_date) where note is not null), 'dose notes leaked to coach';
  assert (select count(*) from public.prescriptions) = 0, 'coach can read prescriptions table';
  begin
    perform * from public.get_team_summary('00000000-0000-4000-8000-00000000c002');
    raise exception 'coach can read another club';
  exception when insufficient_privilege then null; end;
  begin
    perform public.log_dose('00000000-0000-4000-8000-00000000b001', current_date, '20:00', 'taken');
    raise exception 'coach confirmed a dose';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A7. Physician sees everything incl. notes; can manage accounts but not create administrators
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
do $$ begin
  assert exists (select 1 from public.get_team_adherence('00000000-0000-4000-8000-00000000c001', current_date - 3, current_date) where name like 'Ibuprofen%' and note = 'stomach ache'), 'physician cannot see full adherence';
  assert (select count(*) from public.list_athlete_accounts()) = 2, 'athlete accounts list';
  perform public.log_dose('00000000-0000-4000-8000-00000000b001', current_date, '20:00', 'taken');
end $$;
update public.profiles set is_active = false where email = 'athlete.d1@dsf.local';
do $$ begin
  assert (select not is_active from public.profiles where email = 'athlete.d1@dsf.local'), 'physician cannot deactivate athlete';
  begin
    update public.profiles set role = 'super_admin' where email = 'coach@test.local';
    raise exception 'physician created an administrator';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A8. Deactivated athlete loses access
select pg_temp.act_as('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1');
do $$ begin
  begin
    perform public.get_my_portal();
    raise exception 'inactive athlete opened the portal';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A9. Assistant of club B cannot see Dar City adherence
select pg_temp.act_as('77777777-7777-4777-8777-777777777777');
do $$ begin
  begin
    perform * from public.get_team_adherence('00000000-0000-4000-8000-00000000c001', current_date - 1, current_date);
    raise exception 'assistant read another club adherence';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo athlete tests passed

-- A10. Clearing a confirmation: coach never; athlete only own recent doses
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  begin
    perform public.clear_dose('00000000-0000-4000-8000-00000000b001', current_date, '08:00');
    raise exception 'coach cleared a dose';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo athlete clear tests passed

-- A11. Athletes may record their own sign-in, nothing else
select pg_temp.act_as('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2');
do $$ begin
  perform public.log_event('LOGIN', 'session');
  begin
    perform public.log_event('EXPORT_CSV', 'players');
    raise exception 'athlete wrote an export audit event';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo athlete audit tests passed

-- A12. Deleting a player disables its athlete account
select set_config('request.jwt.claim.sub', '', false);
insert into public.players (id, club_id, full_name, date_of_birth, position) values ('00000000-0000-4000-8000-0000000000ee', '00000000-0000-4000-8000-00000000c001', 'Temp Player', '2001-01-01', 'Center');
insert into auth.users (id, email) values ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', 'athlete.temp@dsf.local');
update public.profiles set role = 'athlete', is_active = true, player_id = '00000000-0000-4000-8000-0000000000ee' where email = 'athlete.temp@dsf.local';
delete from public.players where id = '00000000-0000-4000-8000-0000000000ee';
do $$ begin
  assert (select not is_active and player_id is null from public.profiles where email = 'athlete.temp@dsf.local'), 'athlete not disabled on player delete';
end $$;
\echo athlete unlink tests passed
