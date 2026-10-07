# Testing

All payment tests are offline: they run the real server code against local mocks of Supabase and Payza. No real money or credentials are used.

```bash
node tests/payza-payments/test-payza.mjs                 # payment rules and state machine
node tests/payza-payments/test-receipts.mjs              # receipts and emails
node tests/payza-payments/test-e2e.mjs                   # real server.js over HTTP
node tests/payza-payments/test-bundles-sizes.mjs         # bundles and size verification
node tests/payza-payments/test-payment-notifications.mjs # administrator payment alerts
node tests/payza-payments/test-pre-migration.mjs         # safe before a migration is applied
```

Some suites use a real local Postgres with the migrations applied. See `tests/payza-payments/README.md` for the exact setup and environment variables.

## What the payment alert suite proves

Verified payments email both administrators once; failed, cancelled, pending, wrong amount, wrong currency and unsigned webhooks send nothing; duplicate and concurrent webhooks never duplicate; a failed email never changes the order; one administrator's failure does not block the other; a crash between saving the receipt and alerting is repaired on retry.

## Browser tests

`tests/browser-ui/` holds scripted browser checks (bundle pages, checkout, admin pages, phone and tablet layouts, hover and motion). See `tests/browser-ui/README.md`.

## Code quality

```bash
npm run lint
npm run typecheck
npm run build
```
