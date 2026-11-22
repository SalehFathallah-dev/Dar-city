-- =====================================================================
-- Migration 13 – Phase 2: performance
--   * Training sessions + individual participation (sRPE load)
--   * Match calendar
--   * Recovery plans around matches (proposed → approved by the physician)
--   * Recovery sessions (ice bath …) with individual attendance
--   * Individual recovery restrictions / contraindications
-- =====================================================================

-- Coaching staff who may plan training and matches.
create or replace function public.can_plan_training() returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_role('team_physician', 'assistant_medical_staff', 'head_coach', 'team_manager', 'super_admin') $$;

-- Generic: club of a child row must match the club of its parent row, and of the player.
create or replace function public._club_of(p_table text, p_id uuid) returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare v uuid;
begin
  execute format('select club_id from public.%I where id = $1', p_table) into v using p_id;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 1. Matches
-- ---------------------------------------------------------------------
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs (id) on delete cascade,
  opponent      text not null check (char_length(trim(opponent)) between 2 and 120),
  competition   text check (char_length(competition) <= 120),
  match_date    date not null,
  match_time    time,
  venue         text check (char_length(venue) <= 160),
  home_away     text not null default 'Home' check (home_away in ('Home','Away','Neutral')),
  travel        text check (char_length(travel) <= 300),
  status        text not null default 'Scheduled' check (status in ('Scheduled','Played','Postponed','Cancelled')),
  result        text check (char_length(result) <= 40),
  category      text check (char_length(category) <= 40),
  notes         text check (char_length(notes) <= 2000),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid()
);
create index matches_club_date on public.matches (club_id, match_date);
create trigger trg_matches_updated before update on public.matches for each row execute function public.set_updated_fields();
create trigger trg_matches_audit after insert or update or delete on public.matches for each row execute function public.audit_row_change();
alter table public.matches enable row level security;
grant select, insert, update, delete on public.matches to authenticated;
revoke all on public.matches from anon;
create policy matches_read on public.matches for select to authenticated using (public.has_club_access(club_id));
create policy matches_write on public.matches for insert to authenticated with check (public.can_plan_training() and public.has_club_access(club_id));
create policy matches_update on public.matches for update to authenticated
  using (public.can_plan_training() and public.has_club_access(club_id)) with check (public.can_plan_training() and public.has_club_access(club_id));
create policy matches_delete on public.matches for delete to authenticated using (public.can_plan_training() and public.has_club_access(club_id));

