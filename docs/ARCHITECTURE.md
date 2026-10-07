# Architecture

## Overview

```
Browser (React + Vite)
   |  supabase-js (anon key, Row Level Security)      -> Supabase Postgres + Auth
   |  fetch /api/...                                  -> Vercel serverless functions
                                                          |  service role key
                                                          v
                                                       Supabase (privileged writes)
                                                          |
                              Payza (payments) <----------+----> Email provider (receipts, alerts)
```

The browser reads public catalogue data and the signed in user's own data straight from Supabase, protected by Row Level Security (RLS). Anything that needs trust (pricing, payment, receipts, notifications) runs on the server with the service role key, which never reaches the browser.

## Folder map

| Path | Purpose |
|---|---|
| `src/pages/` | Customer pages (Home, Catalog, ProductDetail, Bundles, Checkout, MyOrders, Messages, policy pages) |
| `src/pages/admin/` | Admin panel pages (Dashboard, Products, Bundles, Orders, Inbox, and more) |
| `src/components/site/` | Storefront parts (Navbar, CartDrawer, ProductCard, SizeGuideModal, WhatsAppFloat) |
| `src/components/ui/` | shadcn/ui primitives |
| `src/lib/` | Client logic: auth, cart, pricing, size policy, analytics, Supabase client |
| `lib/*.mjs` | Server logic shared by Vercel functions and `server.js` |
| `api/*.js` | Vercel serverless entry points (thin wrappers around `lib/`) |
| `supabase/migrations/` | Ordered SQL migrations, the source of truth for the database |
| `tests/` | Payment suites, product meta, browser UI tests |
| `server.js` | Node server for non-Vercel hosting; serves `dist/` and the same API routes |

## Server modules (`lib/`)

| File | Responsibility |
|---|---|
| `payza-shared.mjs` | Cart pricing, order creation, Payza calls, signature check, applying a verified payment |
| `shop-api.mjs` | `/api/shop/*` routes: quote, orders, receipt, resend, receipt worker |
| `order-receipts.mjs` | Builds the immutable receipt and the customer email |
| `payment-notifications.mjs` | Admin "New Payment Received" emails with retry |
| `bundles.mjs` | Bundle pricing and component expansion |
| `size-policy.mjs` | Which items need size verification (shared with the browser) |
| `product-notifications.mjs`, `announcements.mjs` | Email notifications for new products and announcements |
| `product-meta.mjs`, `sitemap.mjs` | Social share tags and `sitemap.xml` |

## Key design rules

1. **The server decides prices.** The browser sends product ids and quantities. The server loads real prices and computes the total, so editing the cart in the browser cannot change what is charged.
2. **A payment is real only after the server verifies it** with Payza (amount, currency, reference). A browser saying "success" does nothing.
3. **Everything that can happen twice is idempotent.** Duplicate webhooks never create a second order, receipt or email.
4. **Email failures never undo a payment.** They are recorded and retried.
5. **Secrets stay on the server.** Only `VITE_*` variables reach the browser.
