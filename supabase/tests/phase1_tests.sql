-- =====================================================================
-- Phase 1 tests: medical cases, confidentiality, wellness, notifications.
-- Run after registration_tests.sql and migration 12.
-- Accounts available here:
--   physician 1111 (c001 Dar City + c002), assistant 2222 (c001), coach 4444 (c001), manager 3333 (c001)
--   athlete b1b1 → player d2 (c001), athlete a2a2 → player e9 (c002, other club), coach b2b2 (c001)
-- =====================================================================
\set QUIET on
reset role;
select set_config('request.jwt.claim.sub', '', false);
create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

-- P1. Athlete submits a complaint → case created, clinical team notified
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$
declare c public.medical_cases;
begin
  c := public.submit_medical_case('{"category":"Muscle pain","pain_score":6,"context":"Training","can_continue":false,
        "affects_movement":true,"description":"Pain in right hamstring during sprint",
        "body_locations":[{"region":"Hamstring","side":"Right","view":"back"}],"athlete_urgent":false}'::jsonb);
  assert c.player_id = '00000000-0000-4000-8000-0000000000d2', 'case for wrong player';
  assert c.status = 'New' and c.visibility = 'private' and c.priority = 'Routine', 'case defaults';
  assert jsonb_array_length(public.my_cases()) = 1, 'my_cases should show 1 case';
  begin
    insert into public.medical_cases (player_id, category) values ('00000000-0000-4000-8000-0000000000d1', 'Other');
    raise exception 'athlete inserted a case for another player';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.case_messages (case_id, kind, body) values (c.id, 'athlete_reply', 'direct');
    raise exception 'athlete wrote case_messages directly';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.medical_cases) = 0, 'athlete reads medical_cases table';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications n join public.profiles p on p.id = n.user_id
                  where p.email = 'physician@test.local' and n.kind = 'case_new'), 'physician not notified';
  assert not exists (select 1 from public.notifications n join public.profiles p on p.id = n.user_id
                  where p.role in ('head_coach','team_manager') and n.kind in ('case_new','case_urgent')), 'coach notified of private complaint';
end $$;

-- P2. Another athlete (other club) sees nothing of it
select pg_temp.act_as('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2');
do $$ begin
  assert jsonb_array_length(public.my_cases()) = 0, 'athlete sees another athlete''s case';
  begin
    perform public.athlete_case_reply((select id from public.medical_cases limit 1), 'hi');
    raise exception 'athlete replied on another athlete''s case';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- P3. Coach: no access while private
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert (select count(*) from public.medical_cases) = 0, 'coach reads medical cases';
  assert (select count(*) from public.case_messages) = 0, 'coach reads case messages';
  assert (select count(*) from public.get_staff_case_board('00000000-0000-4000-8000-00000000c001')) = 0, 'private case visible to coach';
end $$;
reset role;

-- P4. Assistant cannot change disclosure; physician can; disclosure logged; staff notified
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
do $$ begin
  assert (select count(*) from public.medical_cases) = 1, 'assistant should read the case';
  begin
    update public.medical_cases set visibility = 'limited', staff_status = 'Modified training';
    raise exception 'assistant changed disclosure';
  exception when insufficient_privilege then null; end;
  insert into public.case_messages (case_id, kind, body) select id, 'private_note', 'Palpation tender mid-belly' from public.medical_cases;
end $$;
reset role;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
do $$
declare cid uuid := (select id from public.medical_cases where player_id = '00000000-0000-4000-8000-0000000000d2');
begin
  update public.medical_cases set visibility = 'limited', staff_status = 'Modified training', shared_summary = 'should be dropped',
         diagnosis = 'Grade 1 hamstring strain', status = 'Under Review', priority = 'Priority' where id = cid;
  assert (select shared_summary is null and shared_by = auth.uid() from public.medical_cases where id = cid), 'limited must not keep a summary';
  insert into public.case_messages (case_id, kind, body) values (cid, 'request_info', 'When exactly did it start?');
  assert (select status = 'Information Requested' from public.medical_cases where id = cid), 'status not set by info request';
  begin
    update public.medical_cases set visibility = 'limited', staff_status = null where id = cid;
    raise exception 'limited without staff status accepted';
  exception when check_violation then null; end;
end $$;
reset role;