-- ---------------------------------------------------------------------
-- 2. Training sessions and participation
-- ---------------------------------------------------------------------
create table public.training_sessions (
  id                uuid primary key default gen_random_uuid(),
  club_id           uuid not null references public.clubs (id) on delete cascade,
  session_date      date not null,
  start_time        time,
  session_type      text not null check (session_type in ('Morning training','Evening training','Gym','Conditioning','Recovery','Match','Other')),
  duration_minutes  integer not null check (duration_minutes between 1 and 600),
  planned_rpe       integer check (planned_rpe between 1 and 10),
  season_phase      text not null default 'In-season' check (season_phase in ('Pre-season','In-season','Off-season')),
  category          text check (char_length(category) <= 40),
  match_id          uuid references public.matches (id) on delete set null,
  notes             text check (char_length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid()
);
create index training_sessions_club_date on public.training_sessions (club_id, session_date);
create trigger trg_training_sessions_updated before update on public.training_sessions for each row execute function public.set_updated_fields();
create trigger trg_training_sessions_audit after insert or update or delete on public.training_sessions for each row execute function public.audit_row_change();
alter table public.training_sessions enable row level security;
grant select, insert, update, delete on public.training_sessions to authenticated;
revoke all on public.training_sessions from anon;
create policy training_read on public.training_sessions for select to authenticated using (public.has_club_access(club_id));
create policy training_insert on public.training_sessions for insert to authenticated with check (public.can_plan_training() and public.has_club_access(club_id));
create policy training_update on public.training_sessions for update to authenticated
  using (public.can_plan_training() and public.has_club_access(club_id)) with check (public.can_plan_training() and public.has_club_access(club_id));
create policy training_delete on public.training_sessions for delete to authenticated using (public.can_plan_training() and public.has_club_access(club_id));

create table public.training_participation (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.training_sessions (id) on delete cascade,
  club_id           uuid not null references public.clubs (id) on delete cascade,
  player_id         uuid not null references public.players (id) on delete cascade,
  status            text not null default 'Full' check (status in ('Full','Modified','Individual','Absent','Excused','Injured')),
  duration_minutes  integer check (duration_minutes between 0 and 600),
  rpe               integer check (rpe between 1 and 10),
  session_load      integer generated always as (case when rpe is not null and duration_minutes is not null then rpe * duration_minutes end) stored,
  minutes_played    integer check (minutes_played between 0 and 80),
  notes             text check (char_length(notes) <= 500),
  updated_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid(),
  unique (session_id, player_id)
);
create index training_participation_player on public.training_participation (player_id);

create or replace function public.child_club_check()
returns trigger language plpgsql security definer set search_path = public
as $$
declare parent_club uuid; player_club uuid;
begin
  parent_club := public._club_of(tg_argv[0], (to_jsonb(new) ->> tg_argv[1])::uuid);
  if parent_club is null then raise exception 'Parent record not found' using errcode = '23503'; end if;
  if tg_op = 'UPDATE' and new.club_id is distinct from parent_club then raise exception 'Records cannot be moved to another club' using errcode = '42501'; end if;
  new.club_id := parent_club;
  if (to_jsonb(new) ->> 'player_id') is not null then
    select club_id into player_club from public.players where id = (to_jsonb(new) ->> 'player_id')::uuid;
    if player_club is distinct from parent_club then raise exception 'The player belongs to another club' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger trg_00_club_participation before insert or update on public.training_participation
  for each row execute function public.child_club_check('training_sessions', 'session_id');
create trigger trg_participation_updated before update on public.training_participation for each row execute function public.set_updated_fields();
create trigger trg_participation_audit after insert or update or delete on public.training_participation for each row execute function public.audit_row_change();
alter table public.training_participation enable row level security;
grant select, insert, update, delete on public.training_participation to authenticated;
revoke all on public.training_participation from anon;
create policy participation_read on public.training_participation for select to authenticated using (public.has_club_access(club_id));
create policy participation_insert on public.training_participation for insert to authenticated with check (public.can_plan_training() and public.has_club_access(club_id));
create policy participation_update on public.training_participation for update to authenticated
  using (public.can_plan_training() and public.has_club_access(club_id)) with check (public.can_plan_training() and public.has_club_access(club_id));
create policy participation_delete on public.training_participation for delete to authenticated using (public.can_plan_training() and public.has_club_access(club_id));

-- ---------------------------------------------------------------------
-- 3. Recovery restrictions (contraindications) – reasons are clinical
-- ---------------------------------------------------------------------
create table public.recovery_restrictions (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs (id),
  player_id     uuid not null references public.players (id) on delete cascade,
  intervention  text not null check (intervention in ('Ice bath','Active recovery','Compression boots','Mobility','Stretching','Massage','Foam rolling','Recovery gym','Other','All')),
  level         text not null check (level in ('Contraindicated','Modified')),
  instructions  text check (char_length(instructions) <= 500),
  reason        text check (char_length(reason) <= 1000),
  valid_until   date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid()
);
create index recovery_restrictions_player on public.recovery_restrictions (player_id, is_active);
create trigger trg_00_club_recovery_restrictions before insert or update on public.recovery_restrictions for each row execute function public.set_club_from_parent('player');
create trigger trg_recovery_restrictions_updated before update on public.recovery_restrictions for each row execute function public.set_updated_fields();
create trigger trg_recovery_restrictions_audit after insert or update or delete on public.recovery_restrictions for each row execute function public.audit_row_change();
alter table public.recovery_restrictions enable row level security;
grant select, insert, update on public.recovery_restrictions to authenticated;
revoke all on public.recovery_restrictions from anon;
create policy restrictions_read on public.recovery_restrictions for select to authenticated using (public.is_clinical() and public.has_club_access(club_id));
create policy restrictions_insert on public.recovery_restrictions for insert to authenticated with check (public.is_physician() and public.has_club_access(club_id));
create policy restrictions_update on public.recovery_restrictions for update to authenticated
  using (public.is_physician() and public.has_club_access(club_id)) with check (public.is_physician() and public.has_club_access(club_id));

create or replace function public._active_restriction(p_player uuid, p_kind text, p_date date)
returns public.recovery_restrictions language sql stable security definer set search_path = public
as $$
  select * from public.recovery_restrictions r
   where r.player_id = p_player and r.is_active and (r.intervention = p_kind or r.intervention = 'All')
     and (r.valid_until is null or r.valid_until >= p_date)
   order by (r.level = 'Contraindicated') desc limit 1
$$;

-- ---------------------------------------------------------------------
-- 4. Recovery plans (match-based protocol: proposed → approved)
-- ---------------------------------------------------------------------
create table public.recovery_plans (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubs (id) on delete cascade,
  match_id       uuid references public.matches (id) on delete cascade,
  title          text not null check (char_length(trim(title)) between 2 and 160),
  interval_label text check (char_length(interval_label) <= 80),
  status         text not null default 'Proposed' check (status in ('Proposed','Approved','Archived')),
  player_ids     uuid[],          -- null = whole team
  notes          text check (char_length(notes) <= 2000),
  approved_by    uuid,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid default auth.uid()
);
create index recovery_plans_club on public.recovery_plans (club_id, status);
create table public.recovery_plan_items (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.recovery_plans (id) on delete cascade,
  club_id          uuid not null references public.clubs (id) on delete cascade,
  day_label        text not null check (day_label in ('MD-3','MD-2','MD-1','MD','MD+1','MD+2','MD+3')),
  item_date        date not null,
  category         text not null check (category in ('Active recovery','Cold water immersion','Mobility','Sleep','Nutrition','Hydration','Compression','Massage','Training load','Other')),
  recommendation   text not null check (char_length(trim(recommendation)) between 2 and 1000),
  sort_order       integer not null default 0,
  player_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(player_overrides) = 'object'),  -- {player_id: "individual instruction" | "EXCLUDED"}
  created_at       timestamptz not null default now()
);
create index recovery_plan_items_plan on public.recovery_plan_items (plan_id, item_date, sort_order);

