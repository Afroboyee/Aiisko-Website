// Tests the AISSKO Crew database rules against a real Postgres engine (PGlite).
// It imitates Supabase's roles (anon, authenticated) and auth.uid(), loads schema.sql,
// then acts as each kind of user and checks what they can and cannot do.
//
// Run:  cd crew-backend/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const db = new PGlite();

// ---- Imitate the parts of Supabase the schema depends on ----------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase hands new tables and functions to these roles by default; the schema must take that back.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
await db.exec(schema);
await db.exec(schema); // running it twice must be harmless

// ---- Tiny test kit ------------------------------------------------------------------------------
let passed = 0;
const failures = [];
const as = async (who, sql, params = []) => {
  await db.exec('reset role');
  if (who === 'superuser') return db.query(sql, params);
  if (who === 'anon') {
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false)`);
  } else {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${who.id}', false)`);
  }
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failures.push(name + (extra ? ' -> ' + extra : '')); console.log('  FAIL ' + name + (extra ? '  (' + extra + ')' : '')); }
};
const allowed = async (name, who, sql, params) => {
  try { const r = await as(who, sql, params); check(name, true); return r; }
  catch (e) { check(name, false, e.message); return null; }
};
// "blocked" means: it errors, or it quietly changes/returns nothing.
const blocked = async (name, who, sql, params) => {
  try { const r = await as(who, sql, params); check(name, r.rows.length === 0, 'it went through: ' + JSON.stringify(r.rows).slice(0, 120)); }
  catch (e) { check(name, true); }
};
const fails = async (name, who, sql, params, message) => {
  try { await as(who, sql, params); check(name, false, 'it should have failed'); }
  catch (e) { check(name, !message || e.message.includes(message), 'wrong error: ' + e.message); }
};
const count = async (who, sql, params) => (await as(who, sql, params)).rows.length;
const signup = async (email) => {
  const r = await as('superuser', 'insert into auth.users (email) values ($1) returning id', [email]);
  return { id: r.rows[0].id, email };
};
const apply = (who, fullName, email, state) => as(who, `insert into public.applications (full_name, email, state, consent) values ($1, $2, $3, true)`, [fullName, email, state]);

// ---- Cast ---------------------------------------------------------------------------------------
console.log('\nWebsite visitors (anonymous)');
await allowed('can send a contractor sign-up', 'anon', `insert into public.applications (full_name, email, state, services, consent) values ('Ana Reyes','ana@example.com','GA','{IMAC,ITAM}',true)`);
await apply('anon', 'Pat Pending', 'pending@example.com', 'GA');
await apply('anon', 'Tex Tran', 'tex@example.com', 'TX');
await allowed('can send a crew request', 'anon', `insert into public.service_requests (company, full_name, email, state, consent) values ('Acme','Cam Customer','cam@acme.test','GA',true)`);
await fails('cannot sign themselves up as already approved', 'anon', `insert into public.applications (full_name, email, state, consent, status) values ('Sly','sly@example.com','GA',true,'approved')`);
await fails('cannot skip the consent box', 'anon', `insert into public.applications (full_name, email, state, consent) values ('No Consent','nc@example.com','GA',false)`);
await fails('cannot read sign-ups', 'anon', `select * from public.applications`);
await fails('cannot read people', 'anon', `select * from public.profiles`);
await fails('cannot read jobs', 'anon', `select * from public.jobs`);
await fails('cannot run check-in', 'anon', `select public.check_in(gen_random_uuid(), 'in')`);

console.log('\nAccounts');
const owner = await signup('owner@example.com');
const mgrGA = await signup('mgr.ga@example.com');
const mgrTX = await signup('mgr.tx@example.com');
let r = await as('superuser', `select role, active from public.profiles where id = $1`, [owner.id]);
check('the owner email becomes an active admin', r.rows[0].role === 'admin' && r.rows[0].active === true);
r = await as('superuser', `select role, active from public.profiles where id = $1`, [mgrGA.id]);
check('everyone else starts as an inactive crew member', r.rows[0].role === 'contractor' && r.rows[0].active === false);
await fails('a new account cannot promote itself', mgrGA, `update public.profiles set role = 'admin', active = true where id = '${mgrGA.id}'`, [], 'Only an admin');
await allowed('admin makes the Georgia manager', owner, `update public.profiles set role='manager', states='{GA}', active=true where id = $1`, [mgrGA.id]);
await allowed('admin makes the Texas manager', owner, `update public.profiles set role='manager', states='{TX}', active=true where id = $1`, [mgrTX.id]);

console.log('\nManagers and sign-ups');
check('Georgia manager sees only Georgia sign-ups', (await count(mgrGA, `select 1 from public.applications`)) === 2);
check('Texas manager sees only Texas sign-ups', (await count(mgrTX, `select 1 from public.applications`)) === 1);
check('Georgia manager sees only Georgia crew requests', (await count(mgrGA, `select 1 from public.service_requests`)) === 1);
check('Texas manager sees no Georgia crew requests', (await count(mgrTX, `select 1 from public.service_requests`)) === 0);

