-- =====================================================================
-- DR. FARAJ LASHIKA – ORTHOPEDIC & SPORTS MEDICINE
-- Migration 4: Multi-club architecture
--
-- * Creates clubs + club_members
-- * Registers Dar City Basketball Team as the initial club
-- * Adds club_id to every operational table and assigns ALL existing
--   records to Dar City (record IDs and history are preserved)
-- * Verifies data integrity before/after, then makes club_id mandatory
-- * Replaces RLS with club-aware policies (database-enforced isolation)
-- Reversal script: supabase/rollback/20261102000004_multi_club_down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Snapshot row counts for integrity verification
-- ---------------------------------------------------------------------
create temporary table _mc_counts as
select 'players' t, count(*) n from public.players union all
select 'player_emergency_contacts', count(*) from public.player_emergency_contacts union all
select 'medical_histories', count(*) from public.medical_histories union all
select 'medical_examinations', count(*) from public.medical_examinations union all
select 'examination_findings', count(*) from public.examination_findings union all
select 'injuries', count(*) from public.injuries union all
select 'injury_followups', count(*) from public.injury_followups union all
select 'treatments', count(*) from public.treatments union all
select 'rehabilitation_programs', count(*) from public.rehabilitation_programs union all
select 'rehabilitation_sessions', count(*) from public.rehabilitation_sessions union all
select 'rtp_assessments', count(*) from public.rtp_assessments union all
select 'medical_clearances', count(*) from public.medical_clearances union all
select 'player_availability', count(*) from public.player_availability union all
select 'medical_documents', count(*) from public.medical_documents union all
select 'team_seasons', count(*) from public.team_seasons union all
select 'team_exposures', count(*) from public.team_exposures;

-- ---------------------------------------------------------------------
-- 1. Clubs
-- ---------------------------------------------------------------------
create sequence public.club_code_seq start 1;

create table public.clubs (
  id                    uuid primary key default gen_random_uuid(),
  club_code             text not null unique default ('CLB-' || lpad(nextval('public.club_code_seq')::text, 4, '0')),
  name                  text not null check (char_length(trim(name)) between 2 and 160),
  short_name            text not null check (char_length(trim(short_name)) between 2 and 40),
  player_id_prefix      text not null unique check (player_id_prefix ~ '^[A-Z0-9]{2,6}$'),
  player_counter        integer not null default 0 check (player_counter >= 0),
  logo_url              text,
  country               text,
  city                  text,
  sport                 text not null default 'Basketball',
  competition_category  text,
  league                text,
  current_season        text,
  contact_person        text,
  phone                 text check (phone is null or phone ~ '^[0-9+() -]{6,25}$'),
  email                 text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address               text,
  medical_notes         text,
  registration_date     date not null default current_date,
  status                text not null default 'active' check (status in ('active','inactive')),
  is_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);
create unique index clubs_name_unique on public.clubs (lower(name));

-- Dar City becomes the first club (fixed id so every environment matches).
insert into public.clubs (id, name, short_name, player_id_prefix, logo_url, country, city, sport, competition_category, league, status, registration_date)
values ('00000000-0000-4000-8000-00000000c001', 'Dar City Basketball Team', 'Dar City', 'DCB', '/clubs/dar-city.png',
        'Tanzania', 'Dar es Salaam', 'Basketball', 'Senior Men', null, 'active', current_date);

-- Continue Dar City player numbering after the highest existing DCB-#### code.
update public.clubs
   set player_counter = coalesce((select max((regexp_match(player_code, '(\d+)$'))[1]::int) from public.players), 0),
       current_season = (select name from public.team_seasons where is_current limit 1)
 where id = '00000000-0000-4000-8000-00000000c001';

-- Club membership (which staff accounts may access which club).
create table public.club_members (
  club_id     uuid not null references public.clubs (id) on delete cascade deferrable initially deferred,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id);

