# AISSKO Crew: setup guide

The crew app lives at **aissko.com/crew**. It works right now in **demo mode** (sample data, nothing saved anywhere).
These steps connect it to a real database so crews, managers, and the website's sign-up forms all share one set of records.

**What you will create:** a free [Supabase](https://supabase.com) project (the database and secure sign-in) and, for email, a free [Resend](https://resend.com) account.
You do not need to write any code. When you have the two values in step 6, send them to Claude, or paste them yourself.

## 1. Create the database
1. Sign up at supabase.com and click **New project**. Name it `aissko-crew`, pick a region near you (US East is fine), and save the database password somewhere safe.
2. Open **SQL Editor** → **New query**.
3. Open `crew-backend/schema.sql` from this repo, copy **all** of it, and paste it in.
4. Near the top, change `owner@example.com` to **your own email**. This is the account that becomes the admin.
5. Click **Run**. You should see "Success". (It is safe to run again later.)

## 2. Make the sign-in emails show a code
The app signs people in with a 6-digit code emailed to them, so there are no passwords.
1. **Authentication → Emails** (or **Email Templates**).
2. Open **Confirm signup** and **Magic Link**. In each one, replace the body with:
   `Your AISSKO Crew sign-in code is: {{ .Token }}`
3. **Authentication → URL Configuration**: set **Site URL** to `https://aissko.com/crew/`.

## 3. Send the emails from your own domain (do not skip)
Supabase's built-in email sender allows only a handful of emails per hour, which will not work for a crew.
1. Create a free account at resend.com, open **Domains**, add `aissko.com`, and add the DNS records it shows at your domain company. Wait until it says **Verified**.
2. In Resend, create an **API key**.
3. In Supabase: **Authentication → SMTP Settings** (or **Project Settings → Authentication**), turn on **Custom SMTP** and enter:
   host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key, sender email `crew@aissko.com`, sender name `AISSKO Crew`.

## 4. Check the security rules (optional but smart)
The rules that keep people from seeing each other's data are tested automatically. To run the tests yourself:
`cd crew-backend/tests && npm install && npm test` (needs Node.js). Expect `99 passed, 0 failed`.

## 5. Plan limits to know about
Supabase's free plan pauses a project after a week with no activity. For something crews depend on every day, the Pro plan (about $25 a month) is the safe choice and adds daily backups.

## 6. Connect the app and the website
In Supabase open **Project Settings → API** (or **API Keys**) and copy:
- the **Project URL** (looks like `https://abcdefgh.supabase.co`), and
- the **public key**: the one labelled **anon public** (a long text starting `eyJ`) or **publishable**.
  **Never** use the `service_role` or **secret** key anywhere on this site.

Paste both into these two files in this repo:
- `crew/config.js` → `supabaseUrl` and `supabaseKey` (turns the app from demo into live)
- `assets/js/config.js` → `supabaseUrl` and `supabaseKey` (makes the website's "Join the network" and "Request crews" forms save into the database)

The public key is meant to be visible. The database rules in `schema.sql` are what protect the data.

## 7. Optional: email alerts for new jobs
Crews always see alerts inside the app. To also email them: *(this function has not yet been tested against a live project)*
1. Install the Supabase CLI and run `supabase functions deploy notify-email` (file: `crew-backend/functions/notify-email/index.ts`).
2. Add the secrets it lists at the top of that file.
3. **Database → Webhooks → Create**: table `notifications`, event `Insert`, type `Supabase Edge Functions`, function `notify-email`, plus an HTTP header `x-webhook-secret` with the same secret.

## 8. First sign-in
1. Open **aissko.com/crew** and sign in with the owner email. You are now the admin.
2. **Me → Team and managers**: when a manager signs in the first time, set their role to **Manager** and enter the states they cover (for example `GA, TX`). Managers only see jobs and people in those states.
3. When someone applies on the website, the application appears in **Inbox**. Tap **Approve**, then **Copy sign-in message** and text it to them. They sign in with the same email and see their jobs.

## How it works, in short
- **Crew** see only their own jobs. They confirm or decline, and tap **Check in** and **Check out**. Location is recorded only at that tap.
- **Managers** see and run jobs in their own states: create jobs, add crew, watch who is on site, fix missed check-ins, mark no-shows.
- **Admin (you)** sees everything and decides who is a manager and which states they cover.
- Check-in opens 60 minutes before the start. If a crew member checks in more than the job's radius from the pin, it is still recorded but flagged, and the manager is alerted.
- Every check-in is kept as a permanent record. Managers can add corrections but cannot edit or erase what a crew member recorded.
