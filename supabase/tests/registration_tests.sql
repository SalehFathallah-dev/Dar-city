-- =====================================================================
-- Self-registration, staff register, categories and recovery view tests.
-- Run after athlete_tests.sql and migration 10.
-- Dar City = c001 (players d1–d5, physician 1111, coach 4444, manager 3333).
-- =====================================================================
\set QUIET on
reset role;
select set_config('request.jwt.claim.sub', '', false);
create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

-- New self-registered accounts (inactive, no role)
insert into auth.users (id, email, raw_user_meta_data) values
 ('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1','newplayer@dsf.local','{"full_name":"New Player"}'),
 ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2','newcoach@dsf.local','{"full_name":"New Coach"}'),
 ('b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3','impostor@dsf.local','{"full_name":"Impostor"}');

-- R1. Categories created for existing players; physician manages categories and staff
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
do $$ begin
  assert exists (select 1 from public.club_categories where club_id = '00000000-0000-4000-8000-00000000c001'), 'existing categories not created';
end $$;
insert into public.club_categories (club_id, name, sort_order) values ('00000000-0000-4000-8000-00000000c001', 'U18', 1);
insert into public.staff_members (id, club_id, full_name, app_role, title, category)
values ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000c001', 'Omar Coach', 'head_coach', 'Head Coach U18', 'U18');
do $$ begin
  begin
    update public.staff_members set profile_id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2' where id = '00000000-0000-4000-8000-00000000f001';
    raise exception 'staff linked to an account directly';
  exception when insufficient_privilege then null; end;
end $$;
-- Renaming a category renames it on players
update public.players set team_category = 'U18' where id = '00000000-0000-4000-8000-0000000000d2';
update public.club_categories set name = 'Under 18' where club_id = '00000000-0000-4000-8000-00000000c001' and name = 'U18';
do $$ begin
  assert (select team_category = 'Under 18' from public.players where id = '00000000-0000-4000-8000-0000000000d2'), 'category rename not propagated';
  assert (select category = 'Under 18' from public.staff_members where id = '00000000-0000-4000-8000-00000000f001'), 'staff category rename not propagated';
end $$;
reset role;

-- R2. Coach (staff) cannot change categories or staff
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  begin
    insert into public.club_categories (club_id, name) values ('00000000-0000-4000-8000-00000000c001', 'U12');
    raise exception 'coach created a category';
  exception when insufficient_privilege then null; end;
  update public.staff_members set full_name = 'Hacked' where id = '00000000-0000-4000-8000-00000000f001';
  assert (select full_name = 'Omar Coach' from public.staff_members where id = '00000000-0000-4000-8000-00000000f001'), 'coach edited staff register';
end $$;
reset role;

-- R3. Unassigned account: sees only club names and unclaimed names; no data at all
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$ begin
  assert public.is_unassigned_user(), 'new account should be unassigned';
  assert (select count(*) from public.clubs) = 0, 'unassigned account reads clubs table';
  assert (select count(*) from public.players) = 0, 'unassigned account reads players table';
  assert (select count(*) from public.staff_members) = 0, 'unassigned account reads staff table';
  assert (select count(*) from public.club_categories) = 0, 'unassigned account reads categories table';
  assert exists (select 1 from public.registration_clubs() where id = '00000000-0000-4000-8000-00000000c001'), 'club list empty';
  assert exists (select 1 from public.registration_categories('00000000-0000-4000-8000-00000000c001') where name = 'Under 18'), 'category list';
  -- d1 already has an athlete account (athlete_tests) → not offered
  assert not exists (select 1 from public.registration_people('00000000-0000-4000-8000-00000000c001', 'athlete') where id = '00000000-0000-4000-8000-0000000000d1'), 'claimed player offered';
  assert exists (select 1 from public.registration_people('00000000-0000-4000-8000-00000000c001', 'athlete', 'Under 18') where id = '00000000-0000-4000-8000-0000000000d2'), 'player list by category';
  begin
    perform public.get_player_recovery('00000000-0000-4000-8000-0000000000d2');
    raise exception 'unassigned account read recovery';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_registration('00000000-0000-4000-8000-00000000c001', 'athlete', '00000000-0000-4000-8000-0000000000d1');
    raise exception 'claimed player accepted';
  exception when check_violation then null; end;
  perform public.submit_registration('00000000-0000-4000-8000-00000000c001', 'athlete', '00000000-0000-4000-8000-0000000000d2', 'I am #7');
  assert (select status = 'pending' and person_name like '%' from public.my_registration()), 'my_registration';
  begin
    perform public.decide_registration((select id from public.my_registration()), true);
    raise exception 'user approved own request';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The impostor also claims d2; the coach account claims the staff member
