-- =====================================================================
-- ROLLBACK for migration 20261102000004_multi_club.sql
-- Restores the single-club structure. ALL player and medical records are
-- kept (only the club_id columns, clubs and club memberships are removed).
-- WARNING: if additional clubs were created, their records would be merged
-- into one roster – the script refuses to run in that case.
-- =====================================================================
begin;

do $$ begin
  if (select count(*) from public.clubs) > 1 then
    raise exception 'Rollback refused: more than one club exists. Export or archive the other clubs first.';
  end if;
end $$;

-- 1. Drop club-aware policies (tables + storage)
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in (
    'players','player_emergency_contacts','medical_histories','medical_examinations','examination_findings','injuries',
    'injury_followups','treatments','rehabilitation_programs','rehabilitation_sessions','rtp_assessments','medical_clearances',
    'player_availability','medical_documents','team_seasons','team_exposures','audit_logs','application_settings')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in (
    'medical docs read','medical docs upload','medical docs delete','player photos read','player photos upload','player photos update',
    'player photos delete','club logos read','club logos upload','club logos update','club logos delete','brand assets read',
    'brand assets upload','brand assets update')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- 1b. Restore the original audit trigger function
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_j jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_j jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, value) into new_j
      from jsonb_each(to_jsonb(new)) n
     where n.value is distinct from (to_jsonb(old) -> n.key)
       and n.key not in ('updated_at','updated_by');
    if new_j is null then return new; end if;
    select jsonb_object_agg(key, to_jsonb(old) -> key) into old_j from jsonb_object_keys(new_j) key;
  end if;
  insert into public.audit_logs (user_id, action, record_type, record_id, old_values, new_values)
  values (auth.uid(), tg_op, tg_table_name, coalesce(rec ->> 'id', rec ->> 'key'), old_j, new_j);
  return coalesce(new, old);
end $fn$;

-- 2. Drop club triggers & functions
do $$
declare r record;
begin
  for r in select tgname, relname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and (tgname like 'trg\_00\_club\_%' or tgname like 'trg\_01\_season\_club\_%' or tgname = 'trg_00_player_code')
  loop
    execute format('drop trigger %I on public.%I', r.tgname, r.relname);
  end loop;
end $$;
drop function public.get_team_availability(uuid);
drop function public.set_club_from_parent();
drop function public.prevent_club_change();
drop function public.check_season_club();
drop function public.assign_player_code();

-- 3. Restore original uniqueness rules
alter table public.players drop constraint players_club_player_code_key;
alter table public.players add constraint players_player_code_key unique (player_code);
select setval('public.player_code_seq', greatest(1, coalesce((select max((regexp_match(player_code, '(\d+)$'))[1]::int) from public.players), 0)));
alter table public.players alter column player_code set default ('DCB-' || lpad(nextval('public.player_code_seq')::text, 4, '0'));
drop index public.players_unique_active_jersey;
create unique index players_unique_active_jersey on public.players (team_category, jersey_number) where status = 'active' and jersey_number is not null;
alter table public.team_seasons drop constraint team_seasons_club_name_key;
alter table public.team_seasons add constraint team_seasons_name_key unique (name);
drop index public.team_seasons_one_current;
create unique index team_seasons_one_current on public.team_seasons (is_current) where is_current;

-- 4. Remove club columns (data rows are untouched)
do $$
declare t text;
begin
  foreach t in array array['players','player_emergency_contacts','medical_histories','medical_examinations','examination_findings',
    'injuries','injury_followups','treatments','rehabilitation_programs','rehabilitation_sessions','rtp_assessments',
    'medical_clearances','player_availability','medical_documents','team_seasons','team_exposures','audit_logs'] loop
    execute format('alter table public.%I drop column club_id', t);
  end loop;
end $$;
drop function public.storage_player_access(text);
drop function public.storage_club_access(text);
drop table public.club_members;
drop table public.clubs;
drop sequence public.club_code_seq;
drop function public.has_club_access(uuid);
drop function public.has_club_access_now(uuid);
drop function public.clubs_before_write();
delete from public.application_settings where key like 'brand\_%';

-- 6. Restore original policies and RPC
-- roles (lookup)


-- seasons
create policy seasons_read on public.team_seasons for select to authenticated using (public.is_staff());
create policy seasons_insert on public.team_seasons for insert to authenticated with check (public.has_role('super_admin','team_physician'));
create policy seasons_update on public.team_seasons for update to authenticated
  using (public.has_role('super_admin','team_physician')) with check (public.has_role('super_admin','team_physician'));

-- players (registration information – not confidential medical data)
create policy players_read on public.players for select to authenticated using (public.is_staff());
create policy players_insert on public.players for insert to authenticated with check (public.has_role('super_admin','team_physician'));
create policy players_update on public.players for update to authenticated
  using (public.has_role('super_admin','team_physician')) with check (public.has_role('super_admin','team_physician'));

