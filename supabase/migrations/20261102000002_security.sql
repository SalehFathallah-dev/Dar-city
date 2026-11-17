-- =====================================================================
-- Migration 2: Security – role helpers, triggers, audit logging, RLS
-- =====================================================================

-- ---------------------------------------------------------------------
-- Role helper functions (SECURITY DEFINER so they can read profiles
-- without recursive RLS evaluation)
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active and role is not null
$$;

create or replace function public.has_role(variadic allowed public.app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() = any(allowed), false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$ select public.current_app_role() is not null $$;

create or replace function public.is_clinical() returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_role('team_physician','assistant_medical_staff') $$;

create or replace function public.is_physician() returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_role('team_physician') $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_role('super_admin') $$;

-- ---------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_fields()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_j jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_j jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
begin
  -- For updates store only the fields that changed.
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
end $$;

-- Apply updated_at + audit triggers
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','team_seasons','players','player_emergency_contacts','medical_examinations',
    'examination_findings','injuries','injury_followups','treatments','rehabilitation_programs',
    'rehabilitation_sessions','rtp_assessments','medical_documents','application_settings'
  ] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_fields()', t);
  end loop;

  foreach t in array array[
    'profiles','team_seasons','players','player_emergency_contacts','medical_histories','medical_examinations',
    'examination_findings','injuries','injury_followups','treatments','rehabilitation_programs',
    'rehabilitation_sessions','rtp_assessments','medical_clearances','player_availability',
    'medical_documents','team_exposures','application_settings'
  ] loop
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$I for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Profiles: auto-create on sign-up (inactive, no role until approved)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only super administrators may change roles / activation (SQL editor sessions, where auth.uid() is null, are trusted).
create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    if not public.is_admin() then
      raise exception 'Only a Super Administrator can change roles or account status' using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role or account status' using errcode = '42501';
    end if;
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'Email is managed by authentication and cannot be edited here' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- ---------------------------------------------------------------------
-- Domain triggers
-- ---------------------------------------------------------------------

-- Player archive timestamps + age validation
create or replace function public.players_before_write()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.date_of_birth > current_date - interval '10 years' then
    raise exception 'Date of birth is not valid for a registered player' using errcode = '23514';
  end if;
  if new.status = 'archived' and (tg_op = 'INSERT' or old.status <> 'archived') then
    new.archived_at := now();
  elsif new.status <> 'archived' then
    new.archived_at := null;
  end if;
  new.full_name := trim(new.full_name);
  return new;
end $$;
create trigger trg_players_before_write before insert or update on public.players
  for each row execute function public.players_before_write();

-- Medical history versioning: new row becomes current, previous preserved.
create or replace function public.medical_history_versioning()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.player_id::text));
  select coalesce(max(version), 0) + 1 into new.version from public.medical_histories where player_id = new.player_id;
  update public.medical_histories set is_current = false where player_id = new.player_id and is_current;
  new.is_current := true;
  return new;
end $$;
create trigger trg_medical_history_version before insert on public.medical_histories
  for each row execute function public.medical_history_versioning();

-- Child records must reference the same player as their parent injury.
create or replace function public.check_injury_player_match()
returns trigger language plpgsql set search_path = public
as $$
begin
  if not exists (select 1 from public.injuries i where i.id = new.injury_id and i.player_id = new.player_id) then
    raise exception 'The selected injury does not belong to this player' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_rehab_player_match before insert or update on public.rehabilitation_programs
  for each row execute function public.check_injury_player_match();
create trigger trg_rtp_player_match before insert or update on public.rtp_assessments
  for each row execute function public.check_injury_player_match();

create or replace function public.check_document_links()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.injury_id is not null and not exists (select 1 from public.injuries where id = new.injury_id and player_id = new.player_id) then
    raise exception 'The linked injury does not belong to this player' using errcode = '23514';
  end if;
  if new.examination_id is not null and not exists (select 1 from public.medical_examinations where id = new.examination_id and player_id = new.player_id) then
    raise exception 'The linked examination does not belong to this player' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_document_links before insert or update on public.medical_documents
  for each row execute function public.check_document_links();

