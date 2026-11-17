-- =====================================================================
-- RLS & business-rule tests. Run after migrations + demo seed.
-- Every block raises an exception on failure (psql ON_ERROR_STOP=1).
-- =====================================================================
\set QUIET on

-- Test users -----------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','physician@test.local','{"full_name":"Dr. Faraj Lashika"}'),
 ('22222222-2222-4222-8222-222222222222','assistant@test.local','{"full_name":"Assistant"}'),
 ('33333333-3333-4333-8333-333333333333','manager@test.local','{"full_name":"Manager"}'),
 ('44444444-4444-4444-8444-444444444444','coach@test.local','{"full_name":"Coach"}'),
 ('55555555-5555-4555-8555-555555555555','admin@test.local','{"full_name":"Admin"}'),
 ('66666666-6666-4666-8666-666666666666','pending@test.local','{"full_name":"Pending"}');
update public.profiles set is_active = true, role = case email
  when 'physician@test.local' then 'team_physician'::app_role
  when 'assistant@test.local' then 'assistant_medical_staff'::app_role
  when 'manager@test.local' then 'team_manager'::app_role
  when 'coach@test.local' then 'head_coach'::app_role
  when 'admin@test.local' then 'super_admin'::app_role end
 where email <> 'pending@test.local';
-- Existing staff accounts belong to Dar City (migration 4 grants this to accounts that existed before the upgrade).
insert into public.club_members (club_id, user_id) select '00000000-0000-4000-8000-00000000c001', id from public.profiles where email <> 'pending@test.local' on conflict do nothing;

create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

-- 1. Profile auto-created on sign-up, inactive by default
do $$ begin
  assert (select count(*) from public.profiles) = 6, 'profiles not auto-created';
  assert (select not is_active and role is null from public.profiles where email = 'pending@test.local'), 'new user must be inactive with no role';
end $$;

-- 2. Physician: full medical access
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
do $$ begin
  assert (select count(*) from public.injuries) = 5, 'physician should see 5 demo injuries';
  assert (select count(*) from public.medical_histories) = 5, 'physician should see histories';
  assert (select count(*) from public.medical_clearances) = 5, 'exam trigger should have created 5 clearances';
end $$;
-- player registration with generated ID
insert into public.players (club_id, full_name, date_of_birth, position, jersey_number, height_cm, weight_kg)
values ('00000000-0000-4000-8000-00000000c001', 'Test Player', '2001-01-01', 'Center', 45, 200, 100);
do $$ begin
  assert (select player_code = 'DCB-0006' from public.players where full_name = 'Test Player'), 'Dar City player numbering should continue at DCB-0006';
  assert (select bmi = 25.0 from public.players where full_name = 'Test Player'), 'BMI not calculated';
end $$;
-- 3. Duplicate jersey prevention
do $$ begin
  begin
    insert into public.players (club_id, full_name, date_of_birth, position, jersey_number) values ('00000000-0000-4000-8000-00000000c001', 'Dup Jersey', '2001-01-01', 'Center', 45);
    raise exception 'duplicate jersey was accepted';
  exception when unique_violation then null; end;
end $$;
-- archived players free their jersey number
update public.players set status = 'archived' where full_name = 'Test Player';
insert into public.players (club_id, full_name, date_of_birth, position, jersey_number) values ('00000000-0000-4000-8000-00000000c001', 'Reuse Jersey', '2001-01-01', 'Center', 45);
do $$ begin
  assert (select archived_at is not null from public.players where full_name = 'Test Player'), 'archived_at not set';
end $$;
-- 4. Medical history versioning
insert into public.medical_histories (player_id, drug_allergies, change_reason)
values ('00000000-0000-4000-8000-0000000000d1', 'Sulfonamides', 'New allergy');
do $$ begin
  assert (select count(*) from public.medical_histories where player_id = '00000000-0000-4000-8000-0000000000d1') = 2, 'history version not preserved';
  assert (select version from public.medical_histories where player_id = '00000000-0000-4000-8000-0000000000d1' and is_current) = 2, 'current version should be 2';
