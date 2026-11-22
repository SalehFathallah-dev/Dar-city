# Sports Medicine Platform – audit and phased plan

Audit date: 2026-11-22 · Owner: Dr. Saleh Fathullah (team physician, primary medical administrator)

## 1. Current architecture

| Layer | Technology |
|---|---|
| Client | React 18 + TypeScript + Vite + Tailwind, Recharts, jsPDF. Web app on Render (phones via "Add to Home Screen" and computers) |
| Backend | Supabase project `hjzefycoaqvvfeetytqz` (Frankfurt): PostgreSQL with Row Level Security on every table, Supabase Auth (username accounts `name@dsf.local`), private Storage buckets, Edge Functions `admin-users` and `self-register` |
| Security model | Roles in `profiles.role` (`team_physician`, `assistant_medical_staff`, `team_manager`, `head_coach`, `super_admin`, `athlete`). Club isolation through `club_members` + `has_club_access()`. Athletes are not staff: they reach only their own data through SECURITY DEFINER functions. Full audit trail (`audit_logs`, triggers on every clinical table). |
| Tests | `npm test` (unit), `npm run test:db` (migrations + RLS + business rules on throw-away PostgreSQL), end-to-end runs with Playwright against the real project |

## 2. Existing features (kept unchanged)

- Clubs (multi-club), age categories, seasons, staff register, self-registration with physician approval
- Player registry, emergency contacts, versioned medical history, photos
- Medical examinations (systematic + orthopedic findings, vitals, clearance)
- Injuries, follow-ups, treatments, rehabilitation programmes (7 phases) and sessions, return-to-play assessments, clearance history
- Availability (internal vs staff notes), team status for staff, recovery progress for staff (no clinical detail)
- Prescriptions (medication / supplement / exercise / treatment) with times and weekdays, athlete dose confirmation, adherence grid
- Athlete portal (Arabic): status, doses, rehab programme, injuries
- Documents (private storage), PDF reports, CSV exports, analytics, audit log

## 3. Requested features – gap analysis

| Module | Status before this work |
|---|---|
| 1 Roles | Doctor, athlete, coach, manager, medical assistant exist. **Missing:** configurable permissions for optional roles (physio, S&C, recovery staff) |
| 2 Athlete portal | Partial. **Missing:** report-a-medical-issue with body map and attachments, questionnaires, appointments, notifications, training/match schedule |
| 3 Medical inbox + confidentiality | **Missing** (complaints, inbox, private/limited/approved disclosure, disclosure log) |
| 4 Wellness questionnaires | **Missing** |
| 5 Training load | Partial (team exposure only). **Missing:** per-player sRPE load, daily/weekly load |
| 6 Matches + recovery planner | **Missing** |
| 7 Recovery sessions / ice bath attendance | **Missing** |
| 8 Medication & supplement inventory | Partial (prescriptions + adherence). **Missing:** inventory, batches, expiry, stock, cost, team assignment, safety checks, administration log by staff |
| 9 Individual medical file | Mostly present. **Missing:** examination fields (presenting complaint, inspection, palpation, neurovascular), investigations section |
| 10 Injury / rehab / RTP | Present (checklist exists; final decision by physician) |
| 11 Availability board | Present with 5 statuses. **Missing:** extra statuses, review date, match availability report |
| 12 Appointments | **Missing** |
| 13 Doctor command centre | Partial (dashboard). **Missing:** alert centre |
| 14 Reports | Partial (PDF/CSV). **Missing:** wellness, load, recovery, supplement, inventory, match reports |
| 15 Notifications | Partial. **Missing:** in-app notification centre, announcements, instructions |
| 16 Travel & emergency | **Missing** |
| 17 Security | Present (RLS, audit, private storage, idle sign-out). To extend to every new table |
| 19 Arabic/English | Athlete portal Arabic RTL; staff screens English LTR |

## 4. Database modification plan (extends existing tables – no duplicates)

| Phase | New tables / functions |
|---|---|
| 1 | `medical_cases`, `case_messages`, `case_files` (+ private bucket `case-attachments`), `case_disclosures`; `wellness_responses`, `wellness_settings`; `notifications`; RPCs `submit_medical_case`, `athlete_case_reply`, `my_cases`, `submit_wellness`, `get_wellness_flags`, `get_staff_case_board`, `send_announcement`, `notify_*` triggers |
| 2 | `matches`, `recovery_plans`, `recovery_sessions`, `recovery_attendance`, `training_sessions`, `training_participation` (sRPE per player) |
| 3 | extra columns on `medical_examinations`, `investigations`, `appointments` |
| 4 | `products`, `product_batches`, `stock_movements`, `administration_log`; prescriptions gain `product_id` |
| 5 | report generators and exports over the above |

All new tables: `club_id` derived from the player, RLS, audit trigger, athlete access only through RPCs.

## 5. Phases

1. **Essential** – roles check, athlete portal, complaints, medical inbox, confidentiality, wellness questionnaires + baseline flags, notifications, doctor alert centre
2. **Performance** – training load, match calendar, recovery planner, recovery sessions and ice-bath attendance
3. **Medical** – examination form extension, investigations, appointments and reminders
4. **Medication and supplements** – inventory, team assignment, administration log, safety checks, expiry/stock alerts
5. **Analytics and reporting** – new PDF/Excel reports, advanced dashboard, travel and emergency module

Each phase: database tests for every permission rule, end-to-end test on the real project, then deployment to Render.