-- emergency contacts (no coach access)
create policy contacts_read on public.player_emergency_contacts for select to authenticated
  using (public.has_role('super_admin','team_physician','assistant_medical_staff','team_manager'));
create policy contacts_insert on public.player_emergency_contacts for insert to authenticated
  with check (public.has_role('super_admin','team_physician'));
create policy contacts_update on public.player_emergency_contacts for update to authenticated
  using (public.has_role('super_admin','team_physician')) with check (public.has_role('super_admin','team_physician'));
create policy contacts_delete on public.player_emergency_contacts for delete to authenticated
  using (public.has_role('super_admin','team_physician'));

-- Confidential clinical tables: clinical staff read, physician writes.
do $$
declare t text;
begin
  foreach t in array array['medical_histories','medical_examinations','examination_findings','injuries',
                           'rehabilitation_programs','rtp_assessments','medical_clearances','player_availability'] loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (public.is_clinical())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_physician())', t);
  end loop;
  foreach t in array array['medical_examinations','examination_findings','injuries','rehabilitation_programs','rtp_assessments'] loop
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_physician()) with check (public.is_physician())', t);
  end loop;
end $$;
-- Medical history versions and clearance/availability decisions are append-only (no update / delete).
create policy findings_delete on public.examination_findings for delete to authenticated using (public.is_physician());

-- Follow-up style tables: clinical staff may add; author or physician may edit.
do $$
declare t text;
begin
  foreach t in array array['injury_followups','treatments','rehabilitation_sessions'] loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (public.is_clinical())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_clinical() and created_by = auth.uid())', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_physician() or (public.is_clinical() and created_by = auth.uid())) with check (public.is_clinical())', t);
  end loop;
end $$;

-- Documents
create policy documents_read on public.medical_documents for select to authenticated using (public.is_clinical());
create policy documents_insert on public.medical_documents for insert to authenticated with check (public.is_clinical() and created_by = auth.uid());
create policy documents_update on public.medical_documents for update to authenticated using (public.is_physician()) with check (public.is_physician());
create policy documents_delete on public.medical_documents for delete to authenticated using (public.is_physician());

-- Exposure data
create policy exposures_read on public.team_exposures for select to authenticated using (public.is_clinical() or public.is_admin());
create policy exposures_insert on public.team_exposures for insert to authenticated with check (public.is_physician());
create policy exposures_delete on public.team_exposures for delete to authenticated using (public.is_physician());

-- Audit logs
create policy audit_read on public.audit_logs for select to authenticated using (public.has_role('super_admin','team_physician'));

-- Settings
create policy settings_read on public.application_settings for select to authenticated using (public.is_staff());
create policy settings_write on public.application_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_insert on public.application_settings for insert to authenticated with check (public.is_admin());


create or replace function public.get_team_availability()
returns table (
  player_id uuid, player_code text, full_name text, jersey_number integer, "position" text,
  team_category text, availability text, medical_status text, restrictions text, staff_notes text,
  effective_date date, next_followup_date date, last_assessment_date date
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select p.id, p.player_code, p.full_name, p.jersey_number, p.position, p.team_category,
         coalesce(a.availability, 'UNDER MEDICAL REVIEW'),
         coalesce(a.medical_status, 'Awaiting Assessment'),
         a.restrictions, a.staff_notes, a.effective_date, a.next_followup_date,
         greatest(
           (select max(e.examination_date) from public.medical_examinations e where e.player_id = p.id and not e.is_archived),
           (select max(f.followup_date) from public.injury_followups f join public.injuries i on i.id = f.injury_id where i.player_id = p.id),
           (select max(r.assessment_date) from public.rtp_assessments r where r.player_id = p.id)
         )
    from public.players p
    left join lateral (
      select pa.* from public.player_availability pa
       where pa.player_id = p.id and pa.shared_with_staff
       order by pa.effective_date desc, pa.created_at desc
       limit 1
    ) a on true
   where p.status = 'active'
   order by p.jersey_number nulls last, p.full_name;
end $$;

grant execute on function public.get_team_availability() to authenticated;

-- 7. Restore original storage policies
-- Medical documents: clinical staff read/upload, physician removes.
create policy "medical docs read" on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and public.is_clinical());
create policy "medical docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-documents' and public.is_clinical());
create policy "medical docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'medical-documents' and public.is_physician());

-- Player photos: all active staff can view, physician/admin manage.
create policy "player photos read" on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and public.is_staff());
create policy "player photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and public.has_role('team_physician','super_admin'));
create policy "player photos update" on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and public.has_role('team_physician','super_admin'));
create policy "player photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and public.has_role('team_physician','super_admin'));

commit;
