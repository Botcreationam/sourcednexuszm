# Operations

## Administrators

Two accounts have admin access: `sourcednexus@gmail.com` and `frankmwalu04@gmail.com`. Access is enforced twice: the browser hides the panel (`src/lib/adminAccess.js`) and the database checks `public.is_admin()`. To add or remove an administrator, update both places and the `is_admin()` function in a new migration.

The admin panel lives at `/secure/nexuspanel-trust`. Keep that URL private.

## Everyday tasks

| Task | How |
|---|---|
| Add a product | Admin, Products, New. Set category, price, grade, sizes, photos, then publish |
| Make a bundle | Admin, Bundles, New. Pick components, set one price, activate |
| Handle an order | Admin, Orders. Move through processing, shipped, completed |
| Reply to a customer | Admin, Inbox or Inquiries |
| Send an announcement | Admin, Announcements |
| Remove a bad comment | Admin, Moderation |
| Resend a receipt | The customer does it from My Orders (it only works for their own order). To resend for someone else, run the receipt worker with `CRON_SECRET` |

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Paid, but order still pending | Webhook not received. The return page and `/api/payments/payza/verify` also confirm it. Check the Payza webhook URL and `PAYZA_WEBHOOK_SECRET` |
| Webhook returns 401 | Wrong or missing `PAYZA_WEBHOOK_SECRET`, or the request was not signed by Payza (expected for tests) |
| "Payment method coming soon" | The `PAYMENTS_ENABLED` constant in `src/pages/Checkout.jsx` must be `true` (it is). If you still see it, the browser has an old cached build: hard refresh and confirm the latest Vercel deployment is Ready |
| Customer got no receipt | Check email variables and `order_receipts.email_status`. The daily worker retries; or call the receipt worker with `CRON_SECRET` |
| Administrators got no payment email | Latest migration not applied, or email variables missing. Check `payment_admin_notifications.email_status` and `email_last_error` |
| Checkout says phone required | Phone is mandatory; the customer must enter a valid number (7 to 15 digits) |
| Site shows old version | Hard refresh. If a service worker is cached, clear site data |
| Vercel refuses to deploy | Commit author must match the GitHub account that owns the project |

Useful queries (Supabase SQL editor):

```sql
-- Unsent customer receipts
select id, email_status, email_attempts, email_last_error from order_receipts where email_status <> 'sent';

-- Unsent administrator alerts
select recipient_email, email_status, email_attempts, email_last_error from payment_admin_notifications where email_status <> 'sent';
```

## Security checklist

- Keep `SUPABASE_SERVICE_ROLE_KEY`, `PAYZA_SECRET_KEY`, `PAYZA_WEBHOOK_SECRET`, `EMAIL_API_KEY` and `CRON_SECRET` only in Vercel. Never in git, chat or the browser.
- Rotate any token that was ever shared in a chat (GitHub, Vercel, Render).
- Never turn off RLS. New tables need RLS and explicit policies.
- Do not add insert, update or delete policies for browsers on orders, payments or receipts.
- Review the Payza dashboard regularly against paid orders.

## Backups and data

Use Supabase backups and export order tables regularly. Receipts are immutable snapshots, so keep them for tax and accounting.

## Legal and business

Terms, Privacy and Refund pages are in `src/pages/`. Customer data is handled under the Zambia Data Protection Act, 2021. Have a licensed advocate review policy wording.
