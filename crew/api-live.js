// Live backend: talks to your Supabase database. Same functions as api-demo.js.
export const mode = 'live';
export const demoPersonas = [];
export const demo = {};

let sb = null;
let session = null;
const listeners = [];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.supabase) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the app. Check your connection and try again.'));
    document.head.appendChild(s);
  });
}

export async function init(cfg) {
  await loadScript('vendor/supabase.js');
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'aissko-crew-auth' }
  });
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((evt, s) => { session = s; listeners.forEach((f) => f(evt)); });
}
export const resetDemo = () => {};
export const user = () => (session ? { id: session.user.id, email: session.user.email } : null);
export const onAuthChange = (f) => listeners.push(f);
const uid = () => session.user.id;

function friendly(e) {
  const m = (e && e.message) || String(e);
  if (/row-level security|permission denied/i.test(m)) return 'You do not have permission to do that.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No connection. Check your signal and try again.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/token has expired|invalid.*(otp|token)|otp.*(expired|invalid)/i.test(m)) return 'That code did not work. Check it and try again, or ask for a new one.';
  return m;
}
const ok = (res) => { if (res.error) throw new Error(friendly(res.error)); return res.data; };

// ---------- Sign-in ----------------------------------------------------------------------------
export async function signInStart(email) {
  ok(await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } }));
  return { needsCode: true };
}
export async function signInVerify(email, token) {
  const data = ok(await sb.auth.verifyOtp({ email: email.trim(), token: token.replace(/\s+/g, ''), type: 'email' }));
  session = data.session;
}
export async function signOut() { await sb.auth.signOut(); session = null; }
export const signInDemo = () => {};

export async function loadProfile() { return ok(await sb.from('profiles').select('*').eq('id', uid()).maybeSingle()); }
export async function updateMyProfile(p) { return ok(await sb.from('profiles').update({ full_name: p.full_name, phone: p.phone }).eq('id', uid()).select().single()); }

// ---------- Shapes -----------------------------------------------------------------------------
const byAt = (a, b) => new Date(a.at) - new Date(b.at);
const MGR = 'manager:profiles!jobs_manager_id_fkey(id,full_name,phone,email)';
const CHK = 'checkins(id,kind,at,source,within_site,distance_m,note)';
const JOB_FULL = `*, ${MGR}, assignments(id,status,responded_at,contractor_id, contractor:profiles!assignments_contractor_id_fkey(id,full_name,phone,email), ${CHK})`;
const tidy = (job) => ({ ...job, assignments: (job.assignments || []).map((a) => ({ ...a, checkins: (a.checkins || []).slice().sort(byAt) })) });
const JOB_FIELDS = ['title', 'service', 'customer', 'site_name', 'address', 'city', 'state', 'postal', 'lat', 'lng', 'radius_m', 'timezone', 'starts_at', 'ends_at', 'crew_needed', 'instructions', 'manager_id', 'status'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

// ---------- Crew -------------------------------------------------------------------------------
export async function crewAssignments() {
  const rows = ok(await sb.from('assignments').select(`id,status,responded_at, job:jobs(*, ${MGR}), ${CHK}`).eq('contractor_id', uid()));
  return rows.filter((a) => a.job).map((a) => ({ ...a, checkins: (a.checkins || []).slice().sort(byAt) }));
}
export async function respond(aid, resp) { ok(await sb.rpc('respond_to_assignment', { p_assignment: aid, p_response: resp })); }
export async function checkIn(aid, kind, geo) {
  return ok(await sb.rpc('check_in', { p_assignment: aid, p_kind: kind, p_lat: geo ? geo.lat : null, p_lng: geo ? geo.lng : null, p_accuracy: geo ? geo.accuracy : null }));
}
export async function notifications() { return ok(await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)); }
export async function markRead() { ok(await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid()).is('read_at', null)); }

// ---------- Managers and admins ----------------------------------------------------------------
export async function jobs({ since } = {}) {
  let q = sb.from('jobs').select(JOB_FULL).order('starts_at');
  if (since) q = q.gte('ends_at', since);
  return ok(await q).map(tidy);
}
export async function jobById(id) { const r = ok(await sb.from('jobs').select(JOB_FULL).eq('id', id).maybeSingle()); return r ? tidy(r) : null; }
export async function saveJob(j) {
  const fields = pick(j, JOB_FIELDS);
  if (j.id) return tidy(ok(await sb.from('jobs').update(fields).eq('id', j.id).select(JOB_FULL).single()));
  return tidy(ok(await sb.from('jobs').insert({ ...fields, manager_id: j.manager_id || uid(), created_by: uid() }).select(JOB_FULL).single()));
}
export async function cancelJob(id) { ok(await sb.from('jobs').update({ status: 'cancelled' }).eq('id', id)); }
export async function crew() { return ok(await sb.from('profiles').select('id,full_name,phone,email,role,states,active').eq('role', 'contractor').order('full_name')); }
export async function eligibleCrew(jobId) {
  const [people, on] = await Promise.all([crew(), sb.from('assignments').select('contractor_id').eq('job_id', jobId)]);
  const taken = new Set(ok(on).map((a) => a.contractor_id));
  return people.filter((p) => p.active && !taken.has(p.id));
}
export async function assign(jobId, cid) { ok(await sb.from('assignments').insert({ job_id: jobId, contractor_id: cid })); }
export async function unassign(aid) { ok(await sb.from('assignments').delete().eq('id', aid)); }
export async function setAssignmentStatus(aid, status) { ok(await sb.from('assignments').update({ status }).eq('id', aid)); }
export async function managerCheckIn(aid, kind, atIso, note) {
  ok(await sb.rpc('manager_check_in', { p_assignment: aid, p_kind: kind, p_at: atIso || new Date().toISOString(), p_note: note || '' }));
}
export async function applications() { return ok(await sb.from('applications').select('*').order('created_at', { ascending: false }).limit(300)); }
export async function setApplication(id, patch) { ok(await sb.from('applications').update(pick(patch, ['status', 'notes'])).eq('id', id)); }
export async function requests() { return ok(await sb.from('service_requests').select('*').order('created_at', { ascending: false }).limit(300)); }
export async function setRequest(id, patch) { ok(await sb.from('service_requests').update(pick(patch, ['status', 'notes'])).eq('id', id)); }
export async function people() { return ok(await sb.from('profiles').select('id,full_name,phone,email,role,states,active,created_at').order('full_name')); }
export async function setPerson(id, patch) { ok(await sb.from('profiles').update(pick(patch, ['role', 'states', 'active', 'full_name', 'phone'])).eq('id', id)); }
