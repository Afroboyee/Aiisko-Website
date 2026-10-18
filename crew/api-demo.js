// Demo backend: the whole app running on sample data stored in this browser only.
// It follows the same rules as the real database (check-in window, who can see what),
// so what you click through here is what crews and managers get once the database is connected.
import { haversineM, zoneForState } from './lib.js';

const KEY = 'aissko-crew-demo-v1';
const USER_KEY = 'aissko-crew-demo-user';
export const mode = 'demo';
export const demoPersonas = [
  { id: 'p-ana', label: 'Crew member', name: 'Ana Reyes', note: 'Sees her jobs, confirms, checks in and out' },
  { id: 'p-dana', label: 'Manager (Georgia)', name: 'Dana Brooks', note: 'Runs jobs, sees who is on site, fixes check-ins' },
  { id: 'p-owner', label: 'Owner / admin', name: 'You', note: 'Sees everything, approves people, sets managers' }
];
export const demo = { away: false }; // flip to simulate checking in from far away

let db = null;
const iso = (ms) => new Date(ms).toISOString();
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const save = () => localStorage.setItem(KEY, JSON.stringify(db));

function seed() {
  const now = Date.now(), H = 3600000, D = 24 * H, M = 60000;
  const person = (id, name, role, states, active, phone) => ({ id, email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', full_name: name, phone, role, states, active, created_at: iso(now - 30 * D) });
  const profiles = [
    person('p-owner', 'Jordan Owner', 'admin', [], true, '404-555-0100'),
    person('p-dana', 'Dana Brooks', 'manager', ['GA'], true, '404-555-0111'),
    person('p-ray', 'Ray Collins', 'manager', ['TX'], true, '214-555-0122'),
    person('p-ana', 'Ana Reyes', 'contractor', ['GA'], true, '404-555-0133'),
    person('p-marcus', 'Marcus Webb', 'contractor', ['GA'], true, '678-555-0144'),
    person('p-priya', 'Priya Shah', 'contractor', ['GA'], true, '770-555-0155'),
    person('p-luis', 'Luis Ortega', 'contractor', ['GA'], true, '470-555-0166'),
    person('p-jae', 'Jae Kim', 'contractor', ['GA'], false, '404-555-0177'),
    person('p-tex', 'Tex Tran', 'contractor', ['TX'], true, '972-555-0188'),
    person('p-mia', 'Mia Alvarez', 'contractor', ['TX'], true, '469-555-0199')
  ];
  const job = (id, p) => ({ id, created_at: iso(now - 2 * D), created_by: 'p-dana', customer: '', site_name: '', city: '', postal: '', radius_m: 250, instructions: '', status: 'scheduled', ...p, timezone: zoneForState(p.state) });
  const jobs = [
    job('j-e', { title: 'E-waste pickup and sort', service: 'E-waste', customer: 'Northside Health', site_name: 'Loading dock B', address: '1100 Peachtree St NE', city: 'Atlanta', state: 'GA', postal: '30309', lat: 33.7816, lng: -84.3836, starts_at: iso(now - 2 * H), ends_at: iso(now + 3 * H), crew_needed: 3, manager_id: 'p-dana', instructions: 'Dock B, ask for Tom at the front desk. Gloves and safety shoes required.' }),
    job('j-r', { title: 'Rack refresh, Midtown data hall', service: 'IMAC', customer: 'Peachtree Financial', site_name: 'Data hall 2', address: '400 W Peachtree St NW', city: 'Atlanta', state: 'GA', postal: '30308', lat: 33.7733, lng: -84.3880, starts_at: iso(now + 25 * M), ends_at: iso(now + 8.4 * H), crew_needed: 4, manager_id: 'p-dana', instructions: 'Badge pickup at security, ground floor. Bring photo ID. Closed-toe shoes only.' }),
    job('j-w', { title: 'Warehouse cage moves', service: 'Warehouse movement', customer: 'Blue Ridge Logistics', site_name: 'Warehouse 4', address: '2050 Fulton Industrial Blvd', city: 'Atlanta', state: 'GA', postal: '30336', lat: 33.7625, lng: -84.5340, starts_at: iso(now + 20 * H), ends_at: iso(now + 28 * H), crew_needed: 3, manager_id: 'p-dana', instructions: 'Forklift certified lead on site. Park in lot C.' }),
    job('j-a', { title: 'ITAM audit, Alpharetta campus', service: 'ITAM', customer: 'Summit Insurance', site_name: 'Building 2', address: '3000 Old Alabama Rd', city: 'Alpharetta', state: 'GA', postal: '30022', lat: 34.0616, lng: -84.2744, starts_at: iso(now + 3 * D + 2 * H), ends_at: iso(now + 3 * D + 10 * H), crew_needed: 2, manager_id: 'p-dana', instructions: 'Bring a phone with a camera. Scan every device tag.' }),
    job('j-c', { title: 'Data hall cleaning, floor 3', service: 'Data-center cleaning', customer: 'Peachtree Financial', site_name: 'Floor 3', address: '400 W Peachtree St NW', city: 'Atlanta', state: 'GA', postal: '30308', lat: 33.7733, lng: -84.388, starts_at: iso(now - 1 * D - 6 * H), ends_at: iso(now - 1 * D + 2 * H), crew_needed: 2, manager_id: 'p-dana', status: 'completed' }),
    job('j-t', { title: 'Office move, Dallas', service: 'IMAC', customer: 'Lone Star Legal', site_name: 'Suite 900', address: '2001 Ross Ave', city: 'Dallas', state: 'TX', postal: '75201', lat: 32.7878, lng: -96.7992, starts_at: iso(now + 18 * H), ends_at: iso(now + 27 * H), crew_needed: 2, manager_id: 'p-ray', created_by: 'p-ray' })
  ];
  const as = (id, job_id, contractor_id, status = 'confirmed') => ({ id, job_id, contractor_id, status, responded_at: status === 'assigned' ? null : iso(now - 5 * H), created_at: iso(now - 2 * D), created_by: 'p-dana' });
  const assignments = [
    as('a-e1', 'j-e', 'p-marcus'), as('a-e2', 'j-e', 'p-luis'), as('a-e3', 'j-e', 'p-priya'),
    as('a-r1', 'j-r', 'p-ana'), as('a-r2', 'j-r', 'p-marcus'), as('a-r3', 'j-r', 'p-priya', 'assigned'),
    as('a-w1', 'j-w', 'p-ana', 'assigned'), as('a-w2', 'j-w', 'p-marcus', 'assigned'),
    as('a-a1', 'j-a', 'p-ana', 'assigned'),
    as('a-c1', 'j-c', 'p-ana', 'completed'), as('a-c2', 'j-c', 'p-luis', 'completed'),
    as('a-t1', 'j-t', 'p-tex'), as('a-t2', 'j-t', 'p-mia', 'assigned')
  ];
  const ci = (assignment_id, kind, at, within = true, dist = 40, source = 'self', note = '') => ({ id: uid('c'), assignment_id, kind, at: iso(at), source, within_site: within, distance_m: dist, note });
  const checkins = [
    ci('a-e1', 'in', now - 1.9 * H), ci('a-e2', 'in', now - 1.7 * H, false, 1900),
    ci('a-c1', 'in', now - 1 * D - 5.9 * H), ci('a-c1', 'out', now - 1 * D + 1.9 * H), ci('a-c2', 'in', now - 1 * D - 5.8 * H), ci('a-c2', 'out', now - 1 * D + 2 * H)
  ];
  const applications = [
    { id: 'ap-1', created_at: iso(now - 2 * H), full_name: 'Devon Carter', email: 'devon.carter@example.com', phone: '404-555-0201', state: 'GA', city: 'Marietta', experience: '3 to 5 years', services: ['IMAC', 'ITAM'], availability: 'Full-time', travel: 'Regionally', credentials: 'CompTIA A+, own tools', link: '', message: 'Worked data-center installs for four years.', status: 'new', notes: '' },
    { id: 'ap-2', created_at: iso(now - 1 * D), full_name: 'Keisha Powell', email: 'keisha.powell@example.com', phone: '678-555-0202', state: 'GA', city: 'Decatur', experience: '5 or more years', services: ['Warehouse movement', 'E-waste'], availability: 'Weekends and evenings', travel: 'Within my state', credentials: 'Forklift certified', link: '', message: '', status: 'reviewing', notes: 'Call Thursday' },
    { id: 'ap-3', created_at: iso(now - 3 * D), full_name: 'Sam Whitfield', email: 'sam.whitfield@example.com', phone: '770-555-0203', state: 'GA', city: 'Roswell', experience: '1 to 3 years', services: ['Data-center cleaning'], availability: 'Part-time', travel: 'No, local work only', credentials: '', link: '', message: '', status: 'approved', notes: '' },
    { id: 'ap-4', created_at: iso(now - 5 * H), full_name: 'Rosa Medina', email: 'rosa.medina@example.com', phone: '214-555-0204', state: 'TX', city: 'Plano', experience: '3 to 5 years', services: ['IMAC'], availability: 'Full-time', travel: 'Anywhere', credentials: '', link: '', message: '', status: 'new', notes: '' }
  ];
  const requests = [
    { id: 'rq-1', created_at: iso(now - 4 * H), company: 'Harbor Systems', full_name: 'Lee Foster', email: 'lee@harborsystems.test', phone: '404-555-0301', services: ['IMAC', 'ITAM'], state: 'GA', site: 'Savannah data center', timeframe: 'Within 30 days', crew_size: '3 to 5 people', message: 'Moving 60 racks and tagging everything.', status: 'new', notes: '' },
    { id: 'rq-2', created_at: iso(now - 2 * D), company: 'Alamo Retail', full_name: 'Gina Ruiz', email: 'gina@alamoretail.test', phone: '210-555-0302', services: ['Warehouse movement'], state: 'TX', site: 'San Antonio DC', timeframe: 'In 1 to 3 months', crew_size: '6 to 10 people', message: '', status: 'contacted', notes: '' }
  ];
  const notifications = [
    { id: 'n-1', user_id: 'p-ana', title: 'New job: ITAM audit, Alpharetta campus', body: 'Check the date and confirm you can make it.', job_id: 'j-a', created_at: iso(now - 3 * H), read_at: null },
    { id: 'n-2', user_id: 'p-dana', title: 'Luis Ortega checked in away from the site', body: 'E-waste pickup and sort · about 1900 m from the address', job_id: 'j-e', created_at: iso(now - 1.7 * H), read_at: null }
  ];
  return { profiles, jobs, assignments, checkins, applications, requests, notifications };
}

export function init() {
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
  if (!db) { db = seed(); save(); }
}
export function resetDemo() { db = seed(); save(); }

// ---------- Sign-in ----------------------------------------------------------------------------
export const user = () => { const id = localStorage.getItem(USER_KEY); const p = db.profiles.find((x) => x.id === id); return p ? { id: p.id, email: p.email } : null; };
export const signInDemo = (id) => { localStorage.setItem(USER_KEY, id); };
export const signOut = async () => { localStorage.removeItem(USER_KEY); };
export const onAuthChange = () => {};
export const signInStart = async () => ({ needsCode: false });
export const signInVerify = async () => { throw new Error('Demo mode has no codes. Pick a role instead.'); };

const me = () => db.profiles.find((p) => p.id === localStorage.getItem(USER_KEY));
const isAdmin = () => me() && me().role === 'admin' && me().active;
const isMgr = () => me() && me().role === 'manager' && me().active;
const scoped = (state) => isAdmin() || (isMgr() && me().states.includes(state));
const fail = (m) => { throw new Error(m); };

export const loadProfile = async () => clone(me());
export async function updateMyProfile(p) { Object.assign(me(), { full_name: p.full_name, phone: p.phone }); save(); return clone(me()); }

// ---------- Shaping ----------------------------------------------------------------------------
const pub = (p) => p && { id: p.id, full_name: p.full_name, phone: p.phone, email: p.email, role: p.role, states: p.states, active: p.active };
const withCheckins = (a) => ({ ...a, checkins: db.checkins.filter((c) => c.assignment_id === a.id).sort((x, y) => new Date(x.at) - new Date(y.at)) });
function fullJob(j) {
  return {
    ...j,
    manager: pub(db.profiles.find((p) => p.id === j.manager_id)) || null,
    assignments: db.assignments.filter((a) => a.job_id === j.id).map((a) => ({ ...withCheckins(a), contractor: pub(db.profiles.find((p) => p.id === a.contractor_id)) }))
  };
}
const notify = (user_id, title, body, job_id) => db.notifications.push({ id: uid('n'), user_id, title, body, job_id, created_at: iso(Date.now()), read_at: null });

// ---------- Crew -------------------------------------------------------------------------------
export async function crewAssignments() {
  if (!me() || !me().active) return [];
  return clone(db.assignments.filter((a) => a.contractor_id === me().id).map((a) => {
    const j = db.jobs.find((x) => x.id === a.job_id);
    return { ...withCheckins(a), job: { ...j, manager: pub(db.profiles.find((p) => p.id === j.manager_id)) } };
  }));
}
export async function respond(aid, resp) {
  const a = db.assignments.find((x) => x.id === aid && x.contractor_id === me().id) || fail('Assignment not found');
  const j = db.jobs.find((x) => x.id === a.job_id);
  if (!['confirmed', 'declined'].includes(resp)) fail('Invalid response');
  if (['no_show', 'completed'].includes(a.status)) fail('This assignment is closed');
  if (j.status !== 'scheduled') fail('This job is no longer scheduled');
  if (Date.now() > new Date(j.ends_at)) fail('This job has already ended');
  a.status = resp; a.responded_at = iso(Date.now());
  if (j.manager_id) notify(j.manager_id, `${me().full_name} ${resp === 'declined' ? "can't make it" : 'confirmed'}`, j.title, j.id);
  save();
}
export async function checkIn(aid, kind, geo) {
  const a = db.assignments.find((x) => x.id === aid && x.contractor_id === me().id) || fail('Assignment not found');
  const j = db.jobs.find((x) => x.id === a.job_id);
  if (!['assigned', 'confirmed'].includes(a.status)) fail('You are not on this job');
  const now = Date.now();
  if (j.status !== 'scheduled') fail('This job is not scheduled');
  if (now < new Date(j.starts_at).getTime() - 60 * 60000) fail('Check-in opens 60 minutes before the start time');
  if (now > new Date(j.ends_at).getTime() + 6 * 3600000) fail('This job ended too long ago to check in. Ask your manager.');
  const last = db.checkins.filter((c) => c.assignment_id === a.id).sort((x, y) => new Date(x.at) - new Date(y.at)).pop();
  if (kind === 'in' && last && last.kind === 'in') fail('You are already checked in');
  if (kind === 'out' && !(last && last.kind === 'in')) fail('You are not checked in');
  // The demo cannot be at the sample addresses, so it simulates a location.
  const lat = demo.away ? j.lat + 0.02 : j.lat + 0.0004, lng = demo.away ? j.lng + 0.02 : j.lng + 0.0004;
  const dist = haversineM(lat, lng, j.lat, j.lng), inside = dist <= j.radius_m + 20;
  const rec = { id: uid('c'), assignment_id: a.id, kind, at: iso(now), source: 'self', lat, lng, accuracy_m: 20, distance_m: dist, within_site: inside, note: '' };
  db.checkins.push(rec);
  if (kind === 'in' && !inside && j.manager_id) notify(j.manager_id, `${me().full_name} checked in away from the site`, `${j.title} · about ${Math.round(dist)} m from the address`, j.id);
  save();
  return clone(rec);
}
export async function notifications() { return clone(db.notifications.filter((n) => n.user_id === me().id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); }
export async function markRead() { db.notifications.filter((n) => n.user_id === me().id && !n.read_at).forEach((n) => { n.read_at = iso(Date.now()); }); save(); }

// ---------- Managers and admins ----------------------------------------------------------------
export async function jobs({ since } = {}) {
  const from = since ? new Date(since).getTime() : 0;
  return clone(db.jobs.filter((j) => scoped(j.state) && new Date(j.ends_at).getTime() >= from).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).map(fullJob));
}
export async function jobById(id) { const j = db.jobs.find((x) => x.id === id && scoped(x.state)); return j ? clone(fullJob(j)) : null; }
export async function saveJob(j) {
  if (!scoped(j.state)) fail('You can only manage jobs in your own states');
  if (new Date(j.ends_at) <= new Date(j.starts_at)) fail('The end time must be after the start time');
  if (j.id) {
    const cur = db.jobs.find((x) => x.id === j.id) || fail('Job not found');
    const changed = ['starts_at', 'ends_at', 'address', 'city', 'instructions'].some((k) => String(cur[k]) !== String(j[k] ?? cur[k]));
    Object.assign(cur, j);
    if (changed) db.assignments.filter((a) => a.job_id === cur.id && ['assigned', 'confirmed'].includes(a.status)).forEach((a) => notify(a.contractor_id, 'Job updated: ' + cur.title, cur.address, cur.id));
    save(); return clone(fullJob(cur));
  }
  const rec = { created_at: iso(Date.now()), created_by: me().id, customer: '', site_name: '', city: '', postal: '', radius_m: 250, instructions: '', status: 'scheduled', manager_id: me().id, ...j, id: uid('j') };
  db.jobs.push(rec); save(); return clone(fullJob(rec));
}
export async function cancelJob(id) {
  const j = db.jobs.find((x) => x.id === id && scoped(x.state)) || fail('Job not found');
  j.status = 'cancelled';
  db.assignments.filter((a) => a.job_id === id && ['assigned', 'confirmed'].includes(a.status)).forEach((a) => notify(a.contractor_id, 'Job cancelled: ' + j.title, j.address, j.id));
  save();
}
export async function eligibleCrew(jobId) {
  const j = db.jobs.find((x) => x.id === jobId);
  const already = new Set(db.assignments.filter((a) => a.job_id === jobId).map((a) => a.contractor_id));
  return clone(db.profiles.filter((p) => p.role === 'contractor' && p.active && !already.has(p.id) && (isAdmin() || p.states.some((s) => me().states.includes(s)))).map(pub));
}
export async function assign(jobId, cid) {
  const j = db.jobs.find((x) => x.id === jobId && scoped(x.state)) || fail('Job not found');
  const p = db.profiles.find((x) => x.id === cid && x.role === 'contractor' && x.active) || fail('That person is not switched on yet');
  if (!isAdmin() && !p.states.some((s) => me().states.includes(s))) fail('That person is outside your states');
  if (db.assignments.some((a) => a.job_id === jobId && a.contractor_id === cid)) fail('Already on this job');
  db.assignments.push({ id: uid('a'), job_id: jobId, contractor_id: cid, status: 'assigned', responded_at: null, created_at: iso(Date.now()), created_by: me().id });
  notify(cid, 'New job: ' + j.title, j.address, j.id); save();
}
export async function unassign(aid) {
  const a = db.assignments.find((x) => x.id === aid) || fail('Not found');
  const j = db.jobs.find((x) => x.id === a.job_id);
  if (!scoped(j.state)) fail('Not allowed');
  db.assignments = db.assignments.filter((x) => x.id !== aid); db.checkins = db.checkins.filter((c) => c.assignment_id !== aid); save();
}
export async function setAssignmentStatus(aid, status) {
  const a = db.assignments.find((x) => x.id === aid) || fail('Not found');
  if (!scoped(db.jobs.find((x) => x.id === a.job_id).state)) fail('Not allowed');
  a.status = status; save();
}
export async function managerCheckIn(aid, kind, atIso, note) {
  const a = db.assignments.find((x) => x.id === aid) || fail('Not found');
  if (!scoped(db.jobs.find((x) => x.id === a.job_id).state)) fail('Not allowed');
  const at = atIso ? new Date(atIso).getTime() : Date.now();
  if (at > Date.now() + 5 * 60000) fail('That time is in the future');
  db.checkins.push({ id: uid('c'), assignment_id: aid, kind, at: iso(at), source: 'manager', lat: null, lng: null, accuracy_m: null, distance_m: null, within_site: null, note: note || '' });
  if (kind === 'in' && ['assigned', 'declined', 'no_show'].includes(a.status)) a.status = 'confirmed';
  save();
}
export async function crew() { return clone(db.profiles.filter((p) => p.role === 'contractor' && (isAdmin() || p.states.some((s) => me().states.includes(s)))).map(pub)); }
export async function applications() { return clone(db.applications.filter((a) => scoped(a.state)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); }
export async function setApplication(id, patch) {
  const a = db.applications.find((x) => x.id === id && scoped(x.state)) || fail('Not found');
  const was = a.status; Object.assign(a, patch);
  if (patch.status === 'approved' && was !== 'approved') { const p = db.profiles.find((x) => x.email.toLowerCase() === a.email.toLowerCase()); if (p) { p.active = true; } }
  save();
}
export async function requests() { return clone(db.requests.filter((a) => scoped(a.state)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); }
export async function setRequest(id, patch) { const a = db.requests.find((x) => x.id === id && scoped(x.state)) || fail('Not found'); Object.assign(a, patch); save(); }
export async function people() { if (!isAdmin()) fail('Admins only'); return clone(db.profiles.map(pub)); }
export async function setPerson(id, patch) { if (!isAdmin()) fail('Admins only'); Object.assign(db.profiles.find((p) => p.id === id) || fail('Not found'), patch); save(); }
