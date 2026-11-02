-- =====================================================================
-- Default administrator / physician setup
-- 1. Create the accounts first in Supabase Dashboard → Authentication → Users
--    ("Add user" → "Create new user", tick "Auto Confirm User").
-- 2. Replace the e-mail addresses below and run this script in the SQL editor.
-- =====================================================================
update public.profiles
   set full_name = 'Dr. Faraj Lashika', title = 'Team Physician', role = 'team_physician', is_active = true
 where email = 'physician@example.com';      -- ← Dr. Faraj Lashika's login e-mail

update public.profiles
   set full_name = 'System Administrator', title = 'Super Administrator', role = 'super_admin', is_active = true
 where email = 'admin@example.com';          -- ← administrator login e-mail

select email, full_name, role, is_active from public.profiles order by created_at;
