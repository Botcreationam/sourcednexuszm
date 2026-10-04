# Payza payment integration tests

Offline test suites for the Payza (payzaapi.co.ke) payment integration.
They run the REAL server code against local mocks of the Supabase REST API
and the Payza REST API (POST /pay + GET /verify/:reference). No real
credentials, no real money, and no network access to Payza/Supabase.

## Run

```bash
node tests/payza-payments/test-payza.mjs  # unit/state-machine tests (82 checks)
node tests/payza-payments/test-e2e.mjs    # real server.js HTTP endpoints (33 checks)
```

Both suites exit non-zero if any check fails.

## What is covered

- Server-side pricing: browser-sent prices are ignored; amounts come from
  the products table (grade prices included; the K500 -> K5 tamper case).
- The exact request Payza receives on POST /pay: amount, currency ZMW,
  unique reference, callback/redirect/cancel URLs built from the site's
  public base URL, customer email/name, order metadata.
- Webhook signature verification (X-Payza-Signature = HMAC-SHA256 of the
  raw body keyed with the account's Webhook Signing Secret), including
  tampered/missing/wrong-secret signatures.
- Idempotency: duplicate webhooks/verify calls never duplicate orders,
  payments, order items or cart clears.
- Duplicate checkout protection: the same basket reuses its pending order;
  every attempt gets a fresh unique reference (Payza rejects reuse with 409);
  superseded open attempts cancel; terminal attempts stay as history.
- Amount/currency integrity: a "successful" Payza response with the wrong
  amount is recorded as failed and the order is NOT marked paid.
- Ownership: another user's reference cannot be verified, cancelled or seen.
- Payza outage handling: a failed /pay call records the attempt as failed
  so a retry starts cleanly with a fresh reference.
- payment.cancelled webhook + customer-cancel flow map to the cancelled state.
- Cart clearing: only the purchased lines are removed; unrelated items keep.
- Unavailable/hidden products, unknown grades and "Price on request" items
  are rejected for online payment.
- Secrets (sk_ key, webhook signing secret, service role key) never appear
  in any API response payload.
