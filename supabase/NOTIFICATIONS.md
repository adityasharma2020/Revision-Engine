# Web Push deployment

The app contains the complete client, schema, service-worker handlers and Edge
Functions. These one-time steps connect them to a Supabase project.

## 1. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

Put only the public key in the web app environment:

```text
VITE_VAPID_PUBLIC_KEY=<public key>
```

Store both keys and a contact subject in Edge Function secrets:

```bash
supabase secrets set \
  VAPID_SUBJECT=mailto:your-email@example.com \
  VAPID_PUBLIC_KEY=<public key> \
  VAPID_PRIVATE_KEY=<private key> \
  CRON_SECRET=<a-long-random-value>
```

Never expose the private key through a `VITE_` variable or commit it.

## 2. Apply schema and deploy

```bash
supabase db push
supabase functions deploy test-notification
supabase functions deploy dispatch-notifications --no-verify-jwt
```

The scheduled function uses the server-only `SUPABASE_SERVICE_ROLE_KEY` secret.
Hosted Supabase projects provide this legacy secret automatically. If your
project uses the newer secret-key format, add the equivalent service-role value
under that name for this function.

## 3. Schedule delivery

In Supabase Dashboard, open **Integrations → Cron**, create an HTTP job every 15
minutes, and POST to:

```text
https://<project-ref>.supabase.co/functions/v1/dispatch-notifications
```

Add this request header:

```text
x-cron-secret: <the same CRON_SECRET value>
```

The dispatcher evaluates each user's timezone and configured schedule. A unique
delivery key makes repeated Cron calls safe and prevents duplicate messages.

## Delivery behavior

- Daily revision: sent only when today's assignment is not complete.
- Weekly summary: question and quiz totals for the preceding seven days.
- Milestones: one notification for each 100-question lifetime milestone.
- Expired browser endpoints (HTTP 404/410) are disabled automatically.
- A user can own multiple subscriptions, so each signed-in device receives the
  notification.
- Memory Nudges use the same dispatcher. Apply migration `0006`, configure the
  add-on in Settings, and manage content at `/nudges`; no second Cron job is
  required.
