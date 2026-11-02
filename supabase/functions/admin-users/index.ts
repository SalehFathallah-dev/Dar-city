// Supabase Edge Function: admin-users
// Creates staff accounts on behalf of a Super Administrator.
// The service-role key is only available here (server side) – never in the browser.
// Deploy: supabase functions deploy admin-users
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ROLES = ['super_admin', 'team_physician', 'assistant_medical_staff', 'team_manager', 'head_coach'];
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Identify the caller with their own JWT and verify they are an active Super Administrator.
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401);
  const { data: me } = await caller.from('profiles').select('role, is_active').eq('id', userData.user.id).single();
  if (!me || !me.is_active || me.role !== 'super_admin') return json({ error: 'Only a Super Administrator can manage users' }, 403);

  let body: { action?: string; email?: string; password?: string; full_name?: string; role?: string; title?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (body.action !== 'create') return json({ error: 'Unsupported action' }, 400);

  const email = (body.email ?? '').trim().toLowerCase();
  const fullName = (body.full_name ?? '').trim();
  const password = body.password ?? '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Invalid e-mail address' }, 400);
  if (fullName.length < 2 || fullName.length > 120) return json({ error: 'Invalid full name' }, 400);
  if (!ROLES.includes(body.role ?? '')) return json({ error: 'Invalid role' }, 400);
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return json({ error: 'Password does not meet the policy' }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) return json({ error: createErr?.message ?? 'Unable to create user' }, 400);

  // The on_auth_user_created trigger inserts the profile; activate it with the chosen role.
  const { error: profErr } = await admin.from('profiles')
    .update({ role: body.role, is_active: true, full_name: fullName, title: body.title?.trim() || null })
    .eq('id', created.user.id);
  if (profErr) return json({ error: `User created but role assignment failed: ${profErr.message}` }, 500);

  await admin.from('audit_logs').insert({
    user_id: userData.user.id, action: 'INSERT', record_type: 'auth_users', record_id: created.user.id,
    new_values: { email, role: body.role, full_name: fullName, created_via: 'admin-users function' },
  });
  return json({ id: created.user.id, email });
});
