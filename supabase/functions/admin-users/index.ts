// Supabase Edge Function: admin-users
// Creates accounts (staff and athletes) and resets passwords on behalf of the
// team physician or a Super Administrator.
// The service-role key is only available here (server side) – never in the app.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const STAFF_ROLES = ['team_physician', 'assistant_medical_staff', 'team_manager', 'head_coach'];
const USERNAME_DOMAIN = 'dsf.local'; // athletes/staff may sign in with a username: "ali7" = "ali7@dsf.local"
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const toLogin = (v: string) => {
  const s = v.trim().toLowerCase();
  return s.includes('@') ? s : `${s}@${USERNAME_DOMAIN}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Identify the caller with their own JWT: active team physician or Super Administrator.
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401);
  const { data: me } = await caller.from('profiles').select('role, is_active').eq('id', userData.user.id).single();
  if (!me || !me.is_active || !['super_admin', 'team_physician'].includes(me.role)) {
    return json({ error: 'Only the physician or an administrator can manage accounts' }, 403);
  }
  const isAdmin = me.role === 'super_admin';

  let body: {
    action?: string; email?: string; username?: string; password?: string; full_name?: string; role?: string;
    title?: string; club_ids?: string[]; player_id?: string; user_id?: string;
  };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const password = body.password ?? '';
  const passwordOk = (p: string) => p.length >= 8;

  // ---- Reset a password (forgotten password) ----
  if (body.action === 'reset_password') {
    if (!body.user_id) return json({ error: 'Missing user' }, 400);
    if (!passwordOk(password)) return json({ error: 'Password must have at least 8 characters' }, 400);
    const { data: target } = await admin.from('profiles').select('role').eq('id', body.user_id).single();
    if (!target) return json({ error: 'User not found' }, 404);
    if (target.role === 'super_admin' && !isAdmin) return json({ error: 'Not allowed' }, 403);
    const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
    if (error) return json({ error: error.message }, 400);
    await admin.from('audit_logs').insert({ user_id: userData.user.id, action: 'UPDATE', record_type: 'auth_users', record_id: body.user_id, new_values: { password_reset: true } });
    return json({ ok: true });
  }

  if (body.action !== 'create') return json({ error: 'Unsupported action' }, 400);

  const role = body.role ?? '';
  const login = toLogin(body.email || body.username || '');
  const fullName = (body.full_name ?? '').trim();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(login)) return json({ error: 'Invalid username or e-mail (letters, numbers, dots only)' }, 400);
  if (!passwordOk(password)) return json({ error: 'Password must have at least 8 characters' }, 400);
  if (![...STAFF_ROLES, 'athlete', ...(isAdmin ? ['super_admin'] : [])].includes(role)) return json({ error: 'Invalid role' }, 400);

  let playerClub: string | null = null;
  let name = fullName;
  if (role === 'athlete') {
    if (!body.player_id) return json({ error: 'Select the player for this account' }, 400);
    // The caller must have access to that player (checked with the caller's own permissions).
    const { data: player } = await caller.from('players').select('id, full_name, club_id').eq('id', body.player_id).single();
    if (!player) return json({ error: 'Player not found or not accessible' }, 404);
    const { data: existing } = await admin.from('profiles').select('id').eq('player_id', player.id).maybeSingle();
    if (existing) return json({ error: 'This player already has an account' }, 400);
    playerClub = player.club_id;
    name = name || player.full_name;
  }
  if (name.length < 2 || name.length > 120) return json({ error: 'Invalid full name' }, 400);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: login, password, email_confirm: true, user_metadata: { full_name: name },
  });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'Unable to create user';
    return json({ error: /already/i.test(msg) ? 'This username is already used' : msg }, 400);
  }

  // The on_auth_user_created trigger inserts the profile; activate it with the chosen role.
  const { error: profErr } = await admin.from('profiles')
    .update({ role, is_active: true, full_name: name, title: body.title?.trim() || null, player_id: role === 'athlete' ? body.player_id : null })
    .eq('id', created.user.id);
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: `Account could not be configured: ${profErr.message}` }, 500);
  }

  // Club access for staff (only clubs the caller may access). Athletes get none – they use the portal.
  if (role !== 'athlete' && role !== 'super_admin') {
    const clubIds = Array.isArray(body.club_ids) ? body.club_ids.filter((c) => typeof c === 'string').slice(0, 200) : [];
    if (clubIds.length) {
      const { data: valid } = await caller.from('clubs').select('id').in('id', clubIds);
      const rows = (valid ?? []).map((c: { id: string }) => ({ club_id: c.id, user_id: created.user!.id, created_by: userData.user.id }));
      if (rows.length) {
        const { error: memErr } = await admin.from('club_members').insert(rows);
        if (memErr) return json({ error: `Account created but club assignment failed: ${memErr.message}` }, 500);
      }
    }
  }

  await admin.from('audit_logs').insert({
    user_id: userData.user.id, action: 'INSERT', record_type: 'auth_users', record_id: created.user.id, club_id: playerClub,
    new_values: { login, role, full_name: name, player_id: body.player_id ?? null, created_via: 'admin-users function' },
  });
  return json({ id: created.user.id, login });
});
