-- =====================================================================
-- Multi-club isolation tests (included from rls_tests.sql)
-- Dar City = c001 (existing data). A second club is created here.
-- =====================================================================
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data) values
 ('77777777-7777-4777-8777-777777777777','clubb.assistant@test.local','{"full_name":"Club B Assistant"}');
update public.profiles set role = 'assistant_medical_staff', is_active = true where email = 'clubb.assistant@test.local';

-- 15. Existing data fully migrated to Dar City
do $$ begin
  assert (select count(*) from public.clubs) = 1, 'only Dar City should exist after migration';
  assert (select name = 'Dar City Basketball Team' and logo_url = '/clubs/dar-city.png' from public.clubs where id = '00000000-0000-4000-8000-00000000c001'), 'Dar City club not registered';
  assert not exists (select 1 from public.injuries where club_id <> '00000000-0000-4000-8000-00000000c001'), 'injuries not on Dar City';
  assert not exists (select 1 from public.injury_followups where club_id <> '00000000-0000-4000-8000-00000000c001'), 'follow-ups not on Dar City';
  assert (select count(*) from public.injuries where id::text like '00000000-0000-4000-8000-0000000000f%') = 5, 'original injury IDs not preserved';
end $$;

-- 16. Physician creates a second club (INSERT … RETURNING must work) and its records
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
insert into public.clubs (id, name, short_name, country, city) values ('00000000-0000-4000-8000-00000000c002', 'Kilimanjaro Warriors BC', 'Kili Warriors', 'Tanzania', 'Moshi') returning club_code, player_id_prefix;
do $$ begin
  assert (select player_id_prefix = 'KILI' from public.clubs where id = '00000000-0000-4000-8000-00000000c002'), 'prefix not derived';
  assert exists (select 1 from public.club_members where club_id = '00000000-0000-4000-8000-00000000c002' and user_id = auth.uid()), 'creator not given access';
end $$;
insert into public.team_seasons (id, club_id, name, start_date, end_date, is_current)
values ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000c002', '2026/2027', '2026-09-01', '2027-06-30', true);
-- Same jersey number #3 as a Dar City player is fine in another club
insert into public.players (id, club_id, season_id, full_name, date_of_birth, position, jersey_number)
values ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000a002', 'Kili Player', '2000-01-01', 'Center', 3);
do $$ begin
  assert (select player_code = 'KILI-0001' from public.players where id = '00000000-0000-4000-8000-0000000000e9'), 'per-club player ID not generated';
end $$;
-- Child records inherit the club; a forged club_id is ignored
insert into public.injuries (id, player_id, club_id, injury_date, setting, body_region, injury_type)
values ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-00000000c001', current_date, 'Match', 'Ankle', 'Ligament Sprain');
insert into public.injury_followups (injury_id, club_id, followup_date, pain_score)
values ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-00000000c001', current_date, 5);
do $$
declare n int;
begin
  assert (select club_id = '00000000-0000-4000-8000-00000000c002' from public.injuries where id = '00000000-0000-4000-8000-0000000000f9'), 'injury club not derived from player';
  assert (select bool_and(club_id = '00000000-0000-4000-8000-00000000c002') from public.injury_followups where injury_id = '00000000-0000-4000-8000-0000000000f9'), 'follow-up club forged';
  begin
    update public.players set club_id = '00000000-0000-4000-8000-00000000c001' where id = '00000000-0000-4000-8000-0000000000e9';
    raise exception 'player moved to another club';
  exception when insufficient_privilege then null; end;
  begin
    update public.injuries set club_id = '00000000-0000-4000-8000-00000000c001' where id = '00000000-0000-4000-8000-0000000000f9';
    raise exception 'injury moved to another club';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.players (club_id, season_id, full_name, date_of_birth, position)
    values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000a002', 'Wrong Season', '2000-01-01', 'Center');
    raise exception 'season from another club accepted';
  exception when check_violation then null; end;
end $$;
insert into storage.objects (bucket_id, name) values ('medical-documents', '00000000-0000-4000-8000-0000000000e9/kili.pdf');
insert into storage.objects (bucket_id, name) values ('club-logos', '00000000-0000-4000-8000-00000000c002/logo.png');
-- grant the Club B assistant access to Club B only
insert into public.club_members (club_id, user_id) values ('00000000-0000-4000-8000-00000000c002', '77777777-7777-4777-8777-777777777777');
reset role;

