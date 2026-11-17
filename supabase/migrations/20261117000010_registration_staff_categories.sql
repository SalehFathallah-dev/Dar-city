-- =====================================================================
-- Migration 10:
--   * Age categories per club (U14, U16, U18, First Team …)
--   * Staff register (coaches, managers, physiotherapists …) entered by the physician
--   * Self-registration: a new account picks its club and its own name
--     (player or staff member) and waits for the physician's approval.
--     Before approval it can see only club names and unclaimed names.
--   * Recovery progress for staff – stages and dates, no clinical detail.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Age categories
-- ---------------------------------------------------------------------
create table public.club_categories (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 40),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create unique index club_categories_name on public.club_categories (club_id, lower(name));

create or replace function public.club_category_write()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.name := trim(new.name);
  if tg_op = 'UPDATE' then
    if new.club_id is distinct from old.club_id then
      raise exception 'Categories cannot be moved to another club' using errcode = '42501';
    end if;
    -- Renaming a category renames it on the players of that club.
    if new.name is distinct from old.name then
      update public.players set team_category = new.name where club_id = new.club_id and team_category = old.name;
      update public.staff_members set category = new.name where club_id = new.club_id and category = old.name;
    end if;
  end if;
  return new;
end $$;

alter table public.club_categories enable row level security;
grant select, insert, update, delete on public.club_categories to authenticated;
revoke all on public.club_categories from anon;
create policy categories_read on public.club_categories for select to authenticated using (public.has_club_access(club_id));
create policy categories_insert on public.club_categories for insert to authenticated
  with check (public.has_role('team_physician','super_admin') and public.has_club_access(club_id));
create policy categories_update on public.club_categories for update to authenticated
  using (public.has_role('team_physician','super_admin') and public.has_club_access(club_id))
  with check (public.has_role('team_physician','super_admin') and public.has_club_access(club_id));
create policy categories_delete on public.club_categories for delete to authenticated
  using (public.has_role('team_physician','super_admin') and public.has_club_access(club_id)
         and not exists (select 1 from public.players p where p.club_id = club_categories.club_id and p.team_category = club_categories.name));

