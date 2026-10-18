-- =====================================================================
-- AISSKO Crew: database setup for Supabase.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- It is safe to run again later; it updates things in place and never deletes data.
--
-- BEFORE YOU RUN IT: change the owner email in STEP 1 to the email you will sign in with.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1. Settings. Put YOUR email here (the person who owns the system).
-- The first time that email signs in, that account becomes the admin.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
insert into public.app_settings (key, value) values ('owner_email', 'owner@example.com')
on conflict (key) do nothing;
-- To change it later:  update public.app_settings set value = 'you@yourmail.com' where key = 'owner_email';

-- ---------------------------------------------------------------------
-- STEP 2. Tables
-- ---------------------------------------------------------------------

-- One row per person who can sign in (crew, managers, you).
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text not null default '',
  phone          text not null default '',
  role           text not null default 'contractor' check (role in ('contractor', 'manager', 'admin')),
  states         text[] not null default '{}',     -- managers: the states they cover. Crew: home state.
  active         boolean not null default false,   -- crew cannot see jobs until this is true
  application_id uuid,
  created_at     timestamptz not null default now()
);
create unique index if not exists profiles_email_uq on public.profiles (lower(email));

-- "Join the network" sign-ups from the website.
create table if not exists public.applications (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  full_name    text not null check (char_length(full_name) between 1 and 120),
  email        text not null check (char_length(email) between 3 and 200 and position('@' in email) > 1),
  phone        text not null default '' check (char_length(phone) <= 40),
  state        text not null check (char_length(state) = 2),
  city         text not null default '' check (char_length(city) <= 120),
  experience   text not null default '' check (char_length(experience) <= 80),
  services     text[] not null default '{}',
  availability text not null default '' check (char_length(availability) <= 80),
  travel       text not null default '' check (char_length(travel) <= 80),
  credentials  text not null default '' check (char_length(credentials) <= 500),
  link         text not null default '' check (char_length(link) <= 500),
  message      text not null default '' check (char_length(message) <= 3000),
  consent      boolean not null default false check (consent),
  status       text not null default 'new' check (status in ('new', 'reviewing', 'approved', 'rejected')),
  notes        text not null default '',
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz
);
create index if not exists applications_state_idx on public.applications (state, created_at desc);

-- "Request crews" submissions from customers.
create table if not exists public.service_requests (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  company      text not null check (char_length(company) between 1 and 200),
  full_name    text not null check (char_length(full_name) between 1 and 120),
  email        text not null check (char_length(email) between 3 and 200 and position('@' in email) > 1),
  phone        text not null default '' check (char_length(phone) <= 40),
  services     text[] not null default '{}',
  state        text not null check (char_length(state) = 2),
  site         text not null default '' check (char_length(site) <= 300),
  timeframe    text not null default '' check (char_length(timeframe) <= 80),
  crew_size    text not null default '' check (char_length(crew_size) <= 80),
  message      text not null default '' check (char_length(message) <= 3000),
  consent      boolean not null default false check (consent),
  status       text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'won', 'lost')),
  notes        text not null default ''
);
create index if not exists service_requests_state_idx on public.service_requests (state, created_at desc);

-- A job: where, when, how many people.
create table if not exists public.jobs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  title        text not null check (char_length(title) between 1 and 160),
  service      text not null default 'Other' check (service in ('IMAC', 'ITAM', 'E-waste', 'Data-center cleaning', 'Warehouse movement', 'Other')),
  customer     text not null default '' check (char_length(customer) <= 160),
  site_name    text not null default '' check (char_length(site_name) <= 160),
  address      text not null check (char_length(address) between 1 and 240),
  city         text not null default '' check (char_length(city) <= 120),
  state        text not null check (char_length(state) = 2),
  postal       text not null default '' check (char_length(postal) <= 20),
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  radius_m     integer not null default 250 check (radius_m between 25 and 5000),
  timezone     text not null default 'America/New_York',
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  crew_needed  integer not null default 1 check (crew_needed between 1 and 500),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  manager_id   uuid references public.profiles (id) on delete set null,
  status       text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  constraint jobs_end_after_start check (ends_at > starts_at)
);
create index if not exists jobs_starts_idx on public.jobs (starts_at);
create index if not exists jobs_state_idx on public.jobs (state);

