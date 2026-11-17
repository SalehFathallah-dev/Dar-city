-- =====================================================================
-- Migration 7: Dr. Saleh Fathullah edition
--   * Athlete portal: players sign in and see ONLY their own programme,
--     medications and supplements, and confirm each dose.
--   * Prescriptions (medication / supplement / exercise / treatment) with
--     a daily schedule, and a dose log (taken / skipped).
--   * Staff summary for team managers and coaches: readiness, plan and
--     adherence – without diagnoses or clinical notes.
--   * The team physician manages user accounts.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Branding defaults for this installation
-- ---------------------------------------------------------------------
-- The multi-club migration registers Dar City as the first club. On a fresh
-- installation it has no records – remove it.
delete from public.club_members where club_id = '00000000-0000-4000-8000-00000000c001'
  and not exists (select 1 from public.players where club_id = '00000000-0000-4000-8000-00000000c001');
delete from public.team_seasons where club_id = '00000000-0000-4000-8000-00000000c001'
  and not exists (select 1 from public.players where club_id = '00000000-0000-4000-8000-00000000c001');
delete from public.clubs where id = '00000000-0000-4000-8000-00000000c001'
  and not exists (select 1 from public.players where club_id = '00000000-0000-4000-8000-00000000c001');

update public.application_settings set value = '"Dr. Saleh Fathullah"' where key in ('physician_name', 'brand_name') and value::text like '%Faraj%';
update public.application_settings set value = '"Orthopedic Surgery & Sports Injuries"' where key = 'brand_specialty' and value::text like '%Orthopedic & Sports Medicine%';
update public.application_settings set value = '"ORTHOPEDIC & SPORTS MEDICINE"' where key = 'department';
update public.application_settings set value = '"CONFIDENTIAL MEDICAL DOCUMENT – Dr. Saleh Fathullah"' where key = 'report_footer';
update public.application_settings set value = '"DR. SALEH FATHULLAH"' where key = 'team_name' and value::text like '%DAR CITY%';
update public.application_settings set value = '"ORTHOPEDIC & SPORTS MEDICINE"' where key = 'organization' and value::text like '%DAR CITY%';

-- ---------------------------------------------------------------------
-- 2. Athlete role & link between an account and a player record
-- ---------------------------------------------------------------------
insert into public.roles (code, name, description)
values ('athlete', 'Athlete', 'Player portal: own programme, medications and supplements; confirms doses')
on conflict (code) do nothing;

alter table public.profiles add column if not exists player_id uuid references public.players (id) on delete set null;
create unique index if not exists profiles_one_account_per_player on public.profiles (player_id) where player_id is not null;

-- Athletes are NOT staff: every existing policy that relies on is_staff() /
-- has_club_access() therefore gives them no access at all. They only reach
-- their own data through the SECURITY DEFINER functions below.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() <> 'athlete', false) $$;

create or replace function public.can_manage_users() returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_role('super_admin', 'team_physician') $$;

create or replace function public.current_player_id() returns uuid
language sql stable security definer set search_path = public
as $$ select player_id from public.profiles where id = auth.uid() and is_active and role = 'athlete' $$;

-- Roles, activation and the player link are managed by the physician / administrator.
create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role or new.is_active is distinct from old.is_active
      or new.player_id is distinct from old.player_id) then
    if not public.can_manage_users() then
      raise exception 'Only the physician or an administrator can change roles or account status' using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role or account status' using errcode = '42501';
    end if;
    if new.role = 'super_admin' and not public.is_admin() then
      raise exception 'Only a Super Administrator can create administrators' using errcode = '42501';
    end if;
  end if;
  if new.role = 'athlete' and new.player_id is null and new.is_active then
    raise exception 'An athlete account must be linked to a player' using errcode = '23514';
  end if;
  if new.role is distinct from 'athlete' then
    new.player_id := null;
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'Email is managed by authentication and cannot be edited here' using errcode = '42501';
  end if;
  return new;
end $$;

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.can_manage_users()) with check (public.can_manage_users());

-- In this edition the team physician runs the system: application settings too.
drop policy if exists settings_write on public.application_settings;
drop policy if exists settings_insert on public.application_settings;
create policy settings_write on public.application_settings for update to authenticated
  using (public.is_admin() or public.is_physician()) with check (public.is_admin() or public.is_physician());
create policy settings_insert on public.application_settings for insert to authenticated
  with check (public.is_admin() or public.is_physician());

