# DR. SALEH FATHULLAH – ORTHOPEDIC & SPORTS MEDICINE

**Orthopedic & Sports Injuries Medical System – web app on Render (phones and computers) with an online database**

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

Security is enforced in the database: athletes are not "staff", so every table policy denies them;
they reach only their own data through `get_my_portal()` and `log_dose()`. Staff summaries come from
`get_team_summary()` / `get_team_adherence()`, which never return diagnoses or notes.

## Database

Migrations are in `supabase/migrations` (apply in order). `npm run test:db` runs the whole suite on
throw-away local PostgreSQL clusters, including `supabase/tests/athlete_tests.sql` for the athlete
portal, prescriptions, dose log and staff-summary rules.

## Hosting

The web app is served by **Render** as a free static site (`render.yaml` Blueprint). Every push to the
branch rebuilds and publishes it automatically: https://dr-saleh-fathullah-9t2g.onrender.com
On a phone: open the link in the browser and use "Add to Home Screen".

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run test:db      # database + security tests (PostgreSQL 15+ binaries)
```
