# Setup & Deployment Guide

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> → **New project**. Choose a region close to Tanzania (e.g. *eu-central* or *ap-south*), set a strong database password and store it safely.
2. **Authentication → Providers → Email**: keep Email enabled and **disable "Allow new users to sign up"** (staff accounts are created by the administrator).
3. **Authentication → URL Configuration**: set *Site URL* to your deployed URL (e.g. `https://darcity-medical.vercel.app`) and add `https://<your-domain>/reset-password` to *Redirect URLs*.

## 2. Run the database migrations

Open **SQL Editor** and run these files **in order** (copy/paste each file and click *Run*):

1. `supabase/migrations/20261102000001_schema.sql` – tables, constraints, indexes, sequences
2. `supabase/migrations/20261102000002_security.sql` – role helpers, triggers, audit log, Row Level Security, RPCs
3. `supabase/migrations/20261102000003_storage.sql` – private `medical-documents` and `player-photos` buckets with policies

Alternatively with the Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.

## 3. Create the default administrator and the Team Physician

1. **Authentication → Users → Add user → Create new user** for:
   - Dr. Faraj Lashika (Team Physician) – tick *Auto Confirm User*
   - A Super Administrator account (manages users, seasons and settings)
2. Edit the two e-mail addresses in `supabase/seed/create_initial_users.sql` and run it in the SQL Editor.
   New accounts are **inactive with no role** until this step (or until the administrator approves them in the app).
3. Sign in to the app as the administrator → **Settings & Users → Seasons** → add the current season (e.g. *2026/2027*) and tick *Current season*.

> Roles are separate by design: the Super Administrator has **no access to clinical records**, and the Team Physician cannot change user roles.

### Optional: in-app user creation

The **Create User** button calls the `admin-users` Edge Function, which uses the service-role key **on the server only**:

```bash
npx supabase functions deploy admin-users --project-ref <ref>
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions automatically.)
Without it, create users in the dashboard and assign roles in **Settings & Users**.

## 4. Optional DEMO data

`supabase/seed/demo_data.sql` inserts 5 fictional players (names start with **DEMO**, every row has `is_demo = true`)
with examinations, injuries, follow-ups, rehabilitation, RTP decisions and exposure data.
**Only run it on a test project, or with explicit confirmation.** Remove it at any time with `supabase/seed/remove_demo_data.sql` (deletes only DEMO rows).

## 5. Environment variables

Copy `.env.example` to `.env`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon key>
```

Both values are under **Project Settings → API**. The anon key is public by design – all protection comes from RLS.
**Never put the `service_role` key in any `VITE_` variable or frontend code.**

## 6. GitHub

```bash
git remote add origin https://github.com/<org>/<repo>.git
git push -u origin main
```

`.env` is git-ignored. Never commit real credentials or exported medical files.

## 7. Deploy to Vercel

1. <https://vercel.com> → **Add New → Project** → import the GitHub repository.
2. Framework preset: **Vite** (build `npm run build`, output `dist`).
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Production + Preview).
4. Deploy. `vercel.json` provides SPA routing and security headers.
5. Put the Vercel URL into Supabase *Site URL* / *Redirect URLs* (step 1.3).

## 8. Install as an app (PWA)

- **Android / Chrome**: open the site → menu → *Install app*.
- **iPhone / Safari**: Share → *Add to Home Screen*.

Only the application shell is cached. Medical data is always fetched live over HTTPS and is **never stored offline**; when offline the app shows a banner and saving is disabled.

## 9. Backups

- Supabase runs automatic daily backups (Point-in-Time Recovery on paid plans – recommended for medical data).
- The Team Physician can download a full JSON backup from **Export Center → Full Medical Backup**. Store it encrypted.
- Uploaded files live in Supabase Storage; include the `medical-documents` bucket in your backup routine.