const ana = await signup('ana@example.com');
const pat = await signup('pending@example.com');
const tex = await signup('tex@example.com');
const stranger = await signup('stranger@example.com');
r = await as('superuser', `select full_name, active from public.profiles where id = $1`, [ana.id]);
check('signing in fills the name from the sign-up', r.rows[0].full_name === 'Ana Reyes');
check('an unapproved person stays switched off', (await as('superuser', `select active from public.profiles where id = $1`, [ana.id])).rows[0].active === false);

const appId = async (email) => (await as('superuser', `select id from public.applications where email = $1`, [email])).rows[0].id;
await allowed('Georgia manager approves Ana', mgrGA, `update public.applications set status = 'approved' where id = $1 returning id`, [await appId('ana@example.com')]);
check('approving switches the account on', (await as('superuser', `select active from public.profiles where id = $1`, [ana.id])).rows[0].active === true);
await allowed('Georgia manager approves Pat', mgrGA, `update public.applications set status = 'approved' where id = $1 returning id`, [await appId('pending@example.com')]);
check('Pat is switched on too', (await as('superuser', `select active from public.profiles where id = $1`, [pat.id])).rows[0].active === true);
await blocked('Georgia manager cannot approve a Texas applicant', mgrGA, `update public.applications set status = 'approved' where email = 'tex@example.com' returning id`);
await allowed('Texas manager approves Tex', mgrTX, `update public.applications set status = 'approved' where id = $1 returning id`, [await appId('tex@example.com')]);
check('review is stamped with the reviewer', (await as('superuser', `select reviewed_by from public.applications where email='ana@example.com'`)).rows[0].reviewed_by === mgrGA.id);

console.log('\nJobs and assignments');
const jobSql = `insert into public.jobs (title, service, address, city, state, lat, lng, radius_m, starts_at, ends_at, crew_needed, manager_id, timezone)
                values ($1, 'IMAC', '100 Peachtree St', 'Atlanta', $2, 33.7490, -84.3880, 250, now() + interval '5 days', now() + interval '5 days 8 hours', 3, $3, 'America/New_York') returning id`;
const job = (await allowed('Georgia manager creates a Georgia job', mgrGA, jobSql, ['Rack refresh', 'GA', mgrGA.id])).rows[0].id;
await fails('Georgia manager cannot create a Texas job', mgrGA, jobSql, ['Sneaky', 'TX', mgrGA.id]);
await fails('a crew member cannot create a job', ana, jobSql, ['Nope', 'GA', mgrGA.id]);
await blocked('Texas manager cannot see the Georgia job', mgrTX, `select id from public.jobs`);
await blocked('Texas manager cannot edit the Georgia job', mgrTX, `update public.jobs set title='hacked' where id = $1 returning id`, [job]);
await fails('Georgia manager cannot move a job out of their area', mgrGA, `update public.jobs set state='TX' where id = $1`, [job]);
await fails('Georgia manager cannot create a Texas job even by naming themselves manager', mgrGA, jobSql, ['Sneaky 2', 'TX', mgrGA.id]);

const assign = (who, jobId, person) => as(who, `insert into public.assignments (job_id, contractor_id) values ($1, $2) returning id`, [jobId, person.id]);
const aAna = (await assign(mgrGA, job, ana)).rows[0].id;
check('Georgia manager assigns Ana', !!aAna);
try { await assign(mgrGA, job, tex); check('a Georgia manager cannot staff a Texas crew member', false); } catch (e) { check('a Georgia manager cannot staff a Texas crew member', true); }
const aTex = (await assign(owner, job, tex)).rows[0].id;
check('admin can staff someone from any state', !!aTex);
try { await assign(mgrGA, job, stranger); check('cannot assign someone who is not switched on', false); } catch (e) { check('cannot assign someone who is not switched on', true); }
try { await assign(mgrGA, job, mgrTX); check('cannot assign a manager as crew', false); } catch (e) { check('cannot assign a manager as crew', true); }
try { await assign(ana, job, pat); check('crew cannot assign people', false); } catch (e) { check('crew cannot assign people', true); }
check('Ana was notified about the new job', (await count(ana, `select 1 from public.notifications where title like 'New job:%'`)) === 1);

