# Payments

Online payments use **Payza** in **ZMW**. The site never sees or stores card or mobile money PINs.

## Flow

1. **Quote.** `POST /api/shop/quote` returns server computed prices for the cart.
2. **Create order.** `POST /api/payments/payza/create-order` (signed in users only). The server re-prices every line, checks size verification and the phone number, creates a `pending` order and payment, and asks Payza for a hosted checkout link.
3. **Pay.** The customer pays on Payza and is returned to the site.
4. **Verify.** Two paths lead to the same function, `applyPaymentResult`:
   - the return page calls `POST /api/payments/payza/verify`
   - Payza calls the webhook `POST /api/webhooks/payza`
5. **Confirm.** The server asks Payza for the real status and checks amount, currency and reference. Only then is the payment `paid` and the order moved forward.
6. **After a confirmed payment** (once only): clear the purchased cart lines, create the immutable receipt, email the customer, queue and email both administrators.

## Statuses

| Payment | Meaning |
|---|---|
| `pending` | Created, not paid |
| `paid` | Verified by the server |
| `failed` / `cancelled` | Not paid |
| `confirmation_pending` | Payza has not given a final answer yet; checked again |

| Order | Meaning |
|---|---|
| `pending` | Awaiting payment |
| `processing`, `shipped`, `completed` | Fulfilment, set by admins |
| `cancelled` | Cancelled |

## Webhook security

Payza signs the raw body. `verifyPayzaSignature` checks it with `PAYZA_WEBHOOK_SECRET`. An unsigned or wrongly signed request is rejected with 401 and changes nothing.

## Idempotency (no duplicates)

- Only the call that moves a payment from `pending` to `paid` creates the receipt.
- `order_receipts` is unique per payment.
- `payment_admin_notifications` is unique per payment and administrator.
- A repeated webhook or verify call returns early and sends nothing.
- If the server stops after saving the receipt but before alerting administrators, the next webhook retry alerts them.

## Emails

| Email | Recipient | Trigger |
|---|---|---|
| Receipt | Customer | After verified payment |
| New Payment Received | Both administrators | After verified payment |

Each has its own status and retry (up to 6 attempts with backoff) in the database. A failed email never changes payment or order state. One administrator's mailbox failing does not block the other. The daily worker `POST /api/shop/receipts/process` (protected by `CRON_SECRET`) retries anything unsent.

## What the administrator email contains

Customer name, email and phone; order id; each product with quantity and price (bundles list their components and sizes); total; payment provider; transaction reference; time; status.

## Testing a real payment

Buy a low value item (for example K1) while signed in, with a phone number. Confirm the order shows as paid in My Orders, the customer receipt arrives, and both administrator inboxes receive "New Payment Received".
