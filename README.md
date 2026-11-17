# DR. SALEH FATHULLAH – ORTHOPEDIC & SPORTS MEDICINE

**Orthopedic & Sports Injuries Medical System – Android app (APK) with an online database**

One app, three kinds of account (the screen depends on who signs in):

| Account | Sees / does |
|---|---|
| **Physician** (Dr. Saleh) | Everything: players, examinations, injuries, rehab, return-to-play, clearance, reports, exports; prescribes medications, supplements and home exercises; creates staff and player accounts |
| **Team staff** (manager, head coach) | *Team Status*: readiness/availability, rehab phase, expected return and treatment adherence – no diagnoses or clinical notes. Medication names only when the physician shares them |
| **Athlete** (player) | Own portal only (Arabic): status and restrictions, rehab programme, today's medications/supplements, **"Taken ✓"** confirmation per dose and phone reminders at the prescribed times |

## Architecture

| Layer | Technology |
|---|---|
| App | React 18 · TypeScript · Vite · Tailwind CSS · Recharts · jsPDF |
| Backend | Supabase (PostgreSQL + Row Level Security, Auth, private Storage, Edge Function `admin-users`) |
| Android | Capacitor 7 (`android/`), signed release APK, local notifications for dose reminders |

Security is enforced in the database: athletes are not "staff", so every table policy denies them;
they reach only their own data through `get_my_portal()` and `log_dose()`. Staff summaries come from
`get_team_summary()` / `get_team_adherence()`, which never return diagnoses or notes.

## Database

Migrations are in `supabase/migrations` (apply in order). `npm run test:db` runs the whole suite on
throw-away local PostgreSQL clusters, including `supabase/tests/athlete_tests.sql` for the athlete
portal, prescriptions, dose log and staff-summary rules.

## Getting the APK

Every push to the branch runs `.github/workflows/android-apk.yml`, which builds a signed APK and publishes
it as a GitHub **Release** (`Dr-Saleh-Fathullah.apk`). Updates install over the previous version.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run test:db      # database + security tests (PostgreSQL 15+ binaries)
npm run android      # build + sync into the Android project
```
