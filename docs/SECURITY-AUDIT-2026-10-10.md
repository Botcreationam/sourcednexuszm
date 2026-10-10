# Sourced Nexus Security Audit, 2026-10-10

Scope: static review of the repository (api/, lib/, server.js, src/, supabase/migrations, vercel.json, CI),
dependency scan, git-history secret scan, and read-only unauthenticated probes of sourcednexus.online.
No production data was read or modified. No deployment was performed.

This report does NOT certify the site as secure. See "Not verified".

## Findings (prioritized)

| # | Sev | Finding | Evidence | Status |
|---|-----|---------|----------|--------|
| 1 | High | `/api/inquiries` trusted `user_id` from the request body, so anyone could file inquiries under another customer's account (shows in that customer's "my inquiries"). No auth, no rate limit, no email validation. | api/inquiries.js `user_id: payload.user_id`; same logic duplicated in server.js. Live E2E reproduced then verified fixed. | FIXED (code) |
| 2 | High | 33 vulnerable npm packages (20 high, 12 moderate, 1 low), incl. lodash, dompurify, moment, vite, rollup, ws, quill. | `npm audit` | MOSTLY FIXED: `npm audit fix` (lockfile only, no major bumps) plus removal of the unused `react-quill`. 33 -> 10 remaining, all build-time tooling (tailwind/postcss/braces chain) or the react-router advisory (see 15). Build and all 316+ checks pass. |
| 15 | Medium | Open redirect in login: `returnTo` from the URL was passed to `navigate()` and `window.location.href` (also reachable via the Google OAuth flow through sessionStorage), so `/login?returnTo=//evil.com` or a `javascript:` value could phish customers after sign-in. | Login.jsx, Register.jsx, AuthContext.jsx | FIXED: same-origin path allowlist (`src/lib/safeReturn.js`), applied on both write and read; 24 attack variants tested. Also neutralizes the exposed react-router open-redirect advisory for this app. |
| 3 | Medium | No Content-Security-Policy on the live Vercel deployment (only the Render server.js sets one). | `curl -I https://sourcednexus.online/` | MITIGATED: CSP added as Report-Only (not enforcing yet) |
| 4 | Medium | Wildcard CORS (`*`) on server.js preflight. | server.js | FIXED |
| 5 | Medium | Rate limiter keyed on the first X-Forwarded-For entry (client-controlled), trivially bypassed. Same for IP stored on inquiries and sent to Turnstile. | server.js getClientIp, api/*.js | FIXED |
| 6 | Medium | Turnstile CAPTCHA verification fails OPEN when `TURNSTILE_SECRET` is unset (returns success). | api/verify-turnstile.js, server.js | FIXED (fails closed in production) |
| 7 | Medium | `product_views` readable by the public, exposing visitor_id/session_id/user_id of customers. | migration 20261001000005 | FIXED in new migration (NOT YET APPLIED) |
| 8 | Medium | Direct PostgREST inserts into `customer_inquiries`, `website_visits`, `product_views` could set another user's `user_id` and oversized payloads. | policies `with check (true)` | FIXED in new migration (NOT YET APPLIED) |
| 9 | Low | Inquiry image URLs stored unvalidated (javascript:/data: schemes) and rendered into `<img src>` in admin. | api/inquiries.js | FIXED |
| 10 | Low | `is_admin()` is SECURITY DEFINER without a pinned search_path; admin also granted by hard-coded email match, including `admin@sourcednexus.com` which docs did not list (removed in migration 20261010000001; admins are now exactly sourcednexus@gmail.com, joshuankuba04@gmail.com, frankmwalu04@gmail.com). | migration 20261002000001 | search_path FIXED in migration; email allowlist is a decision for the owner |
| 11 | Low | Inquiry API echoed the full database row back to anonymous callers; Turnstile echoed Cloudflare error codes. | api/inquiries.js, api/verify-turnstile.js | FIXED |
| 12 | Low | `X-XSS-Protection: 1; mode=block` is deprecated and can itself introduce issues in legacy browsers. | vercel.json | FIXED (set to 0, CSP is the control) |
| 13 | Info | `.github/workflows/supabase-sync.yml` runs `supabase db push` on every push to main touching migrations, with `latest` CLI. Merging this branch applies the new migration automatically. | workflow file | Owner awareness |
| 14 | Info | `.env.example` / `render.yaml` contain a Base44 app id and the Supabase project ref/URL; these are public identifiers, not secrets. | | No action |

## Verified controls (passed)

- Payment webhook: HMAC-SHA256 over the raw body, timing-safe compare, 64 KB cap, re-verified with the provider before any state change, forged signature returns 401 (live probe + tests).
- Payment amounts and currency are recomputed server-side from the products table; client prices are ignored (tests include a K500 -> K5 tamper case).
- Payment state transitions are idempotent (conditional updates on current status; receipt UNIQUE payment_id; provider idempotency keys on emails).
- create-order / verify / cancel require a valid session and check payment ownership (403 on other users' payments). Live unauthenticated probes returned 401.
- Cron/admin processors (`/api/notifications/process`, `/api/announcements/process`) require admin (checked against `admin_users` server-side) or a timing-safe CRON_SECRET. Live probe returned 401.
- Orders, payments, receipts: RLS enabled, customers have SELECT on their own rows only, no browser INSERT/UPDATE/DELETE policies.
- `/api/shop/*` filters every read by the verified token's user id; other users' receipts return 404.
- Preorder photos: private bucket, owner/admin-only policies. Product/category images: admin-only writes.
- All 25 tables holding app data have RLS enabled. Final `is_admin()` has no user-metadata fallback (earlier version did; superseded).
- No `dangerouslySetInnerHTML` with user data (only chart theme CSS from static config). No eval/innerHTML.
- Email templates escape user content (`escapeHtml`); announcement button URLs must be https.
- Git history secret scan: no JWTs, `sk_live`, or service-role keys found in any commit (pattern scan of all revisions).
- Live headers: HSTS (2y, preload), nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy.

## Remaining risks and not verified

- Dependencies (finding 2) are still vulnerable. Run `npm audit fix`, then upgrade react-router-dom and review react-quill; retest the UI.
- CSP is now ENFORCED (branch security/csp-enforce-and-deps). Tested in headless Chrome across 7 pages with zero violations, plus a negative control. Original note: confirm no violations across login, checkout, admin, and the Turnstile widget.
- The new SQL migration was NOT applied or executed against any database (no DB access here). It was checked by reading the schema only. Test on a Supabase branch/staging first.
- Not tested: admin MFA (Supabase MFA is available but not enforced; admin is gated by email/role only), password policy (enforced by Supabase Auth settings, not visible in the repo), brute-force limits on Supabase auth endpoints, Supabase dashboard config (backups/PITR, SMTP, redirect URL allow-list, leaked-password protection), Vercel env var hygiene, Cloudflare/DNS, the Base44 backend at base44.app, and the Payza provider side.
- Rate limiting is in-memory per instance (serverless instances do not share it). It is a speed bump, not a guarantee; use Vercel WAF/Firewall rate rules or Upstash for real limits.
- No audit logging table, alerting, or security monitoring exists in the repo. Backups and restore procedure are only mentioned in docs (no tested runbook).
- Admin routes are hidden by URL obscurity (`/secure/nexuspanel-trust`) plus client-side checks; real enforcement is RLS/`is_admin()`. Admin pages were skimmed, not exhaustively line-reviewed.
- pg-backed tests (test-payment-notifications, test-bundles-sizes, test-pre-migration) could not run here: they need the `pg` package and a local Postgres.
- 20 pre-existing ESLint unused-import errors remain (cosmetic, untouched).
- Automated sub-agent reviewers declined the task, so all analysis above is my own direct review, not an independent second pass.

## Recommended follow-up (priority order)

1. Review and apply the migration on a staging branch, then production.
2. Remaining 10 npm advisories need breaking upgrades (tailwindcss 4, react-router 7). They are build-time or neutralized (finding 15); schedule as a separate, visually-tested upgrade.
3. Turn on Supabase: MFA for the two admin accounts, leaked-password protection, min password length 10+, PITR backups, restrict redirect URLs.
4. CSP enforcement: done on branch; verify login/captcha/checkout on a Vercel preview before merging. If the Base44 build plugin changes its injected inline script, the hash in vercel.json must be updated.
5. Add Vercel Firewall rate-limit rules for /api/inquiries, /api/payments/*, and auth routes.
6. Add an `audit_log` table and alerts for failed webhook signatures and admin actions.
7. Rotate any token that was ever shared in chat (docs/OPERATIONS.md already says so).


NOTE (CSP hash): the inline script hash depends on the Base44 app id baked in at build time. Production id 6abc6a8a4b6c9d175aa35566 gives sha256-zbfs/Ay7CnFP0DlobpUDfH8mn5mZZSS0FXW0AHN6uMI=. A build with a different VITE_BASE44_APP_ID produces a different hash.
