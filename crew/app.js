// AISSKO Crew: the app screens. Crew see their jobs and check in. Managers run jobs and see who is on site.
import {
  html, raw, esc, zoneForState, ZONE_CHOICES, zonedToUtc, utcToZoned, dayKey, fmtTime, fmtDay, fmtDayLong, tzAbbr, relDay, fmtRange, timeAgo, untilText,
  distText, telHref, mapsHref, assignState, windowState, lastCheckin, SERVICES, STATES
} from './lib.js';

const cfg = window.CREW_CONFIG || {};
const params = new URLSearchParams(location.search);
const live = !!(cfg.supabaseUrl && cfg.supabaseKey) && !params.has('demo');
const api = await import(live ? './api-live.js' : './api-demo.js');
await api.init(cfg);

const $ = (s, r = document) => r.querySelector(s);
const S = { profile: null, unread: 0, newInbox: 0, draft: null, inboxTab: 'applicants', jobFilter: 'upcoming', peopleQuery: '' };

// ---------- Icons ------------------------------------------------------------------------------
const ICONS = {
  today: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
  jobs: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.4c2.3.2 3.7 1.7 4.2 4.1"/>',
  inbox: '<path d="M3.5 13.5 6 5.5h12l2.5 8"/><path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5l-1.5 2.5h-3L8.5 13.5z"/>',
  me: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.8 3.6-5.5 7-5.5s6.2 1.7 7 5.5"/>',
  bell: '<path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.2a11 11 0 0 0 6.3 6.3l1.2-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  pin: '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  nav: '<path d="m4 11 16-7-7 16-2-7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  out: '<path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M15 8l4 4-4 4M19 12H9"/>'
};
const ico = (n, cls = '') => raw(`<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`);

// ---------- Small UI helpers -------------------------------------------------------------------
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, kind === 'bad' || kind === 'warn' ? 6500 : 3200);
}
const modalEl = () => $('#modal');
function openModal(content) { const d = modalEl(); d.innerHTML = content.toString(); if (!d.open) d.showModal(); return d; }
function closeModal() { const d = modalEl(); if (d.open) d.close(); }
const pill = (label, tone = 'muted') => html`<span class="pill ${tone}">${label}</span>`;
const loading = () => setView(html`<div class="loading"><div class="spin"></div>Loading…</div>`);
function setView(content) { const v = $('#view'); v.innerHTML = content.toString(); v.scrollTop = 0; }
const stateOptions = (sel = '') => STATES.map((s) => html`<option ${s === sel ? raw('selected') : ''}>${s}</option>`);
const isMgr = () => S.profile && S.profile.role !== 'contractor';
const isAdmin = () => S.profile && S.profile.role === 'admin';
const first = (n) => String(n || '').split(' ')[0] || 'there';
const errMsg = (e) => (e && e.message) || 'Something went wrong. Try again.';
const phoneLink = (p) => (p ? html`<a class="iconbtn" href="${telHref(p)}" aria-label="Call ${p}">${ico('phone')}</a>` : '');

async function run(fn) { try { return await fn(); } catch (e) { toast(errMsg(e), 'bad'); return null; } }

