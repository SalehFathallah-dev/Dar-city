# DR. FARAJ LASHIKA – ORTHOPEDIC & SPORTS MEDICINE

**Multi-Club Sports Medical Management System**

A production-ready sports medicine web application (installable PWA) for managing the medical records of
**multiple clubs**: player registration, examinations, injuries, follow-ups, rehabilitation, return-to-play,
medical clearance, daily availability, dual-branded PDF reports, CSV exports and analytics.

- **Medical brand** (primary identity): Dr. Faraj Lashika – Orthopedic & Sports Medicine.
- **Club identity**: each club has its own logo, roster, Player IDs, seasons and medical records.
  Dar City Basketball Team – Tanzania is the first club; all its existing records were migrated unchanged.

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · Lucide icons · Recharts |
| Backend | Supabase (PostgreSQL, Auth, private Storage, Row Level Security, Edge Function) |
| Documents | jsPDF + AutoTable (branded A4 PDFs) · UTF-8 CSV (Excel compatible) |
| Deployment | Vercel / any static host · PWA (vite-plugin-pwa) |

## Quick start

```bash
npm install
cp .env.example .env        # add your Supabase URL + anon key
npm run dev                 # http://localhost:5173
```

Without Supabase credentials the app shows a setup screen – it never pretends to save data.

## Documentation

- [`docs/SETUP.md`](docs/SETUP.md) – Supabase setup, environment variables, default administrator, GitHub & Vercel deployment
- [`docs/MODULES.md`](docs/MODULES.md) – what every module does, roles & permissions, security model
- [`docs/TESTING.md`](docs/TESTING.md) – automated tests and the manual testing checklist

## Project structure

```
supabase/
  migrations/      SQL schema, RLS security, storage buckets, multi-club upgrade (run in order)
  rollback/        Reversal script for the multi-club migration
  seed/            DEMO data (clearly labelled), demo removal, initial users
  functions/       admin-users Edge Function (server-side user creation)
  tests/           Database / RLS test suite (npm run test:db)
src/
  lib/             api (data access), analytics, pdf, reports, csv, permissions, formatting
  context/         Auth, toast notifications, shared reference data
  components/      UI kit, layout, charts, timeline, documents, PDF preview
  pages/           Dashboard, players, examinations, injuries, rehab, RTP, availability, reports, exports, analytics, admin, audit
public/            Official logo and PWA icons
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build (`dist/`) |
| `npm test` | Unit tests (analytics, dates, BMI, CSV) |
| `npm run test:db` | Migrates single-club data to multi-club (verifying every record), runs RLS + club-isolation tests, tests the rollback, then a fresh install with DEMO data |