create or replace function public.recovery_plan_rules()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'Approved' and (tg_op = 'INSERT' or old.status <> 'Approved') then
    if auth.uid() is not null and not public.is_physician() then
      raise exception 'Only the team physician can approve a recovery plan' using errcode = '42501';
    end if;
    new.approved_by := auth.uid(); new.approved_at := now();
  elsif new.status <> 'Approved' then
    new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
create trigger trg_recovery_plan_rules before insert or update on public.recovery_plans for each row execute function public.recovery_plan_rules();
create trigger trg_recovery_plans_updated before update on public.recovery_plans for each row execute function public.set_updated_fields();
create trigger trg_recovery_plans_audit after insert or update or delete on public.recovery_plans for each row execute function public.audit_row_change();
create trigger trg_00_club_plan_items before insert or update on public.recovery_plan_items
  for each row execute function public.child_club_check('recovery_plans', 'plan_id');
create trigger trg_plan_items_audit after insert or update or delete on public.recovery_plan_items for each row execute function public.audit_row_change();

-- Editing an approved plan sends it back to "Proposed" (a change needs a new approval).
create or replace function public.plan_item_unapprove()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.recovery_plans set status = 'Proposed'
   where id = coalesce(new.plan_id, old.plan_id) and status = 'Approved' and auth.uid() is not null and not public.is_physician();
  return coalesce(new, old);