end $$;
-- 5. Examination + clearance requires signature
do $$ begin
  begin
    insert into public.medical_examinations (player_id, examination_date, physician_name, examination_type, clearance_status)
    values ('00000000-0000-4000-8000-0000000000d1', current_date, 'Dr. Faraj Lashika', 'Periodic', 'Cleared for Full Participation');
    raise exception 'unsigned clearance accepted';
  exception when check_violation then null; end;
end $$;
-- 6. Injury + follow-up + RTP sets return date
insert into public.injuries (id, player_id, injury_date, setting, body_region, injury_type)
values ('99999999-9999-4999-8999-999999999999','00000000-0000-4000-8000-0000000000d3', current_date - 10, 'Training', 'Calf', 'Muscle Strain');
insert into public.injury_followups (injury_id, followup_date, pain_score) values ('99999999-9999-4999-8999-999999999999', current_date - 5, 4);
do $$ begin
  begin
    insert into public.injury_followups (injury_id, followup_date, pain_score) values ('99999999-9999-4999-8999-999999999999', current_date, 11);
    raise exception 'pain score 11 accepted';
  exception when check_violation then null; end;
  begin
    insert into public.rtp_assessments (injury_id, player_id, assessment_date, decision, decision_date, physician_name, signature)
    values ('99999999-9999-4999-8999-999999999999', '00000000-0000-4000-8000-0000000000d1', current_date, 'Cleared for Competition', current_date, 'Dr. Faraj Lashika', 'Dr. Faraj Lashika');
    raise exception 'RTP for wrong player accepted';
  exception when check_violation then null; end;
end $$;
insert into public.rtp_assessments (injury_id, player_id, assessment_date, decision, decision_date, physician_name, signature)
values ('99999999-9999-4999-8999-999999999999', '00000000-0000-4000-8000-0000000000d3', current_date, 'Cleared for Full Training', current_date, 'Dr. Faraj Lashika', 'Dr. Faraj Lashika');
do $$ begin
  assert (select return_to_play_date = current_date from public.injuries where id = '99999999-9999-4999-8999-999999999999'), 'RTP date not set';
end $$;
-- 7. Rehab phase change requires approval
insert into public.rehabilitation_programs (id, injury_id, player_id, start_date)
values ('88888888-8888-4888-8888-888888888888','99999999-9999-4999-8999-999999999999','00000000-0000-4000-8000-0000000000d3', current_date);
do $$ begin
  begin
    update public.rehabilitation_programs set current_phase = 'Early Rehabilitation', phase_approved_by = null where id = '88888888-8888-4888-8888-888888888888';
    raise exception 'phase change without approval accepted';
  exception when check_violation then null; end;
end $$;
update public.rehabilitation_programs set current_phase = 'Early Rehabilitation', phase_approved_by = 'Dr. Faraj Lashika' where id = '88888888-8888-4888-8888-888888888888';
-- physician cannot change roles
update public.profiles set role = 'super_admin' where email = 'coach@test.local';
do $$ begin
  assert (select role = 'head_coach' from public.profiles where email = 'coach@test.local'), 'physician changed a role';
end $$;
reset role;

-- 8. Assistant: reads clinical data, adds follow-ups, cannot edit physician records
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
do $$ begin
  assert (select count(*) from public.injuries) = 6, 'assistant should read injuries';