-- Preserve current access: every existing account keeps access to Dar City.
insert into public.club_members (club_id, user_id)
select '00000000-0000-4000-8000-00000000c001', id from public.profiles
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Add club_id to operational tables and backfill with Dar City
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'players','player_emergency_contacts','medical_histories','medical_examinations','examination_findings',
    'injuries','injury_followups','treatments','rehabilitation_programs','rehabilitation_sessions',
    'rtp_assessments','medical_clearances','player_availability','medical_documents','team_seasons','team_exposures'
  ] loop
    execute format('alter table public.%I add column club_id uuid references public.clubs (id)', t);
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set club_id = %L where club_id is null', t, '00000000-0000-4000-8000-00000000c001');
    execute format('alter table public.%I enable trigger user', t);
    execute format('alter table public.%I alter column club_id set not null', t);
    execute format('create index %I on public.%I (club_id)', t || '_club_idx', t);
  end loop;
end $$;

alter table public.audit_logs add column club_id uuid;
create index audit_logs_club_idx on public.audit_logs (club_id, created_at desc);
update public.audit_logs set club_id = '00000000-0000-4000-8000-00000000c001'
 where record_type in ('players','player_emergency_contacts','medical_histories','medical_examinations','examination_findings',
   'injuries','injury_followups','treatments','rehabilitation_programs','rehabilitation_sessions','rtp_assessments',
   'medical_clearances','player_availability','medical_documents','team_seasons','team_exposures');

-- ---------------------------------------------------------------------
-- 3. Per-club uniqueness
-- ---------------------------------------------------------------------
drop index public.players_unique_active_jersey;
create unique index players_unique_active_jersey
  on public.players (club_id, team_category, jersey_number)
  where status = 'active' and jersey_number is not null;

alter table public.players alter column player_code drop default;
alter table public.players drop constraint players_player_code_key;
alter table public.players add constraint players_club_player_code_key unique (club_id, player_code);

alter table public.team_seasons drop constraint team_seasons_name_key;
alter table public.team_seasons add constraint team_seasons_club_name_key unique (club_id, name);
drop index public.team_seasons_one_current;
create unique index team_seasons_one_current on public.team_seasons (club_id) where is_current;

-- ---------------------------------------------------------------------
-- 4. Integrity verification (aborts the migration on any problem)
-- ---------------------------------------------------------------------
do $$
declare r record; n bigint;
begin
  for r in select * from _mc_counts loop
    execute format('select count(*) from public.%I', r.t) into n;
    if n <> r.n then raise exception 'Integrity check failed: % had % rows, now %', r.t, r.n, n; end if;
    execute format('select count(*) from public.%I where club_id is null', r.t) into n;
    if n > 0 then raise exception 'Integrity check failed: % has % rows without club', r.t, n; end if;
  end loop;
end $$;
drop table _mc_counts;