console.log('\nWhat crew can see');
check('Ana sees exactly her job', (await count(ana, `select 1 from public.jobs`)) === 1);
check('Ana sees only her assignment', (await count(ana, `select 1 from public.assignments`)) === 1);
check('Ana sees herself and her manager, nobody else', (await count(ana, `select 1 from public.profiles`)) === 2);
check('Ana sees no sign-ups', (await count(ana, `select 1 from public.applications`)) === 0);
check("Pat (not on a job) sees no jobs", (await count(pat, `select 1 from public.jobs`)) === 0);
await fails('Ana cannot read the settings table', ana, `select * from public.app_settings`);
await blocked('Ana cannot edit the job', ana, `update public.jobs set title = 'x' where id = $1 returning id`, [job]);
await blocked('Ana cannot delete the job', ana, `delete from public.jobs where id = $1 returning id`, [job]);
await fails("Ana cannot promote herself", ana, `update public.profiles set role = 'admin' where id = $1`, [ana.id], 'Only an admin');
await fails("Ana cannot widen her own states", ana, `update public.profiles set states = '{GA,TX}' where id = $1`, [ana.id], 'Only an admin');
await allowed('Ana can change her own phone number', ana, `update public.profiles set phone = '555-0100' where id = $1 returning id`, [ana.id]);
await blocked("Ana cannot edit Tex's profile", ana, `update public.profiles set phone = '000' where id = $1 returning id`, [tex.id]);
await fails('Ana cannot add check-ins directly', ana, `insert into public.checkins (assignment_id, kind, source) values ($1, 'in', 'self')`, [aAna]);
await blocked("Ana cannot change her assignment status directly", ana, `update public.assignments set status = 'completed' where id = $1 returning id`, [aAna]);
check("and her status really did not change", (await as('superuser', `select status from public.assignments where id = $1`, [aAna])).rows[0].status === 'assigned');

console.log('\nConfirming, declining, and the check-in window');
await allowed('Ana confirms her job', ana, `select * from public.respond_to_assignment($1, 'confirmed')`, [aAna]);
await fails("Ana cannot respond for Tex", ana, `select * from public.respond_to_assignment($1, 'confirmed')`, [aTex], 'not found');
await fails('only confirm or decline are allowed', ana, `select * from public.respond_to_assignment($1, 'completed')`, [aAna], 'Invalid');
check('the manager was told Ana confirmed', (await count(mgrGA, `select 1 from public.notifications where title like '%confirmed'`)) === 1);
await fails('check-in is closed days before the job', ana, `select * from public.check_in($1, 'in', 33.7490, -84.3880, 10)`, [aAna], 'opens 60 minutes');

// Move the job to start in 10 minutes (as the admin) and tell the crew.
await allowed('admin moves the job to start soon', owner, `update public.jobs set starts_at = now() + interval '10 minutes', ends_at = now() + interval '8 hours' where id = $1 returning id`, [job]);
check('Ana was notified the job changed', (await count(ana, `select 1 from public.notifications where title like 'Job updated:%'`)) === 1);
await fails('check-in needs a location when the job has an address pin', ana, `select * from public.check_in($1, 'in')`, [aAna], 'Location is needed');
const far = (await allowed('Ana can check in from far away (but it is flagged)', ana, `select * from public.check_in($1, 'in', 34.2000, -84.0000, 15)`, [aAna])).rows[0];
check('far check-in is marked outside the site', far.within_site === false && far.distance_m > 10000, JSON.stringify(far));
check('the manager is warned about it', (await count(mgrGA, `select 1 from public.notifications where title like '%away from the site'`)) === 1);
await fails('cannot check in twice', ana, `select * from public.check_in($1, 'in', 33.7490, -84.3880, 10)`, [aAna], 'already checked in');
await allowed('Ana checks out', ana, `select * from public.check_in($1, 'out', 33.7490, -84.3880, 10)`, [aAna]);
await fails('cannot check out twice', ana, `select * from public.check_in($1, 'out', 33.7490, -84.3880, 10)`, [aAna], 'not checked in');
const near = (await allowed('Ana checks in again, at the site', ana, `select * from public.check_in($1, 'in', 33.7491, -84.3881, 20)`, [aAna])).rows[0];
check('at the site is marked inside', near.within_site === true && near.distance_m < 50, JSON.stringify(near));
check('Ana sees her own check-ins', (await count(ana, `select 1 from public.checkins`)) === 3);
check('Texas manager sees none of them', (await count(mgrTX, `select 1 from public.checkins`)) === 0);
check('Georgia manager sees all of them', (await count(mgrGA, `select 1 from public.checkins`)) === 3);

console.log('\nDeclining and switched-off accounts');
await allowed('Tex declines', tex, `select * from public.respond_to_assignment($1, 'declined')`, [aTex]);
check('the manager was told Tex cannot make it', (await count(mgrGA, `select 1 from public.notifications where title like '%can''t make it'`)) === 1);
await fails('Tex cannot check in after declining', tex, `select * from public.check_in($1, 'in', 33.7490, -84.3880, 10)`, [aTex], 'not on this job');
// Switch Pat off after being assigned, and make sure a switched-off account is locked out.
const aPat = (await as('superuser', `insert into public.assignments (job_id, contractor_id) values ($1, $2) returning id`, [job, pat.id])).rows[0].id;
await allowed('admin switches Pat off', owner, `update public.profiles set active = false where id = $1 returning id`, [pat.id]);
await fails('a switched-off account cannot check in', pat, `select * from public.check_in($1, 'in', 33.7490, -84.3880, 10)`, [aPat], 'not active');
check('a switched-off account sees no jobs', (await count(pat, `select 1 from public.jobs`)) === 0);

