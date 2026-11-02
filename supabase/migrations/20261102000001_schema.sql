-- =====================================================================
-- DAR CITY BASKETBALL TEAM – TEAM MEDICAL MANAGEMENT SYSTEM
-- Migration 1: Core schema (tables, constraints, indexes, sequences)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
create type public.app_role as enum (
  'super_admin',
  'team_physician',
  'assistant_medical_staff',
  'team_manager',
  'head_coach'
);

create table public.roles (
  code        public.app_role primary key,
  name        text not null,
  description text not null
);

insert into public.roles (code, name, description) values
  ('super_admin', 'Super Administrator', 'Manages users, application settings, team registration and access permissions.'),
  ('team_physician', 'Team Physician', 'Full access to all medical records, examinations, injuries, rehabilitation, clearance and reports.'),
  ('assistant_medical_staff', 'Assistant Medical Staff', 'Reads medical records and adds follow-up notes, treatments and rehabilitation sessions.'),
  ('team_manager', 'Team Manager', 'Views player registration information and approved availability. No confidential medical data.'),
  ('head_coach', 'Head Coach', 'Views player availability, training restrictions and return-to-training status only.');

-- ---------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 120),
  email       text,
  title       text,
  role        public.app_role references public.roles (code),
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ---------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------
create table public.team_seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 2 and 40),
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint season_dates_valid check (end_date > start_date)
);
create unique index team_seasons_one_current on public.team_seasons (is_current) where is_current;

-- ---------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------
create sequence public.player_code_seq start 1;

create table public.players (
  id                 uuid primary key default gen_random_uuid(),
  player_code        text not null unique default ('DCB-' || lpad(nextval('public.player_code_seq')::text, 4, '0')),
  full_name          text not null check (char_length(trim(full_name)) between 2 and 120),
  date_of_birth      date not null check (date_of_birth > date '1940-01-01'),
  nationality        text,
  photo_path         text,
  phone              text check (phone is null or phone ~ '^[0-9+() -]{6,25}$'),
  email              text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address            text,
  jersey_number      integer check (jersey_number between 0 and 99),
  position           text not null check (position in ('Point Guard','Shooting Guard','Small Forward','Power Forward','Center')),
  height_cm          numeric(5,1) check (height_cm between 120 and 250),
  weight_kg          numeric(5,1) check (weight_kg between 35 and 200),
  bmi                numeric(4,1) generated always as (
                       case when height_cm > 0 and weight_kg > 0
                            then round(weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)), 1) end
                     ) stored,
  dominant_hand      text check (dominant_hand in ('Right','Left','Both')),
  team_category      text not null default 'Senior Men',
  registration_date  date not null default current_date,
  season_id          uuid references public.team_seasons (id),
  status             text not null default 'active' check (status in ('active','inactive','archived')),
  archived_at        timestamptz,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);
-- No duplicate jersey numbers within the same active roster
create unique index players_unique_active_jersey
  on public.players (team_category, jersey_number)
  where status = 'active' and jersey_number is not null;
create index players_status_idx on public.players (status);
create index players_name_idx on public.players (lower(full_name));

