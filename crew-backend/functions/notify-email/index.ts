// OPTIONAL: emails a person whenever the app creates an alert for them (new job, job changed, and so on).
// NOT YET TESTED against a live project. Deploy it, then add a Database Webhook (see ../../README.md, step 7).
//
// Needs these secrets (Supabase -> Edge Functions -> Secrets):
//   RESEND_API_KEY   your Resend API key
//   EMAIL_FROM       e.g.  AISSKO Crew <crew@aissko.com>   (the address must be on a domain verified in Resend)
//   WEBHOOK_SECRET   any long random text; put the same text in the webhook's "x-webhook-secret" header
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return new Response('unauthorized', { status: 401 });

  const payload = await req.json().catch(() => null);
  const n = payload && payload.record;
  if (!n || payload.table !== 'notifications') return new Response('nothing to send');

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: person } = await sb.from('profiles').select('email, full_name').eq('id', n.user_id).maybeSingle();
  if (!person || !person.email) return new Response('no email on file');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'AISSKO Crew <crew@aissko.com>',
      to: [person.email],
      subject: n.title,
      text: `${n.title}\n\n${n.body}\n\nOpen AISSKO Crew: https://aissko.com/crew/\n`
    })
  });
  return new Response(res.ok ? 'sent' : 'failed', { status: res.ok ? 200 : 502 });
});