-- ---------------------------------------------------------------------
-- 5. Club access helper
-- ---------------------------------------------------------------------
create or replace function public.has_club_access(p_club uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_club is not null and public.is_staff() and (
    public.is_admin()
    or exists (select 1 from public.club_members m where m.club_id = p_club and m.user_id = auth.uid())
  )
$$;
grant execute on function public.has_club_access(uuid) to authenticated;

-- VOLATILE twin used by the clubs read policy: it must see the creator's membership
-- row that is inserted by a trigger within the same INSERT … RETURNING statement.
create or replace function public.has_club_access_now(p_club uuid)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
begin
  return p_club is not null and public.is_staff() and (
    public.is_admin()
    or exists (select 1 from public.club_members m where m.club_id = p_club and m.user_id = auth.uid()));
end $$;
grant execute on function public.has_club_access_now(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Triggers: club assignment, immutability, player IDs per club
-- ---------------------------------------------------------------------

-- Child records always inherit club_id from their parent (client value ignored),
-- so a club can never be "changed" through the API.
create or replace function public.set_club_from_parent()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v uuid;
begin
  case tg_argv[0]
    when 'player' then select club_id into v from public.players where id = new.player_id;
    when 'injury' then select club_id into v from public.injuries where id = new.injury_id;
    when 'exam' then select club_id into v from public.medical_examinations where id = new.examination_id;
    when 'program' then select club_id into v from public.rehabilitation_programs where id = new.program_id;
  end case;
  if v is null then
    raise exception 'Parent record not found' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.club_id is distinct from v then
    raise exception 'Records cannot be moved to another club' using errcode = '42501';
  end if;
  new.club_id := v;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('player_emergency_contacts','player'), ('medical_histories','player'), ('medical_examinations','player'),
    ('injuries','player'), ('rehabilitation_programs','player'), ('rtp_assessments','player'),
    ('medical_clearances','player'), ('player_availability','player'), ('medical_documents','player'),
    ('examination_findings','exam'), ('injury_followups','injury'), ('treatments','injury'),
    ('rehabilitation_sessions','program')) as x(t, parent)
  loop
    execute format('create trigger trg_00_club_%1$s before insert or update on public.%1$I for each row execute function public.set_club_from_parent(%2$L)', r.t, r.parent);
  end loop;
end $$;

-- Root records (players, seasons, exposures): club cannot change after creation.
create or replace function public.prevent_club_change()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.club_id is distinct from old.club_id then
    raise exception 'Records cannot be moved to another club' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_00_club_players_lock before update on public.players for each row execute function public.prevent_club_change();
create trigger trg_00_club_seasons_lock before update on public.team_seasons for each row execute function public.prevent_club_change();
create trigger trg_00_club_exposures_lock before update on public.team_exposures for each row execute function public.prevent_club_change();

-- A season referenced by a record must belong to the same club.
create or replace function public.check_season_club()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.season_id is not null and not exists (select 1 from public.team_seasons s where s.id = new.season_id and s.club_id = new.club_id) then
    raise exception 'The selected season belongs to a different club' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_01_season_club_players before insert or update on public.players for each row execute function public.check_season_club();
create trigger trg_01_season_club_exams before insert or update on public.medical_examinations for each row execute function public.check_season_club();
create trigger trg_01_season_club_injuries before insert or update on public.injuries for each row execute function public.check_season_club();
create trigger trg_01_season_club_exposures before insert or update on public.team_exposures for each row execute function public.check_season_club();

-- Player IDs are generated per club: <PREFIX>-0001, <PREFIX>-0002 …
create or replace function public.assign_player_code()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_prefix text; v_n int; v_status text;
begin
  select status into v_status from public.clubs where id = new.club_id;
  if v_status is null then raise exception 'Club not found' using errcode = '23503'; end if;
  if v_status <> 'active' then raise exception 'This club is inactive – players cannot be registered' using errcode = '23514'; end if;
  if new.player_code is null or new.player_code = '' then
    update public.clubs set player_counter = player_counter + 1 where id = new.club_id
      returning player_id_prefix, player_counter into v_prefix, v_n;
    new.player_code := v_prefix || '-' || lpad(v_n::text, 4, '0');
  end if;
  return new;
end $$;
create trigger trg_00_player_code before insert on public.players for each row execute function public.assign_player_code();

-- Club defaults: prefix derived from the short name; creator gets access.
create or replace function public.clubs_before_write()
returns trigger language plpgsql security definer set search_path = public
as $$
declare base text; candidate text; i int := 1;
begin
  new.name := trim(new.name);
  new.short_name := trim(new.short_name);
  if new.player_id_prefix is null or new.player_id_prefix = '' then
    base := left(upper(regexp_replace(new.short_name, '[^A-Za-z0-9]', '', 'g')), 4);
    if char_length(base) < 2 then base := 'CLB'; end if;
    candidate := base;
    while exists (select 1 from public.clubs where player_id_prefix = candidate and id <> new.id) loop
      i := i + 1; candidate := left(base, 4) || i::text;
    end loop;
    new.player_id_prefix := candidate;
  else
    new.player_id_prefix := upper(new.player_id_prefix);
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null and not public.is_admin() then
    insert into public.club_members (club_id, user_id) values (new.id, auth.uid()) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger trg_clubs_before_write before insert or update on public.clubs for each row execute function public.clubs_before_write();
create trigger trg_clubs_updated before update on public.clubs for each row execute function public.set_updated_fields();
create trigger trg_clubs_audit after insert or update or delete on public.clubs for each row execute function public.audit_row_change();
create trigger trg_club_members_audit after insert or update or delete on public.club_members for each row execute function public.audit_row_change();

-- Audit entries now record the club they belong to.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_j jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_j jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_club uuid;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, value) into new_j
      from jsonb_each(to_jsonb(new)) n
     where n.value is distinct from (to_jsonb(old) -> n.key)
       and n.key not in ('updated_at','updated_by');
    if new_j is null then return new; end if;
    select jsonb_object_agg(key, to_jsonb(old) -> key) into old_j from jsonb_object_keys(new_j) key;
  end if;
  v_club := case when tg_table_name = 'clubs' then (rec ->> 'id')::uuid else (rec ->> 'club_id')::uuid end;
  insert into public.audit_logs (user_id, action, record_type, record_id, old_values, new_values, club_id)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce(rec ->> 'id', rec ->> 'key', (rec ->> 'club_id') || ':' || (rec ->> 'user_id')), old_j, new_j, v_club);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 7. Club-aware Row Level Security