-- Who is on which job.
create table if not exists public.assignments (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs (id) on delete cascade,
  contractor_id uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'assigned' check (status in ('assigned', 'confirmed', 'declined', 'no_show', 'completed')),
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (job_id, contractor_id)
);
create index if not exists assignments_contractor_idx on public.assignments (contractor_id);
create index if not exists assignments_job_idx on public.assignments (job_id);

-- Check-ins and check-outs. Rows are only added, never edited.
create table if not exists public.checkins (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  kind          text not null check (kind in ('in', 'out')),
  at            timestamptz not null default now(),
  source        text not null check (source in ('self', 'manager')),
  lat           double precision,
  lng           double precision,
  accuracy_m    double precision,
  distance_m    double precision,
  within_site   boolean,
  by_user       uuid references public.profiles (id) on delete set null,
  note          text not null default '' check (char_length(note) <= 500),
  created_at    timestamptz not null default now()
);
create index if not exists checkins_assignment_idx on public.checkins (assignment_id, at);

-- In-app messages ("New job assigned", "Job changed").
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text not null default '',
  job_id     uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- STEP 3. Helper functions (used by the security rules)
-- ---------------------------------------------------------------------
create or replace function public.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

create or replace function public.fmt_when(ts timestamptz, tz text)
returns text language sql stable as $$
  select to_char(ts at time zone tz, 'Dy Mon FMDD "at" FMHH12:MI AM')
$$;

-- Who am I, if my account is active?
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.my_states()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select states from public.profiles where id = auth.uid() and active), '{}'::text[])
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- Can I manage things in this state? (admins: everywhere. managers: only their states.)
create or replace function public.manages_state(st text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.my_role() = 'manager' and st = any (public.my_states()))
$$;

-- Can I manage this job? (admins: any job. managers: jobs in their states.)
create or replace function public.manages_job(jid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs j where j.id = jid and public.manages_state(j.state))
$$;

-- Can I put this person on a job? They must be an active crew member in one of my states (admins: anyone).
create or replace function public.can_assign(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                  where p.id = cid and p.active and p.role = 'contractor'
                    and (public.is_admin() or p.states && public.my_states()))
$$;

create or replace function public.me_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;

create or replace function public.is_assigned(jid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assignments a where a.job_id = jid and a.contractor_id = auth.uid())
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;

create or replace function public.can_see_profile(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select pid = auth.uid()
      or public.is_admin()
      or (public.my_role() = 'manager' and (
            exists (select 1 from public.profiles p where p.id = pid and p.states && public.my_states())
         or exists (select 1 from public.assignments a where a.contractor_id = pid and public.manages_job(a.job_id))
         ))
      -- crew can see the manager of a job they are on, so they know who to call
      or exists (select 1 from public.jobs j join public.assignments a on a.job_id = j.id
                  where a.contractor_id = auth.uid() and j.manager_id = pid)
$$;

create or replace function public.can_see_assignment(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assignments a
                  where a.id = aid
                    and ((a.contractor_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active))
                         or public.manages_job(a.job_id)))
$$;

-- ---------------------------------------------------------------------
-- STEP 4. Triggers
-- ---------------------------------------------------------------------

-- When someone signs in for the first time, create their profile.
-- The owner email becomes admin. Someone whose application was approved is switched on right away.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  app public.applications;
  owner_email text;
  is_owner boolean;