-- 17. Dar City-only staff cannot see Club B (coach, manager, assistant)
do $$
declare uid text;
begin
  foreach uid in array array['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'] loop
    perform pg_temp.act_as(uid);
    assert not exists (select 1 from public.clubs where id = '00000000-0000-4000-8000-00000000c002'), 'club B visible to Dar City staff';
    assert not exists (select 1 from public.players where club_id = '00000000-0000-4000-8000-00000000c002'), 'club B players leaked';
    assert not exists (select 1 from public.injuries where club_id = '00000000-0000-4000-8000-00000000c002'), 'club B injuries leaked';
    assert not exists (select 1 from public.team_seasons where club_id = '00000000-0000-4000-8000-00000000c002'), 'club B seasons leaked';
    assert not exists (select 1 from public.get_team_availability() where club_id = '00000000-0000-4000-8000-00000000c002'), 'club B availability leaked';
    assert not exists (select 1 from storage.objects where name like '00000000-0000-4000-8000-0000000000e9/%' or bucket_id = 'club-logos'), 'club B files leaked';
    begin
      perform public.get_team_availability('00000000-0000-4000-8000-00000000c002');
      raise exception 'availability RPC for foreign club allowed';
    exception when insufficient_privilege then null; end;
    begin
      insert into public.players (club_id, full_name, date_of_birth, position) values ('00000000-0000-4000-8000-00000000c002', 'Intruder', '2000-01-01', 'Center');
      raise exception 'inserted into foreign club';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
end $$;

-- 18. Club B assistant sees only Club B clinical data, and cannot write to Dar City
select pg_temp.act_as('77777777-7777-4777-8777-777777777777');
do $$ begin
  assert (select count(*) from public.injuries) = 1, 'club B assistant should see exactly 1 injury';
  assert not exists (select 1 from public.players where club_id = '00000000-0000-4000-8000-00000000c001'), 'Dar City players leaked to club B user';
  assert (select count(*) from storage.objects where bucket_id = 'medical-documents') = 1, 'club B assistant should see only club B file';
  begin
    insert into public.injury_followups (injury_id, followup_date, pain_score) values ('00000000-0000-4000-8000-0000000000f1', current_date, 1);
    raise exception 'club B user wrote a Dar City follow-up';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 19. Physician overview spans both clubs; admin sees both clubs; coach cannot create clubs
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
do $$ begin
  assert (select count(distinct club_id) from public.injuries) = 2, 'physician overview should include both clubs';
  assert (select count(distinct club_id) from public.get_team_availability()) = 2, 'overall availability should span both clubs';
  assert exists (select 1 from public.audit_logs where club_id = '00000000-0000-4000-8000-00000000c002' and record_type = 'injuries'), 'audit not club-tagged';
end $$;
-- brand settings editable by the physician, other settings are not
update public.application_settings set value = '"Orthopedic & Sports Medicine – Tanzania"' where key = 'brand_specialty';
update public.application_settings set value = '"x"' where key = 'team_name';
do $$ begin
  assert (select value = '"Orthopedic & Sports Medicine – Tanzania"' from public.application_settings where key = 'brand_specialty'), 'physician cannot edit brand';
  assert (select value <> '"x"' from public.application_settings where key = 'team_name'), 'physician edited admin setting';
end $$;
-- Deactivated club: no new registrations
update public.clubs set status = 'inactive' where id = '00000000-0000-4000-8000-00000000c002';
do $$ begin
  begin
    insert into public.players (club_id, full_name, date_of_birth, position) values ('00000000-0000-4000-8000-00000000c002', 'Late', '2000-01-01', 'Center');
    raise exception 'player registered in inactive club';
  exception when check_violation then null; end;
end $$;
reset role;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
do $$ begin
  assert (select count(*) from public.clubs) = 2, 'admin should see all clubs';
  assert (select count(*) from public.injuries) = 0, 'admin must not read clinical data';
end $$;
reset role;
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  begin
    insert into public.clubs (name, short_name) values ('Coach Club', 'Coach');
    raise exception 'coach created a club';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'CLUB ISOLATION TESTS PASSED'
