// Supabase Edge Function: admin-users
// Account management on behalf of the team physician or a Super Administrator:
//   create          – create an account with a chosen username/e-mail and password
//   provision       – create the app account of a registered player or staff member with a
//                     generated username (by category) and a generated password, already approved
//   reset_password  – set a new password (generated when none is given)
// Generated passwords are returned once to the caller and never stored in readable form.
// The service-role key is only available here (server side) – never in the app.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const STAFF_ROLES = ['team_physician', 'assistant_medical_staff', 'team_manager', 'head_coach'];
const USERNAME_DOMAIN = 'dsf.local'; // "ali7" = "ali7@dsf.local" (no e-mail is ever sent)
const ROLE_WORD: Record<string, string> = { head_coach: 'coach', team_manager: 'manager', assistant_medical_staff: 'medic' };
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
// Easy to read and type on a phone: 4 letters + 4 digits, no look-alike characters (l/1, o/0, i).
function generatePassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const r = new Uint32Array(8);
  crypto.getRandomValues(r);
  let out = '';
  for (let i = 0; i < 4; i++) out += letters[r[i] % letters.length];
  for (let i = 4; i < 8; i++) out += digits[r[i] % digits.length];
  return out;
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

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
    title?: string; club_ids?: string[]; player_id?: string; staff_member_id?: string; user_id?: string;
  };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const passwordOk = (p: string) => p.length >= 8;
  const audit = (action: string, recordId: string, values: Record<string, unknown>, clubId: string | null = null) =>
    admin.from('audit_logs').insert({ user_id: userData.user!.id, action, record_type: 'auth_users', record_id: recordId, club_id: clubId, new_values: values });
  const loginTaken = async (login: string) => {
    const { data } = await admin.from('profiles').select('id').eq('email', login).maybeSingle();
    return !!data;
  };
  const freeLogin = async (base: string, firstWithNumber = false) => {
    for (let i = firstWithNumber ? 1 : 0; i < 500; i++) {
      const candidate = `${base}${i === 0 ? '' : i}@${USERNAME_DOMAIN}`;
      if (!(await loginTaken(candidate))) return candidate;
    }
    throw new Error('Could not find a free username');
  };

  // ---- Reset a password (generated when none is given) ----
  if (body.action === 'reset_password') {
    if (!body.user_id) return json({ error: 'Missing user' }, 400);
    const password = body.password || generatePassword();
    if (!passwordOk(password)) return json({ error: 'Password must have at least 8 characters' }, 400);
    const { data: target } = await admin.from('profiles').select('role, email').eq('id', body.user_id).single();
    if (!target) return json({ error: 'User not found' }, 404);
    if (target.role === 'super_admin' && !isAdmin) return json({ error: 'Not allowed' }, 403);
    const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
    if (error) return json({ error: error.message }, 400);
    await audit('UPDATE', body.user_id, { password_reset: true, generated: !body.password });
    return json({ ok: true, username: String(target.email ?? '').replace(`@${USERNAME_DOMAIN}`, ''), password: body.password ? undefined : password });
  }

  // ---- Provision: app account of a registered player / staff member, generated credentials ----
  if (body.action === 'provision') {
    let login: string; let role: string; let fullName: string; let clubId: string; let title: string | null = null;
    if (body.player_id) {
      // The caller must have access to that player (checked with the caller's own permissions).
      const { data: player } = await caller.from('players').select('id, full_name, club_id, player_code, status').eq('id', body.player_id).single();
      if (!player) return json({ error: 'Player not found or not accessible' }, 404);
      const { data: existing } = await admin.from('profiles').select('id').eq('player_id', player.id).maybeSingle();
      if (existing) return json({ error: 'This player already has an account' }, 400);
      login = await freeLogin(slug(player.player_code) || 'player');
      role = 'athlete'; fullName = player.full_name; clubId = player.club_id;
    } else if (body.staff_member_id) {
      const { data: staff } = await caller.from('staff_members').select('id, full_name, club_id, app_role, title, profile_id').eq('id', body.staff_member_id).single();
      if (!staff) return json({ error: 'Staff member not found or not accessible' }, 404);
      if (staff.profile_id) return json({ error: 'This staff member already has an account' }, 400);
      const { data: club } = await admin.from('clubs').select('player_id_prefix').eq('id', staff.club_id).single();
      login = await freeLogin(`${ROLE_WORD[staff.app_role] ?? 'staff'}.${slug(club?.player_id_prefix ?? 'club')}`, true);
      role = staff.app_role; fullName = staff.full_name; clubId = staff.club_id; title = staff.title;
    } else {
      return json({ error: 'Choose the player or staff member' }, 400);
    }
    const password = generatePassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: login, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? 'Unable to create the account' }, 400);
    const uid = created.user.id;
    const fail = async (msg: string) => { await admin.auth.admin.deleteUser(uid); return json({ error: msg }, 500); };
    const { error: profErr } = await admin.from('profiles')
      .update({ role, is_active: true, full_name: fullName, title, player_id: role === 'athlete' ? body.player_id : null }).eq('id', uid);
    if (profErr) return await fail(`Account could not be configured: ${profErr.message}`);
    if (role !== 'athlete') {
      const { error: linkErr } = await admin.from('staff_members').update({ profile_id: uid }).eq('id', body.staff_member_id!);
      if (linkErr) return await fail(`Staff link failed: ${linkErr.message}`);
      const { error: memErr } = await admin.from('club_members').insert({ club_id: clubId, user_id: uid, created_by: userData.user.id });
      if (memErr) return await fail(`Club access failed: ${memErr.message}`);
    }
    await audit('INSERT', uid, { login, role, full_name: fullName, player_id: body.player_id ?? null, staff_member_id: body.staff_member_id ?? null, created_via: 'provision' }, clubId);
    return json({ id: uid, username: login.replace(`@${USERNAME_DOMAIN}`, ''), password, full_name: fullName, role });
  }

  if (body.action !== 'create') return json({ error: 'Unsupported action' }, 400);

  const password = body.password ?? '';
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
  const { error: profErr } = await admin.from('profiles')
    .update({ role, is_active: true, full_name: name, title: body.title?.trim() || null, player_id: role === 'athlete' ? body.player_id : null })
    .eq('id', created.user.id);
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: `Account could not be configured: ${profErr.message}` }, 500);
  }
  if (role !== 'athlete' && role !== 'super_admin') {
    const clubIds = Array.isArray(body.club_ids) ? body.club_ids.filter((c) => typeof c === 'string').slice(0, 200) : [];
    if (clubIds.length) {
      const { data: valid } = await caller.from('clubs').select('id').in('id', clubIds);
      const rows = (valid ?? []).map((c: { id: string }) => ({ club_id: c.id, user_id: created.user!.id, created_by: userData.user!.id }));
      if (rows.length) {
        const { error: memErr } = await admin.from('club_members').insert(rows);
        if (memErr) return json({ error: `Account created but club assignment failed: ${memErr.message}` }, 500);
      }
    }
  }
  await audit('INSERT', created.user.id, { login, role, full_name: name, player_id: body.player_id ?? null, created_via: 'admin-users function' }, playerClub);
  return json({ id: created.user.id, login });
});