end $$;
create trigger trg_plan_items_unapprove after insert or update or delete on public.recovery_plan_items for each row execute function public.plan_item_unapprove();

alter table public.recovery_plans enable row level security;
alter table public.recovery_plan_items enable row level security;
grant select, insert, update, delete on public.recovery_plans, public.recovery_plan_items to authenticated;
revoke all on public.recovery_plans, public.recovery_plan_items from anon;
-- Staff see approved plans; the medical team sees proposals too.
create policy plans_read on public.recovery_plans for select to authenticated
  using (public.has_club_access(club_id) and (status = 'Approved' or public.is_clinical()));
create policy plans_insert on public.recovery_plans for insert to authenticated with check (public.is_clinical() and public.has_club_access(club_id));
create policy plans_update on public.recovery_plans for update to authenticated
  using (public.is_clinical() and public.has_club_access(club_id)) with check (public.is_clinical() and public.has_club_access(club_id));
create policy plans_delete on public.recovery_plans for delete to authenticated using (public.is_physician() and public.has_club_access(club_id));
create policy plan_items_read on public.recovery_plan_items for select to authenticated
  using (public.has_club_access(club_id) and (public.is_clinical() or exists (select 1 from public.recovery_plans p where p.id = plan_id and p.status = 'Approved')));
create policy plan_items_write on public.recovery_plan_items for insert to authenticated with check (public.is_clinical() and public.has_club_access(club_id));
create policy plan_items_update on public.recovery_plan_items for update to authenticated
  using (public.is_clinical() and public.has_club_access(club_id)) with check (public.is_clinical() and public.has_club_access(club_id));
create policy plan_items_delete on public.recovery_plan_items for delete to authenticated using (public.is_clinical() and public.has_club_access(club_id));

-- ---------------------------------------------------------------------
-- 5. Recovery sessions and attendance
-- ---------------------------------------------------------------------
create table public.recovery_sessions (
  id                    uuid primary key default gen_random_uuid(),
  club_id               uuid not null references public.clubs (id) on delete cascade,
  plan_id               uuid references public.recovery_plans (id) on delete set null,
  kind                  text not null check (kind in ('Ice bath','Active recovery','Compression boots','Mobility','Stretching','Massage','Foam rolling','Recovery gym','Other')),
  session_date          date not null,
  start_time            time,
  recommended_temp_c    numeric(4,1) check (recommended_temp_c between 0 and 45),
  actual_temp_c         numeric(4,1) check (actual_temp_c between 0 and 45),
  recommended_minutes   integer check (recommended_minutes between 1 and 240),
  protocol              text check (char_length(protocol) <= 2000),
  precautions           text check (char_length(precautions) <= 2000),
  supervisor            text check (char_length(supervisor) <= 120),
  status                text not null default 'Scheduled' check (status in ('Scheduled','Completed','Cancelled')),
  notes                 text check (char_length(notes) <= 2000),
  created_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid default auth.uid()
);
create index recovery_sessions_club_date on public.recovery_sessions (club_id, session_date);
create trigger trg_recovery_sessions_updated before update on public.recovery_sessions for each row execute function public.set_updated_fields();
create trigger trg_recovery_sessions_audit after insert or update or delete on public.recovery_sessions for each row execute function public.audit_row_change();