console.log('\nManager check-ins');
await allowed('Georgia manager checks Tex in', mgrGA, `select * from public.manager_check_in($1, 'in', now(), 'Arrived with the truck')`, [aTex]);
check('that puts Tex back on the job', (await as('superuser', `select status from public.assignments where id = $1`, [aTex])).rows[0].status === 'confirmed');
await fails('Texas manager cannot check people in on a Georgia job', mgrTX, `select * from public.manager_check_in($1, 'in')`, [aTex], 'Not allowed');
await fails('crew cannot use the manager check-in', ana, `select * from public.manager_check_in($1, 'out')`, [aAna], 'Not allowed');
await fails('manager check-ins cannot be set in the future', mgrGA, `select * from public.manager_check_in($1, 'out', now() + interval '2 hours')`, [aTex], 'future');
const mc = (await as('superuser', `select source, by_user, note from public.checkins where assignment_id = $1`, [aTex])).rows[0];
check('manager check-ins are labelled and signed', mc.source === 'manager' && mc.by_user === mgrGA.id && mc.note.includes('truck'));

console.log('\nNotifications, admin, and clean-up');
check('Ana sees only her own notifications', (await count(ana, `select 1 from public.notifications where user_id <> '${ana.id}'`)) === 0);
await allowed('Ana marks a notification read', ana, `update public.notifications set read_at = now() where user_id = $1 returning id`, [ana.id]);
await fails('Ana cannot rewrite a notification', ana, `update public.notifications set title = 'x' where user_id = $1`, [ana.id]);
check('admin sees every job', (await count(owner, `select 1 from public.jobs`)) === 1);
check('admin sees every sign-up', (await count(owner, `select 1 from public.applications`)) === 3);
check('admin sees every person', (await count(owner, `select 1 from public.profiles`)) === 7);
await blocked('a manager cannot delete a job', mgrGA, `delete from public.jobs where id = $1 returning id`, [job]);
await blocked('a manager cannot delete a check-in', mgrGA, `delete from public.checkins returning id`);
await allowed('admin can delete a job', owner, `delete from public.jobs where id = $1 returning id`, [job]);
check('deleting a job removes its assignments and check-ins', (await count('superuser', `select 1 from public.checkins`)) === 0);

console.log('\nWhat the website and the app send');
const joinRow = { full_name: 'Web Person', email: 'web@example.com', phone: '555-0100', state: 'GA', city: 'Atlanta', experience: '3 to 5 years', services: ['IMAC', 'E-waste'], availability: 'Full-time', travel: 'Regionally', credentials: '', link: '', message: '', consent: true };
await allowed('a website contractor sign-up, exactly as the site sends it, is accepted', 'anon',
  `insert into public.applications (full_name, email, phone, state, city, experience, services, availability, travel, credentials, link, message, consent)
   select full_name, email, phone, state, city, experience, services, availability, travel, credentials, link, message, consent
     from json_to_recordset($1::json) as t(full_name text, email text, phone text, state text, city text, experience text, services text[], availability text, travel text, credentials text, link text, message text, consent boolean)`, [JSON.stringify([joinRow])]);
const reqRow = { company: 'Acme', full_name: 'Cam', email: 'cam@acme.test', phone: '', services: ['IMAC'], state: 'TX', site: 'Dallas', timeframe: 'Within 30 days', crew_size: '3 to 5 people', message: '', consent: true };
await allowed('a website crew request, exactly as the site sends it, is accepted', 'anon',
  `insert into public.service_requests (company, full_name, email, phone, services, state, site, timeframe, crew_size, message, consent)
   select company, full_name, email, phone, services, state, site, timeframe, crew_size, message, consent
     from json_to_recordset($1::json) as t(company text, full_name text, email text, phone text, services text[], state text, site text, timeframe text, crew_size text, message text, consent boolean)`, [JSON.stringify([reqRow])]);
const fk = (await as('superuser', `select conname from pg_constraint where conname in ('jobs_manager_id_fkey', 'assignments_contractor_id_fkey')`)).rows.map((r) => r.conname).sort();
check('the links the app reads through exist under the expected names', fk.join() === 'assignments_contractor_id_fkey,jobs_manager_id_fkey', fk.join());

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('\nFailures:\n - ' + failures.join('\n - ')); process.exit(1); }
