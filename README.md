# Sourced Nexus

Product sourcing and online retail for customers in Zambia. Browse fashion, footwear, home items and gadgets, pay online in Zambian Kwacha (ZMW), or ask the team to source something that is not listed.

- Live site: https://sourcednexus.online
- Contact: sourcednexus@gmail.com, WhatsApp 0573575734 (Lusaka, Zambia)

## Documentation

| Guide | What it covers |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Stack, folders, how the pieces fit together |
| [Features](docs/FEATURES.md) | Every customer and admin feature, with routes |
| [Payments](docs/PAYMENTS.md) | Payza checkout, webhook, receipts, admin payment emails |
| [Database](docs/DATABASE.md) | Tables, functions, security, migration order |
| [Deployment](docs/DEPLOYMENT.md) | Vercel, Supabase, environment variables, cron jobs |
| [Operations](docs/OPERATIONS.md) | Day to day admin tasks, troubleshooting, security checklist |
| [Testing](docs/TESTING.md) | How to run the test suites |

## Quick start

```bash
npm install
cp .env.example .env     # then fill in the values (see docs/DEPLOYMENT.md)
npm run dev              # http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build into `dist/` |
| `npm start` | Node server (`server.js`) serving the build and the API |
| `npm run lint` / `npm run typecheck` | Code checks |

## Tech stack

React 18 with Vite 6, Tailwind CSS 3, shadcn/ui (Radix), React Router, TanStack Query, Supabase (Postgres, Auth, Row Level Security), Payza for payments, Vercel for hosting and cron.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
