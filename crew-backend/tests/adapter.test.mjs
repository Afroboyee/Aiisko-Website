// Smoke test for crew/api-live.js: every call reaches the right table or action with the right names.
// Uses a stand-in for the Supabase client, so it does not prove a live project works; it catches typos and wiring slips.
import assert from 'node:assert/strict';

const calls = [];
const builder = (table) => {
  const state = { single: false };
  const chain = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve({ data: state.single ? { id: 'x1', checkins: [] } : [], error: null });
      return (...args) => { calls.push([table, prop, ...args]); if (prop === 'single' || prop === 'maybeSingle') state.single = true; return chain; };
    }
  });
  return chain;
};
const fake = {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.co' } } } }),
    onAuthStateChange() {}, signOut: async () => ({}),
    signInWithOtp: async (a) => { calls.push(['auth', 'signInWithOtp', a]); return { error: null }; },
    verifyOtp: async (a) => { calls.push(['auth', 'verifyOtp', a]); return { data: { session: { user: { id: 'u1' } } }, error: null }; }
  },
  from: (t) => builder(t),
  rpc: (name, args) => { calls.push(['rpc', name, args]); return Promise.resolve({ data: { id: 'c1' }, error: null }); }
};
globalThis.window = { supabase: { createClient: () => fake } };
globalThis.document = {};
globalThis.location = { origin: 'https://aissko.com', pathname: '/crew/' };

const api = await import('../../crew/api-live.js');
await api.init({ supabaseUrl: 'https://x.supabase.co', supabaseKey: 'k' });
assert.equal(api.user().id, 'u1');

const used = (table, method) => calls.some((c) => c[0] === table && c[1] === method);
await api.signInStart('A@B.co ');
assert.deepEqual(calls.find((c) => c[1] === 'signInWithOtp')[2].email, 'A@B.co');
await api.signInVerify('a@b.co', '123 456');
assert.equal(calls.find((c) => c[1] === 'verifyOtp')[2].token, '123456');

await api.loadProfile(); await api.updateMyProfile({ full_name: 'A', phone: '1' });
await api.crewAssignments(); await api.notifications(); await api.markRead();
await api.jobs({ since: new Date().toISOString() }); await api.jobById('j1');
await api.saveJob({ title: 't', state: 'GA', address: 'a', starts_at: 'x', ends_at: 'y', manager: { ignored: true }, assignments: [] });
await api.saveJob({ id: 'j1', title: 't' }); await api.cancelJob('j1');
await api.crew(); await api.eligibleCrew('j1');
await api.assign('j1', 'c1'); await api.unassign('a1'); await api.setAssignmentStatus('a1', 'no_show');
await api.applications(); await api.setApplication('ap1', { status: 'approved', notes: 'n', role: 'admin' });
await api.requests(); await api.setRequest('r1', { status: 'quoted' });
await api.people(); await api.setPerson('p1', { role: 'manager', states: ['GA'], active: true, email: 'no@no.no' });
await api.respond('a1', 'confirmed');
const rec = await api.checkIn('a1', 'in', { lat: 1, lng: 2, accuracy: 3 });
await api.checkIn('a1', 'out', null);
await api.managerCheckIn('a1', 'in', '2026-01-01T00:00:00Z', 'note');

for (const t of ['profiles', 'assignments', 'notifications', 'jobs', 'applications', 'service_requests']) assert.ok(calls.some((c) => c[0] === t), 'never touched ' + t);
const rpc = (n) => calls.filter((c) => c[0] === 'rpc' && c[1] === n);
assert.deepEqual(rpc('check_in')[0][2], { p_assignment: 'a1', p_kind: 'in', p_lat: 1, p_lng: 2, p_accuracy: 3 });
assert.deepEqual(rpc('check_in')[1][2], { p_assignment: 'a1', p_kind: 'out', p_lat: null, p_lng: null, p_accuracy: null });
assert.deepEqual(rpc('respond_to_assignment')[0][2], { p_assignment: 'a1', p_response: 'confirmed' });
assert.deepEqual(rpc('manager_check_in')[0][2], { p_assignment: 'a1', p_kind: 'in', p_at: '2026-01-01T00:00:00Z', p_note: 'note' });
// Only allowed fields are ever sent when saving.
const ins = calls.find((c) => c[0] === 'jobs' && c[1] === 'insert')[2];
assert.ok(!('manager' in ins) && !('assignments' in ins), 'nested data leaked into the save');
assert.equal(ins.created_by, 'u1'); assert.equal(ins.manager_id, 'u1');
const appUpd = calls.find((c) => c[0] === 'applications' && c[1] === 'update')[2];
assert.deepEqual(Object.keys(appUpd).sort(), ['notes', 'status']);
const perUpd = calls.find((c) => c[0] === 'profiles' && c[1] === 'update' && 'role' in c[2])[2];
assert.ok(!('email' in perUpd), 'email must not be editable from the team screen');
assert.equal(rec.id, 'c1');
console.log('adapter wiring: ok (' + calls.length + ' calls checked)');
