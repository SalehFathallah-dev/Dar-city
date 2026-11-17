// Supabase Edge Function: self-register
// Lets a player or staff member create their own sign-in (username + password).
// The new account has NO role and NO access: after signing in it can only pick
// its club and its own name, then waits for the physician's approval.
// Deployed with verify_jwt = false (the caller has no account yet).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const USERNAME_DOMAIN = 'dsf.local';
const MAX_SIGNUPS_PER_HOUR = 40; // simple protection against automated sign-ups
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { username?: string; password?: string; full_name?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const username = (body.username ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const fullName = (body.full_name ?? '').trim();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: 'Username: 3–30 letters or numbers, no spaces' }, 400);
  if (password.length < 8) return json({ error: 'Password must have at least 8 characters' }, 400);
  if (fullName.length < 2 || fullName.length > 120) return json({ error: 'Enter your full name' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).is('role', null).gte('created_at', since);
  if ((count ?? 0) >= MAX_SIGNUPS_PER_HOUR) return json({ error: 'Too many new accounts right now. Please try again later.' }, 429);

  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@${USERNAME_DOMAIN}`, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    const msg = error?.message ?? 'Unable to create the account';
    return json({ error: /already/i.test(msg) ? 'This username is already used – choose another one' : msg }, 400);
  }
  // The on_auth_user_created trigger creates an inactive profile with no role.
  return json({ ok: true, username });
});