-- ---------------------------------------------------------------------
-- 3. Prescriptions & dose log
-- ---------------------------------------------------------------------
create table public.prescriptions (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubs (id),
  player_id        uuid not null references public.players (id) on delete cascade,
  injury_id        uuid references public.injuries (id) on delete set null,
  kind             text not null check (kind in ('Medication','Supplement','Exercise','Treatment','Other')),
  name             text not null check (char_length(trim(name)) between 2 and 120),
  dose             text check (char_length(dose) <= 120),
  instructions     text check (char_length(instructions) <= 2000),
  schedule_times   text[] not null default '{}'
                   check (array_length(schedule_times, 1) is null or (array_length(schedule_times, 1) <= 12
                          and array_to_string(schedule_times, ',') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*$')),
  days_of_week     smallint[] not null default '{0,1,2,3,4,5,6}'
                   check (days_of_week <@ '{0,1,2,3,4,5,6}'::smallint[] and array_length(days_of_week, 1) >= 1),
  start_date       date not null default current_date,
  end_date         date,
  is_active        boolean not null default true,
  share_with_staff boolean not null default true,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid(),
  check (end_date is null or end_date >= start_date)
);
create index prescriptions_player on public.prescriptions (player_id, is_active);
create index prescriptions_club on public.prescriptions (club_id);

create table public.dose_logs (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubs (id),
  prescription_id  uuid not null references public.prescriptions (id) on delete cascade,
  player_id        uuid not null references public.players (id) on delete cascade,
  scheduled_date   date not null,
  scheduled_time   text not null check (scheduled_time = 'any' or scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  status           text not null check (status in ('taken','skipped')),
  note             text check (char_length(note) <= 500),
  logged_at        timestamptz not null default now(),
  logged_by        uuid default auth.uid(),
  unique (prescription_id, scheduled_date, scheduled_time)
);
create index dose_logs_player_date on public.dose_logs (player_id, scheduled_date);
create index dose_logs_club_date on public.dose_logs (club_id, scheduled_date);

create trigger trg_00_club_prescriptions before insert or update on public.prescriptions
  for each row execute function public.set_club_from_parent('player');
create trigger trg_prescriptions_updated before update on public.prescriptions
  for each row execute function public.set_updated_fields();
create trigger trg_prescriptions_audit after insert or update or delete on public.prescriptions
  for each row execute function public.audit_row_change();

-- A prescription linked to an injury must be for the same player.
create or replace function public.check_prescription_injury()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.injury_id is not null and not exists (select 1 from public.injuries where id = new.injury_id and player_id = new.player_id) then
    raise exception 'The selected injury does not belong to this player' using errcode = '23514';
  end if;
  new.name := trim(new.name);
  return new;
end $$;
create trigger trg_prescription_injury before insert or update on public.prescriptions
  for each row execute function public.check_prescription_injury();

alter table public.prescriptions enable row level security;
alter table public.dose_logs enable row level security;
grant select, insert, update on public.prescriptions to authenticated;
grant select on public.dose_logs to authenticated;
revoke all on public.prescriptions, public.dose_logs from anon;

create policy prescriptions_read on public.prescriptions for select to authenticated
  using (public.is_clinical() and public.has_club_access(club_id));
create policy prescriptions_insert on public.prescriptions for insert to authenticated
  with check (public.is_physician() and public.has_club_access(club_id));
create policy prescriptions_update on public.prescriptions for update to authenticated
  using (public.is_physician() and public.has_club_access(club_id))
  with check (public.is_physician() and public.has_club_access(club_id));
create policy dose_logs_read on public.dose_logs for select to authenticated
  using (public.is_clinical() and public.has_club_access(club_id));
-- No direct writes to dose_logs: everything goes through log_dose().

-- ---------------------------------------------------------------------
-- 4. Dose confirmation (athlete for own doses; clinical staff for their clubs)
-- ---------------------------------------------------------------------
create or replace function public.log_dose(p_prescription_id uuid, p_date date, p_time text, p_status text, p_note text default null)
returns public.dose_logs
language plpgsql volatile security definer set search_path = public
as $$
declare rx public.prescriptions; rec public.dose_logs;
begin
  select * into rx from public.prescriptions where id = p_prescription_id;
  if rx.id is null then raise exception 'Prescription not found' using errcode = '23503'; end if;
  -- coalesce: current_player_id() is NULL for staff – a NULL here must never grant access.
  if not coalesce(rx.player_id = public.current_player_id()
          or (public.is_clinical() and public.has_club_access(rx.club_id)), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('taken','skipped') then raise exception 'Invalid status' using errcode = '23514'; end if;
  if p_date > current_date + 1 or p_date < current_date - 14 then
    raise exception 'Doses can only be confirmed for the last 14 days' using errcode = '23514';
  end if;
  if p_date < rx.start_date or (rx.end_date is not null and p_date > rx.end_date) then
    raise exception 'This date is outside the prescription period' using errcode = '23514';
  end if;
  insert into public.dose_logs (club_id, prescription_id, player_id, scheduled_date, scheduled_time, status, note)
  values (rx.club_id, rx.id, rx.player_id, p_date, coalesce(nullif(p_time, ''), 'any'), p_status, nullif(trim(p_note), ''))
  on conflict (prescription_id, scheduled_date, scheduled_time)
  do update set status = excluded.status, note = excluded.note, logged_at = now(), logged_by = auth.uid()
  returning * into rec;
  return rec;
end $$;

-- Undo a confirmation made by mistake (same day only for athletes).
create or replace function public.clear_dose(p_prescription_id uuid, p_date date, p_time text)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare rx public.prescriptions;
begin
  select * into rx from public.prescriptions where id = p_prescription_id;
  if rx.id is null then raise exception 'Prescription not found' using errcode = '23503'; end if;
  if not coalesce((rx.player_id = public.current_player_id() and p_date >= current_date - 1)
          or (public.is_clinical() and public.has_club_access(rx.club_id)), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from public.dose_logs where prescription_id = rx.id and scheduled_date = p_date and scheduled_time = coalesce(nullif(p_time, ''), 'any');
end $$;

-- ---------------------------------------------------------------------
-- 5. Expected doses for a period (shared by the portal and staff views)
-- ---------------------------------------------------------------------
create or replace function public._dose_schedule(p_player_ids uuid[], p_from date, p_to date)
returns table (prescription_id uuid, player_id uuid, scheduled_date date, scheduled_time text, status text, note text, logged_at timestamptz)
language sql stable security definer set search_path = public
as $$
  with due as (
    select r.id as prescription_id, r.player_id, d::date as scheduled_date, coalesce(t, 'any') as scheduled_time
      from public.prescriptions r
      cross join lateral generate_series(greatest(p_from, r.start_date), least(p_to, coalesce(r.end_date, p_to)), interval '1 day') d
      left join lateral unnest(case when cardinality(r.schedule_times) = 0 then array[null::text] else r.schedule_times end) t on true
     where r.player_id = any(p_player_ids) and r.is_active
       and extract(dow from d)::smallint = any(r.days_of_week)
  )
  select coalesce(due.prescription_id, l.prescription_id), coalesce(due.player_id, l.player_id),
         coalesce(due.scheduled_date, l.scheduled_date), coalesce(due.scheduled_time, l.scheduled_time),
         l.status, l.note, l.logged_at
    from due
    full join (select * from public.dose_logs where player_id = any(p_player_ids) and scheduled_date between p_from and p_to) l
      on l.prescription_id = due.prescription_id and l.scheduled_date = due.scheduled_date and l.scheduled_time = due.scheduled_time
$$;
revoke execute on function public._dose_schedule(uuid[], date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Athlete portal – everything the signed-in athlete may see, in one call
-- ---------------------------------------------------------------------
create or replace function public.get_my_portal(p_from date default current_date - 6, p_to date default current_date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare pid uuid := public.current_player_id(); result jsonb;
begin
  if pid is null then raise exception 'No player is linked to this account' using errcode = '42501'; end if;
  if p_to - p_from > 62 then p_from := p_to - 62; end if;
  select jsonb_build_object(
    'player', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'player_code', p.player_code, 'jersey_number', p.jersey_number,
                 'position', p.position, 'club_name', c.name, 'club_short_name', c.short_name, 'club_logo', c.logo_url)
                 from public.players p join public.clubs c on c.id = p.club_id where p.id = pid),
    'availability', (select jsonb_build_object('availability', a.availability, 'medical_status', a.medical_status, 'restrictions', a.restrictions,
                       'staff_notes', a.staff_notes, 'effective_date', a.effective_date, 'next_followup_date', a.next_followup_date)
                       from public.player_availability a where a.player_id = pid and a.shared_with_staff
                       order by a.effective_date desc, a.created_at desc limit 1),
    'injuries', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'injury_code', i.injury_code, 'injury_date', i.injury_date,
                       'body_region', i.body_region, 'body_side', i.body_side, 'injury_type', i.injury_type, 'diagnosis', i.diagnosis,
                       'status', i.status, 'expected_return_date', i.expected_return_date) order by i.injury_date desc)
                       from public.injuries i where i.player_id = pid and not i.is_archived and i.status not in ('Recovered','Closed')), '[]'::jsonb),
    'rehab', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'program_code', r.program_code, 'current_phase', r.current_phase,
                       'goals', r.goals, 'exercises', r.exercises, 'training_load', r.training_load, 'start_date', r.start_date,
                       'status', r.status, 'body_region', i.body_region, 'injury_type', i.injury_type) order by r.start_date desc)
                       from public.rehabilitation_programs r join public.injuries i on i.id = r.injury_id
                       where r.player_id = pid and r.status = 'Active'), '[]'::jsonb),
    'prescriptions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.name, 'dose', x.dose,
                       'instructions', x.instructions, 'schedule_times', x.schedule_times, 'days_of_week', x.days_of_week,
                       'start_date', x.start_date, 'end_date', x.end_date) order by x.kind, x.name)
                       from public.prescriptions x where x.player_id = pid and x.is_active
                       and (x.end_date is null or x.end_date >= p_from)), '[]'::jsonb),
    'doses', coalesce((select jsonb_agg(to_jsonb(s) order by s.scheduled_date, s.scheduled_time)
                       from public._dose_schedule(array[pid], p_from, p_to) s), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- 7. Staff summary (managers, coaches, medical staff) – no diagnoses
-- ---------------------------------------------------------------------
create or replace function public.get_team_summary(p_club_id uuid)
returns table (
  player_id uuid, player_code text, full_name text, jersey_number integer, "position" text,
  availability text, medical_status text, restrictions text, staff_notes text, next_followup_date date,
  rehab_phase text, expected_return_date date, open_injuries integer
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_staff() or not public.has_club_access(p_club_id) then
    raise exception 'Not authorized for this club' using errcode = '42501';
  end if;
  return query
  select p.id, p.player_code, p.full_name, p.jersey_number, p.position,
         coalesce(a.availability, 'UNDER MEDICAL REVIEW'), coalesce(a.medical_status, 'Awaiting Assessment'),
         a.restrictions, a.staff_notes, a.next_followup_date,
         (select r.current_phase from public.rehabilitation_programs r where r.player_id = p.id and r.status = 'Active' order by r.start_date desc limit 1),
         (select max(i.expected_return_date) from public.injuries i where i.player_id = p.id and not i.is_archived and i.status not in ('Recovered','Closed')),
         (select count(*)::int from public.injuries i where i.player_id = p.id and not i.is_archived and i.status not in ('Recovered','Closed'))
    from public.players p
    left join lateral (
      select pa.* from public.player_availability pa where pa.player_id = p.id and pa.shared_with_staff
       order by pa.effective_date desc, pa.created_at desc limit 1) a on true
   where p.club_id = p_club_id and p.status = 'active'
   order by p.jersey_number nulls last, p.full_name;
end $$;

-- Adherence: every expected dose in the period and whether it was confirmed.
-- Medication names are hidden from non-clinical staff unless the physician shares them.
create or replace function public.get_team_adherence(p_club_id uuid, p_from date, p_to date)
returns table (
  player_id uuid, full_name text, jersey_number integer, prescription_id uuid, kind text, name text, dose text,
  scheduled_date date, scheduled_time text, status text, note text, logged_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
declare clinical boolean := public.is_clinical(); ids uuid[];
begin
  if not public.is_staff() or not public.has_club_access(p_club_id) then
    raise exception 'Not authorized for this club' using errcode = '42501';
  end if;
  if p_to < p_from then raise exception 'Invalid period' using errcode = '22023'; end if;
  if p_to - p_from > 62 then p_from := p_to - 62; end if;
  select array_agg(pl.id) into ids from public.players pl where pl.club_id = p_club_id and pl.status = 'active';
  if ids is null then return; end if;
  return query
  select s.player_id, p.full_name, p.jersey_number, s.prescription_id, r.kind,
         case when clinical or r.share_with_staff then r.name else r.kind end,
         case when clinical or r.share_with_staff then r.dose end,
         s.scheduled_date, s.scheduled_time, s.status,
         case when clinical then s.note end, s.logged_at
    from public._dose_schedule(ids, p_from, p_to) s
    join public.players p on p.id = s.player_id
    join public.prescriptions r on r.id = s.prescription_id
   order by p.jersey_number nulls last, p.full_name, s.scheduled_date, s.scheduled_time;
end $$;

-- Accounts linked to players (for the physician's account screen).
create or replace function public.list_athlete_accounts()
returns table (user_id uuid, email text, full_name text, is_active boolean, player_id uuid)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_manage_users() then raise exception 'Not authorized' using errcode = '42501'; end if;
  return query select pr.id, pr.email, pr.full_name, pr.is_active, pr.player_id from public.profiles pr where pr.role = 'athlete';
end $$;

-- ---------------------------------------------------------------------
-- 8. Function grants
-- ---------------------------------------------------------------------
revoke execute on function public.check_prescription_injury() from public, anon, authenticated;
revoke execute on function
  public.log_dose(uuid, date, text, text, text), public.clear_dose(uuid, date, text), public.get_my_portal(date, date),
  public.get_team_summary(uuid), public.get_team_adherence(uuid, date, date), public.list_athlete_accounts(),
  public.can_manage_users(), public.current_player_id()
  from public, anon;
grant execute on function
  public.log_dose(uuid, date, text, text, text), public.clear_dose(uuid, date, text), public.get_my_portal(date, date),
  public.get_team_summary(uuid), public.get_team_adherence(uuid, date, date), public.list_athlete_accounts(),
  public.can_manage_users(), public.current_player_id()
  to authenticated;