end $$;
insert into public.injury_followups (injury_id, followup_date, pain_score, physician_notes)
values ('99999999-9999-4999-8999-999999999999', current_date, 2, 'Assistant note');
do $$
declare n int;
begin
  update public.injuries set diagnosis = 'tampered' where id = '99999999-9999-4999-8999-999999999999';
  get diagnostics n = row_count;
  assert n = 0, 'assistant modified an injury';
  begin
    insert into public.injuries (player_id, injury_date, setting, body_region, injury_type)
    values ('00000000-0000-4000-8000-0000000000d1', current_date, 'Training', 'Knee', 'Other');
    raise exception 'assistant created an injury';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.medical_clearances (player_id, clearance_status, decision_date, physician_name, signature)
    values ('00000000-0000-4000-8000-0000000000d1', 'Cleared for Full Participation', current_date, 'x', 'xx');
    raise exception 'assistant issued a clearance';
  exception when insufficient_privilege then null; end;
  -- assistant cannot edit the physician's follow-up
  update public.injury_followups set physician_notes = 'tampered' where created_by is distinct from auth.uid();
  get diagnostics n = row_count;
  assert n = 0, 'assistant edited a physician follow-up';
end $$;
reset role;

-- 9. Team manager & head coach: no confidential medical data
do $$
declare uid text;
begin
  foreach uid in array array['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'] loop
    perform pg_temp.act_as(uid);
    assert (select count(*) from public.injuries) = 0, 'non-clinical role can read injuries';
    assert (select count(*) from public.medical_histories) = 0, 'non-clinical role can read histories';
    assert (select count(*) from public.medical_examinations) = 0, 'non-clinical role can read examinations';
    assert (select count(*) from public.injury_followups) = 0, 'non-clinical role can read follow-ups';
    assert (select count(*) from public.treatments) = 0, 'non-clinical role can read treatments';
    assert (select count(*) from public.player_availability) = 0, 'non-clinical role can read raw availability (internal notes)';
    assert (select count(*) from public.medical_documents) = 0, 'non-clinical role can read documents';
    assert (select count(*) from public.audit_logs) = 0, 'non-clinical role can read audit log';
    assert (select count(*) from public.players) > 0, 'staff should see roster';
    assert (select count(*) from public.get_team_availability()) = 6, 'availability RPC should return active players';
    execute 'reset role';
  end loop;
end $$;
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert (select count(*) from public.player_emergency_contacts) = 0, 'coach can read emergency contacts';
  begin
    update public.players set full_name = 'x';
  exception when others then null; end;
  assert not exists (select 1 from public.players where full_name = 'x'), 'coach edited player';
end $$;
reset role;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
do $$ begin
  assert (select count(*) from public.player_emergency_contacts) = 5, 'manager should read emergency contacts';
end $$;
reset role;

-- 10. Pending (inactive) user sees nothing
select pg_temp.act_as('66666666-6666-4666-8666-666666666666');
do $$ begin
  assert (select count(*) from public.players) = 0, 'inactive user can read players';
  begin
    perform public.get_team_availability();
    raise exception 'inactive user called availability RPC';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set role = 'super_admin', is_active = true where id = auth.uid();
    raise exception 'self-escalation succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 11. Super admin manages users but has no clinical access
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
update public.profiles set role = 'head_coach', is_active = true where email = 'pending@test.local';
do $$ begin
  assert (select count(*) from public.injuries) = 0, 'admin should not read injuries';
  assert (select count(*) from public.audit_logs) > 0, 'admin should read audit log';
end $$;
reset role;

-- 12. Anonymous has no access
set role anon;
do $$ begin
  begin
    perform count(*) from public.players;
    raise exception 'anon read players';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 13. Storage policies
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('medical-documents', 'x/test.pdf');
    raise exception 'coach uploaded a medical document';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
insert into storage.objects (bucket_id, name) values ('medical-documents', '00000000-0000-4000-8000-0000000000d1/test.pdf');
reset role;
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'medical-documents') = 0, 'coach can see medical files';
end $$;
reset role;

-- 14. Audit log captured changes
do $$ begin
  assert exists (select 1 from public.audit_logs where record_type = 'injuries' and action = 'INSERT' and user_id = '11111111-1111-4111-8111-111111111111'), 'injury insert not audited';
  assert exists (select 1 from public.audit_logs where record_type = 'profiles' and action = 'UPDATE' and old_values ? 'role'), 'role change not audited';
end $$;

\ir club_tests.sql
\echo 'ALL DATABASE TESTS PASSED'
