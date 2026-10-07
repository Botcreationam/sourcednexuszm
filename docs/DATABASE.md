# Database

Supabase Postgres. The schema is defined only by the SQL files in `supabase/migrations/`, applied in filename order. Every migration is additive and safe to run twice.

## Tables

| Group | Tables |
|---|---|
| Catalogue | `categories`, `products`, `bundles`, `bundle_items` |
| Engagement | `product_likes`, `product_views`, `product_comments`, `product_reviews`, `product_metrics` |
| Customers | `user_profiles`, `customer_inquiries`, `customer_inquiry_messages`, `preorders` |
| Orders and payments | `orders`, `order_items`, `order_item_components`, `payments`, `order_receipts`, `payment_admin_notifications` |
| Notifications | `product_notification_events`, `product_notification_deliveries`, `admin_announcements`, `announcement_deliveries` |
| Analytics | `website_visits` |
| Admin | `admin_users` |

## Important functions

| Function | Purpose |
|---|---|
| `is_admin()` | True for administrators; used by RLS policies |
| `claim_receipt_emails(limit)` | Atomically claims receipt emails to send (parallel safe) |
| `claim_payment_admin_notifications(limit)` | Same for administrator payment alerts |
| `claim_product_notification_deliveries`, `claim_announcement_deliveries` | Same for product and announcement emails |
| `get_dashboard_analytics()` | Dashboard numbers |
| `enqueue_product_notification_event`, `queue_announcement`, `create_announcement` | Notification queues |
| `upsert_product_review`, `mark_messages_read` | Customer actions |

The `claim_*` functions are executable only by the service role, never by browsers.

## Security model

- **RLS is on.** Customers see only their own orders, receipts, messages and profile. The public catalogue is readable by everyone.
- **Admins** are identified by `is_admin()` (the two administrator emails, or an `admin` role in user metadata).
- **Writes that need trust** (orders, payments, receipts, notification queues) are done only by the server with the service role key. No insert, update or delete policy exists for browsers on those tables.
- No card data, tokens or secrets are stored.

## Migration order

Apply in this order (the filenames already sort correctly):

```
20260930000000_create_sourced_nexus_schema.sql
20260930000001_comprehensive_indexes_and_categories.sql
20261001000000 ... 20261001000007   security, profiles, inquiries, messaging, reviews
20261002000000 ... 20261002000002   messaging and admin fixes
20261003000000, 20261003000001      analytics, product grades
20261004000000, 20261004000001      visitor activity, index cleanup
20261005000000_orders_payments_payza.sql
20261006000000 ... 20261006000002   categories cleanup, product update emails
20261006000003_admin_announcements.sql
20261007000000_order_receipts.sql
20261008000000_bundles_and_size_verification.sql
20261009000000_payment_admin_notifications.sql
```

### Applying a migration
Open Supabase, SQL Editor, New query, paste the file, Run. Confirm with, for example:

```sql
select to_regclass('public.payment_admin_notifications') is not null as ok;
```

Deploying code before its migration is safe for receipts (the phone column is optional until it exists), but administrator payment emails need the newest migration.