-- Existing clubs: create a category for every category already used by their players.
insert into public.club_categories (club_id, name, created_by)
select distinct club_id, team_category, null::uuid from public.players
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Staff register
-- ---------------------------------------------------------------------
create table public.staff_members (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  full_name   text not null check (char_length(trim(full_name)) between 2 and 120),
  app_role    public.app_role not null check (app_role in ('head_coach','team_manager','assistant_medical_staff')),
  title       text check (char_length(title) <= 80),
  category    text check (char_length(category) <= 40),
  phone       text check (phone is null or phone ~ '^[0-9+() -]{6,25}$'),
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes       text,
  profile_id  uuid unique references public.profiles (id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create index staff_members_club on public.staff_members (club_id);

create trigger trg_club_categories_write before insert or update on public.club_categories
  for each row execute function public.club_category_write();
create trigger trg_club_categories_updated before update on public.club_categories
  for each row execute function public.set_updated_fields();
create trigger trg_club_categories_audit after insert or update or delete on public.club_categories
  for each row execute function public.audit_row_change();

create or replace function public.staff_member_write()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.full_name := trim(new.full_name);
  if tg_op = 'UPDATE' and new.club_id is distinct from old.club_id then
    raise exception 'Staff members cannot be moved to another club' using errcode = '42501';
  end if;
  -- The account link is set only by decide_registration() (or the SQL editor).
  if auth.uid() is not null and new.profile_id is distinct from (case when tg_op = 'UPDATE' then old.profile_id end)
     and current_setting('dsf.registration', true) is distinct from 'on' then
    if new.profile_id is not null then
      raise exception 'Accounts are linked through the approval of a registration request' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_staff_members_write before insert or update on public.staff_members
  for each row execute function public.staff_member_write();
create trigger trg_staff_members_updated before update on public.staff_members
  for each row execute function public.set_updated_fields();
create trigger trg_staff_members_audit after insert or update or delete on public.staff_members
  for each row execute function public.audit_row_change();

alter table public.staff_members enable row level security;
grant select, insert, update, delete on public.staff_members to authenticated;
revoke all on public.staff_members from anon;
create policy staff_read on public.staff_members for select to authenticated using (public.is_staff() and public.has_club_access(club_id));
create policy staff_insert on public.staff_members for insert to authenticated
  with check (public.can_manage_users() and public.has_club_access(club_id));
create policy staff_update on public.staff_members for update to authenticated
  using (public.can_manage_users() and public.has_club_access(club_id))
  with check (public.can_manage_users() and public.has_club_access(club_id));
create policy staff_delete on public.staff_members for delete to authenticated
  using (public.can_manage_users() and public.has_club_access(club_id));

-- ---------------------------------------------------------------------
-- 3. Registration requests
-- ---------------------------------------------------------------------
create table public.registration_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  club_id          uuid not null references public.clubs (id) on delete cascade,
  kind             text not null check (kind in ('athlete','staff')),
  player_id        uuid references public.players (id) on delete cascade,
  staff_member_id  uuid references public.staff_members (id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  message          text check (char_length(message) <= 300),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text check (char_length(decision_note) <= 300),
  created_at       timestamptz not null default now(),
  check ((kind = 'athlete' and player_id is not null and staff_member_id is null)
      or (kind = 'staff' and staff_member_id is not null and player_id is null))
);
create unique index registration_one_pending_per_user on public.registration_requests (user_id) where status = 'pending';
create index registration_club_status on public.registration_requests (club_id, status);
create trigger trg_registration_audit after insert or update or delete on public.registration_requests
  for each row execute function public.audit_row_change();

alter table public.registration_requests enable row level security;
grant select on public.registration_requests to authenticated;
revoke all on public.registration_requests from anon;
create policy registration_read on public.registration_requests for select to authenticated
  using (user_id = auth.uid() or (public.can_manage_users() and public.has_club_access(club_id)));
-- All writes go through the functions below.

-- A signed-in account that has not been given a role yet.
create or replace function public.is_unassigned_user() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role is null) $$;

-- Step 1: clubs to choose from (names only).
create or replace function public.registration_clubs()
returns table (id uuid, name text, short_name text, city text, country text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_unassigned_user() then raise exception 'Not available for this account' using errcode = '42501'; end if;
  return query select c.id, c.name, c.short_name, c.city, c.country from public.clubs c where c.status = 'active' order by c.name;
end $$;

-- Step 2: categories of the chosen club.
create or replace function public.registration_categories(p_club_id uuid)
returns table (name text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_unassigned_user() then raise exception 'Not available for this account' using errcode = '42501'; end if;
  return query select c.name from public.club_categories c where c.club_id = p_club_id and c.is_active order by c.sort_order, c.name;
end $$;

-- Step 3: names that are not yet linked to an account – nothing else.
create or replace function public.registration_people(p_club_id uuid, p_kind text, p_category text default null)
returns table (id uuid, full_name text, detail text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_unassigned_user() then raise exception 'Not available for this account' using errcode = '42501'; end if;
  if p_kind = 'athlete' then
    return query
      select p.id, p.full_name, case when p.jersey_number is null then null else '#' || p.jersey_number end
        from public.players p
       where p.club_id = p_club_id and p.status = 'active'
         and (p_category is null or p.team_category = p_category)
         and not exists (select 1 from public.profiles pr where pr.player_id = p.id)
       order by p.full_name;
  elsif p_kind = 'staff' then
    return query
      select s.id, s.full_name, s.title
        from public.staff_members s
       where s.club_id = p_club_id and s.is_active and s.profile_id is null
         and (p_category is null or s.category = p_category or s.category is null)
       order by s.full_name;
  else
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
end $$;

create or replace function public.submit_registration(p_club_id uuid, p_kind text, p_person_id uuid, p_message text default null)
returns public.registration_requests
language plpgsql volatile security definer set search_path = public
as $$
declare rec public.registration_requests;
begin
  if not public.is_unassigned_user() then raise exception 'This account already has access' using errcode = '42501'; end if;
  if not exists (select 1 from public.clubs where id = p_club_id and status = 'active') then
    raise exception 'Club not found' using errcode = '23503';
  end if;
  if p_kind = 'athlete' then
    if not exists (select 1 from public.players p where p.id = p_person_id and p.club_id = p_club_id and p.status = 'active'
                   and not exists (select 1 from public.profiles pr where pr.player_id = p.id)) then
      raise exception 'This player is not available for registration' using errcode = '23514';
    end if;
  elsif p_kind = 'staff' then
    if not exists (select 1 from public.staff_members s where s.id = p_person_id and s.club_id = p_club_id and s.is_active and s.profile_id is null) then
      raise exception 'This staff member is not available for registration' using errcode = '23514';
    end if;
  else
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
  update public.registration_requests set status = 'cancelled' where user_id = auth.uid() and status = 'pending';
  insert into public.registration_requests (user_id, club_id, kind, player_id, staff_member_id, message)
  values (auth.uid(), p_club_id, p_kind,
          case when p_kind = 'athlete' then p_person_id end,
          case when p_kind = 'staff' then p_person_id end,
          nullif(trim(p_message), ''))
  returning * into rec;
  return rec;
end $$;

-- The current account's latest request (shown on the waiting screen).
create or replace function public.my_registration()
returns table (id uuid, status text, kind text, club_name text, person_name text, decision_note text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select r.id, r.status, r.kind, c.name, coalesce(p.full_name, s.full_name), r.decision_note, r.created_at
    from public.registration_requests r
    join public.clubs c on c.id = r.club_id
    left join public.players p on p.id = r.player_id
    left join public.staff_members s on s.id = r.staff_member_id
   where r.user_id = auth.uid()
   order by r.created_at desc limit 1
$$;

create or replace function public.cancel_my_registration()
returns void language sql volatile security definer set search_path = public
as $$ update public.registration_requests set status = 'cancelled' where user_id = auth.uid() and status = 'pending' $$;

-- Physician: pending (and recent) requests for the clubs they manage.
create or replace function public.list_registrations(p_status text default 'pending')
returns table (id uuid, created_at timestamptz, status text, kind text, club_id uuid, club_name text,
               person_id uuid, person_name text, person_detail text, login text, account_name text, message text,
               already_linked boolean, decided_at timestamptz, decision_note text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_manage_users() then raise exception 'Not authorized' using errcode = '42501'; end if;
  return query
  select r.id, r.created_at, r.status, r.kind, r.club_id, c.name,
         coalesce(r.player_id, r.staff_member_id),
         coalesce(p.full_name, s.full_name),
         case when r.kind = 'athlete' then concat_ws(' · ', case when p.jersey_number is not null then '#' || p.jersey_number end, p.team_category)
              else concat_ws(' · ', s.title, s.category) end,
         replace(pr.email, '@dsf.local', ''), pr.full_name, r.message,
         case when r.kind = 'athlete' then exists (select 1 from public.profiles x where x.player_id = r.player_id)
              else s.profile_id is not null end,
         r.decided_at, r.decision_note
    from public.registration_requests r
    join public.clubs c on c.id = r.club_id
    join public.profiles pr on pr.id = r.user_id
    left join public.players p on p.id = r.player_id
    left join public.staff_members s on s.id = r.staff_member_id
   where public.has_club_access(r.club_id)
     and (p_status = 'all' or r.status = p_status)
   order by r.created_at desc
   limit 300;
end $$;

-- Physician approves or rejects. Approval gives the account its role, its
-- player link (athlete) or club access (staff) – the first sign-in is allowed only now.
create or replace function public.decide_registration(p_request_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare r public.registration_requests; s public.staff_members; pl public.players;
begin
  select * into r from public.registration_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Request not found' using errcode = '23503'; end if;
  if not (public.can_manage_users() and public.has_club_access(r.club_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'This request has already been decided' using errcode = '23514'; end if;
  if exists (select 1 from public.profiles where id = r.user_id and role is not null) then
    raise exception 'This account already has access' using errcode = '23514';
  end if;

  if not p_approve then
    update public.registration_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
     where id = r.id;
    return;
  end if;

  if r.kind = 'athlete' then
    select * into pl from public.players where id = r.player_id;
    if exists (select 1 from public.profiles where player_id = r.player_id) then
      raise exception 'This player is already linked to another account' using errcode = '23514';
    end if;
    update public.profiles set role = 'athlete', player_id = r.player_id, is_active = true, full_name = pl.full_name where id = r.user_id;
  else
    select * into s from public.staff_members where id = r.staff_member_id for update;
    if s.profile_id is not null then
      raise exception 'This staff member is already linked to another account' using errcode = '23514';
    end if;
    update public.profiles set role = s.app_role, is_active = true, full_name = s.full_name, title = s.title where id = r.user_id;
    perform set_config('dsf.registration', 'on', true);
    update public.staff_members set profile_id = r.user_id where id = s.id;
    perform set_config('dsf.registration', 'off', true);
    insert into public.club_members (club_id, user_id) values (r.club_id, r.user_id) on conflict do nothing;
  end if;

  update public.registration_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = r.id;
  -- Other pending requests for the same person can no longer be approved.
  update public.registration_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
         decision_note = 'Linked to another account'
   where status = 'pending' and id <> r.id
     and ((r.kind = 'athlete' and player_id = r.player_id) or (r.kind = 'staff' and staff_member_id = r.staff_member_id));
end $$;

-- ---------------------------------------------------------------------
-- 4. Recovery progress for staff (no diagnosis, grade, pain or notes)
-- ---------------------------------------------------------------------
create or replace function public.get_player_recovery(p_player_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare pl public.players; result jsonb;
  phases text[] := array['Acute Phase','Early Rehabilitation','Strengthening Phase','Functional Rehabilitation',
                         'Sport-Specific Rehabilitation','Return-to-Training','Return-to-Competition'];
begin
  select * into pl from public.players where id = p_player_id;
  if pl.id is null or not public.is_staff() or not public.has_club_access(pl.club_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'player', jsonb_build_object('id', pl.id, 'full_name', pl.full_name, 'jersey_number', pl.jersey_number, 'position', pl.position, 'team_category', pl.team_category),
    'availability', (select jsonb_build_object('availability', a.availability, 'medical_status', a.medical_status, 'restrictions', a.restrictions,
                       'staff_notes', a.staff_notes, 'effective_date', a.effective_date, 'next_followup_date', a.next_followup_date)
                       from public.player_availability a where a.player_id = pl.id and a.shared_with_staff
                       order by a.effective_date desc, a.created_at desc limit 1),
    'episodes', coalesce((select jsonb_agg(jsonb_build_object(
        'injury_id', i.id, 'injury_date', i.injury_date, 'body_region', i.body_region, 'body_side', i.body_side,
        'status', i.status, 'expected_return_date', i.expected_return_date, 'return_to_play_date', i.return_to_play_date,
        'closed_date', i.closed_date,
        'days_out', (coalesce(i.return_to_play_date, i.closed_date, current_date) - i.injury_date),
        'rehab', (select jsonb_build_object(
              'current_phase', rp.current_phase,
              'phase_number', array_position(phases, rp.current_phase), 'phase_total', array_length(phases, 1),
              'status', rp.status, 'start_date', rp.start_date, 'end_date', rp.end_date,
              'sessions', (select count(*) from public.rehabilitation_sessions s where s.program_id = rp.id),
              'last_session_date', (select max(s.session_date) from public.rehabilitation_sessions s where s.program_id = rp.id),
              'phase_history', coalesce((select jsonb_agg(jsonb_build_object('phase', h.phase, 'from', h.first_date) order by h.first_date)
                                           from (select s.phase, min(s.session_date) as first_date from public.rehabilitation_sessions s
                                                  where s.program_id = rp.id group by s.phase) h), '[]'::jsonb))
            from public.rehabilitation_programs rp where rp.injury_id = i.id
            order by (rp.status = 'Active') desc, rp.start_date desc limit 1),
        'rtp', coalesce((select jsonb_agg(jsonb_build_object('decision', t.decision, 'decision_date', t.decision_date) order by t.decision_date)
                           from public.rtp_assessments t where t.injury_id = i.id), '[]'::jsonb)
      ) order by i.injury_date desc)
      from public.injuries i
     where i.player_id = pl.id and not i.is_archived
       and (i.status not in ('Recovered','Closed') or coalesce(i.closed_date, i.return_to_play_date, i.injury_date) >= current_date - 120)), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- 4b. Team summary now includes the age category
-- ---------------------------------------------------------------------
drop function public.get_team_summary(uuid);
create function public.get_team_summary(p_club_id uuid)
returns table (
  player_id uuid, player_code text, full_name text, jersey_number integer, "position" text, team_category text,
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
  select p.id, p.player_code, p.full_name, p.jersey_number, p.position, p.team_category,
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
revoke execute on function public.get_team_summary(uuid) from public, anon;
grant execute on function public.get_team_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------
revoke execute on function public.club_category_write(), public.staff_member_write() from public, anon, authenticated;
revoke execute on function
  public.is_unassigned_user(), public.registration_clubs(), public.registration_categories(uuid),
  public.registration_people(uuid, text, text), public.submit_registration(uuid, text, uuid, text),
  public.my_registration(), public.cancel_my_registration(), public.list_registrations(text),
  public.decide_registration(uuid, boolean, text), public.get_player_recovery(uuid)
  from public, anon;
grant execute on function
  public.is_unassigned_user(), public.registration_clubs(), public.registration_categories(uuid),
  public.registration_people(uuid, text, text), public.submit_registration(uuid, text, uuid, text),
  public.my_registration(), public.cancel_my_registration(), public.list_registrations(text),
  public.decide_registration(uuid, boolean, text), public.get_player_recovery(uuid)
  to authenticated;
