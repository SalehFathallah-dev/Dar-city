-- =====================================================================
-- Migration 12 – Phase 1
--   * Medical cases (athlete complaints) + medical inbox
--   * Confidential disclosure to staff: private / limited / approved
--   * Case messages (private notes, information requests, instructions)
--   * Case attachments in a private storage bucket
--   * Daily wellness questionnaires (pre / post training) + baseline flags
--   * In-app notifications and announcements
-- Existing tables are only extended; no data is removed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
-- Active accounts of a club with one of the given roles.
create or replace function public._club_users(p_club uuid, p_roles public.app_role[])
returns setof uuid language sql stable security definer set search_path = public
as $$
  select pr.id from public.profiles pr
   where pr.is_active and pr.role = any(p_roles)
     and (pr.role = 'super_admin' or exists (select 1 from public.club_members m where m.club_id = p_club and m.user_id = pr.id))
$$;
-- Active athlete account of a player.
create or replace function public._player_user(p_player uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select pr.id from public.profiles pr where pr.player_id = p_player and pr.is_active and pr.role = 'athlete' limit 1 $$;

-- ---------------------------------------------------------------------
-- 1. Notifications
-- ---------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  club_id     uuid references public.clubs (id) on delete cascade,
  kind        text not null check (kind in ('case_new','case_urgent','case_update','case_message','case_shared',
                                            'wellness','announcement','instruction','availability','system')),
  priority    text not null default 'normal' check (priority in ('normal','high','urgent')),
  title       text not null check (char_length(title) between 1 and 200),
  body        text check (char_length(body) <= 2000),
  link        text check (char_length(link) <= 300),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user on public.notifications (user_id, created_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke all on public.notifications from anon;
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public._notify(p_users uuid[], p_club uuid, p_kind text, p_title text, p_body text, p_link text, p_priority text default 'normal')
returns void language sql volatile security definer set search_path = public
as $$
  insert into public.notifications (user_id, club_id, kind, title, body, link, priority)
  select distinct u, p_club, p_kind, left(p_title, 200), left(p_body, 2000), p_link, p_priority
    from unnest(p_users) u where u is not null
$$;

-- Announcements / instructions sent by the physician.
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs (id) on delete cascade,
  kind         text not null check (kind in ('announcement','instruction')),
  title        text not null check (char_length(trim(title)) between 2 and 200),
  body         text not null check (char_length(trim(body)) between 1 and 2000),
  player_ids   uuid[],          -- null = whole team
  include_staff boolean not null default false,
  recipients   integer not null default 0,
  sent_by      uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
alter table public.announcements enable row level security;
grant select on public.announcements to authenticated;
revoke all on public.announcements from anon;
create policy announcements_read on public.announcements for select to authenticated
  using (public.is_clinical() and public.has_club_access(club_id));
create trigger trg_announcements_audit after insert or update or delete on public.announcements
  for each row execute function public.audit_row_change();

create or replace function public.send_announcement(p_club_id uuid, p_kind text, p_title text, p_body text,
                                                    p_player_ids uuid[] default null, p_include_staff boolean default false)
returns public.announcements
language plpgsql volatile security definer set search_path = public
as $$
declare rec public.announcements; users uuid[];
begin
  if not (public.is_physician() and public.has_club_access(p_club_id)) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_kind not in ('announcement','instruction') then raise exception 'Invalid kind' using errcode = '22023'; end if;
  select array_agg(public._player_user(p.id)) into users
    from public.players p where p.club_id = p_club_id and p.status = 'active'
     and (p_player_ids is null or p.id = any(p_player_ids));
  if p_include_staff then
    users := coalesce(users, '{}') || coalesce((select array_agg(u) from public._club_users(p_club_id, array['head_coach','team_manager','assistant_medical_staff']::public.app_role[]) u), '{}');
  end if;
  users := array(select distinct u from unnest(coalesce(users, '{}')) u where u is not null);
  insert into public.announcements (club_id, kind, title, body, player_ids, include_staff, recipients)
  values (p_club_id, p_kind, trim(p_title), trim(p_body), p_player_ids, p_include_staff, cardinality(users))
  returning * into rec;
  perform public._notify(users, p_club_id, p_kind, trim(p_title), trim(p_body), null, case when p_kind = 'instruction' then 'high' else 'normal' end);
  return rec;
end $$;

-- ---------------------------------------------------------------------
-- 2. Medical cases
-- ---------------------------------------------------------------------
create sequence public.case_code_seq start 1;
create table public.medical_cases (
  id                 uuid primary key default gen_random_uuid(),
  case_code          text not null unique default ('CASE-' || lpad(nextval('public.case_code_seq')::text, 5, '0')),
  club_id            uuid not null references public.clubs (id),
  player_id          uuid not null references public.players (id),
  source             text not null default 'athlete' check (source in ('athlete','staff','wellness')),
  category           text not null check (category in ('Muscle pain','Joint pain','Acute injury','Chronic pain','Illness',
                                                       'Fatigue','Swelling','Training-related problem','Other')),
  body_locations     jsonb not null default '[]'::jsonb check (jsonb_typeof(body_locations) = 'array' and jsonb_array_length(body_locations) <= 20),
  onset_at           timestamptz,
  pain_score         integer check (pain_score between 0 and 10),
  how_started        text check (char_length(how_started) <= 1000),
  context            text check (context in ('Training','Competition','Outside sport','Unknown')),
  can_continue       boolean,
  affects_movement   boolean,
  description        text check (char_length(description) <= 4000),
  athlete_urgent     boolean not null default false,
  priority           text not null default 'Routine' check (priority in ('Routine','Priority','Urgent')),
  status             text not null default 'New' check (status in ('New','Under Review','Information Requested','Examination Scheduled','In Treatment','Closed')),
  diagnosis          text,
  injury_id          uuid references public.injuries (id) on delete set null,
  examination_id     uuid references public.medical_examinations (id) on delete set null,
  -- disclosure to coaching staff (decided by the physician)
  visibility         text not null default 'private' check (visibility in ('private','limited','approved')),
  staff_status       text check (staff_status in ('Available','Modified training','Unavailable','Medical assessment pending')),
  shared_summary     text check (char_length(shared_summary) <= 2000),
  shared_at          timestamptz,
  shared_by          uuid,
  closed_at          timestamptz,
  closed_by          uuid,
  created_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid default auth.uid(),
  check (visibility = 'private' or staff_status is not null)
);
create index medical_cases_club_status on public.medical_cases (club_id, status, created_at desc);
create index medical_cases_player on public.medical_cases (player_id, created_at desc);

create trigger trg_00_club_medical_cases before insert or update on public.medical_cases
  for each row execute function public.set_club_from_parent('player');
create trigger trg_medical_cases_updated before update on public.medical_cases
  for each row execute function public.set_updated_fields();
create trigger trg_medical_cases_audit after insert or update or delete on public.medical_cases
  for each row execute function public.audit_row_change();

-- Disclosure log: every change of what the staff may see.
create table public.case_disclosures (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references public.medical_cases (id) on delete cascade,
  club_id        uuid not null references public.clubs (id),
  visibility     text not null,
  staff_status   text,
  shared_summary text,
  authorized_by  uuid,
  created_at     timestamptz not null default now()
);
create index case_disclosures_case on public.case_disclosures (case_id, created_at desc);
alter table public.case_disclosures enable row level security;
grant select on public.case_disclosures to authenticated;
revoke all on public.case_disclosures from anon;
create policy case_disclosures_read on public.case_disclosures for select to authenticated
  using (public.is_clinical() and public.has_club_access(club_id));

create or replace function public.medical_case_rules()
returns trigger language plpgsql security definer set search_path = public
as $$
declare pname text; staff uuid[];
begin
  if tg_op = 'UPDATE' then
    -- Only the physician decides what the staff may see.
    if (new.visibility, new.staff_status, new.shared_summary) is distinct from (old.visibility, old.staff_status, old.shared_summary) then
      if auth.uid() is not null and not public.is_physician() then
        raise exception 'Only the team physician can change what is shared with staff' using errcode = '42501';
      end if;
      if new.visibility <> 'approved' then new.shared_summary := null; end if;
      if new.visibility = 'private' then new.staff_status := null; end if;
      new.shared_at := case when new.visibility = 'private' then null else now() end;
      new.shared_by := case when new.visibility = 'private' then null else auth.uid() end;
    end if;
    if new.status = 'Closed' and old.status <> 'Closed' then new.closed_at := now(); new.closed_by := auth.uid(); end if;
    if new.status <> 'Closed' then new.closed_at := null; new.closed_by := null; end if;
  else
    if new.visibility <> 'approved' then new.shared_summary := null; end if;
  end if;
  return new;
end $$;
create trigger trg_medical_cases_rules before insert or update on public.medical_cases
  for each row execute function public.medical_case_rules();

create or replace function public.medical_case_after()
returns trigger language plpgsql security definer set search_path = public
as $$
declare pname text; athlete uuid; clinical uuid[]; staff uuid[]; urgent boolean;
begin
  select full_name into pname from public.players where id = new.player_id;
  athlete := public._player_user(new.player_id);
  if tg_op = 'INSERT' then
    clinical := array(select public._club_users(new.club_id, array['team_physician','assistant_medical_staff']::public.app_role[]));
    urgent := new.athlete_urgent or coalesce(new.pain_score, 0) >= 8 or new.priority = 'Urgent';
    perform public._notify(clinical, new.club_id, case when urgent then 'case_urgent' else 'case_new' end,
      case when urgent then '🚨 URGENT complaint – ' else 'New medical complaint – ' end || pname,
      new.category || coalesce(' · pain ' || new.pain_score || '/10', '') || ' · ' || new.case_code,
      '/inbox/' || new.id, case when urgent then 'urgent' else 'high' end);
    if new.visibility <> 'private' then
      insert into public.case_disclosures (case_id, club_id, visibility, staff_status, shared_summary, authorized_by)
      values (new.id, new.club_id, new.visibility, new.staff_status, new.shared_summary, auth.uid());
    end if;
    return new;
  end if;
  -- UPDATE
  if (new.visibility, new.staff_status, new.shared_summary) is distinct from (old.visibility, old.staff_status, old.shared_summary) then
    insert into public.case_disclosures (case_id, club_id, visibility, staff_status, shared_summary, authorized_by)
    values (new.id, new.club_id, new.visibility, new.staff_status, new.shared_summary, auth.uid());
    if new.visibility <> 'private' then
      staff := array(select public._club_users(new.club_id, array['head_coach','team_manager']::public.app_role[]));
      perform public._notify(staff, new.club_id, 'case_shared', 'Medical update – ' || pname,
        coalesce(new.staff_status, '') || case when new.visibility = 'approved' and new.shared_summary is not null then ' · ' || left(new.shared_summary, 300) else '' end,
        '/team-status', 'normal');
    end if;
  end if;
  if new.status is distinct from old.status then
    perform public._notify(array[athlete], new.club_id, 'case_update', 'تحديث على بلاغك الطبي ' || new.case_code,
      'الحالة: ' || new.status, '/', 'normal');
  end if;
  if new.priority = 'Urgent' and old.priority <> 'Urgent' then
    perform public._notify(array[athlete], new.club_id, 'case_urgent', 'تواصل مع الطبيب فوراً',
      'صنّف الطبيب بلاغك ' || new.case_code || ' كحالة عاجلة. اتصل بالطبيب مباشرة، وفي حالة الخطر اتصل بالإسعاف.', '/', 'urgent');
  end if;
  return new;
end $$;
create trigger trg_medical_cases_after after insert or update on public.medical_cases
  for each row execute function public.medical_case_after();

alter table public.medical_cases enable row level security;
grant select, insert, update on public.medical_cases to authenticated;
revoke all on public.medical_cases from anon;
create policy medical_cases_read on public.medical_cases for select to authenticated
  using (public.is_clinical() and public.has_club_access(club_id));
create policy medical_cases_insert on public.medical_cases for insert to authenticated
  with check (public.is_clinical() and public.has_club_access(club_id));
create policy medical_cases_update on public.medical_cases for update to authenticated
  using (public.is_clinical() and public.has_club_access(club_id))
  with check (public.is_clinical() and public.has_club_access(club_id));

-- Messages on a case
create table public.case_messages (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.medical_cases (id) on delete cascade,
  club_id     uuid not null references public.clubs (id),
  kind        text not null check (kind in ('private_note','request_info','instruction','athlete_reply')),
  body        text not null check (char_length(trim(body)) between 1 and 4000),
  author_id   uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index case_messages_case on public.case_messages (case_id, created_at);
create or replace function public.case_message_rules()
returns trigger language plpgsql security definer set search_path = public
as $$
declare c public.medical_cases; pname text;
begin
  select * into c from public.medical_cases where id = new.case_id;
  if c.id is null then raise exception 'Case not found' using errcode = '23503'; end if;
  new.club_id := c.club_id;
  new.body := trim(new.body);
  return new;
end $$;
create trigger trg_case_messages_rules before insert on public.case_messages
  for each row execute function public.case_message_rules();
create or replace function public.case_message_after()
returns trigger language plpgsql security definer set search_path = public
as $$
declare c public.medical_cases; pname text;
begin
  select * into c from public.medical_cases where id = new.case_id;
  select full_name into pname from public.players where id = c.player_id;
  if new.kind in ('request_info','instruction') then
    perform public._notify(array[public._player_user(c.player_id)], c.club_id, 'case_message',
      case when new.kind = 'request_info' then 'الطبيب يطلب معلومات إضافية – ' else 'تعليمات من الطبيب – ' end || c.case_code,
      left(new.body, 500), '/', 'high');
    if new.kind = 'request_info' and c.status not in ('Closed') then
      update public.medical_cases set status = 'Information Requested' where id = c.id and status in ('New','Under Review');
    end if;
  elsif new.kind = 'athlete_reply' then
    perform public._notify(array(select public._club_users(c.club_id, array['team_physician','assistant_medical_staff']::public.app_role[])),
      c.club_id, 'case_message', 'Reply from ' || pname || ' – ' || c.case_code, left(new.body, 500), '/inbox/' || c.id, 'high');
  end if;
  return new;
end $$;
create trigger trg_case_messages_after after insert on public.case_messages
  for each row execute function public.case_message_after();
create trigger trg_case_messages_audit after insert or update or delete on public.case_messages
  for each row execute function public.audit_row_change();
alter table public.case_messages enable row level security;
grant select, insert on public.case_messages to authenticated;
revoke all on public.case_messages from anon;
create policy case_messages_read on public.case_messages for select to authenticated
  using (public.is_clinical() and public.has_club_access(club_id));
create policy case_messages_insert on public.case_messages for insert to authenticated
  with check (public.is_clinical() and kind <> 'athlete_reply' and author_id = auth.uid()
              and exists (select 1 from public.medical_cases c where c.id = case_id and public.has_club_access(c.club_id)));

-- Attachments (files in the private bucket "case-attachments": <player_id>/<case_id>/<file>)
create table public.case_files (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.medical_cases (id) on delete cascade,
  club_id      uuid not null references public.clubs (id),
  file_path    text not null unique,
  file_name    text not null check (char_length(file_name) <= 200),
  mime_type    text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/heic','application/pdf','video/mp4','video/quicktime')),
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 26214400),
  uploaded_by  uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index case_files_case on public.case_files (case_id);
create trigger trg_case_files_audit after insert or update or delete on public.case_files
  for each row execute function public.audit_row_change();
alter table public.case_files enable row level security;
grant select on public.case_files to authenticated;
revoke all on public.case_files from anon;
create policy case_files_read on public.case_files for select to authenticated
  using (public.is_clinical() and public.has_club_access(club_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-attachments', 'case-attachments', false, 26214400,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf','video/mp4','video/quicktime'])
on conflict (id) do nothing;

create or replace function public.storage_case_access(p_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare pid uuid; cid uuid; c public.medical_cases;
begin
  begin
    pid := split_part(p_name, '/', 1)::uuid; cid := split_part(p_name, '/', 2)::uuid;
  exception when others then return false; end;
  select * into c from public.medical_cases where id = cid and player_id = pid;
  if c.id is null then return false; end if;
  return pid = public.current_player_id() or (public.is_clinical() and public.has_club_access(c.club_id));
end $$;
create policy "case files read" on storage.objects for select to authenticated
  using (bucket_id = 'case-attachments' and public.storage_case_access(name));
create policy "case files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'case-attachments' and public.storage_case_access(name));

-- Register an uploaded file on a case (athlete for own open case; clinical staff).
create or replace function public.add_case_file(p_case_id uuid, p_path text, p_file_name text, p_mime text, p_size integer)
returns public.case_files
language plpgsql volatile security definer set search_path = public
as $$
declare c public.medical_cases; rec public.case_files;
begin
  select * into c from public.medical_cases where id = p_case_id;
  if c.id is null then raise exception 'Case not found' using errcode = '23503'; end if;
  if not coalesce((c.player_id = public.current_player_id() and c.status <> 'Closed')
                  or (public.is_clinical() and public.has_club_access(c.club_id)), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_path not like c.player_id::text || '/' || c.id::text || '/%' then raise exception 'Invalid file path' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'case-attachments' and o.name = p_path) then
    raise exception 'File was not uploaded' using errcode = '23503';
  end if;
  insert into public.case_files (case_id, club_id, file_path, file_name, mime_type, size_bytes)
  values (c.id, c.club_id, p_path, left(p_file_name, 200), p_mime, p_size) returning * into rec;
  return rec;
end $$;

-- ---------------------------------------------------------------------
-- 3. Athlete side of cases
-- ---------------------------------------------------------------------
create or replace function public.submit_medical_case(p_case jsonb)
returns public.medical_cases
language plpgsql volatile security definer set search_path = public
as $$
declare pid uuid := public.current_player_id(); rec public.medical_cases;
begin
  if pid is null then raise exception 'No player is linked to this account' using errcode = '42501'; end if;
  insert into public.medical_cases (club_id, player_id, source, category, body_locations, onset_at, pain_score, how_started,
                                    context, can_continue, affects_movement, description, athlete_urgent, status, priority)
  values ((select club_id from public.players where id = pid), pid, 'athlete', p_case ->> 'category',
          coalesce(p_case -> 'body_locations', '[]'::jsonb), nullif(p_case ->> 'onset_at', '')::timestamptz,
          nullif(p_case ->> 'pain_score', '')::int, nullif(trim(p_case ->> 'how_started'), ''),
          nullif(p_case ->> 'context', ''), (p_case ->> 'can_continue')::boolean, (p_case ->> 'affects_movement')::boolean,
          nullif(trim(p_case ->> 'description'), ''), coalesce((p_case ->> 'athlete_urgent')::boolean, false), 'New', 'Routine')
  returning * into rec;
  return rec;
end $$;

create or replace function public.athlete_case_reply(p_case_id uuid, p_body text)
returns void language plpgsql volatile security definer set search_path = public
as $$
declare c public.medical_cases;
begin
  select * into c from public.medical_cases where id = p_case_id;
  if c.id is null or c.player_id is distinct from public.current_player_id() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if c.status = 'Closed' then raise exception 'This case is closed' using errcode = '23514'; end if;
  insert into public.case_messages (case_id, kind, body) values (c.id, 'athlete_reply', p_body);
  if c.status = 'Information Requested' then update public.medical_cases set status = 'Under Review' where id = c.id; end if;
end $$;

-- The athlete's own cases: no private notes, no diagnosis unless the physician sends it as an instruction.
create or replace function public.my_cases()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare pid uuid := public.current_player_id();
begin
  if pid is null then raise exception 'No player is linked to this account' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'case_code', c.case_code, 'category', c.category, 'body_locations', c.body_locations, 'pain_score', c.pain_score,
      'status', c.status, 'priority', c.priority, 'created_at', c.created_at, 'description', c.description,
      'messages', coalesce((select jsonb_agg(jsonb_build_object('kind', m.kind, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
                             from public.case_messages m where m.case_id = c.id and m.kind <> 'private_note'), '[]'::jsonb),
      'files', coalesce((select jsonb_agg(jsonb_build_object('file_name', f.file_name, 'file_path', f.file_path, 'mime_type', f.mime_type))
                          from public.case_files f where f.case_id = c.id), '[]'::jsonb)
    ) order by c.created_at desc) from public.medical_cases c where c.player_id = pid), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 4. Staff view of shared case information (never private cases)
-- ---------------------------------------------------------------------
create or replace function public.get_staff_case_board(p_club_id uuid)
returns table (case_id uuid, player_id uuid, full_name text, jersey_number integer, staff_status text, shared_summary text,
               shared_at timestamptz, case_status text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_staff() or not public.has_club_access(p_club_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  return query
  select c.id, p.id, p.full_name, p.jersey_number, c.staff_status,
         case when c.visibility = 'approved' then c.shared_summary end, c.shared_at,
         case when c.status = 'Closed' then 'Closed' else 'Open' end
    from public.medical_cases c join public.players p on p.id = c.player_id
   where c.club_id = p_club_id and c.visibility in ('limited','approved')
     and (c.status <> 'Closed' or c.closed_at >= now() - interval '14 days')
   order by c.shared_at desc;
end $$;

-- ---------------------------------------------------------------------
-- 5. Wellness questionnaires
-- ---------------------------------------------------------------------
create table public.wellness_settings (
  club_id            uuid primary key references public.clubs (id) on delete cascade,
  pre_enabled        boolean not null default false,
  post_enabled       boolean not null default false,
  reminder_time      text not null default '09:00' check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  baseline_days      integer not null default 28 check (baseline_days between 7 and 120),
  min_baseline       integer not null default 5 check (min_baseline between 3 and 60),
  fatigue_rise       numeric(3,1) not null default 2 check (fatigue_rise between 0.5 and 9),
  soreness_rise      numeric(3,1) not null default 2 check (soreness_rise between 0.5 and 9),
  readiness_drop     numeric(3,1) not null default 2 check (readiness_drop between 0.5 and 9),
  sleep_drop         numeric(3,1) not null default 1.5 check (sleep_drop between 0.5 and 8),
  sleep_min          numeric(3,1) not null default 6 check (sleep_min between 3 and 10),
  high_score         integer not null default 8 check (high_score between 5 and 10),
  missed_days        integer not null default 2 check (missed_days between 1 and 14),
  updated_at         timestamptz not null default now(),
  updated_by         uuid default auth.uid()
);
create trigger trg_wellness_settings_updated before update on public.wellness_settings
  for each row execute function public.set_updated_fields();
create trigger trg_wellness_settings_audit after insert or update or delete on public.wellness_settings
  for each row execute function public.audit_row_change();
alter table public.wellness_settings enable row level security;
grant select, insert, update on public.wellness_settings to authenticated;
revoke all on public.wellness_settings from anon;
create policy wellness_settings_read on public.wellness_settings for select to authenticated using (public.has_club_access(club_id));
create policy wellness_settings_insert on public.wellness_settings for insert to authenticated
  with check (public.is_physician() and public.has_club_access(club_id));
create policy wellness_settings_update on public.wellness_settings for update to authenticated
  using (public.is_physician() and public.has_club_access(club_id)) with check (public.is_physician() and public.has_club_access(club_id));

create table public.wellness_responses (
  id                 uuid primary key default gen_random_uuid(),
  club_id            uuid not null references public.clubs (id),
  player_id          uuid not null references public.players (id) on delete cascade,
  kind               text not null check (kind in ('pre','post')),
  response_date      date not null,
  session_type       text not null default 'Day' check (session_type in ('Day','Morning training','Evening training','Gym','Conditioning','Recovery','Match')),
  -- pre-training
  sleep_hours        numeric(3,1) check (sleep_hours between 0 and 16),
  sleep_quality      integer check (sleep_quality between 1 and 5),
  fatigue            integer check (fatigue between 1 and 10),
  soreness           integer check (soreness between 1 and 10),
  energy             integer check (energy between 1 and 10),
  readiness          integer check (readiness between 1 and 10),
  unwell             boolean,
  illness_symptoms   text check (char_length(illness_symptoms) <= 500),
  pain               boolean,
  pain_location      text check (char_length(pain_location) <= 200),
  pain_severity      integer check (pain_severity between 0 and 10),
  pain_duration      text check (char_length(pain_duration) <= 100),
  pain_new           boolean,
  movement_affected  boolean,
  -- post-training
  rpe                integer check (rpe between 1 and 10),
  duration_minutes   integer check (duration_minutes between 1 and 600),
  session_load       integer generated always as (rpe * duration_minutes) stored,
  completed_full     boolean,
  unusual_symptoms   text check (char_length(unusual_symptoms) <= 500),
  notes              text check (char_length(notes) <= 1000),
  submitted_by       uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (player_id, response_date, kind, session_type),
  check (kind = 'post' or (sleep_hours is not null and sleep_quality is not null and fatigue is not null and soreness is not null
                           and energy is not null and readiness is not null and unwell is not null and pain is not null)),
  check (kind = 'pre' or (rpe is not null and duration_minutes is not null and fatigue is not null and soreness is not null
                          and pain is not null and completed_full is not null))
);
create index wellness_player_date on public.wellness_responses (player_id, response_date desc);
create index wellness_club_date on public.wellness_responses (club_id, response_date desc);
create trigger trg_00_club_wellness before insert or update on public.wellness_responses
  for each row execute function public.set_club_from_parent('player');
alter table public.wellness_responses enable row level security;
grant select on public.wellness_responses to authenticated;
revoke all on public.wellness_responses from anon;
create policy wellness_read on public.wellness_responses for select to authenticated
  using (public.is_clinical() and public.has_club_access(club_id));

-- Athlete submits (or corrects, same day) a questionnaire.
create or replace function public.submit_wellness(p_kind text, p_date date, p_session_type text, p jsonb)
returns public.wellness_responses
language plpgsql volatile security definer set search_path = public
as $$
declare pid uuid := public.current_player_id(); rec public.wellness_responses; c public.medical_cases; pname text; clinical uuid[]; cl uuid;
begin
  if pid is null then raise exception 'No player is linked to this account' using errcode = '42501'; end if;
  if p_date > current_date + 1 or p_date < current_date - 2 then raise exception 'Questionnaires can be completed for today only' using errcode = '23514'; end if;
  insert into public.wellness_responses as w (club_id, player_id, kind, response_date, session_type, sleep_hours, sleep_quality, fatigue, soreness,
      energy, readiness, unwell, illness_symptoms, pain, pain_location, pain_severity, pain_duration, pain_new, movement_affected,
      rpe, duration_minutes, completed_full, unusual_symptoms, notes)
  values ((select club_id from public.players where id = pid), pid, p_kind, p_date, coalesce(nullif(p_session_type, ''), 'Day'),
      nullif(p ->> 'sleep_hours', '')::numeric, nullif(p ->> 'sleep_quality', '')::int, nullif(p ->> 'fatigue', '')::int,
      nullif(p ->> 'soreness', '')::int, nullif(p ->> 'energy', '')::int, nullif(p ->> 'readiness', '')::int,
      (p ->> 'unwell')::boolean, nullif(trim(p ->> 'illness_symptoms'), ''), (p ->> 'pain')::boolean, nullif(trim(p ->> 'pain_location'), ''),
      nullif(p ->> 'pain_severity', '')::int, nullif(trim(p ->> 'pain_duration'), ''), (p ->> 'pain_new')::boolean,
      (p ->> 'movement_affected')::boolean, nullif(p ->> 'rpe', '')::int, nullif(p ->> 'duration_minutes', '')::int,
      (p ->> 'completed_full')::boolean, nullif(trim(p ->> 'unusual_symptoms'), ''), nullif(trim(p ->> 'notes'), ''))
  on conflict (player_id, response_date, kind, session_type) do update set
      sleep_hours = excluded.sleep_hours, sleep_quality = excluded.sleep_quality, fatigue = excluded.fatigue, soreness = excluded.soreness,
      energy = excluded.energy, readiness = excluded.readiness, unwell = excluded.unwell, illness_symptoms = excluded.illness_symptoms,
      pain = excluded.pain, pain_location = excluded.pain_location, pain_severity = excluded.pain_severity, pain_duration = excluded.pain_duration,
      pain_new = excluded.pain_new, movement_affected = excluded.movement_affected, rpe = excluded.rpe, duration_minutes = excluded.duration_minutes,
      completed_full = excluded.completed_full, unusual_symptoms = excluded.unusual_symptoms, notes = excluded.notes, updated_at = now()
  returning * into rec;
  -- Pain, illness or severe pain is brought to the medical team's attention immediately.
  if rec.pain or rec.unwell or coalesce(rec.pain_severity, 0) >= 7 or rec.unusual_symptoms is not null then
    select full_name, club_id into pname, cl from public.players where id = pid;
    clinical := array(select public._club_users(cl, array['team_physician','assistant_medical_staff']::public.app_role[]));
    perform public._notify(clinical, cl, 'wellness',
      'Wellness alert – ' || pname,
      concat_ws(' · ', case when rec.pain then 'pain' || coalesce(' ' || rec.pain_severity || '/10', '') || coalesce(' (' || rec.pain_location || ')', '') end,
                case when rec.unwell then 'feels unwell' end, rec.unusual_symptoms) || ' – decision support, needs clinical review',
      '/wellness', case when coalesce(rec.pain_severity, 0) >= 7 then 'high' else 'normal' end);
  end if;
  return rec;
end $$;

create or replace function public.my_wellness(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare pid uuid := public.current_player_id(); s public.wellness_settings;
begin
  if pid is null then raise exception 'No player is linked to this account' using errcode = '42501'; end if;
  select * into s from public.wellness_settings where club_id = (select club_id from public.players where id = pid);
  return jsonb_build_object(
    'settings', jsonb_build_object('pre_enabled', coalesce(s.pre_enabled, false), 'post_enabled', coalesce(s.post_enabled, false), 'reminder_time', coalesce(s.reminder_time, '09:00')),
    'responses', coalesce((select jsonb_agg(to_jsonb(w) - 'club_id' - 'submitted_by' order by w.response_date desc, w.created_at desc)
                           from public.wellness_responses w where w.player_id = pid and w.response_date between p_from and p_to), '[]'::jsonb));
end $$;

-- Decision-support flags: each athlete compared with his own recent baseline.
-- These are NOT diagnoses or injury predictions – they require clinical interpretation.
create or replace function public.get_wellness_flags(p_club_id uuid, p_date date default current_date)
returns table (player_id uuid, full_name text, flag text, detail text, value numeric, baseline numeric)
language plpgsql stable security definer set search_path = public
as $$
declare s public.wellness_settings;
begin
  if not (public.is_clinical() and public.has_club_access(p_club_id)) then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into s from public.wellness_settings where club_id = p_club_id;
  if s.club_id is null then
    s.baseline_days := 28; s.min_baseline := 5; s.fatigue_rise := 2; s.soreness_rise := 2; s.readiness_drop := 2;
    s.sleep_drop := 1.5; s.sleep_min := 6; s.high_score := 8; s.missed_days := 2; s.pre_enabled := false;
  end if;
  return query
  with pl as (select p.id, p.full_name from public.players p where p.club_id = p_club_id and p.status = 'active'),
  today as (select w.* from public.wellness_responses w join pl on pl.id = w.player_id where w.kind = 'pre' and w.response_date = p_date),
  base as (
    select w.player_id, count(*) n, avg(w.fatigue) fatigue, avg(w.soreness) soreness, avg(w.readiness) readiness, avg(w.sleep_hours) sleep
      from public.wellness_responses w join pl on pl.id = w.player_id
     where w.kind = 'pre' and w.response_date >= p_date - s.baseline_days and w.response_date < p_date
     group by w.player_id),
  f as (
    select t.player_id, 'High fatigue'::text flag, 'Fatigue ' || t.fatigue || '/10' || coalesce(' (usual ' || round(b.fatigue, 1) || ')', '') detail,
           t.fatigue::numeric v, round(b.fatigue, 1) bl
      from today t left join base b on b.player_id = t.player_id and b.n >= s.min_baseline
     where t.fatigue >= s.high_score or (b.player_id is not null and t.fatigue - b.fatigue >= s.fatigue_rise)
    union all
    select t.player_id, 'Increased soreness', 'Soreness ' || t.soreness || '/10' || coalesce(' (usual ' || round(b.soreness, 1) || ')', ''),
           t.soreness, round(b.soreness, 1)
      from today t left join base b on b.player_id = t.player_id and b.n >= s.min_baseline
     where t.soreness >= s.high_score or (b.player_id is not null and t.soreness - b.soreness >= s.soreness_rise)
    union all
    select t.player_id, 'Reduced sleep', t.sleep_hours || ' h sleep' || coalesce(' (usual ' || round(b.sleep, 1) || ' h)', ''),
           t.sleep_hours, round(b.sleep, 1)
      from today t left join base b on b.player_id = t.player_id and b.n >= s.min_baseline
     where t.sleep_hours < s.sleep_min or (b.player_id is not null and b.sleep - t.sleep_hours >= s.sleep_drop)
    union all
    select t.player_id, 'Declining readiness', 'Readiness ' || t.readiness || '/10' || coalesce(' (usual ' || round(b.readiness, 1) || ')', ''),
           t.readiness, round(b.readiness, 1)
      from today t left join base b on b.player_id = t.player_id and b.n >= s.min_baseline
     where t.readiness <= 3 or (b.player_id is not null and b.readiness - t.readiness >= s.readiness_drop)
    union all
    select t.player_id, case when t.pain_new then 'New pain' else 'Pain reported' end,
           concat_ws(' · ', t.pain_location, case when t.pain_severity is not null then t.pain_severity || '/10' end,
                     case when t.movement_affected then 'movement affected' end), t.pain_severity, null
      from today t where t.pain
    union all
    select t.player_id, 'Illness symptoms', coalesce(t.illness_symptoms, 'feels unwell'), null, null from today t where t.unwell
    union all
    select w.player_id, 'New pain after training', concat_ws(' · ', w.session_type, w.unusual_symptoms), null, null
      from public.wellness_responses w join pl on pl.id = w.player_id
     where w.kind = 'post' and w.response_date = p_date and (w.pain or w.unusual_symptoms is not null)
    union all
    select pl.id, 'Missed questionnaires', 'No pre-training questionnaire for ' || s.missed_days || ' day(s)', null, null
      from pl
     where s.pre_enabled and public._player_user(pl.id) is not null
       and not exists (select 1 from public.wellness_responses w where w.player_id = pl.id and w.kind = 'pre'
                        and w.response_date > p_date - s.missed_days and w.response_date <= p_date)
  )
  select f.player_id, pl.full_name, f.flag, f.detail, f.v, f.bl from f join pl on pl.id = f.player_id
   order by pl.full_name, f.flag;
end $$;

-- ---------------------------------------------------------------------
-- 6. Audit: record views of confidential records
-- ---------------------------------------------------------------------
create or replace function public.log_event(p_action text, p_record_type text, p_record_id text default null, p_details jsonb default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.is_staff() or (public.current_player_id() is not null and p_action in ('LOGIN','LOGOUT'))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_action not in ('LOGIN','LOGOUT','EXPORT_CSV','EXPORT_PDF','BACKUP_EXPORT','VIEW_DOCUMENT','PRINT','VIEW_CASE','VIEW_CASE_FILE','VIEW_WELLNESS') then
    raise exception 'Unsupported audit action %', p_action;
  end if;
  insert into public.audit_logs (user_id, action, record_type, record_id, new_values)
  values (auth.uid(), p_action, left(p_record_type, 80), left(p_record_id, 120), p_details);
end $$;

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
revoke execute on function
  public._club_users(uuid, public.app_role[]), public._player_user(uuid),
  public._notify(uuid[], uuid, text, text, text, text, text),
  public.medical_case_rules(), public.medical_case_after(), public.case_message_rules(), public.case_message_after()
  from public, anon, authenticated;
revoke execute on function
  public.send_announcement(uuid, text, text, text, uuid[], boolean), public.storage_case_access(text),
  public.add_case_file(uuid, text, text, text, integer), public.submit_medical_case(jsonb), public.athlete_case_reply(uuid, text),
  public.my_cases(), public.get_staff_case_board(uuid), public.submit_wellness(text, date, text, jsonb),
  public.my_wellness(date, date), public.get_wellness_flags(uuid, date)
  from public, anon;
grant execute on function
  public.send_announcement(uuid, text, text, text, uuid[], boolean), public.storage_case_access(text),
  public.add_case_file(uuid, text, text, text, integer), public.submit_medical_case(jsonb), public.athlete_case_reply(uuid, text),
  public.my_cases(), public.get_staff_case_board(uuid), public.submit_wellness(text, date, text, jsonb),
  public.my_wellness(date, date), public.get_wellness_flags(uuid, date)
  to authenticated;
