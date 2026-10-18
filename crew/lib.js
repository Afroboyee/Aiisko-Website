// Small helpers shared by the whole app: safe HTML, dates and time zones, distances.

// ---------- Safe HTML ----------------------------------------------------------------------------
// Anything put into html`...` is escaped unless it was built with html`...` or raw().
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const render = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join('') : v == null || v === false ? '' : esc(v));
export const html = (strings, ...vals) => new Raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? render(vals[i]) : ''), ''));

// ---------- Time zones ---------------------------------------------------------------------------
const ET = 'America/New_York', CT = 'America/Chicago', MT = 'America/Denver', PT = 'America/Los_Angeles';
const ZONES = {
  CT: ET, DE: ET, DC: ET, FL: ET, GA: ET, IN: ET, ME: ET, MD: ET, MA: ET, MI: ET, NH: ET, NJ: ET, NY: ET, NC: ET, OH: ET, PA: ET, RI: ET, SC: ET, VT: ET, VA: ET, WV: ET,
  AL: CT, AR: CT, IL: CT, IA: CT, KS: CT, KY: ET, LA: CT, MN: CT, MS: CT, MO: CT, NE: CT, ND: CT, OK: CT, SD: CT, TN: CT, TX: CT, WI: CT,
  CO: MT, ID: MT, MT: MT, NM: MT, UT: MT, WY: MT, AZ: 'America/Phoenix',
  CA: PT, NV: PT, OR: PT, WA: PT, AK: 'America/Anchorage', HI: 'Pacific/Honolulu'
};
export const zoneForState = (st) => ZONES[String(st || '').toUpperCase()] || ET;
export const ZONE_CHOICES = [
  [ET, 'Eastern'], [CT, 'Central'], [MT, 'Mountain'], ['America/Phoenix', 'Arizona (no DST)'], [PT, 'Pacific'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii']
];

function tzOffsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const g = (t) => +parts.find((p) => p.type === t).value;
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - utcMs;
}
// "2026-10-20" + "08:00" in a time zone -> a real moment in time.
export function zonedToUtc(dateStr, timeStr, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - tzOffsetMs(guess, tz);
  return new Date(guess);
}
// A moment -> "2026-10-20" and "08:00" as seen in a time zone (for editing forms).
export function utcToZoned(ts, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ts));
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}
export const dayKey = (ts, tz) => utcToZoned(ts, tz).date;
export const fmtTime = (ts, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
export const fmtDay = (ts, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ts));
export const fmtDayLong = (ts, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(ts));
export const tzAbbr = (ts, tz) => (new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ts)).find((p) => p.type === 'timeZoneName') || {}).value || '';
export function relDay(ts, tz, now = new Date()) {
  const k = dayKey(ts, tz), today = dayKey(now, tz), tomorrow = dayKey(new Date(now.getTime() + 864e5), tz), yest = dayKey(new Date(now.getTime() - 864e5), tz);
  return k === today ? 'Today' : k === tomorrow ? 'Tomorrow' : k === yest ? 'Yesterday' : fmtDay(ts, tz);
}
export const fmtRange = (job) => `${fmtTime(job.starts_at, job.timezone)} – ${fmtTime(job.ends_at, job.timezone)} ${tzAbbr(job.starts_at, job.timezone)}`;
export function timeAgo(ts, now = new Date()) {
  const s = Math.round((now - new Date(ts)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export function untilText(ts, now = new Date()) {
  const m = Math.round((new Date(ts) - now) / 60000);
  if (m <= 0) return 'now';
  if (m < 60) return `in ${m} min`;
  if (m < 1440) return `in ${Math.floor(m / 60)} hr ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
  return `in ${Math.round(m / 1440)} days`;
}

// ---------- Distance -----------------------------------------------------------------------------
export function haversineM(lat1, lng1, lat2, lng2) {
  const r = (x) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}
export function distText(m) {
  if (m == null) return '';
  const mi = m / 1609.34;
  return mi < 0.1 ? `${Math.round(m)} m` : `${mi.toFixed(1)} mi`;
}

// ---------- Links --------------------------------------------------------------------------------
export const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
export function mapsHref(job) {
  const dest = job.lat != null && job.lng != null ? `${job.lat},${job.lng}` : [job.address, job.city, job.state, job.postal].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest);
}

// ---------- Assignment status --------------------------------------------------------------------
export const lastCheckin = (a) => (a.checkins || []).slice().sort((x, y) => new Date(x.at) - new Date(y.at)).pop() || null;
export const firstCheckin = (a) => (a.checkins || []).filter((c) => c.kind === 'in').sort((x, y) => new Date(x.at) - new Date(y.at))[0] || null;

// One plain word for where a crew member stands on a job.
export function assignState(a, job, now = new Date()) {
  const last = lastCheckin(a);
  if (a.status === 'declined') return { key: 'declined', label: 'Declined', tone: 'bad' };
  if (a.status === 'no_show') return { key: 'no_show', label: 'No-show', tone: 'bad' };
  if (last && last.kind === 'in') return { key: 'on_site', label: `On site since ${fmtTime(last.at, job.timezone)}`, tone: last.within_site === false ? 'warn' : 'good', away: last.within_site === false };
  if (last && last.kind === 'out') return { key: 'done', label: `Checked out ${fmtTime(last.at, job.timezone)}`, tone: 'muted' };
  if (a.status === 'completed') return { key: 'done', label: 'Completed', tone: 'muted' };
  const lateAfter = new Date(job.starts_at).getTime() + 10 * 60000;
  if (job.status === 'scheduled' && now.getTime() > lateAfter && now < new Date(job.ends_at)) return { key: 'late', label: 'Late, not checked in', tone: 'bad' };
  if (a.status === 'confirmed') return { key: 'confirmed', label: 'Confirmed', tone: 'cyan' };
  return { key: 'assigned', label: 'Not confirmed yet', tone: 'warn' };
}

// Is the check-in window open for this job right now?
export function windowState(job, now = new Date()) {
  const opens = new Date(new Date(job.starts_at).getTime() - 60 * 60000);
  const closes = new Date(new Date(job.ends_at).getTime() + 6 * 3600000);
  if (job.status !== 'scheduled') return { open: false, why: 'This job is not scheduled' };
  if (now < opens) return { open: false, why: `Check-in opens at ${fmtTime(opens, job.timezone)}`, opens };
  if (now > closes) return { open: false, why: 'This job has ended' };
  return { open: true };
}

export const SERVICES = ['IMAC', 'ITAM', 'E-waste', 'Data-center cleaning', 'Warehouse movement', 'Other'];
export const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
