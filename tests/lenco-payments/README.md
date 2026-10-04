# Lenco payment integration tests

Offline test suites for the Lenco (BroadPay) payment integration. They run the
REAL server code against local mocks of the Supabase REST API and the Lenco
collections API. No real credentials, no real money, and no network access
to Lenco/Supabase are needed.

## Run

```bash
node tests/lenco-payments/test-lenco.mjs   # unit/state-machine tests (65 checks)
node tests/lenco-payments/test-e2e.mjs      # real server.js HTTP endpoints (26 checks)
```

Both suites exit non-zero if any check fails.

## What is covered

- Server-side pricing: browser-sent prices are ignored; amounts come from the
  products table (grade prices included; the K500 -> K5 tamper case).
- Webhook signature verification (HMAC-SHA512 keyed with sha256 of the secret
  key, per Lenco's current docs), including tampered/missing signatures.
- Idempotency: duplicate webhooks/verify calls never duplicate orders,
  payments, order items or cart clears.
- Duplicate checkout protection: the same basket reuses its pending order;
  every attempt gets a fresh unique reference; superseded attempts cancel.
- Amount/currency integrity: a "successful" Lenco response with the wrong
  amount is recorded as failed and the order is NOT marked paid.
- Ownership: another user's reference cannot be verified, cancelled or seen.
- Cart clearing: only the purchased lines are removed; unrelated items keep.
- Unavailable/hidden products, unknown grades and "Price on request" items
  are rejected for online payment.
- Secrets never appear in any API response payload.