create table public.recovery_attendance (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.recovery_sessions (id) on delete cascade,
  club_id           uuid not null references public.clubs (id) on delete cascade,
  player_id         uuid not null references public.players (id) on delete cascade,
  status            text not null default 'Assigned' check (status in ('Assigned','Present','Absent','Excused','Declined','Completed','Partially completed')),
  start_time        time,
  end_time          time,
  duration_minutes  numeric(5,1) check (duration_minutes between 0 and 240),
  water_temp_c      numeric(4,1) check (water_temp_c between 0 and 45),
  adverse_symptoms  text check (char_length(adverse_symptoms) <= 500),
  supervisor        text check (char_length(supervisor) <= 120),
  notes             text check (char_length(notes) <= 500),
  updated_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid(),
  unique (session_id, player_id)
);
create index recovery_attendance_player on public.recovery_attendance (player_id);
create trigger trg_00_club_attendance before insert or update on public.recovery_attendance
  for each row execute function public.child_club_check('recovery_sessions', 'session_id');

-- Never assign a player to an intervention that is contraindicated for him;
-- duration is calculated from start/end times when both are given.
create or replace function public.recovery_attendance_rules()
returns trigger language plpgsql security definer set search_path = public
as $$
declare s public.recovery_sessions; r public.recovery_restrictions;
begin
  select * into s from public.recovery_sessions where id = new.session_id;
  r := public._active_restriction(new.player_id, s.kind, s.session_date);
  if r.id is not null and r.level = 'Contraindicated' and new.status in ('Assigned','Present','Completed','Partially completed') then
    raise exception 'This intervention is contraindicated for this player (medical restriction)' using errcode = '23514';
  end if;
  if new.start_time is not null and new.end_time is not null and new.end_time > new.start_time then
    new.duration_minutes := round(extract(epoch from (new.end_time - new.start_time)) / 60.0, 1);
  end if;
  return new;
end $$;
create trigger trg_01_attendance_rules before insert or update on public.recovery_attendance for each row execute function public.recovery_attendance_rules();
create trigger trg_attendance_updated before update on public.recovery_attendance for each row execute function public.set_updated_fields();
create trigger trg_attendance_audit after insert or update or delete on public.recovery_attendance for each row execute function public.audit_row_change();

alter table public.recovery_sessions enable row level security;
alter table public.recovery_attendance enable row level security;
grant select, insert, update, delete on public.recovery_sessions, public.recovery_attendance to authenticated;
revoke all on public.recovery_sessions, public.recovery_attendance from anon;
create policy recovery_sessions_read on public.recovery_sessions for select to authenticated using (public.has_club_access(club_id));
create policy recovery_sessions_insert on public.recovery_sessions for insert to authenticated with check (public.is_clinical() and public.has_club_access(club_id));
create policy recovery_sessions_update on public.recovery_sessions for update to authenticated
  using (public.is_clinical() and public.has_club_access(club_id)) with check (public.is_clinical() and public.has_club_access(club_id));
create policy recovery_sessions_delete on public.recovery_sessions for delete to authenticated using (public.is_clinical() and public.has_club_access(club_id));
create policy attendance_read on public.recovery_attendance for select to authenticated using (public.has_club_access(club_id));
create policy attendance_insert on public.recovery_attendance for insert to authenticated with check (public.is_clinical() and public.has_club_access(club_id));
create policy attendance_update on public.recovery_attendance for update to authenticated
  using (public.is_clinical() and public.has_club_access(club_id)) with check (public.is_clinical() and public.has_club_access(club_id));
create policy attendance_delete on public.recovery_attendance for delete to authenticated using (public.is_clinical() and public.has_club_access(club_id));

-- Notify the athlete when assigned to a recovery session.
create or replace function public.recovery_attendance_notify()
returns trigger language plpgsql security definer set search_path = public
as $$
declare s public.recovery_sessions;
begin
  select * into s from public.recovery_sessions where id = new.session_id;
  if s.session_date >= current_date then
    perform public._notify(array[public._player_user(new.player_id)], new.club_id, 'system',
      'جلسة استشفاء: ' || s.kind, to_char(s.session_date, 'YYYY-MM-DD') || coalesce(' ' || to_char(s.start_time, 'HH24:MI'), '')
      || coalesce(' · ' || s.recommended_minutes || ' دقيقة', '') || coalesce(' · ' || s.recommended_temp_c || '°C', ''), '/', 'normal');
  end if;
  return new;