select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$
declare r record;
begin
  select * into r from public.get_staff_case_board('00000000-0000-4000-8000-00000000c001');
  assert r.staff_status = 'Modified training' and r.shared_summary is null, 'coach limited view wrong';
  assert (select count(*) from public.notifications where kind = 'case_shared') >= 1, 'coach not notified of shared update';
end $$;
reset role;

-- P5. Athlete sees requests and instructions but never private notes or the diagnosis; replies
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$
declare j jsonb := public.my_cases();
begin
  assert j::text like '%When exactly did it start?%', 'athlete does not see the information request';
  assert not (j::text like '%Palpation%'), 'private note leaked to athlete';
  assert not (j::text like '%hamstring strain%'), 'diagnosis leaked to athlete';
  assert exists (select 1 from public.notifications where kind = 'case_message'), 'athlete not notified of request';
  perform public.athlete_case_reply((j -> 0 ->> 'id')::uuid, 'Yesterday at 18:30');
end $$;
reset role;
do $$ begin
  assert (select status = 'Under Review' from public.medical_cases where player_id = '00000000-0000-4000-8000-0000000000d2'), 'reply should move case back to review';
end $$;

-- P6. Approved report: coach sees only the approved text; every disclosure is logged
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
update public.medical_cases set visibility = 'approved', staff_status = 'Modified training', shared_summary = 'No sprinting for 7 days'
 where player_id = '00000000-0000-4000-8000-0000000000d2';
do $$ begin
  assert (select count(*) from public.case_disclosures) = 2, 'disclosures not logged';
end $$;
reset role;
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$
declare r record;
begin
  select * into r from public.get_staff_case_board('00000000-0000-4000-8000-00000000c001');
  assert r.shared_summary = 'No sprinting for 7 days', 'approved summary not visible';
  assert (select count(*) from public.case_disclosures) = 0, 'coach reads disclosure log';
end $$;
reset role;

-- P7. Attachments: own case folder only, and the object must exist
insert into storage.objects (bucket_id, name)
select 'case-attachments', '00000000-0000-4000-8000-0000000000d2/' || id || '/photo.jpg' from public.medical_cases where player_id = '00000000-0000-4000-8000-0000000000d2';
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$
declare cid uuid := ((public.my_cases()) -> 0 ->> 'id')::uuid;
begin
  assert public.storage_case_access('00000000-0000-4000-8000-0000000000d2/' || cid || '/x.jpg'), 'own case folder refused';
  assert not public.storage_case_access('00000000-0000-4000-8000-0000000000d1/' || cid || '/x.jpg'), 'other player folder allowed';
  perform public.add_case_file(cid, '00000000-0000-4000-8000-0000000000d2/' || cid || '/photo.jpg', 'photo.jpg', 'image/jpeg', 1000);
  begin
    perform public.add_case_file(cid, '00000000-0000-4000-8000-0000000000d2/' || cid || '/missing.jpg', 'missing.jpg', 'image/jpeg', 1000);
    raise exception 'unregistered file accepted';
  exception when foreign_key_violation then null; end;
end $$;
reset role;
select pg_temp.act_as('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2');
do $$ begin
  assert not public.storage_case_access((select '00000000-0000-4000-8000-0000000000d2/' || id || '/photo.jpg' from public.case_files limit 1)), 'other athlete can read file';
end $$;
reset role;

-- P8. Wellness: athlete submits; baseline flags; coach has no access
insert into public.wellness_settings (club_id, pre_enabled, post_enabled) values ('00000000-0000-4000-8000-00000000c001', true, true);
insert into public.wellness_responses (player_id, kind, response_date, sleep_hours, sleep_quality, fatigue, soreness, energy, readiness, unwell, pain)
select '00000000-0000-4000-8000-0000000000d2', 'pre', current_date - g, 8, 4, 3, 3, 8, 8, false, false from generate_series(1, 6) g;
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$
declare w public.wellness_responses;
begin
  w := public.submit_wellness('pre', current_date, 'Day', '{"sleep_hours":5,"sleep_quality":2,"fatigue":7,"soreness":4,"energy":4,"readiness":5,"unwell":false,"pain":true,"pain_location":"Right hamstring","pain_severity":4,"pain_new":false}'::jsonb);
  assert w.player_id = '00000000-0000-4000-8000-0000000000d2', 'wellness player';
  w := public.submit_wellness('post', current_date, 'Morning training', '{"rpe":7,"duration_minutes":90,"fatigue":7,"soreness":5,"pain":false,"completed_full":true}'::jsonb);
  assert w.session_load = 630, 'session load should be 630';
  assert jsonb_array_length(public.my_wellness(current_date - 7, current_date) -> 'responses') = 8, 'my_wellness';
  begin
    perform public.submit_wellness('pre', current_date - 10, 'Day', '{"sleep_hours":8,"sleep_quality":4,"fatigue":3,"soreness":3,"energy":8,"readiness":8,"unwell":false,"pain":false}'::jsonb);
    raise exception 'old questionnaire accepted';
  exception when check_violation then null; end;
  begin
    perform * from public.get_wellness_flags('00000000-0000-4000-8000-00000000c001');
    raise exception 'athlete read flags';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