-- ---------------------------------------------------------------------
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
grant select, insert, update, delete on public.clubs, public.club_members to authenticated;
grant usage on sequence public.club_code_seq to authenticated;
revoke all on public.clubs, public.club_members from anon;
revoke delete on public.clubs from authenticated;  -- clubs are deactivated, never deleted

-- Drop every previous policy on club-scoped tables; recreate below.
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
end $$;

-- clubs & membership
create policy clubs_read on public.clubs for select to authenticated using (public.has_club_access_now(id));
create policy clubs_insert on public.clubs for insert to authenticated with check (public.has_role('team_physician','super_admin'));
create policy clubs_update on public.clubs for update to authenticated
  using (public.has_role('team_physician','super_admin') and public.has_club_access(id))
  with check (public.has_role('team_physician','super_admin') and public.has_club_access(id));

create policy members_read on public.club_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or (public.is_physician() and public.has_club_access(club_id)));
create policy members_insert on public.club_members for insert to authenticated
  with check (public.is_admin() or (public.is_physician() and public.has_club_access(club_id)));
create policy members_delete on public.club_members for delete to authenticated
  using (public.is_admin() or (public.is_physician() and public.has_club_access(club_id) and user_id <> auth.uid()));

-- players & registration data
create policy players_read on public.players for select to authenticated using (public.has_club_access(club_id));
create policy players_insert on public.players for insert to authenticated
  with check (public.has_role('super_admin','team_physician') and public.has_club_access(club_id));
create policy players_update on public.players for update to authenticated
  using (public.has_role('super_admin','team_physician') and public.has_club_access(club_id))
  with check (public.has_role('super_admin','team_physician') and public.has_club_access(club_id));

create policy contacts_read on public.player_emergency_contacts for select to authenticated
  using (public.has_role('super_admin','team_physician','assistant_medical_staff','team_manager') and public.has_club_access(club_id));
create policy contacts_insert on public.player_emergency_contacts for insert to authenticated
  with check (public.has_role('super_admin','team_physician') and public.has_club_access(club_id));
create policy contacts_update on public.player_emergency_contacts for update to authenticated
  using (public.has_role('super_admin','team_physician') and public.has_club_access(club_id))
  with check (public.has_role('super_admin','team_physician') and public.has_club_access(club_id));
create policy contacts_delete on public.player_emergency_contacts for delete to authenticated
  using (public.has_role('super_admin','team_physician') and public.has_club_access(club_id));

