# Features

## Customer side

| Feature | Route | Notes |
|---|---|---|
| Home | `/` | Hero, featured sections, categories |
| Catalogue | `/catalog` | Search, category filters, grades, sorting |
| Product page | `/product/:id` | Photos, price, sizes, likes, reviews, comments, share bar, chat |
| Bundles | `/bundles`, `/bundles/:id` | Curated sets at one fixed price, each included item and size shown |
| Categories | `/categories` | Browse by category |
| Pre-order / Source for me | `/pre-order` | Ask the team to source an item that is not listed; a quote comes before any payment |
| Cart and wishlist | drawers | The cart is saved to the account and merged when you sign in |
| Checkout | `/checkout` | Contact details (phone required), size verification, pay online with Payza |
| My orders | `/account/orders` | Order status, receipt, resend receipt, send details to WhatsApp |
| Messages | `/messages` | Chat with the team about products and orders |
| Notifications | `/account/notifications` | Choose which product and announcement emails you want |
| Sign in / up | `/login`, `/register`, `/forgot-password`, `/reset-password` | Email and Google; Cloudflare Turnstile on forms |
| Information | `/how-it-works`, `/contact`, `/privacy`, `/terms`, `/refund-policy`, `/accessibility` | |

### Size verification
Clothing needs a size chosen and a confirmation tick at checkout. The server decides which items need it (`lib/size-policy.mjs`), so it cannot be skipped by editing the browser. Sizes are never converted between systems (US, UK, EU). The chosen size is stored on the order and shown on the receipt. Admins can force it on or off per product.

### Bundles
A bundle has a fixed price and a list of component products. The order stores a snapshot of every component and size, so later edits to a bundle never change a past order.

### Mobile
A fixed bottom navigation bar on phones, with a cart count and unread inbox marker. The search and category bar hide when scrolling down and return when scrolling up. Desktop keeps the full header.

## Admin panel

Base path: `/secure/nexuspanel-trust` (signed in as an administrator).

| Page | Purpose |
|---|---|
| Dashboard | Visits, products, orders and engagement analytics |
| Inbox / Inquiries | Customer messages and product inquiries, reply and mark read |
| Products | Create and edit products, photos, price, grades, sizes, size verification, publish |
| Bundles | Create bundles, set price, choose components, activate or deactivate |
| Categories | Manage categories |
| Pre-orders | Source-for-me requests and quotes |
| Orders | Paid orders, status (pending, processing, shipped, completed, cancelled) |
| Moderation | Review and remove product comments |
| Announcements | Send a message to opted in customers |

Admin access is granted by email (see [Operations](OPERATIONS.md)) and enforced in the database by `public.is_admin()`, not only in the browser.

## Notifications

- **Customer receipt:** emailed after a verified payment; resendable from My Orders.
- **Admin payment alert:** "New Payment Received" to both administrators with customer name, email, phone, order, items, total, reference and status.
- **New product emails:** sent to customers who opted in, once per product (idempotent).
- **Announcements:** admin broadcast to opted in customers.