// ---------- Routing ----------------------------------------------------------------------------
const go = (hash) => { if (location.hash === hash) show(); else location.hash = hash; };
const route = () => { const h = (location.hash || '').replace(/^#\/?/, ''); const [name, arg] = h.split('/'); return { name: name || '', arg: arg || '' }; };

async function show() {
  const u = api.user();
  if (!u) { renderChrome(false); return viewLogin(); }
  loading();
  if (!S.profile) S.profile = await run(() => api.loadProfile());
  if (!S.profile) { renderChrome(false); return setView(html`<div class="card pad"><h2>Account not ready</h2><p class="muted">We could not load your account. Try again in a moment.</p><button class="btn" data-act="signout">Sign out</button></div>`); }
  if (!S.profile.active) { renderChrome(false); return viewPending(); }
  if (!S.profile.full_name) { renderChrome(false); return viewWelcome(); }
  await refreshBadges();
  renderChrome(true);
  const r = route();
  try {
    if (!isMgr()) {
      if (r.name === 'alerts') return await viewAlerts();
      if (r.name === 'me') return viewMe();
      return await viewCrewHome();
    }
    switch (r.name) {
      case 'jobs': return await viewJobs();
      case 'job': return r.arg === 'new' ? await viewJobForm(null) : r.arg && r.arg.endsWith('-edit') ? await viewJobForm(r.arg.replace(/-edit$/, '')) : await viewJob(r.arg);
      case 'people': return await viewPeople();
      case 'inbox': return await viewInbox();
      case 'team': return await viewTeam();
      case 'alerts': return await viewAlerts();
      case 'me': return viewMe();
      default: return await viewToday();
    }
  } catch (e) { setView(html`<div class="card pad"><h2>Something went wrong</h2><p class="muted">${errMsg(e)}</p><button class="btn" data-act="refresh">Try again</button></div>`); }
}
window.addEventListener('hashchange', show);

async function refreshBadges() {
  const notes = await api.notifications().catch(() => []);
  S.unread = notes.filter((n) => !n.read_at).length;
  if (isMgr()) {
    const [a, r] = await Promise.all([api.applications().catch(() => []), api.requests().catch(() => [])]);
    S.newInbox = a.filter((x) => x.status === 'new').length + r.filter((x) => x.status === 'new').length;
  }
}

// ---------- Chrome (top bar and tabs) ----------------------------------------------------------
function renderChrome(authed) {
  $('#demo-banner').hidden = api.mode !== 'demo';
  $('#bar-right').innerHTML = authed
    ? html`<a class="bell" href="#/alerts" aria-label="Alerts${S.unread ? `, ${S.unread} unread` : ''}">${ico('bell')}${S.unread ? html`<span class="dot">${S.unread > 9 ? '9+' : S.unread}</span>` : ''}</a>`.toString()
    : '';
  const tabs = $('#tabs');
  if (!authed) { tabs.hidden = true; return; }
  const cur = route().name;
  const set = isMgr()
    ? [['', 'Today', 'today'], ['jobs', 'Jobs', 'jobs'], ['people', 'People', 'people'], ['inbox', 'Inbox', 'inbox', S.newInbox], ['me', 'Me', 'me']]
    : [['', 'My jobs', 'jobs'], ['alerts', 'Alerts', 'bell', S.unread], ['me', 'Me', 'me']];
  tabs.hidden = false;
  tabs.innerHTML = set.map(([h, label, icon, n]) => html`<a href="#/${h}" class="${cur === h || (h === 'jobs' && cur === 'job') ? 'on' : ''}" ${cur === h ? raw('aria-current="page"') : ''}>${ico(icon)}<span>${label}</span>${n ? html`<b class="badge">${n}</b>` : ''}</a>`.toString()).join('');
}

// ---------- Login, pending, welcome ------------------------------------------------------------
function viewLogin(step = 'email', email = '') {
  if (api.mode === 'demo') {
    return setView(html`
      <section class="hero-card">
        <h1>AISSKO Crew</h1>
        <p class="muted">Try the app with sample data. Pick who you want to be.</p>
        <div class="personas">${api.demoPersonas.map((p) => html`<button class="persona" data-act="demo-login" data-id="${p.id}"><b>${p.label}</b><span>${p.name}</span><small>${p.note}</small></button>`)}</div>
        <p class="fine">Nothing here is real, and nothing leaves this browser. When the database is connected, people sign in with their email instead.</p>
      </section>`);
  }
  if (step === 'code') {
    return setView(html`
      <section class="hero-card">
        <h1>Check your email</h1>
        <p class="muted">We sent a code to <b>${email}</b>. Enter it below.</p>
        <form data-submit="verify" data-email="${email}" class="stack">
          <label class="field"><span>Code</span><input name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus placeholder="123456"></label>
          <button class="btn primary big" type="submit">Sign in</button>
          <button class="btn ghost" type="button" data-act="login-back">Use a different email</button>
        </form>
        <p class="fine">No email? Check spam. The code is good for a few minutes.</p>
      </section>`);
  }
  setView(html`
    <section class="hero-card">
      <h1>AISSKO Crew</h1>
      <p class="muted">Sign in to see your jobs, or to run your crews. We will email you a code. No password to remember.</p>
      <form data-submit="sendcode" class="stack">
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com"></label>
        <button class="btn primary big" type="submit">Email me a code</button>
      </form>
      <p class="fine">New here? Apply at <a href="../people.html#join">aissko.com</a> first, then sign in with the same email.</p>
    </section>`);
}

function viewPending() {
  setView(html`
    <section class="hero-card">
      <h1>Almost there</h1>
      <p class="muted">Hi ${first(S.profile.full_name) === 'there' ? '' : first(S.profile.full_name)}. Your account is waiting for approval. Once AISSKO approves you, your jobs will show up here.</p>
      <p class="fine">Signed in as ${S.profile.email}. Have not applied yet? <a href="../people.html#join">Join the network</a> using this same email.</p>
      <div class="row"><button class="btn primary" data-act="recheck">Check again</button><button class="btn ghost" data-act="signout">Sign out</button></div>
    </section>`);
}

function viewWelcome() {
  setView(html`
    <section class="hero-card">
      <h1>Welcome</h1>
      <p class="muted">Tell us who you are so your manager knows who is showing up.</p>
      <form data-submit="profile" data-welcome="1" class="stack">
        <label class="field"><span>Full name</span><input name="full_name" required autocomplete="name"></label>
        <label class="field"><span>Mobile phone</span><input name="phone" type="tel" autocomplete="tel" required></label>
        <button class="btn primary big" type="submit">Continue</button>
      </form>
    </section>`);
}

// ---------- Crew: my jobs ----------------------------------------------------------------------
async function viewCrewHome() {
  const rows = await api.crewAssignments();
  const now = new Date();
  const stillOut = (a) => { const l = lastCheckin(a); return !!l && l.kind === 'in' && windowState(a.job, now).open; };
  const live = (a) => a.job.status === 'scheduled' && ['assigned', 'confirmed'].includes(a.status) && (new Date(a.job.ends_at) >= now || stillOut(a));
  const up = rows.filter(live).sort((a, b) => new Date(a.job.starts_at) - new Date(b.job.starts_at));
  const past = rows.filter((a) => !live(a)).sort((a, b) => new Date(b.job.starts_at) - new Date(a.job.starts_at)).slice(0, 12);
  const next = up[0];
  setView(html`
    <h1 class="pagehead">Hi ${first(S.profile.full_name)}</h1>
    ${up.length === 0 ? html`<div class="card pad empty"><h3>No jobs right now</h3><p class="muted">When a manager puts you on a job, it shows up here and you will get an alert.</p></div>` : ''}
    ${up.map((a, i) => crewCard(a, now, i === 0))}
    ${past.length ? html`<h2 class="sect">Past and closed</h2>${past.map((a) => crewCard(a, now, false, true))}` : ''}
  `);
}

function crewCard(a, now, featured, past = false) {
  const j = a.job, st = assignState(a, j, now), win = windowState(j, now), last = lastCheckin(a);
  const mgr = j.manager;
  const showControls = !past && ['assigned', 'confirmed'].includes(a.status);
  const canRespond = showControls && new Date(j.ends_at) > now;
  const checkedIn = last && last.kind === 'in';
  const jobTone = j.status === 'cancelled' ? pill('Cancelled', 'bad') : '';
  return html`
  <article class="card job ${featured ? 'featured' : ''} ${past ? 'past' : ''}">
    <div class="job-top">
      <div>
        <div class="when">${relDay(j.starts_at, j.timezone, now)} · ${fmtRange(j)}</div>
        <h3>${j.title}</h3>
        <div class="muted small">${j.service}${j.customer ? ' · ' + j.customer : ''}</div>
      </div>
      <div class="pills">${jobTone}${pill(st.label, st.tone)}</div>
    </div>
    ${featured && !checkedIn && j.status === 'scheduled' && new Date(j.starts_at) > now ? html`<div class="countdown">${ico('clock')} Starts ${untilText(j.starts_at, now)}</div>` : ''}
    <div class="where">
      ${ico('pin')}
      <div><b>${j.site_name || j.address}</b><div class="muted">${[j.site_name ? j.address : '', j.city, j.state, j.postal].filter(Boolean).join(', ')}</div></div>
      <a class="btn small ghost" href="${mapsHref(j)}" target="_blank" rel="noopener">${ico('nav')}Directions</a>
    </div>
    ${j.instructions ? html`<details class="notes" ${featured ? raw('open') : ''}><summary>Instructions</summary><p>${j.instructions}</p></details>` : ''}
    ${mgr ? html`<div class="contact">${ico('people')}<span>Your manager: <b>${mgr.full_name}</b></span>${mgr.phone ? html`<a class="btn small ghost" href="${telHref(mgr.phone)}">${ico('phone')}Call</a>` : ''}</div>` : ''}
    ${showControls ? html`
      ${canRespond ? html`<div class="actions">
        ${a.status === 'assigned' ? html`<button class="btn primary" data-act="respond" data-aid="${a.id}" data-r="confirmed">${ico('check')}I'll be there</button>` : ''}
        ${!checkedIn && !last ? html`<button class="btn ghost" data-act="respond" data-aid="${a.id}" data-r="declined">Can't make it</button>` : ''}
      </div>` : ''}
      ${checkedIn
        ? html`<button class="btn big out" data-act="checkin" data-aid="${a.id}" data-kind="out">${ico('out')}Check out</button><p class="fine center">You checked in at ${fmtTime(last.at, j.timezone)}.</p>`
        : win.open
          ? html`<button class="btn big primary" data-act="checkin" data-aid="${a.id}" data-kind="in">${ico('pin')}Check in</button>`
          : html`<button class="btn big" disabled>${win.why}</button>`}
    ` : ''}
    ${past && last ? html`<p class="fine">${last.kind === 'out' ? 'Checked out' : 'Last check-in'} ${fmtDay(last.at, j.timezone)} ${fmtTime(last.at, j.timezone)}</p>` : ''}
  </article>`;
}

// ---------- Alerts -----------------------------------------------------------------------------
async function viewAlerts() {
  const notes = await api.notifications();
  const now = new Date();
  setView(html`
    <h1 class="pagehead">Alerts</h1>
    ${notes.length === 0 ? html`<div class="card pad empty"><p class="muted">Nothing yet. New jobs and changes show up here.</p></div>` : ''}
    <div class="list">${notes.map((n) => html`
      <a class="card note ${n.read_at ? '' : 'unread'}" href="${isMgr() && n.job_id ? '#/job/' + n.job_id : '#/'}">
        <div><b>${n.title}</b><div class="muted small">${n.body}</div></div><small class="muted">${timeAgo(n.created_at, now)}</small>
      </a>`)}</div>`);
  if (notes.some((n) => !n.read_at)) { await run(() => api.markRead()); S.unread = 0; renderChrome(true); }
}

// ---------- Me ---------------------------------------------------------------------------------
function viewMe() {
  const p = S.profile;
  const roleName = { contractor: 'Crew member', manager: 'Manager', admin: 'Owner / admin' }[p.role];
  setView(html`
    <h1 class="pagehead">Me</h1>
    <form class="card pad stack" data-submit="profile">
      <label class="field"><span>Full name</span><input name="full_name" value="${p.full_name}" required autocomplete="name"></label>
      <label class="field"><span>Mobile phone</span><input name="phone" type="tel" value="${p.phone}" autocomplete="tel"></label>
      <div class="muted small">${p.email} · ${roleName}${p.states && p.states.length ? ' · ' + p.states.join(', ') : ''}</div>
      <button class="btn primary" type="submit">Save</button>
    </form>
    ${isAdmin() ? html`<a class="card pad linkrow" href="#/team"><b>Team and managers</b><span class="muted small">Set who is a manager and which states they cover</span></a>` : ''}
    <div class="card pad stack" id="install-card" hidden><b>Add AISSKO Crew to your home screen</b><p class="muted small" id="install-text"></p><button class="btn" id="install-btn" hidden>Add to home screen</button></div>
    <div class="card pad"><b>About your location</b><p class="muted small">AISSKO records your location only at the moment you tap Check in or Check out, to confirm you are at the job. It does not track you during the day.</p></div>
    ${api.mode === 'demo' ? html`<div class="card pad stack"><b>Demo options</b>
      <label class="check"><input type="checkbox" data-act="demo-away" ${api.demo.away ? raw('checked') : ''}> Pretend I check in from far away</label>
      <button class="btn ghost" data-act="demo-reset">Reset sample data</button></div>` : ''}
    <button class="btn ghost wide" data-act="signout">Sign out</button>
    <p class="fine center">AISSKO Crew · ${api.mode === 'demo' ? 'demo mode' : 'live'}</p>`);
  showInstallHelp();
}
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; showInstallHelp(); });
function showInstallHelp() {
  const card = $('#install-card'); if (!card) return;
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  card.hidden = false;
  if (deferredInstall) { $('#install-btn').hidden = false; $('#install-text').textContent = 'Install it so it opens like any other app.'; }
  else $('#install-text').textContent = ios ? 'In Safari, tap the Share button, then "Add to Home Screen".' : 'In your browser menu, choose "Install app" or "Add to Home screen".';
}

// ---------- Manager: shared pieces -------------------------------------------------------------
function phaseOf(j, now) {
  if (j.status === 'cancelled') return { label: 'Cancelled', tone: 'bad', key: 'cancelled' };
  const s = new Date(j.starts_at), e = new Date(j.ends_at);
  if (j.status === 'completed' || now > e) return { label: 'Ended', tone: 'muted', key: 'ended' };
  if (now >= s) return { label: 'Live now', tone: 'good', key: 'live' };
  if (s - now <= 3600000) return { label: 'Starting soon', tone: 'cyan', key: 'soon' };
  return { label: 'Scheduled', tone: 'muted', key: 'later' };
}
const countCrew = (j) => j.assignments.filter((a) => !['declined', 'no_show'].includes(a.status)).length;

function roster(j, now, { manage = false } = {}) {
  if (!j.assignments.length) return html`<p class="muted small">Nobody assigned yet.</p>`;
  const live = j.status === 'scheduled';
  return html`<ul class="roster">${j.assignments.slice().sort((a, b) => (a.contractor?.full_name || '').localeCompare(b.contractor?.full_name || '')).map((a) => {
    const st = assignState(a, j, now), last = lastCheckin(a), c = a.contractor || {};
    return html`<li class="rrow ${st.key}">
      <div class="rname"><b>${c.full_name || 'Unknown'}</b>
        <div class="rsub">${pill(st.label, st.tone)}
          ${st.away ? html`<span class="warn small">${ico('alert')} ${distText(last.distance_m)} from the site</span>` : ''}
          ${last && last.source === 'manager' ? html`<span class="muted small">by manager${last.note ? ': ' + last.note : ''}</span>` : ''}</div></div>
      <div class="ract">
        ${phoneLink(c.phone)}
        ${live && st.key === 'on_site' ? html`<button class="btn small" data-act="mci" data-aid="${a.id}" data-kind="out" data-name="${c.full_name}">Check out</button>` : ''}
        ${live && ['assigned', 'confirmed', 'late', 'declined', 'no_show'].includes(st.key) ? html`<button class="btn small primary" data-act="mci" data-aid="${a.id}" data-kind="in" data-name="${c.full_name}">Check in</button>` : ''}
        ${live && ['assigned', 'confirmed', 'late'].includes(st.key) ? html`<button class="btn small ghost" data-act="noshow" data-aid="${a.id}">No-show</button>` : ''}
        ${live && st.key === 'no_show' ? html`<button class="btn small ghost" data-act="undo-noshow" data-aid="${a.id}">Undo</button>` : ''}
        ${manage && st.key !== 'on_site' ? html`<button class="btn small ghost danger" data-act="unassign" data-aid="${a.id}" data-name="${c.full_name}" aria-label="Remove ${c.full_name}">Remove</button>` : ''}
      </div></li>`;
  })}</ul>`;
}

function jobCard(j, now, { open = true, link = true } = {}) {
  const ph = phaseOf(j, now), n = countCrew(j), need = j.crew_needed - n;
  const onsite = j.assignments.filter((a) => assignState(a, j, now).key === 'on_site').length;
  const late = j.assignments.filter((a) => assignState(a, j, now).key === 'late').length;
  return html`<article class="card job">
    <div class="job-top">
      <div>
        <div class="when">${relDay(j.starts_at, j.timezone, now)} · ${fmtRange(j)}</div>
        <h3>${link ? html`<a href="#/job/${j.id}">${j.title}</a>` : j.title}</h3>
        <div class="muted small">${j.service}${j.customer ? ' · ' + j.customer : ''} · ${[j.city, j.state].filter(Boolean).join(', ')}</div>
      </div>
      <div class="pills">${pill(ph.label, ph.tone)}</div>
    </div>
    <div class="counts">
      <span>${pill(`${n}/${j.crew_needed} crew`, need > 0 ? 'warn' : 'good')}</span>
      ${ph.key === 'live' || ph.key === 'soon' ? html`<span>${pill(`${onsite} on site`, onsite ? 'good' : 'muted')}</span>` : ''}
      ${late ? html`<span>${pill(`${late} late`, 'bad')}</span>` : ''}
      ${need > 0 && j.status === 'scheduled' ? html`<span class="warn small">Needs ${need} more</span>` : ''}
    </div>
    ${open ? roster(j, now) : ''}
  </article>`;
}

// ---------- Manager: Today ---------------------------------------------------------------------
async function viewToday() {
  const now = new Date();
  const since = new Date(now.getTime() - 12 * 3600000).toISOString();
  const all = (await api.jobs({ since })).filter((j) => j.status !== 'cancelled');
  const tz = (j) => j.timezone;
  const today = all.filter((j) => dayKey(j.starts_at, tz(j)) === dayKey(now, tz(j)) || (new Date(j.starts_at) <= now && new Date(j.ends_at) >= now));
  const soon = all.filter((j) => !today.includes(j) && new Date(j.starts_at) > now && new Date(j.starts_at) < new Date(now.getTime() + 7 * 864e5));
  const flat = today.flatMap((j) => j.assignments.map((a) => assignState(a, j, now).key));
  const stat = (n, label, tone = '') => html`<div class="stat ${tone}"><b>${n}</b><span>${label}</span></div>`;
  setView(html`
    <div class="pagehead row between"><h1>Today</h1><button class="btn small ghost" data-act="refresh">Refresh</button></div>
    <div class="muted small">${fmtDayLong(now, Intl.DateTimeFormat().resolvedOptions().timeZone)}</div>
    <div class="stats">
      ${stat(today.length, 'jobs today')}${stat(flat.filter((k) => k === 'on_site').length, 'on site', 'good')}${stat(flat.filter((k) => k === 'late').length, 'late', flat.includes('late') ? 'bad' : '')}${stat(today.filter((j) => countCrew(j) < j.crew_needed).length, 'need crew', 'warn')}
    </div>
    ${today.length ? today.map((j) => jobCard(j, now)) : html`<div class="card pad empty"><h3>No jobs today</h3><p class="muted">Create one, or look at what is coming up.</p><a class="btn primary" href="#/job/new">${ico('plus')}New job</a></div>`}
    ${soon.length ? html`<h2 class="sect">Coming up</h2>${soon.map((j) => jobCard(j, now, { open: false }))}` : ''}
    <a class="fab" href="#/job/new" aria-label="New job">${ico('plus')}<span>New job</span></a>`);
}

// ---------- Manager: jobs ----------------------------------------------------------------------
async function viewJobs() {
  const now = new Date();
  const f = S.jobFilter;
  const since = f === 'past' ? new Date(now.getTime() - 60 * 864e5).toISOString() : f === 'upcoming' ? new Date(now.getTime() - 6 * 3600000).toISOString() : undefined;
  let list = await api.jobs({ since });
  if (f === 'upcoming') list = list.filter((j) => j.status !== 'cancelled' && new Date(j.ends_at) >= new Date(now.getTime() - 6 * 3600000));
  if (f === 'past') list = list.filter((j) => j.status !== 'cancelled' && new Date(j.ends_at) < now).reverse();
  if (f === 'cancelled') list = list.filter((j) => j.status === 'cancelled').reverse();
  const groups = [];
  list.forEach((j) => { const k = dayKey(j.starts_at, j.timezone); let g = groups[groups.length - 1]; if (!g || g.k !== k) { g = { k, ts: j.starts_at, tz: j.timezone, jobs: [] }; groups.push(g); } g.jobs.push(j); });
  setView(html`
    <div class="pagehead row between"><h1>Jobs</h1><a class="btn small primary" href="#/job/new">${ico('plus')}New job</a></div>
    <div class="seg">${['upcoming', 'past', 'cancelled'].map((k) => html`<button class="${f === k ? 'on' : ''}" data-act="jobfilter" data-f="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`)}</div>
    ${list.length === 0 ? html`<div class="card pad empty"><p class="muted">No ${f} jobs.</p></div>` : ''}
    ${groups.map((g) => html`<h2 class="sect">${relDay(g.ts, g.tz, now)} <small>${fmtDay(g.ts, g.tz)}</small></h2>${g.jobs.map((j) => jobCard(j, now, { open: false }))}`)}`);
}

// ---------- Manager: one job -------------------------------------------------------------------
async function viewJob(id) {
  const j = await api.jobById(id);
  if (!j) return setView(html`<div class="card pad"><h2>Job not found</h2><a class="btn" href="#/jobs">Back to jobs</a></div>`);
  const now = new Date(), ph = phaseOf(j, now);
  const eligible = j.status === 'scheduled' ? await api.eligibleCrew(j.id) : [];
  const need = j.crew_needed - countCrew(j);
  setView(html`
    <a class="back" href="#/jobs">‹ Jobs</a>
    <article class="card job">
      <div class="job-top"><div><div class="when">${fmtDayLong(j.starts_at, j.timezone)} · ${fmtRange(j)}</div><h1 class="h2">${j.title}</h1><div class="muted">${j.service}${j.customer ? ' · ' + j.customer : ''}</div></div><div class="pills">${pill(ph.label, ph.tone)}</div></div>
      <div class="where">${ico('pin')}<div><b>${j.site_name || j.address}</b><div class="muted">${[j.site_name ? j.address : '', j.city, j.state, j.postal].filter(Boolean).join(', ')}</div>
        <div class="fine">${j.lat != null ? `Map pin set · check-in radius ${j.radius_m} m` : 'No map pin yet, so GPS cannot verify check-ins. Edit the job to add one.'}</div></div>
        <a class="btn small ghost" href="${mapsHref(j)}" target="_blank" rel="noopener">${ico('nav')}Map</a></div>
      ${j.instructions ? html`<details class="notes" open><summary>Instructions for the crew</summary><p>${j.instructions}</p></details>` : ''}
      ${j.manager ? html`<div class="contact">${ico('people')}<span>Manager: <b>${j.manager.full_name}</b></span>${phoneLink(j.manager.phone)}</div>` : ''}
      ${j.status === 'scheduled' ? html`<div class="actions"><a class="btn" href="#/job/${j.id}-edit">Edit job</a><button class="btn ghost danger" data-act="canceljob" data-id="${j.id}">Cancel job</button></div>` : ''}
    </article>
    <h2 class="sect">Crew <small>${countCrew(j)} of ${j.crew_needed}${need > 0 ? ` · needs ${need} more` : ''}</small></h2>
    <div class="card pad">${roster(j, now, { manage: j.status === 'scheduled' })}</div>
    ${j.status === 'scheduled' ? html`
      <h2 class="sect">Add crew</h2>
      <div class="card pad">
        ${eligible.length === 0 ? html`<p class="muted small">Nobody else available. Approve more people in the Inbox, or check that they are switched on.</p>` : html`
        <input class="search" type="search" placeholder="Search by name" data-filter-list="#addlist" aria-label="Search crew">
        <ul class="roster" id="addlist">${eligible.map((p) => html`<li class="rrow" data-name="${p.full_name.toLowerCase()}"><div class="rname"><b>${p.full_name}</b><div class="muted small">${(p.states || []).join(', ')}</div></div><div class="ract">${phoneLink(p.phone)}<button class="btn small primary" data-act="assign" data-job="${j.id}" data-cid="${p.id}">Add</button></div></li>`)}</ul>`}
      </div>` : ''}`);
}

// ---------- Manager: job form ------------------------------------------------------------------
async function viewJobForm(id) {
  let j = id ? await api.jobById(id) : null;
  if (id && !j) return setView(html`<div class="card pad"><h2>Job not found</h2></div>`);
  const d = S.draft || {}; S.draft = null;
  const homeState = (S.profile.states && S.profile.states[0]) || 'GA';
  const state = j ? j.state : d.state || homeState;
  const tz = j ? j.timezone : zoneForState(state);
  const startZ = j ? utcToZoned(j.starts_at, tz) : { date: utcToZoned(new Date(Date.now() + 864e5), tz).date, time: '08:00' };
  const endZ = j ? utcToZoned(j.ends_at, tz) : { date: startZ.date, time: '16:00' };
  const v = j || { title: d.title || '', service: 'IMAC', customer: d.customer || '', site_name: '', address: '', city: '', postal: '', lat: null, lng: null, radius_m: 250, crew_needed: 2, instructions: d.instructions || '' };
  const myStates = isAdmin() ? STATES : S.profile.states.length ? S.profile.states : [homeState];
  setView(html`
    <a class="back" href="${j ? '#/job/' + j.id : '#/jobs'}">‹ Back</a>
    <h1 class="pagehead">${j ? 'Edit job' : 'New job'}</h1>
    <form class="card pad stack" data-submit="savejob" ${j ? raw(`data-id="${j.id}"`) : ''}>
      <label class="field"><span>Job title</span><input name="title" required maxlength="160" value="${v.title}" placeholder="e.g. Rack refresh, Midtown data hall"></label>
      <div class="two">
        <label class="field"><span>Service</span><select name="service">${SERVICES.map((s) => html`<option ${s === v.service ? raw('selected') : ''}>${s}</option>`)}</select></label>
        <label class="field"><span>Crew needed</span><input name="crew_needed" type="number" min="1" max="500" required value="${v.crew_needed}"></label>
      </div>
      <div class="two">
        <label class="field"><span>Customer</span><input name="customer" value="${v.customer}" maxlength="160"></label>
        <label class="field"><span>Site or building</span><input name="site_name" value="${v.site_name}" maxlength="160" placeholder="e.g. Data hall 2"></label>
      </div>
      <label class="field"><span>Street address</span><input name="address" required maxlength="240" value="${v.address}" autocomplete="off"></label>
      <div class="three">
        <label class="field"><span>City</span><input name="city" value="${v.city}" maxlength="120"></label>
        <label class="field"><span>State</span><select name="state" data-act-change="statechange">${(isAdmin() ? STATES : myStates).map((s) => html`<option ${s === state ? raw('selected') : ''}>${s}</option>`)}</select></label>
        <label class="field"><span>ZIP</span><input name="postal" value="${v.postal}" maxlength="20" inputmode="numeric"></label>
      </div>
      <div class="pinrow">
        <button type="button" class="btn small" data-act="geocode">${ico('pin')}Find on map</button>
        <button type="button" class="btn small ghost" data-act="mylocation">Use my location</button>
        <span class="fine" id="pinstatus">${v.lat != null ? `Pinned at ${Number(v.lat).toFixed(5)}, ${Number(v.lng).toFixed(5)}` : 'Not pinned yet. A pin lets the app check that crews are really at the site.'}</span>
      </div>
      <input type="hidden" name="lat" value="${v.lat ?? ''}"><input type="hidden" name="lng" value="${v.lng ?? ''}">
      <div class="two">
        <label class="field"><span>Check-in radius</span><select name="radius_m">${[100, 250, 500, 1000, 2000].map((r) => html`<option value="${r}" ${r === v.radius_m ? raw('selected') : ''}>${r < 1000 ? r + ' m' : r / 1000 + ' km'} ${r === 250 ? '(default)' : ''}</option>`)}</select></label>
        <label class="field"><span>Time zone</span><select name="timezone">${ZONE_CHOICES.map(([z, n]) => html`<option value="${z}" ${z === tz ? raw('selected') : ''}>${n}</option>`)}</select></label>
      </div>
      <div class="three">
        <label class="field"><span>Date</span><input name="date" type="date" required value="${startZ.date}"></label>
        <label class="field"><span>Start</span><input name="start" type="time" required value="${startZ.time}"></label>
        <label class="field"><span>End</span><input name="end" type="time" required value="${endZ.time}"></label>
      </div>
      <p class="fine" style="margin-top:-6px">Times are in the job's time zone. If the end is earlier than the start, the job runs past midnight.</p>
      <label class="field"><span>Instructions for the crew</span><textarea name="instructions" rows="4" maxlength="4000" placeholder="Where to park, who to ask for, what to bring">${v.instructions}</textarea></label>
      <div class="row"><button class="btn primary big" type="submit">${j ? 'Save changes' : 'Create job'}</button><a class="btn ghost" href="${j ? '#/job/' + j.id : '#/jobs'}">Cancel</a></div>
    </form>`);
}

// ---------- Manager: people --------------------------------------------------------------------
async function viewPeople() {
  const list = await api.crew();
  const q = S.peopleQuery.toLowerCase();
  const shown = list.filter((p) => !q || p.full_name.toLowerCase().includes(q) || (p.states || []).join(' ').toLowerCase().includes(q));
  const on = shown.filter((p) => p.active), off = shown.filter((p) => !p.active);
  const row = (p) => html`<li class="rrow"><div class="rname"><b>${p.full_name || p.email}</b><div class="muted small">${(p.states || []).join(', ')}${p.phone ? ' · ' + p.phone : ''}</div></div><div class="ract">${phoneLink(p.phone)}${isAdmin() ? html`<button class="btn small ${p.active ? 'ghost' : 'primary'}" data-act="toggleactive" data-id="${p.id}" data-on="${p.active ? 0 : 1}">${p.active ? 'Switch off' : 'Switch on'}</button>` : ''}</div></li>`;
  setView(html`
    <div class="pagehead row between"><h1>People</h1>${isAdmin() ? html`<a class="btn small ghost" href="#/team">Team and managers</a>` : ''}</div>
    <input class="search" type="search" placeholder="Search name or state" value="${S.peopleQuery}" data-act-input="peoplesearch" aria-label="Search people">
    <h2 class="sect">Active crew <small>${on.length}</small></h2>
    <div class="card pad">${on.length ? html`<ul class="roster">${on.map(row)}</ul>` : html`<p class="muted small">Nobody active yet.</p>`}</div>
    ${off.length ? html`<h2 class="sect">Waiting for approval <small>${off.length}</small></h2><div class="card pad"><p class="muted small">These people signed in but are not switched on. Approve their application in the Inbox, or switch them on here.</p><ul class="roster">${off.map(row)}</ul></div>` : ''}`);
}

// ---------- Manager: inbox ---------------------------------------------------------------------
async function viewInbox() {
  const [apps, reqs] = await Promise.all([api.applications(), api.requests()]);
  const tab = S.inboxTab;
  const na = apps.filter((a) => a.status === 'new').length, nr = reqs.filter((a) => a.status === 'new').length;
  setView(html`
    <h1 class="pagehead">Inbox</h1>
    <div class="seg">
      <button class="${tab === 'applicants' ? 'on' : ''}" data-act="inboxtab" data-t="applicants">Applicants${na ? html` <b class="badge">${na}</b>` : ''}</button>
      <button class="${tab === 'requests' ? 'on' : ''}" data-act="inboxtab" data-t="requests">Crew requests${nr ? html` <b class="badge">${nr}</b>` : ''}</button>
    </div>
    ${tab === 'applicants' ? (apps.length ? apps.map(applicantCard) : html`<div class="card pad empty"><p class="muted">No applications yet. They show up here when someone joins the network on your website.</p></div>`)
      : (reqs.length ? reqs.map(requestCard) : html`<div class="card pad empty"><p class="muted">No crew requests yet.</p></div>`)}`);
}
const chips = (arr) => html`<div class="chips">${(arr || []).map((x) => html`<span class="chip">${x}</span>`)}</div>`;
const statusTone = { new: 'cyan', reviewing: 'warn', approved: 'good', rejected: 'bad', contacted: 'warn', quoted: 'cyan', won: 'good', lost: 'bad' };
function applicantCard(a) {
  return html`<article class="card pad stack">
    <div class="job-top"><div><h3>${a.full_name}</h3><div class="muted small">${[a.city, a.state].filter(Boolean).join(', ')} · ${timeAgo(a.created_at)}</div></div>${pill(a.status, statusTone[a.status])}</div>
    ${chips(a.services)}
    <dl class="facts">
      ${a.experience ? html`<dt>Experience</dt><dd>${a.experience}</dd>` : ''}${a.availability ? html`<dt>Availability</dt><dd>${a.availability}</dd>` : ''}${a.travel ? html`<dt>Travel</dt><dd>${a.travel}</dd>` : ''}
      ${a.credentials ? html`<dt>Credentials</dt><dd>${a.credentials}</dd>` : ''}${a.link ? html`<dt>Link</dt><dd>${/^https?:\/\//i.test(a.link) ? html`<a href="${a.link}" target="_blank" rel="noopener noreferrer">${a.link}</a>` : a.link}</dd>` : ''}
      ${a.message ? html`<dt>Note</dt><dd>${a.message}</dd>` : ''}
    </dl>
    <div class="contact">${a.phone ? html`<a class="btn small ghost" href="${telHref(a.phone)}">${ico('phone')}${a.phone}</a>` : ''}<a class="btn small ghost" href="mailto:${a.email}">${ico('mail')}${a.email}</a></div>
    <label class="field"><span>Internal notes</span><input data-act-change="appnote" data-id="${a.id}" value="${a.notes}" maxlength="500" placeholder="Only your team sees this"></label>
    <div class="actions">
      ${a.status !== 'approved' ? html`<button class="btn primary" data-act="appstatus" data-id="${a.id}" data-s="approved" data-name="${a.full_name}" data-email="${a.email}">${ico('check')}Approve</button>` : html`<button class="btn" data-act="invite" data-name="${a.full_name}" data-email="${a.email}">Copy sign-in message</button>`}
      ${a.status === 'new' ? html`<button class="btn ghost" data-act="appstatus" data-id="${a.id}" data-s="reviewing">Mark reviewing</button>` : ''}
      ${a.status !== 'rejected' && a.status !== 'approved' ? html`<button class="btn ghost danger" data-act="appstatus" data-id="${a.id}" data-s="rejected">Reject</button>` : ''}
    </div></article>`;
}
function requestCard(r) {
  return html`<article class="card pad stack">
    <div class="job-top"><div><h3>${r.company}</h3><div class="muted small">${r.full_name} · ${r.state}${r.site ? ' · ' + r.site : ''} · ${timeAgo(r.created_at)}</div></div>${pill(r.status, statusTone[r.status])}</div>
    ${chips(r.services)}
    <dl class="facts">${r.timeframe ? html`<dt>When</dt><dd>${r.timeframe}</dd>` : ''}${r.crew_size ? html`<dt>Crew size</dt><dd>${r.crew_size}</dd>` : ''}${r.message ? html`<dt>Scope</dt><dd>${r.message}</dd>` : ''}</dl>
    <div class="contact">${r.phone ? html`<a class="btn small ghost" href="${telHref(r.phone)}">${ico('phone')}${r.phone}</a>` : ''}<a class="btn small ghost" href="mailto:${r.email}">${ico('mail')}${r.email}</a></div>
    <label class="field"><span>Internal notes</span><input data-act-change="reqnote" data-id="${r.id}" value="${r.notes}" maxlength="500"></label>
    <div class="actions">
      <button class="btn primary" data-act="jobfromreq" data-company="${r.company}" data-state="${r.state}" data-msg="${r.message}" data-site="${r.site}">${ico('plus')}Create job</button>
      ${['contacted', 'quoted', 'won', 'lost'].filter((s) => s !== r.status).map((s) => html`<button class="btn ghost small" data-act="reqstatus" data-id="${r.id}" data-s="${s}">Mark ${s}</button>`)}
    </div></article>`;
}

// ---------- Admin: team ------------------------------------------------------------------------
async function viewTeam() {
  if (!isAdmin()) return go('#/');
  const list = await api.people();
  setView(html`
    <a class="back" href="#/me">‹ Me</a>
    <h1 class="pagehead">Team and managers</h1>
    <p class="muted small">Managers see and run jobs only in the states you give them. Crew members only see their own jobs.</p>
    ${list.map((p) => html`<form class="card pad stack" data-submit="saveperson" data-id="${p.id}">
      <div class="job-top"><div><h3>${p.full_name || '(no name yet)'}</h3><div class="muted small">${p.email}</div></div>${pill(p.active ? 'Active' : 'Switched off', p.active ? 'good' : 'warn')}</div>
      <div class="three">
        <label class="field"><span>Role</span><select name="role">${[['contractor', 'Crew'], ['manager', 'Manager'], ['admin', 'Admin']].map(([v, n]) => html`<option value="${v}" ${p.role === v ? raw('selected') : ''}>${n}</option>`)}</select></label>
        <label class="field"><span>States</span><input name="states" value="${(p.states || []).join(', ')}" placeholder="GA, TX" ${p.role === 'admin' ? raw('disabled') : ''}></label>
        <label class="check"><input type="checkbox" name="active" ${p.active ? raw('checked') : ''}> Switched on</label>
      </div>
      <button class="btn small" type="submit">Save</button></form>`)}`);
}

// ---------- Actions ----------------------------------------------------------------------------
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This phone cannot share its location. Ask your manager to check you in.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'Location is turned off for this app. Turn it on in your phone settings, or ask your manager to check you in.' : 'Could not find your location. Try near a window or outside, or ask your manager to check you in.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
const confirmModal = (title, body, yes = 'OK') => new Promise((resolve) => {
  const d = openModal(html`<h3>${title}</h3><p class="muted">${body}</p><div class="row"><button class="btn primary" data-act="modal-yes">${yes}</button><button class="btn ghost" data-act="modal-no">Cancel</button></div>`);
  const done = (v) => { d.removeEventListener('close', onClose); closeModal(); resolve(v); };
  const onClose = () => resolve(false);
  d.addEventListener('close', onClose, { once: true });
  d.querySelector('[data-act="modal-yes"]').onclick = () => done(true);
  d.querySelector('[data-act="modal-no"]').onclick = () => done(false);
});

async function geocode(q) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Map search is busy. Try again, or use "Use my location" at the site.');
  const rows = await r.json();
  return rows[0] ? { lat: +rows[0].lat, lng: +rows[0].lon } : null;
}

const acts = {
  async 'demo-login'(el) { api.signInDemo(el.dataset.id); S.profile = null; go('#/'); show(); },
  async signout() { await run(() => api.signOut()); S.profile = null; go('#/'); show(); },
  async refresh() { show(); },
  async recheck() { S.profile = null; show(); },
  'login-back'() { viewLogin(); },
  'demo-away'(el) { api.demo.away = el.checked; },
  async 'demo-reset'() { if (await confirmModal('Reset sample data?', 'This puts the demo back the way it started.', 'Reset')) { api.resetDemo(); S.profile = null; show(); } },
  'modal-close'() { closeModal(); },
  async respond(el) {
    const r = el.dataset.r;
    if (r === 'declined' && !(await confirmModal("Can't make it?", 'Your manager will be told right away so they can find someone else.', 'Yes, tell them'))) return;
    await run(async () => { await api.respond(el.dataset.aid, r); toast(r === 'confirmed' ? 'Confirmed. See you there.' : 'Your manager has been told.', 'good'); });
    show();
  },
  async checkin(el) {
    const kind = el.dataset.kind;
    if (!localStorage.getItem('crew.loc-ok')) {
      const ok = await confirmModal('Share your location?', 'AISSKO records where you are only at the moment you tap Check in or Check out, to confirm you are at the job. It does not track you during the day.', 'Continue');
      if (!ok) return;
      localStorage.setItem('crew.loc-ok', '1');
    }
    el.disabled = true; const label = el.innerHTML; el.textContent = 'Getting your location…';
    let geo = null, geoErr = null;
    if (api.mode === 'live') { try { geo = await getPosition(); } catch (e) { geoErr = e; } }
    try {
      const rec = await api.checkIn(el.dataset.aid, kind, geo);
      if (kind === 'in' && rec && rec.within_site === false) toast(`You are checked in, but you appear to be ${distText(rec.distance_m)} from the job site. Your manager has been told.`, 'warn');
      else toast(kind === 'in' ? 'Checked in. Have a good shift.' : 'Checked out. Thanks.', 'good');
    } catch (e) { toast(geoErr && /Location is needed/i.test(e.message) ? geoErr.message : errMsg(e), 'bad'); el.disabled = false; el.innerHTML = label; return; }
    show();
  },
  async mci(el) {
    const kind = el.dataset.kind, name = el.dataset.name;
    const d = openModal(html`<h3>${kind === 'in' ? 'Check in' : 'Check out'} ${name}</h3>
      <form class="stack" data-submit="mcisave" data-aid="${el.dataset.aid}" data-kind="${kind}">
        <label class="field"><span>Time (leave as now, or fix a missed one)</span><input type="datetime-local" name="at" required value="${toLocalInput(new Date())}" max="${toLocalInput(new Date())}"></label>
        <label class="field"><span>Note (optional)</span><input name="note" maxlength="500" placeholder="e.g. arrived with the truck"></label>
        <div class="row"><button class="btn primary" type="submit">Save</button><button type="button" class="btn ghost" data-act="modal-close">Cancel</button></div>
      </form>`);
    d.querySelector('input[name=at]').focus();
  },
  async noshow(el) { await run(() => api.setAssignmentStatus(el.dataset.aid, 'no_show')); show(); },
  async 'undo-noshow'(el) { await run(() => api.setAssignmentStatus(el.dataset.aid, 'assigned')); show(); },
  async unassign(el) { if (await confirmModal(`Remove ${el.dataset.name}?`, 'They will no longer see this job.', 'Remove')) { await run(() => api.unassign(el.dataset.aid)); show(); } },
  async assign(el) { await run(async () => { await api.assign(el.dataset.job, el.dataset.cid); toast('Added. They were sent an alert.', 'good'); }); show(); },
  async canceljob(el) { if (await confirmModal('Cancel this job?', 'The crew will be told it is cancelled.', 'Cancel the job')) { await run(() => api.cancelJob(el.dataset.id)); go('#/jobs'); } },
  jobfilter(el) { S.jobFilter = el.dataset.f; show(); },
  inboxtab(el) { S.inboxTab = el.dataset.t; show(); },
  async toggleactive(el) { await run(() => api.setPerson(el.dataset.id, { active: el.dataset.on === '1' })); show(); },
  async appstatus(el) {
    const s = el.dataset.s;
    await run(async () => {
      await api.setApplication(el.dataset.id, { status: s });
      if (s === 'approved') toast(`Approved. Tell ${first(el.dataset.name)} to sign in at aissko.com/crew with ${el.dataset.email}.`, 'good');
    });
    show();
  },
  async invite(el) {
    const msg = `Hi ${first(el.dataset.name)}, you're approved with AISSKO. Open ${new URL('./', location.href).href} on your phone and sign in with this email: ${el.dataset.email}. You'll get a code by email. Your jobs will show up there.`;
    try { await navigator.clipboard.writeText(msg); toast('Copied. Paste it into a text or email.', 'good'); } catch (e) { openModal(html`<h3>Sign-in message</h3><p>${msg}</p><button class="btn" data-act="modal-close">Close</button>`); }
  },
  async reqstatus(el) { await run(() => api.setRequest(el.dataset.id, { status: el.dataset.s })); show(); },
  jobfromreq(el) { S.draft = { customer: el.dataset.company, state: el.dataset.state, instructions: [el.dataset.site && 'Site: ' + el.dataset.site, el.dataset.msg].filter(Boolean).join('\n'), title: el.dataset.company }; go('#/job/new'); },
  async geocode(el) {
    const f = el.closest('form'), q = [f.address.value, f.city.value, f.state.value, f.postal.value].filter(Boolean).join(', ');
    if (!f.address.value) return toast('Type the street address first.', 'warn');
    el.disabled = true;
    try {
      const r = await geocode(q);
      if (!r) toast('Could not find that address. Check it, or use "Use my location" at the site.', 'warn');
      else { f.lat.value = r.lat; f.lng.value = r.lng; $('#pinstatus').textContent = `Pinned at ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}. Check it on the map before saving.`; toast('Found it.', 'good'); }
    } catch (e) { toast(errMsg(e), 'bad'); }
    el.disabled = false;
  },
  async mylocation(el) {
    const f = el.closest('form');
    try { const p = await getPosition(); f.lat.value = p.lat; f.lng.value = p.lng; $('#pinstatus').textContent = `Pinned at your location (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}).`; } catch (e) { toast(errMsg(e), 'bad'); }
  }
};

const toLocalInput = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

const submits = {
  async sendcode(f) {
    const email = f.email.value.trim(); const b = f.querySelector('button'); b.disabled = true;
    try { await api.signInStart(email); viewLogin('code', email); } catch (e) { toast(errMsg(e), 'bad'); b.disabled = false; }
  },
  async verify(f) {
    const b = f.querySelector('button'); b.disabled = true;
    try { await api.signInVerify(f.dataset.email, f.code.value); S.profile = null; go('#/'); show(); } catch (e) { toast(errMsg(e), 'bad'); b.disabled = false; }
  },
  async profile(f) {
    const p = await run(() => api.updateMyProfile({ full_name: f.full_name.value.trim(), phone: f.phone.value.trim() }));
    if (p) { S.profile = p; toast('Saved.', 'good'); if (f.dataset.welcome) go('#/'); show(); }
  },
  async mcisave(f) {
    const at = new Date(f.at.value);
    await run(async () => { await api.managerCheckIn(f.dataset.aid, f.dataset.kind, at.toISOString(), f.note.value.trim()); toast('Saved.', 'good'); });
    closeModal(); show();
  },
  async savejob(f) {
    const tz = f.timezone.value;
    const startsAt = zonedToUtc(f.date.value, f.start.value, tz);
    let endsAt = zonedToUtc(f.date.value, f.end.value, tz);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 864e5);
    const num = (v) => (v === '' ? null : Number(v));
    const job = {
      id: f.dataset.id || undefined, title: f.elements.title.value.trim(), service: f.service.value, customer: f.customer.value.trim(), site_name: f.site_name.value.trim(),
      address: f.address.value.trim(), city: f.city.value.trim(), state: f.state.value, postal: f.postal.value.trim(), lat: num(f.lat.value), lng: num(f.lng.value),
      radius_m: Number(f.radius_m.value), timezone: tz, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), crew_needed: Number(f.crew_needed.value), instructions: f.instructions.value.trim()
    };
    const b = f.querySelector('[type=submit]'); b.disabled = true;
    const saved = await run(() => api.saveJob(job));
    if (saved) { toast(job.id ? 'Job updated. The crew was told.' : 'Job created. Now add your crew.', 'good'); go('#/job/' + saved.id); } else b.disabled = false;
  },
  async saveperson(f) {
    const states = f.states.value.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const bad = states.find((s) => !STATES.includes(s));
    if (bad) return toast(`"${bad}" is not a state code. Use two letters like GA, TX.`, 'warn');
    await run(async () => { await api.setPerson(f.dataset.id, { role: f.role.value, states: f.role.value === 'admin' ? [] : states, active: f.active.checked }); toast('Saved.', 'good'); });
    show();
  }
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && acts[el.dataset.act]) { if (el.tagName === 'A') e.preventDefault(); Promise.resolve(acts[el.dataset.act](el, e)).catch((err) => toast(errMsg(err), 'bad')); }
});
document.addEventListener('change', (e) => {
  const c = e.target.closest('[data-act-change]');
  if (!c) return;
  const k = c.dataset.actChange;
  if (k === 'statechange') { const f = c.closest('form'); f.timezone.value = zoneForState(c.value); }
  if (k === 'appnote') run(() => api.setApplication(c.dataset.id, { notes: c.value }));
  if (k === 'reqnote') run(() => api.setRequest(c.dataset.id, { notes: c.value }));
});
document.addEventListener('input', (e) => {
  const c = e.target.closest('[data-act-input]');
  if (c && c.dataset.actInput === 'peoplesearch') { S.peopleQuery = c.value; clearTimeout(acts.t); acts.t = setTimeout(async () => { const pos = c.selectionStart; await viewPeople(); const n = $('[data-act-input=peoplesearch]'); n.focus(); n.setSelectionRange(pos, pos); }, 200); }
  const l = e.target.closest('[data-filter-list]');
  if (l) { const q = l.value.toLowerCase(); document.querySelectorAll(l.dataset.filterList + ' li').forEach((li) => { li.hidden = !!q && !li.dataset.name.includes(q); }); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]');
  if (!f) return;
  e.preventDefault();
  Promise.resolve(submits[f.dataset.submit](f)).catch((err) => toast(errMsg(err), 'bad'));
});
modalEl().addEventListener('click', (e) => { if (e.target === modalEl()) closeModal(); });

api.onAuthChange((evt) => { if (evt === 'SIGNED_IN' && !S.profile) show(); if (evt === 'SIGNED_OUT') { S.profile = null; show(); } });

// Live screens update themselves while the app is open.
setInterval(() => {
  if (document.visibilityState !== 'visible' || modalEl().open || !S.profile) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  const r = route().name;
  if (isMgr() ? ['', 'job'].includes(r) && route().arg !== 'new' && !String(route().arg).endsWith('-edit') : r === '') show();
}, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.profile && !modalEl().open) show(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
// A magic link from the email lands with tokens in the address; tidy it so the app route works.
if (/access_token=|type=magiclink/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
show();