create policy seasons_read on public.team_seasons for select to authenticated using (public.has_club_access(club_id));
create policy seasons_insert on public.team_seasons for insert to authenticated
  with check (public.has_role('super_admin','team_physician') and public.has_club_access(club_id));
create policy seasons_update on public.team_seasons for update to authenticated
  using (public.has_role('super_admin','team_physician') and public.has_club_access(club_id))
  with check (public.has_role('super_admin','team_physician') and public.has_club_access(club_id));

-- Confidential clinical tables: clinical staff of the club read, physician of the club writes.
do $$
declare t text;
begin
  foreach t in array array['medical_histories','medical_examinations','examination_findings','injuries',
                           'rehabilitation_programs','rtp_assessments','medical_clearances','player_availability'] loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (public.is_clinical() and public.has_club_access(club_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_physician() and public.has_club_access(club_id))', t);
  end loop;
  foreach t in array array['medical_examinations','examination_findings','injuries','rehabilitation_programs','rtp_assessments'] loop
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_physician() and public.has_club_access(club_id)) with check (public.is_physician() and public.has_club_access(club_id))', t);
  end loop;
  foreach t in array array['injury_followups','treatments','rehabilitation_sessions'] loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (public.is_clinical() and public.has_club_access(club_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_clinical() and public.has_club_access(club_id) and created_by = auth.uid())', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.has_club_access(club_id) and (public.is_physician() or (public.is_clinical() and created_by = auth.uid()))) with check (public.is_clinical() and public.has_club_access(club_id))', t);
  end loop;
end $$;
create policy findings_delete on public.examination_findings for delete to authenticated using (public.is_physician() and public.has_club_access(club_id));

create policy documents_read on public.medical_documents for select to authenticated using (public.is_clinical() and public.has_club_access(club_id));
create policy documents_insert on public.medical_documents for insert to authenticated with check (public.is_clinical() and public.has_club_access(club_id) and created_by = auth.uid());
create policy documents_update on public.medical_documents for update to authenticated using (public.is_physician() and public.has_club_access(club_id)) with check (public.is_physician() and public.has_club_access(club_id));
create policy documents_delete on public.medical_documents for delete to authenticated using (public.is_physician() and public.has_club_access(club_id));

create policy exposures_read on public.team_exposures for select to authenticated using ((public.is_clinical() or public.is_admin()) and public.has_club_access(club_id));
create policy exposures_insert on public.team_exposures for insert to authenticated with check (public.is_physician() and public.has_club_access(club_id));
create policy exposures_delete on public.team_exposures for delete to authenticated using (public.is_physician() and public.has_club_access(club_id));

create policy audit_read on public.audit_logs for select to authenticated
  using (public.is_admin() or (public.is_physician() and (club_id is null or public.has_club_access(club_id))));

-- Settings: admin manages application settings; the physician manages the medical brand (brand_*).
create policy settings_read on public.application_settings for select to authenticated using (public.is_staff());
create policy settings_write on public.application_settings for update to authenticated
  using (public.is_admin() or (public.is_physician() and key like 'brand\_%'))
  with check (public.is_admin() or (public.is_physician() and key like 'brand\_%'));
create policy settings_insert on public.application_settings for insert to authenticated
  with check (public.is_admin() or (public.is_physician() and key like 'brand\_%'));

insert into public.application_settings (key, value, description) values
  ('brand_name', '"Dr. Faraj Lashika"', 'Medical brand – physician name'),
  ('brand_specialty', '"Orthopedic & Sports Medicine"', 'Medical brand – specialty'),
  ('brand_contact', '""', 'Medical brand – contact information (phone, e-mail, address)'),
  ('brand_logo_path', '""', 'Medical brand – uploaded logo (empty = official default logo)'),
  ('brand_signature_path', '""', 'Medical brand – optional signature image')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 8. Availability RPC (club-aware, still free of confidential data)