-- Rehabilitation phase changes require physician approval details.
create or replace function public.rehab_phase_change()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.current_phase is distinct from old.current_phase then
    if new.phase_approved_by is null or char_length(trim(new.phase_approved_by)) < 2 then
      raise exception 'A phase change must be approved by the physician (approver name required)' using errcode = '23514';
    end if;
    new.phase_approved_at := now();
  end if;
  return new;
end $$;
create trigger trg_rehab_phase_change before update on public.rehabilitation_programs
  for each row execute function public.rehab_phase_change();

-- An examination with a documented clearance decision records it in the
-- permanent clearance history (the decision itself is always the physician's).
create or replace function public.exam_record_clearance()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.clearance_status is not null and (tg_op = 'INSERT'
      or new.clearance_status is distinct from old.clearance_status
      or new.clearance_restrictions is distinct from old.clearance_restrictions) then
    insert into public.medical_clearances (player_id, examination_id, clearance_status, restrictions, decision_date, physician_name, signature, notes, is_demo, created_by)
    values (new.player_id, new.id, new.clearance_status, new.clearance_restrictions, new.examination_date,
            new.physician_name, new.physician_signature, 'Recorded from examination ' || new.exam_code, new.is_demo, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_exam_clearance after insert or update on public.medical_examinations
  for each row execute function public.exam_record_clearance();

-- RTP decision that clears the player for full training/competition sets the
-- injury's return-to-play date (used for days-lost calculations).
create or replace function public.rtp_set_return_date()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.decision in ('Cleared for Full Training','Cleared for Competition') then
    update public.injuries
       set return_to_play_date = least(coalesce(return_to_play_date, new.decision_date), new.decision_date)
     where id = new.injury_id;
  end if;
  return new;
end $$;
create trigger trg_rtp_return_date after insert or update of decision, decision_date on public.rtp_assessments
  for each row execute function public.rtp_set_return_date();

-- Injury closure date bookkeeping
create or replace function public.injury_status_dates()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.status = 'Closed' and new.closed_date is null then
    new.closed_date := current_date;
  end if;
  if new.status <> 'Closed' then
    new.closed_date := null;
  end if;
  return new;
end $$;
create trigger trg_injury_status_dates before insert or update on public.injuries
  for each row execute function public.injury_status_dates();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.roles                      enable row level security;
alter table public.profiles                   enable row level security;
alter table public.team_seasons               enable row level security;
alter table public.players                    enable row level security;
alter table public.player_emergency_contacts  enable row level security;
alter table public.medical_histories          enable row level security;
alter table public.medical_examinations       enable row level security;
alter table public.examination_findings       enable row level security;
alter table public.injuries                   enable row level security;
alter table public.injury_followups           enable row level security;
alter table public.treatments                 enable row level security;
alter table public.rehabilitation_programs    enable row level security;
alter table public.rehabilitation_sessions    enable row level security;
alter table public.rtp_assessments            enable row level security;
alter table public.medical_clearances         enable row level security;
alter table public.player_availability        enable row level security;
alter table public.medical_documents          enable row level security;
alter table public.team_exposures             enable row level security;
alter table public.audit_logs                 enable row level security;
alter table public.application_settings       enable row level security;

-- Anonymous users get nothing.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
-- Audit logs are written only by SECURITY DEFINER triggers/functions.
revoke insert, update, delete on public.audit_logs from authenticated;

-- roles (lookup)
create policy roles_read on public.roles for select to authenticated using (true);

-- profiles
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

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

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Approved availability for every staff role (no diagnoses, no internal notes).
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

-- Explicit audit events from the application (exports, report generation, logins).
create or replace function public.log_event(p_action text, p_record_type text, p_record_id text default null, p_details jsonb default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_action not in ('LOGIN','LOGOUT','EXPORT_CSV','EXPORT_PDF','BACKUP_EXPORT','VIEW_DOCUMENT','PRINT') then
    raise exception 'Unsupported audit action %', p_action;
  end if;
  insert into public.audit_logs (user_id, action, record_type, record_id, new_values)
  values (auth.uid(), p_action, left(p_record_type, 80), left(p_record_id, 120), p_details);
end $$;

grant execute on function public.current_app_role(), public.has_role(public.app_role[]), public.is_staff(),
  public.is_clinical(), public.is_physician(), public.is_admin(), public.get_team_availability(),
  public.log_event(text, text, text, jsonb) to authenticated;