end $$;
create trigger trg_attendance_notify after insert on public.recovery_attendance for each row execute function public.recovery_attendance_notify();

-- Restriction flags for staff screens (no clinical reason).
create or replace function public.get_recovery_flags(p_club_id uuid, p_date date default current_date)
returns table (player_id uuid, intervention text, level text, instructions text, valid_until date)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.is_staff() and public.has_club_access(p_club_id)) then raise exception 'Not authorized' using errcode = '42501'; end if;
  return query select r.player_id, r.intervention, r.level, r.instructions, r.valid_until
    from public.recovery_restrictions r
   where r.club_id = p_club_id and r.is_active and (r.valid_until is null or r.valid_until >= p_date);
end $$;

-- ---------------------------------------------------------------------
-- 6. Athlete schedule (portal)
-- ---------------------------------------------------------------------
create or replace function public.my_schedule(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare pid uuid := public.current_player_id(); pl public.players;
begin
  if pid is null then raise exception 'No player is linked to this account' using errcode = '42501'; end if;
  select * into pl from public.players where id = pid;
  return jsonb_build_object(
    'training', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'session_date', t.session_date, 'start_time', t.start_time,
        'session_type', t.session_type, 'duration_minutes', t.duration_minutes, 'notes', t.notes) order by t.session_date, t.start_time)
      from public.training_sessions t where t.club_id = pl.club_id and t.session_date between p_from and p_to
       and (t.category is null or t.category = pl.team_category)), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'opponent', m.opponent, 'competition', m.competition, 'match_date', m.match_date,
        'match_time', m.match_time, 'venue', m.venue, 'home_away', m.home_away, 'status', m.status) order by m.match_date, m.match_time)
      from public.matches m where m.club_id = pl.club_id and m.match_date between p_from and p_to + 21 and m.status <> 'Cancelled'
       and (m.category is null or m.category = pl.team_category)), '[]'::jsonb),
    'recovery', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'session_date', s.session_date, 'start_time', s.start_time,
        'recommended_minutes', s.recommended_minutes, 'recommended_temp_c', s.recommended_temp_c, 'protocol', s.protocol,
        'precautions', s.precautions, 'status', a.status) order by s.session_date, s.start_time)
      from public.recovery_attendance a join public.recovery_sessions s on s.id = a.session_id
     where a.player_id = pid and s.session_date between p_from and p_to and s.status <> 'Cancelled'), '[]'::jsonb),
    'plan', coalesce((select jsonb_agg(jsonb_build_object('plan', p.title, 'day_label', i.day_label, 'item_date', i.item_date, 'category', i.category,
        'recommendation', coalesce(nullif(i.player_overrides ->> pid::text, 'EXCLUDED'), i.recommendation)) order by i.item_date, i.sort_order)
      from public.recovery_plan_items i join public.recovery_plans p on p.id = i.plan_id
     where p.club_id = pl.club_id and p.status = 'Approved' and i.item_date between p_from and p_to
       and (p.player_ids is null or pid = any(p.player_ids))
       and coalesce(i.player_overrides ->> pid::text, '') <> 'EXCLUDED'), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
revoke execute on function public._club_of(text, uuid), public.child_club_check(), public._active_restriction(uuid, text, date),
  public.recovery_plan_rules(), public.plan_item_unapprove(), public.recovery_attendance_rules(), public.recovery_attendance_notify()
  from public, anon, authenticated;
revoke execute on function public.can_plan_training(), public.get_recovery_flags(uuid, date), public.my_schedule(date, date) from public, anon;
grant execute on function public.can_plan_training(), public.get_recovery_flags(uuid, date), public.my_schedule(date, date) to authenticated;