-- ---------------------------------------------------------------------
drop function public.get_team_availability();
create function public.get_team_availability(p_club_id uuid default null)
returns table (
  player_id uuid, club_id uuid, club_name text, player_code text, full_name text, jersey_number integer, "position" text,
  team_category text, availability text, medical_status text, restrictions text, staff_notes text,
  effective_date date, next_followup_date date, last_assessment_date date
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_club_id is not null and not public.has_club_access(p_club_id) then
    raise exception 'Not authorized for this club' using errcode = '42501';
  end if;
  return query
  select p.id, p.club_id, c.short_name, p.player_code, p.full_name, p.jersey_number, p.position, p.team_category,
         coalesce(a.availability, 'UNDER MEDICAL REVIEW'),
         coalesce(a.medical_status, 'Awaiting Assessment'),
         a.restrictions, a.staff_notes, a.effective_date, a.next_followup_date,
         greatest(
           (select max(e.examination_date) from public.medical_examinations e where e.player_id = p.id and not e.is_archived),
           (select max(f.followup_date) from public.injury_followups f join public.injuries i on i.id = f.injury_id where i.player_id = p.id),
           (select max(r.assessment_date) from public.rtp_assessments r where r.player_id = p.id)
         )
    from public.players p
    join public.clubs c on c.id = p.club_id
    left join lateral (
      select pa.* from public.player_availability pa
       where pa.player_id = p.id and pa.shared_with_staff
       order by pa.effective_date desc, pa.created_at desc
       limit 1
    ) a on true
   where p.status = 'active'
     and public.has_club_access(p.club_id)
     and (p_club_id is null or p.club_id = p_club_id)
   order by c.short_name, p.jersey_number nulls last, p.full_name;
end $$;
revoke execute on function public.get_team_availability(uuid) from anon, public;
grant execute on function public.get_team_availability(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Storage: club-aware access + club logos + brand assets
-- ---------------------------------------------------------------------
create or replace function public.storage_player_access(p_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare v uuid;
begin
  begin v := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  return exists (select 1 from public.players p where p.id = v and public.has_club_access(p.club_id));
end $$;

create or replace function public.storage_club_access(p_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare v uuid;
begin
  begin v := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  return public.has_club_access(v);
end $$;
grant execute on function public.storage_player_access(text), public.storage_club_access(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('club-logos', 'club-logos', false, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('brand-assets', 'brand-assets', false, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists "medical docs read" on storage.objects;
drop policy if exists "medical docs upload" on storage.objects;
drop policy if exists "medical docs delete" on storage.objects;
drop policy if exists "player photos read" on storage.objects;
drop policy if exists "player photos upload" on storage.objects;
drop policy if exists "player photos update" on storage.objects;
drop policy if exists "player photos delete" on storage.objects;

create policy "medical docs read" on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and public.is_clinical() and public.storage_player_access(name));
create policy "medical docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-documents' and public.is_clinical() and public.storage_player_access(name));
create policy "medical docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'medical-documents' and public.is_physician() and public.storage_player_access(name));

create policy "player photos read" on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and public.storage_player_access(name));
create policy "player photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and public.has_role('team_physician','super_admin') and public.storage_player_access(name));
create policy "player photos update" on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and public.has_role('team_physician','super_admin') and public.storage_player_access(name));
create policy "player photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and public.has_role('team_physician','super_admin') and public.storage_player_access(name));

create policy "club logos read" on storage.objects for select to authenticated
  using (bucket_id = 'club-logos' and public.storage_club_access(name));
create policy "club logos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'club-logos' and public.has_role('team_physician','super_admin') and public.storage_club_access(name));
create policy "club logos update" on storage.objects for update to authenticated
  using (bucket_id = 'club-logos' and public.has_role('team_physician','super_admin') and public.storage_club_access(name));
create policy "club logos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'club-logos' and public.has_role('team_physician','super_admin') and public.storage_club_access(name));

create policy "brand assets read" on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets' and public.is_staff());
create policy "brand assets upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and public.has_role('team_physician','super_admin'));
create policy "brand assets update" on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets' and public.has_role('team_physician','super_admin'));