do $$ begin
  assert exists (select 1 from public.get_wellness_flags('00000000-0000-4000-8000-00000000c001') where player_id = '00000000-0000-4000-8000-0000000000d2' and flag = 'High fatigue'), 'fatigue rise not flagged';
  assert exists (select 1 from public.get_wellness_flags('00000000-0000-4000-8000-00000000c001') where player_id = '00000000-0000-4000-8000-0000000000d2' and flag = 'Reduced sleep'), 'sleep drop not flagged';
  assert exists (select 1 from public.get_wellness_flags('00000000-0000-4000-8000-00000000c001') where player_id = '00000000-0000-4000-8000-0000000000d2' and flag = 'Pain reported'), 'pain not flagged';
  assert not exists (select 1 from public.get_wellness_flags('00000000-0000-4000-8000-00000000c001') where player_id = '00000000-0000-4000-8000-0000000000d2' and flag = 'Missed questionnaires'), 'false missed flag';
  assert exists (select 1 from public.notifications where kind = 'wellness'), 'physician not alerted of pain in questionnaire';
end $$;
reset role;
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert (select count(*) from public.wellness_responses) = 0, 'coach reads wellness answers';
  begin
    perform * from public.get_wellness_flags('00000000-0000-4000-8000-00000000c001');
    raise exception 'coach read wellness flags';
  exception when insufficient_privilege then null; end;
  begin
    update public.wellness_settings set pre_enabled = false;
    if (select pre_enabled from public.wellness_settings where club_id = '00000000-0000-4000-8000-00000000c001') = false then
      raise exception 'coach changed wellness settings';
    end if;
  end;
end $$;
reset role;

-- P9. Notifications: own only; only read_at can change; announcements by the physician only
select pg_temp.act_as('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
do $$ begin
  assert not exists (select 1 from public.notifications where user_id <> auth.uid()), 'sees other users notifications';
  update public.notifications set read_at = now();
  assert not exists (select 1 from public.notifications where read_at is null), 'mark as read failed';
  begin
    update public.notifications set title = 'hacked';
    raise exception 'notification title changed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.send_announcement('00000000-0000-4000-8000-00000000c001', 'announcement', 'Hi', 'x');
    raise exception 'athlete sent announcement';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
do $$
declare a public.announcements;
begin
  a := public.send_announcement('00000000-0000-4000-8000-00000000c001', 'instruction', 'Hydration', 'Drink 500 ml before training',
                                array['00000000-0000-4000-8000-0000000000d2']::uuid[], false);
  assert a.recipients = 1, format('instruction recipients %s', a.recipients);
  a := public.send_announcement('00000000-0000-4000-8000-00000000c001', 'announcement', 'Team meeting', 'Tomorrow 10:00', null, true);
  assert a.recipients >= 3, 'team announcement recipients';
end $$;
reset role;
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert exists (select 1 from public.notifications where title = 'Team meeting'), 'staff did not get announcement';
  assert not exists (select 1 from public.notifications where title = 'Hydration'), 'staff got private instruction';
  begin
    perform public.send_announcement('00000000-0000-4000-8000-00000000c001', 'announcement', 'x', 'y');
    raise exception 'coach sent announcement';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- P10. Audit: views of a case can be logged by staff; record changes are audited
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select public.log_event('VIEW_CASE', 'medical_cases', (select id::text from public.medical_cases limit 1));
reset role;
do $$ begin
  assert exists (select 1 from public.audit_logs where action = 'VIEW_CASE'), 'case view not audited';
  assert exists (select 1 from public.audit_logs where record_type = 'medical_cases' and action = 'UPDATE'), 'case change not audited';
end $$;
\echo phase 1 tests passed