create table public.player_emergency_contacts (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players (id) on delete cascade,
  contact_name  text not null check (char_length(contact_name) between 2 and 120),
  relationship  text,
  phone         text not null check (phone ~ '^[0-9+() -]{6,25}$'),
  is_primary    boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index emergency_contacts_player_idx on public.player_emergency_contacts (player_id);

-- ---------------------------------------------------------------------
-- Medical history (versioned – every update creates a new version)
-- ---------------------------------------------------------------------
create table public.medical_histories (
  id                         uuid primary key default gen_random_uuid(),
  player_id                  uuid not null references public.players (id),
  version                    integer not null default 1,
  is_current                 boolean not null default true,
  previous_conditions        text,
  chronic_diseases           text,
  previous_injuries          text,
  previous_surgeries         text,
  drug_allergies             text,
  food_allergies             text,
  current_medications        text,
  previous_hospitalizations  text,
  family_history             text,
  relevant_information       text,
  physician_notes            text,
  change_reason              text,
  created_at                 timestamptz not null default now(),
  created_by                 uuid default auth.uid(),
  unique (player_id, version)
);
create unique index medical_histories_one_current on public.medical_histories (player_id) where is_current;

-- ---------------------------------------------------------------------
-- Medical examinations
-- ---------------------------------------------------------------------
create sequence public.exam_code_seq start 1;

create table public.medical_examinations (
  id                      uuid primary key default gen_random_uuid(),
  exam_code               text not null unique default ('EXM-' || lpad(nextval('public.exam_code_seq')::text, 5, '0')),
  player_id               uuid not null references public.players (id),
  season_id               uuid references public.team_seasons (id),
  examination_date        date not null,
  physician_name          text not null,
  examination_type        text not null check (examination_type in ('Pre-Season','Periodic','Post-Injury','Return-to-Play','Other')),
  -- vital signs
  bp_systolic             integer check (bp_systolic between 60 and 260),
  bp_diastolic            integer check (bp_diastolic between 30 and 160),
  heart_rate              integer check (heart_rate between 25 and 230),
  respiratory_rate        integer check (respiratory_rate between 5 and 60),
  temperature_c           numeric(3,1) check (temperature_c between 30 and 43),
  oxygen_saturation       integer check (oxygen_saturation between 50 and 100),
  height_cm               numeric(5,1) check (height_cm between 120 and 250),
  weight_kg               numeric(5,1) check (weight_kg between 35 and 200),
  bmi                     numeric(4,1) generated always as (
                            case when height_cm > 0 and weight_kg > 0
                                 then round(weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)), 1) end
                          ) stored,
  -- investigations
  laboratory_tests        text,
  ecg                     text,
  xray                    text,
  mri                     text,
  ultrasound              text,
  other_investigations    text,
  -- final assessment
  clinical_summary        text,
  identified_problems     text,
  recommendations         text,
  further_investigations  text,
  follow_up_date          date,
  -- clearance (decided and documented by the physician – never automatic)
  clearance_status        text check (clearance_status in ('Cleared for Full Participation','Cleared with Restrictions','Temporarily Not Cleared','Further Evaluation Required')),
  clearance_restrictions  text,
  physician_signature     text,
  signed_at               timestamptz,
  is_archived             boolean not null default false,
  is_demo                 boolean not null default false,
  created_at              timestamptz not null default now(),
  created_by              uuid default auth.uid(),
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  constraint exam_bp_pair check ((bp_systolic is null) = (bp_diastolic is null)),
  constraint exam_bp_order check (bp_systolic is null or bp_systolic > bp_diastolic),
  constraint exam_clearance_signed check (clearance_status is null or (physician_signature is not null and char_length(trim(physician_signature)) > 1))
);
create index medical_examinations_player_idx on public.medical_examinations (player_id, examination_date desc);

create table public.examination_findings (
  id                 uuid primary key default gen_random_uuid(),
  examination_id     uuid not null references public.medical_examinations (id) on delete cascade,
  category           text not null check (category in ('Systematic','Orthopedic')),
  region             text not null,
  is_normal          boolean,
  clinical_findings  text,
  pain               text,
  range_of_motion    text,
  muscle_strength    text,
  joint_stability    text,
  special_tests      text,
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  unique (examination_id, region)
);

-- ---------------------------------------------------------------------
-- Injuries
-- ---------------------------------------------------------------------
create sequence public.injury_code_seq start 1;

