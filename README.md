<div align="center">

<img src="docs/assets/banner.svg" alt="Sourced Nexus - curated fashion, footwear, home and gadgets, Lusaka, Zambia" width="100%">

<img src="docs/assets/tagline.svg" alt="Shop curated fashion and gadgets. Pay securely online with Payza in ZMW. Verified sizes. We'll source anything for you." width="100%">

<br>

[![Live site](https://img.shields.io/badge/LIVE-sourcednexus.online-c5a059?style=for-the-badge&labelColor=14120e)](https://sourcednexus.online)
[![Deployed on Vercel](https://img.shields.io/badge/Vercel-deployed-14120e?style=for-the-badge&logo=vercel&logoColor=white)](https://sourcednexus.online)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white&labelColor=14120e)](docs/DATABASE.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-c5a059?style=for-the-badge&labelColor=14120e)](LICENSE)

<img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=white&labelColor=14120e" alt="React 18">
<img src="https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white&labelColor=14120e" alt="Vite 6">
<img src="https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white&labelColor=14120e" alt="Tailwind 3">
<img src="https://img.shields.io/badge/Payments-Payza%20(ZMW)-c5a059?style=flat-square&labelColor=14120e" alt="Payza ZMW">
<img src="https://img.shields.io/badge/Row%20Level%20Security-on-3ecf8e?style=flat-square&labelColor=14120e" alt="RLS on">

<img src="docs/assets/divider.svg" alt="" width="100%">

</div>

## What is Sourced Nexus?

A product sourcing and online retail website for customers in **Zambia**. Browse fashion, footwear, home items and gadgets, pay online in **Zambian Kwacha**, or ask the team to **source something that is not listed**.

- Live site: **https://sourcednexus.online**
- Contact: sourcednexus@gmail.com, WhatsApp 0573575734 (Lusaka, Zambia)

## Highlights

| | |
|---|---|
| **Shop** | Catalogue with categories, grades, search, wishlist, reviews and likes |
| **Bundles** | Curated sets at one fixed price; every included item and size is recorded |
| **Size verification** | Clothing needs a confirmed size at checkout, enforced by the server |
| **Source for me** | Request any item; get a quote before you pay anything |
| **Secure payments** | Payza checkout in ZMW, confirmed server side before an order counts as paid |
| **Receipts and alerts** | Customer receipt by email; both administrators are alerted on every verified payment |
| **Messaging** | Chat with the team about products and orders |
| **Mobile first** | Fixed bottom navigation on phones, cart count and unread inbox marker |
| **Admin panel** | Products, bundles, orders, inbox, moderation, announcements and analytics |
| **Motion** | Subtle brand animation that respects the "reduce motion" setting |

## How a payment stays safe

```mermaid
flowchart LR
    A[Customer checks out] --> B[Server re-prices the cart]
    B --> C[Payza hosted payment]
    C --> D{Server verifies with Payza<br/>amount, currency, reference}
    D -- verified --> E[Order marked paid]
    D -- not verified --> F[Nothing happens]
    E --> G[Receipt email to customer]
    E --> H[Alert email to both administrators]
```

The browser can never set a price or declare a payment successful. Duplicate webhooks never create a second order, receipt or email, and a failed email never undoes a paid order. Details in [Payments](docs/PAYMENTS.md).

## Architecture at a glance

```mermaid
flowchart TB
    U[Browser<br/>React + Vite] -->|anon key + RLS| S[(Supabase<br/>Postgres + Auth)]
    U -->|/api| V[Vercel functions]
    V -->|service role, server only| S
    V <--> P[Payza]
    V --> M[Email provider]
```

## Documentation

| Guide | What it covers |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Stack, folders, how the pieces fit together |
| [Features](docs/FEATURES.md) | Every customer and admin feature, with routes |
| [Payments](docs/PAYMENTS.md) | Payza checkout, webhook, receipts, admin payment emails |
| [Database](docs/DATABASE.md) | Tables, functions, security, migration order |
| [Deployment](docs/DEPLOYMENT.md) | Vercel, Supabase, environment variables, cron jobs |
| [Operations](docs/OPERATIONS.md) | Admin tasks, troubleshooting, security checklist |
| [Testing](docs/TESTING.md) | How to run the test suites |

## Quick start

```bash
npm install
cp .env.example .env     # fill in the values, see docs/DEPLOYMENT.md
npm run dev              # http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build into `dist/` |
| `npm start` | Node server (`server.js`) serving the build and the API |
| `npm run lint` / `npm run typecheck` | Code checks |

## Tech stack

React 18, Vite 6, Tailwind CSS 3, shadcn/ui (Radix), React Router, TanStack Query, Supabase (Postgres, Auth, Row Level Security), Payza, Vercel (hosting and cron), Cloudflare Turnstile.

## Security

Secrets live only in server environment variables. Row Level Security is on for every table, and orders, payments and receipts can only be written by the server. Please report security issues privately to sourcednexus@gmail.com instead of opening a public issue.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).

<div align="center">
<sub>Made in Lusaka, Zambia</sub>
</div>
