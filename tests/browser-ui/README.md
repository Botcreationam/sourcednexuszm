# Browser UI tests (bundles, sizes, checkout, admin, phone/tablet)

Real headless-Chrome tests against the real built app, a local Postgres built from
`supabase/migrations`, a REST shim (`tests/payza-payments/pg-rest-shim.mjs`) and a fake
Payza. No real money, email or production data is touched.

Setup (outside the repo): Postgres on port 54329 with db `sn_test` built from the stub +
migrations; `seed.mjs` for demo data; `stack.mjs` for shim + fake Payza/email; a Vite build with
`VITE_SUPABASE_URL=http://localhost:4650`; `server.js` copy with `localhost:4650` added to the CSP
`connectSrc` (the real CSP correctly blocks it). Mark test users onboarded with
`localStorage.sn_onboarding_dismissed=true`, or the welcome dialog covers the page.

Paths in these scripts point at the sandbox; adjust them before reuse.