select pg_temp.act_as('b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3');
select public.submit_registration('00000000-0000-4000-8000-00000000c001', 'athlete', '00000000-0000-4000-8000-0000000000d2');
reset role;
select pg_temp.act_as('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2');
select public.submit_registration('00000000-0000-4000-8000-00000000c001', 'staff', '00000000-0000-4000-8000-00000000f001');
reset role;

-- R4. Coach cannot see or decide requests; physician approves
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert (select count(*) from public.registration_requests) = 0, 'coach reads registration requests';
  begin
    perform * from public.list_registrations();
    raise exception 'coach listed registrations';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
do $$ begin
  assert (select count(*) from public.list_registrations()) = 3, 'physician should see 3 pending requests';
  perform public.decide_registration((select id from public.registration_requests where user_id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' and status = 'pending'), true);
  perform public.decide_registration((select id from public.registration_requests where user_id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2' and status = 'pending'), true);
  assert (select status = 'rejected' from public.registration_requests where user_id = 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3'), 'duplicate claim not rejected';
end $$;
reset role;
do $$ begin
  assert (select role = 'athlete' and is_active and player_id = '00000000-0000-4000-8000-0000000000d2' from public.profiles where email = 'newplayer@dsf.local'), 'athlete not activated';
  assert (select role = 'head_coach' and is_active from public.profiles where email = 'newcoach@dsf.local'), 'coach not activated';
  assert exists (select 1 from public.club_members where user_id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2' and club_id = '00000000-0000-4000-8000-00000000c001'), 'coach club access missing';
  assert (select profile_id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2' from public.staff_members where id = '00000000-0000-4000-8000-00000000f001'), 'staff not linked';
end $$;

-- R5. After approval: athlete portal works; the registration helpers are closed
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$ begin
  assert (public.get_my_portal() -> 'player' ->> 'id') = '00000000-0000-4000-8000-0000000000d2', 'approved athlete portal';
  begin
    perform * from public.registration_clubs();
    raise exception 'registration helpers open after approval';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- R6. Approved coach: recovery progress without clinical detail
select pg_temp.act_as('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2');
do $$
declare j jsonb;
begin
  assert (select count(*) from public.injuries) = 0, 'new coach reads injuries';
  j := public.get_player_recovery('00000000-0000-4000-8000-0000000000d4');
  assert j -> 'player' ->> 'id' = '00000000-0000-4000-8000-0000000000d4', 'recovery player';
  assert not (j::text ~* '(diagnosis|physician_assessment|clinical|pain|grade|internal_notes|imaging)'), 'clinical detail leaked in recovery view';
  begin
    perform public.get_player_recovery('00000000-0000-4000-8000-0000000000e9');
    raise exception 'coach read another club recovery';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- R7. The impostor (rejected) still has no access and may try again
select pg_temp.act_as('b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3');
do $$ begin
  assert (select status = 'rejected' from public.my_registration()), 'rejected status not visible';
  assert (select count(*) from public.players) = 0, 'rejected account reads players';
  begin
    perform public.submit_registration('00000000-0000-4000-8000-00000000c001', 'athlete', '00000000-0000-4000-8000-0000000000d2');
    raise exception 'claimed player accepted again';
  exception when check_violation then null; end;
end $$;
reset role;
\echo registration tests passed