create table public.injuries (
  id                     uuid primary key default gen_random_uuid(),
  injury_code            text not null unique default ('INJ-' || lpad(nextval('public.injury_code_seq')::text, 5, '0')),
  player_id              uuid not null references public.players (id),
  season_id              uuid references public.team_seasons (id),
  injury_date            date not null,
  injury_time            time,
  setting                text not null check (setting in ('Match','Training','Other')),
  match_opponent         text,
  training_session       text,
  mechanism              text,
  contact_type           text check (contact_type in ('Contact','Non-Contact')),
  onset                  text check (onset in ('Acute','Overuse')),
  body_region            text not null check (body_region in (
                           'Head','Neck','Shoulder','Upper Arm','Elbow','Forearm','Wrist','Hand','Fingers',
                           'Thoracic Spine','Lumbar Spine','Hip','Groin','Thigh','Hamstring','Quadriceps','Knee',
                           'Lower Leg','Calf','Achilles Tendon','Ankle','Foot','Toes')),
  body_side              text check (body_side in ('Right','Left','Bilateral','Not Applicable')),
  injury_type            text not null check (char_length(trim(injury_type)) > 1),
  anatomical_structure   text,
  diagnosis              text,
  severity               text not null default 'To Be Determined' check (severity in ('Mild','Moderate','Severe','To Be Determined')),
  injury_grade           text,
  clinical_examination   text,
  special_tests          text,
  imaging_results        text,
  physician_assessment   text,
  status                 text not null default 'Newly Recorded' check (status in (
                           'Newly Recorded','Under Investigation','Under Treatment','Under Rehabilitation',
                           'Modified Training','Return-to-Play Assessment','Recovered','Closed')),
  is_recurrent           boolean not null default false,
  previous_injury_id     uuid references public.injuries (id),
  expected_return_date   date,
  return_to_play_date    date,
  closed_date            date,
  closure_notes          text,
  is_archived            boolean not null default false,
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now(),
  created_by             uuid default auth.uid(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid,
  constraint injury_rtp_after_injury check (return_to_play_date is null or return_to_play_date >= injury_date),
  constraint injury_closed_after_injury check (closed_date is null or closed_date >= injury_date)
);
create index injuries_player_idx on public.injuries (player_id, injury_date desc);
create index injuries_status_idx on public.injuries (status);
create index injuries_date_idx on public.injuries (injury_date);

create table public.injury_followups (
  id                     uuid primary key default gen_random_uuid(),
  injury_id              uuid not null references public.injuries (id),
  followup_date          date not null,
  pain_score             integer check (pain_score between 0 and 10),
  swelling               text check (swelling in ('None','Mild','Moderate','Severe')),
  tenderness             text check (tenderness in ('None','Mild','Moderate','Severe')),
  range_of_motion        text,
  muscle_strength        text,
  functional_status      text,
  clinical_findings      text,
  special_tests          text,
  treatment_provided     text,
  response_to_treatment  text check (response_to_treatment in ('Improving','Unchanged','Worsening','Resolved')),
  progress_assessment    text,
  updated_diagnosis      text,
  next_followup_date     date,
  physician_notes        text,
  created_at             timestamptz not null default now(),
  created_by             uuid default auth.uid(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);
create index injury_followups_injury_idx on public.injury_followups (injury_id, followup_date);

create table public.treatments (
  id              uuid primary key default gen_random_uuid(),
  injury_id       uuid not null references public.injuries (id),
  treatment_date  date not null,
  treatment_type  text not null check (treatment_type in (
                    'Initial Management','Medication','Ice / Cryotherapy','Compression','Immobilization',
                    'PRP / Other Procedure','Physiotherapy','Rehabilitation','Referral','Other')),
  details         text,
  medication_name text,
  dosage          text,
  provided_by     text,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
create index treatments_injury_idx on public.treatments (injury_id, treatment_date);

-- ---------------------------------------------------------------------
-- Rehabilitation
-- ---------------------------------------------------------------------
create sequence public.rehab_code_seq start 1;

create table public.rehabilitation_programs (
  id                 uuid primary key default gen_random_uuid(),
  program_code       text not null unique default ('RHB-' || lpad(nextval('public.rehab_code_seq')::text, 5, '0')),
  injury_id          uuid not null references public.injuries (id),
  player_id          uuid not null references public.players (id),
  start_date         date not null,
  current_phase      text not null default 'Acute Phase' check (current_phase in (
                       'Acute Phase','Early Rehabilitation','Strengthening Phase','Functional Rehabilitation',
                       'Sport-Specific Rehabilitation','Return-to-Training','Return-to-Competition')),
  phase_approved_by  text,
  phase_approved_at  timestamptz,
  goals              text,
  exercises          text,
  training_load      text,
  physician_review   text,
  status             text not null default 'Active' check (status in ('Active','Completed','Discontinued')),
  end_date           date,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  constraint rehab_end_after_start check (end_date is null or end_date >= start_date)
);
create index rehab_programs_injury_idx on public.rehabilitation_programs (injury_id);
create index rehab_programs_player_idx on public.rehabilitation_programs (player_id);

create table public.rehabilitation_sessions (
  id                   uuid primary key default gen_random_uuid(),
  program_id           uuid not null references public.rehabilitation_programs (id),
  session_date         date not null,
  phase                text not null,
  exercises            text,
  training_load        text,
  pain_score           integer check (pain_score between 0 and 10),
  range_of_motion      text,
  strength_progress    text,
  functional_progress  text,
  physiotherapy_notes  text,
  physician_review     text,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);
create index rehab_sessions_program_idx on public.rehabilitation_sessions (program_id, session_date);

-- ---------------------------------------------------------------------
-- Return to play
-- ---------------------------------------------------------------------
create sequence public.rtp_code_seq start 1;

create table public.rtp_assessments (
  id                        uuid primary key default gen_random_uuid(),
  rtp_code                  text not null unique default ('RTP-' || lpad(nextval('public.rtp_code_seq')::text, 5, '0')),
  injury_id                 uuid not null references public.injuries (id),
  player_id                 uuid not null references public.players (id),
  assessment_date           date not null,
  current_clinical_status   text,
  pain_score                integer check (pain_score between 0 and 10),
  pain_assessment           text,
  range_of_motion           text,
  muscle_strength           text,
  functional_testing        text,
  balance_assessment        text,
  agility                   text,
  jumping_ability           text,
  landing_mechanics         text,
  sport_specific_tests      text,
  basketball_movement       text,
  training_tolerance        text,
  final_assessment          text,
  decision                  text not null check (decision in ('Not Cleared','Rehabilitation Required','Cleared for Modified Training','Cleared for Full Training','Cleared for Competition')),
  decision_date             date not null,
  physician_name            text not null,
  clinical_notes            text,
  signature                 text not null check (char_length(trim(signature)) > 1),
  is_demo                   boolean not null default false,
  created_at                timestamptz not null default now(),
  created_by                uuid default auth.uid(),
  updated_at                timestamptz not null default now(),
  updated_by                uuid
);
create index rtp_injury_idx on public.rtp_assessments (injury_id, decision_date);

-- ---------------------------------------------------------------------
-- Medical clearances (permanent decision history)
-- ---------------------------------------------------------------------
create sequence public.clearance_code_seq start 1;

create table public.medical_clearances (
  id                  uuid primary key default gen_random_uuid(),
  clearance_code      text not null unique default ('CLR-' || lpad(nextval('public.clearance_code_seq')::text, 5, '0')),
  player_id           uuid not null references public.players (id),
  examination_id      uuid references public.medical_examinations (id),
  rtp_assessment_id   uuid references public.rtp_assessments (id),
  clearance_status    text not null check (clearance_status in ('Cleared for Full Participation','Cleared with Restrictions','Temporarily Not Cleared','Further Evaluation Required')),
  restrictions        text,
  valid_until         date,
  decision_date       date not null,
  physician_name      text not null,
  signature           text not null check (char_length(trim(signature)) > 1),
  notes               text,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid()
);
create index clearances_player_idx on public.medical_clearances (player_id, decision_date desc, created_at desc);

-- ---------------------------------------------------------------------
-- Player availability (history – latest row per player is current)
-- ---------------------------------------------------------------------
create table public.player_availability (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references public.players (id),
  injury_id           uuid references public.injuries (id),
  effective_date      date not null default current_date,
  availability        text not null check (availability in ('FULLY AVAILABLE','MODIFIED TRAINING','INDIVIDUAL TRAINING','NOT AVAILABLE','UNDER MEDICAL REVIEW')),
  medical_status      text not null check (medical_status in ('Fit','Injured','Under Rehabilitation','Return-to-Play Phase','Illness','Awaiting Assessment','Clearance Pending')),
  restrictions        text,
  staff_notes         text,
  internal_notes      text,
  shared_with_staff   boolean not null default true,
  next_followup_date  date,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid()
);
create index availability_player_idx on public.player_availability (player_id, effective_date desc, created_at desc);

-- ---------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------
create table public.medical_documents (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid not null references public.players (id),
  examination_id   uuid references public.medical_examinations (id),
  injury_id        uuid references public.injuries (id),
  category         text not null check (category in ('Medical Examination','Laboratory Results','X-Ray','MRI','Ultrasound','Medical Certificates','Hospital Reports','Prescriptions','Other')),
  title            text not null check (char_length(trim(title)) between 2 and 160),
  description      text,
  document_date    date,
  file_path        text not null unique,
  file_name        text not null,
  mime_type        text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes       integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  is_archived      boolean not null default false,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index documents_player_idx on public.medical_documents (player_id, created_at desc);

-- ---------------------------------------------------------------------
-- Exposure (for incidence per 1,000 player-hours – only real data)
-- ---------------------------------------------------------------------
create table public.team_exposures (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid references public.team_seasons (id),
  session_date      date not null,
  session_type      text not null check (session_type in ('Match','Training')),
  duration_minutes  integer not null check (duration_minutes between 1 and 600),
  players_exposed   integer not null check (players_exposed between 1 and 40),
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid()
);
create index exposures_date_idx on public.team_exposures (session_date);

-- ---------------------------------------------------------------------
-- Audit log & settings
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  user_id      uuid,
  action       text not null,
  record_type  text not null,
  record_id    text,
  old_values   jsonb,
  new_values   jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_record_idx on public.audit_logs (record_type, record_id);

create table public.application_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

insert into public.application_settings (key, value, description) values
  ('team_name', '"DAR CITY BASKETBALL TEAM"', 'Official team name shown on reports'),
  ('organization', '"DAR CITY BASKETBALL TEAM – TANZANIA"', 'Organization line'),
  ('department', '"SPORTS MEDICINE DEPARTMENT"', 'Department shown on PDF headers'),
  ('physician_name', '"Dr. Faraj Lashika"', 'Official team physician'),
  ('default_team_category', '"Senior Men"', 'Default roster category for new players'),
  ('report_footer', '"CONFIDENTIAL MEDICAL DOCUMENT – Dar City Basketball Team"', 'Footer printed on every PDF page');
