# Deployment

## Hosting

| Part | Where |
|---|---|
| Website and API | Vercel, project `sourcednexuszm`, domain https://sourcednexus.online |
| Database and Auth | Supabase |
| Payments | Payza |
| Email | Resend or Brevo (set by `EMAIL_PROVIDER`) |
| Bot protection | Cloudflare Turnstile |

Vercel deploys automatically from every push to `main` on `Botcreationam/sourcednexuszm`. Commits must be authored by the GitHub account that owns the project, or Vercel will refuse the deployment.

`vercel.json` rewrites friendly URLs to the functions in `api/` (for example `/api/webhooks/payza` to `api/payza-webhook.js`) and defines the cron jobs. `render.yaml` and `server.js` allow running the same app on a plain Node host.

## Environment variables

Set these in Vercel, Project Settings, Environment Variables. Never commit real values.

| Variable | Used by | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser and server | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser and server | Public anon key (safe in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Full database access. Secret |
| `PAYZA_PUBLIC_KEY`, `PAYZA_SECRET_KEY` | Server only | Live Payza keys |
| `PAYZA_WEBHOOK_SECRET` | Server only | Verifies webhook signatures |
| `PAYZA_API_BASE_URL` | Server | Optional; defaults to `https://payzaapi.co.ke/api/v1` |
| `SITE_BASE_URL` | Server | Defaults to `https://sourcednexus.online` |
| `EMAIL_PROVIDER` | Server | `resend` (default) or `brevo` |
| `EMAIL_API_KEY` | Server only | Email provider key. Secret |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Server | Sender |
| `EMAIL_API_URL` | Server | Optional override |
| `CRON_SECRET` | Server only | Protects the worker endpoints |
| `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES` | Server | Bot check on sign in and sign up |
| `PAYMENT_ADMIN_EMAILS` | Server | Optional; the two administrators are built in |

After changing a variable, redeploy so it takes effect.

## Scheduled jobs (Vercel Cron, UTC)

| Time | Endpoint | Does |
|---|---|---|
| 06:00 | `/api/notifications/process` | Sends new product emails |
| 06:05 | `/api/announcements/process` | Sends announcements |
| 06:10 | `/api/shop/receipts/process` | Retries receipt and administrator payment emails |

Each requires `Authorization: Bearer <CRON_SECRET>` (Vercel adds it for cron). Anonymous calls return 401.

## Release checklist

1. `npm run build` succeeds.
2. Run the test suites ([Testing](TESTING.md)).
3. Apply any new migration in Supabase.
4. Push to `main` and wait for the Vercel deployment to show Ready.
5. Check https://sourcednexus.online loads, then place a K1 test order.

## Go live checklist for payments

- Live Payza keys and `PAYZA_WEBHOOK_SECRET` set in Vercel.
- Payza dashboard webhook URL points to `https://sourcednexus.online/api/webhooks/payza`.
- Email variables set; send one test receipt.
- Latest migration applied.