begin
  select value into owner_email from public.app_settings where key = 'owner_email';
  is_owner := owner_email is not null and lower(owner_email) = lower(new.email);

  select * into app from public.applications
   where lower(email) = lower(new.email)
   order by (status = 'approved') desc, created_at desc
   limit 1;

  insert into public.profiles (id, email, full_name, phone, role, states, active, application_id)
  values (
    new.id,
    new.email,
    coalesce(nullif(app.full_name, ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    coalesce(app.phone, ''),
    case when is_owner then 'admin' else 'contractor' end,
    case when app.state is not null then array[app.state] else '{}'::text[] end,
    is_owner or coalesce(app.status = 'approved', false),
    app.id
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins can change someone's role, states, or active status.
-- (Runs as the caller, so it only blocks people using the app, not the SQL editor.)
create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.states is distinct from old.states
       or new.active is distinct from old.active
       or new.application_id is distinct from old.application_id then
      raise exception 'Only an admin can change that.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Approving an application switches on the matching account (if the person already signed in).
create or replace function public.on_application_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.profiles
       set active = true,
           application_id = new.id,
           states = case when cardinality(states) = 0 then array[new.state] else states end,
           full_name = case when full_name = '' then new.full_name else full_name end,
           phone = case when phone = '' then new.phone else phone end
     where lower(email) = lower(new.email) and role = 'contractor';
  end if;
  return new;
end $$;

drop trigger if exists on_application_review on public.applications;
create trigger on_application_review before update on public.applications
  for each row execute function public.on_application_review();

-- Tell crew members when they are put on a job.
create or replace function public.notify_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = new.job_id;
  insert into public.notifications (user_id, title, body, job_id)
  values (new.contractor_id, 'New job: ' || j.title,
          public.fmt_when(j.starts_at, j.timezone) || ' · ' || j.address || case when j.city <> '' then ', ' || j.city else '' end || ' ' || j.state,
          j.id);
  return new;
end $$;

drop trigger if exists notify_assignment on public.assignments;
create trigger notify_assignment after insert on public.assignments
  for each row execute function public.notify_assignment();

-- Tell the crew when a job changes or is cancelled.
create or replace function public.notify_job_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, job_id)
  select a.contractor_id,
         case when new.status = 'cancelled' then 'Job cancelled: ' else 'Job updated: ' end || new.title,
         public.fmt_when(new.starts_at, new.timezone) || ' · ' || new.address || case when new.city <> '' then ', ' || new.city else '' end || ' ' || new.state,
         new.id
    from public.assignments a
   where a.job_id = new.id and a.status in ('assigned', 'confirmed');
  return new;
end $$;

drop trigger if exists notify_job_change on public.jobs;
create trigger notify_job_change after update on public.jobs
  for each row
  when (old.starts_at is distinct from new.starts_at
     or old.ends_at is distinct from new.ends_at
     or old.address is distinct from new.address
     or old.city is distinct from new.city
     or old.instructions is distinct from new.instructions
     or old.status is distinct from new.status)
  execute function public.notify_job_change();

-- ---------------------------------------------------------------------
-- STEP 5. Actions the app calls (each one checks who is asking)
-- ---------------------------------------------------------------------

-- Crew member confirms or declines a job.
create or replace function public.respond_to_assignment(p_assignment uuid, p_response text)
returns public.assignments language plpgsql security definer set search_path = public as $$
declare a public.assignments; j public.jobs; who text;
begin
  if p_response not in ('confirmed', 'declined') then raise exception 'Invalid response'; end if;
  select * into a from public.assignments where id = p_assignment and contractor_id = auth.uid();
  if not found then raise exception 'Assignment not found'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then raise exception 'Your account is not active yet'; end if;
  if a.status in ('no_show', 'completed') then raise exception 'This assignment is closed'; end if;
  select * into j from public.jobs where id = a.job_id;
  if j.status <> 'scheduled' then raise exception 'This job is no longer scheduled'; end if;
  if now() > j.ends_at then raise exception 'This job has already ended'; end if;

  update public.assignments set status = p_response, responded_at = now() where id = a.id returning * into a;

  select full_name into who from public.profiles where id = auth.uid();
  if j.manager_id is not null then
    insert into public.notifications (user_id, title, body, job_id)
    values (j.manager_id,
            coalesce(nullif(who, ''), 'A crew member') || case when p_response = 'declined' then ' can''t make it' else ' confirmed' end,
            j.title || ' · ' || public.fmt_when(j.starts_at, j.timezone), j.id);
  end if;
  return a;
end $$;

-- Crew member checks in or out. Location is saved at that moment only.
create or replace function public.check_in(
  p_assignment uuid, p_kind text,
  p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null)
returns public.checkins language plpgsql security definer set search_path = public as $$
declare
  a public.assignments; j public.jobs; last_kind text;
  dist double precision; inside boolean; rec public.checkins; who text;
begin
  if p_kind not in ('in', 'out') then raise exception 'Invalid check-in type'; end if;
  select * into a from public.assignments where id = p_assignment and contractor_id = auth.uid();
  if not found then raise exception 'Assignment not found'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then raise exception 'Your account is not active yet'; end if;
  if a.status not in ('assigned', 'confirmed') then raise exception 'You are not on this job'; end if;

  select * into j from public.jobs where id = a.job_id;
  if j.status <> 'scheduled' then raise exception 'This job is not scheduled'; end if;
  if now() < j.starts_at - interval '60 minutes' then raise exception 'Check-in opens 60 minutes before the start time'; end if;
  if now() > j.ends_at + interval '6 hours' then raise exception 'This job ended too long ago to check in. Ask your manager.'; end if;

  select kind into last_kind from public.checkins where assignment_id = a.id order by at desc, created_at desc limit 1;
  if p_kind = 'in' and last_kind = 'in' then raise exception 'You are already checked in'; end if;
  if p_kind = 'out' and last_kind is distinct from 'in' then raise exception 'You are not checked in'; end if;

  if j.lat is not null and j.lng is not null then
    if p_lat is null or p_lng is null then
      raise exception 'Location is needed to check in here. Turn on location, or ask your manager to check you in.';
    end if;
    dist := public.haversine_m(p_lat, p_lng, j.lat, j.lng);
    inside := dist <= j.radius_m + least(coalesce(p_accuracy, 0), 150);
  end if;

  insert into public.checkins (assignment_id, kind, at, source, lat, lng, accuracy_m, distance_m, within_site, by_user)
  values (a.id, p_kind, now(), 'self', p_lat, p_lng, p_accuracy, dist, inside, auth.uid())
  returning * into rec;

  if p_kind = 'in' and inside is false and j.manager_id is not null then
    select full_name into who from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, title, body, job_id)
    values (j.manager_id, coalesce(nullif(who, ''), 'A crew member') || ' checked in away from the site',
            j.title || ' · about ' || round(dist)::text || ' m from the address', j.id);
  end if;
  return rec;
end $$;

-- Manager checks someone in or out (or fixes a missed check-in).
create or replace function public.manager_check_in(
  p_assignment uuid, p_kind text, p_at timestamptz default now(), p_note text default '')
returns public.checkins language plpgsql security definer set search_path = public as $$
declare a public.assignments; rec public.checkins;
begin
  if p_kind not in ('in', 'out') then raise exception 'Invalid check-in type'; end if;
  select * into a from public.assignments where id = p_assignment;
  if not found or not public.manages_job(a.job_id) then raise exception 'Not allowed'; end if;
  if p_at > now() + interval '5 minutes' then raise exception 'That time is in the future'; end if;

  insert into public.checkins (assignment_id, kind, at, source, by_user, note)
  values (a.id, p_kind, coalesce(p_at, now()), 'manager', auth.uid(), coalesce(p_note, ''))
  returning * into rec;

  if p_kind = 'in' and a.status in ('assigned', 'declined', 'no_show') then
    update public.assignments set status = 'confirmed', responded_at = coalesce(responded_at, now()) where id = a.id;
  end if;
  return rec;
end $$;

-- ---------------------------------------------------------------------
-- STEP 6. Security rules (who can see and change what)
-- ---------------------------------------------------------------------
alter table public.app_settings     enable row level security;
alter table public.profiles         enable row level security;
alter table public.applications     enable row level security;
alter table public.service_requests enable row level security;
alter table public.jobs             enable row level security;
alter table public.assignments      enable row level security;
alter table public.checkins         enable row level security;
alter table public.notifications    enable row level security;

-- Start from nothing, then grant only what is needed.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- The public website: can add a sign-up or a request, and nothing else.
grant insert (full_name, email, phone, state, city, experience, services, availability, travel, credentials, link, message, consent)
  on public.applications to anon;
grant insert (company, full_name, email, phone, services, state, site, timeframe, crew_size, message, consent)
  on public.service_requests to anon;

drop policy if exists applications_public_insert on public.applications;
create policy applications_public_insert on public.applications
  for insert to anon with check (status = 'new' and notes = '' and reviewed_by is null);
drop policy if exists service_requests_public_insert on public.service_requests;
create policy service_requests_public_insert on public.service_requests
  for insert to anon with check (status = 'new' and notes = '');

-- Signed-in users
grant select, update (full_name, phone, role, states, active) on public.profiles to authenticated;
grant select, update (status, notes) on public.applications to authenticated;
grant select, update (status, notes) on public.service_requests to authenticated;
grant select, insert, update, delete on public.jobs to authenticated;
grant select, insert, update (status), delete on public.assignments to authenticated;
grant select, delete on public.checkins to authenticated;
grant select, update (read_at) on public.notifications to authenticated;

-- Helper functions the rules rely on
grant execute on function
  public.my_role(), public.my_states(), public.me_active(), public.is_admin(), public.manages_state(text),
  public.manages_job(uuid), public.can_assign(uuid), public.is_assigned(uuid), public.can_see_profile(uuid), public.can_see_assignment(uuid),
  public.haversine_m(double precision, double precision, double precision, double precision), public.fmt_when(timestamptz, text)
  to authenticated;
-- Actions the app calls
grant execute on function
  public.respond_to_assignment(uuid, text),
  public.check_in(uuid, text, double precision, double precision, double precision),
  public.manager_check_in(uuid, text, timestamptz, text)
  to authenticated;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (public.can_see_profile(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- applications and service requests: admins, and managers for their own states
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications for select to authenticated using (public.manages_state(state));
drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications for update to authenticated
  using (public.manages_state(state)) with check (public.manages_state(state));

drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests for select to authenticated using (public.manages_state(state));
drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests for update to authenticated
  using (public.manages_state(state)) with check (public.manages_state(state));

-- jobs
drop policy if exists jobs_select on public.jobs;
-- Note: reads the job's own columns (not a lookup by id) so that a manager can read back a job they just created.
create policy jobs_select on public.jobs for select to authenticated
  using (public.manages_state(state) or public.is_assigned(id));
drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs for insert to authenticated
  with check (public.manages_state(state) and created_by = auth.uid());
drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs for update to authenticated
  using (public.manages_job(id)) with check (public.manages_state(state));
drop policy if exists jobs_delete on public.jobs;
create policy jobs_delete on public.jobs for delete to authenticated using (public.is_admin());

-- assignments (crew change theirs only through respond_to_assignment)
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated
  using ((contractor_id = auth.uid() and public.me_active()) or public.manages_job(job_id));
drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert on public.assignments for insert to authenticated
  with check (public.manages_job(job_id) and public.can_assign(contractor_id) and created_by = auth.uid());
drop policy if exists assignments_update on public.assignments;
create policy assignments_update on public.assignments for update to authenticated
  using (public.manages_job(job_id)) with check (public.manages_job(job_id));
drop policy if exists assignments_delete on public.assignments;
create policy assignments_delete on public.assignments for delete to authenticated using (public.manages_job(job_id));

-- check-ins: read-only from the app. They are added through check_in / manager_check_in.
drop policy if exists checkins_select on public.checkins;
create policy checkins_select on public.checkins for select to authenticated using (public.can_see_assignment(assignment_id));
drop policy if exists checkins_delete on public.checkins;
create policy checkins_delete on public.checkins for delete to authenticated using (public.is_admin());

-- notifications: your own only
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Done. Next: sign in to the app with your owner email, and you will be the admin.
