-- ============================================================================
-- SOURCED NEXUS - PAYMENT ADMIN NOTIFICATIONS (email outbox, one row per
-- payment per admin recipient) + customer phone on the receipt snapshot
-- ----------------------------------------------------------------------------
-- Purpose:
--   After a payment is VERIFIED (amount + currency + reference) the server
--   emails the Sourced Nexus administrators "New Payment Received". This runs
--   entirely on the server from the verified-payment code path. It does not
--   depend on any admin being logged in, on the dashboard being open, on the
--   customer's browser, or on WhatsApp.
--
-- Safety:
--   - Additive only: create ... if not exists / add column if not exists.
--     No drops, no deletes, no changes to existing rows or policies.
--   - Idempotent: UNIQUE (payment_id, recipient_email). A duplicate webhook /
--     verify call can never create a second row, so it can never send a
--     second email to the same admin for the same payment.
--   - One row PER RECIPIENT, so one admin's mailbox failing never blocks,
--     repeats or hides the notification to the other admin.
--   - Email failure NEVER touches payment/order state. Each row tracks its
--     own email_status so the worker can retry independently.
--   - RLS: admins can read; nobody else. No insert/update/delete policies
--     exist for app users, writes go through the server's service role only.
--   - Stores NO card data, tokens, keys or secrets. Only what is needed to
--     identify the order and who to contact (the order/receipt tables already
--     hold the customer details).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ORDER RECEIPTS: freeze the customer's phone on the receipt snapshot
--    (orders.customer_phone already exists; the receipt is the immutable copy)
-- ----------------------------------------------------------------------------
alter table public.order_receipts
    add column if not exists customer_phone text;

-- ----------------------------------------------------------------------------
-- 2. PAYMENT ADMIN NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table if not exists public.payment_admin_notifications (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    -- Together with recipient_email this is the idempotency key.
    payment_id uuid not null references public.payments(id) on delete cascade,
    receipt_id uuid references public.order_receipts(id) on delete set null,
    recipient_email text not null,
    -- Email delivery state (independent from payment state)
    email_status text not null default 'pending'
        check (email_status in ('pending', 'sending', 'sent', 'failed')),
    email_attempts integer not null default 0,
    email_last_error text,
    email_next_attempt_at timestamptz not null default now(),
    email_sent_at timestamptz,
    email_message_id text,
    created_at timestamptz not null default now(),
    constraint payment_admin_notifications_unique unique (payment_id, recipient_email)
);

alter table public.payment_admin_notifications enable row level security;

drop policy if exists "Admins can view payment notifications" on public.payment_admin_notifications;
create policy "Admins can view payment notifications"
    on public.payment_admin_notifications for select
    to authenticated
    using (public.is_admin());

-- Lookups the app actually performs:
--   order_id           -> "was the admin told about this order?" (admin view)
--   email retry queue  -> due, unsent rows only (partial index stays tiny)
create index if not exists idx_payment_admin_notifications_order
    on public.payment_admin_notifications (order_id);
create index if not exists idx_payment_admin_notifications_due
    on public.payment_admin_notifications (email_next_attempt_at)
    where email_status in ('pending', 'failed');

-- ----------------------------------------------------------------------------
-- 3. Atomic claim for the retry worker (safe with parallel workers)
-- ----------------------------------------------------------------------------
-- Same contract as claim_receipt_emails: a row stuck in 'sending' for more
-- than 10 minutes (crashed worker) is reclaimed so it is never lost.
create or replace function public.claim_payment_admin_notifications(p_limit integer default 20)
returns setof public.payment_admin_notifications
language sql
security definer
set search_path = public
as $$
    update public.payment_admin_notifications n
       set email_status = 'sending',
           email_attempts = n.email_attempts + 1
     where n.id in (
            select id from public.payment_admin_notifications
             where (
                    email_status in ('pending', 'failed')
                    and email_next_attempt_at <= now()
                    and email_attempts < 6
                   )
                or (email_status = 'sending' and email_next_attempt_at <= now() - interval '10 minutes')
             order by email_next_attempt_at
             limit greatest(1, least(p_limit, 100))
             for update skip locked
       )
    returning n.*;
$$;

-- Only the server (service role) may run the claim; never browsers.
revoke all on function public.claim_payment_admin_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_payment_admin_notifications(integer) to service_role;
