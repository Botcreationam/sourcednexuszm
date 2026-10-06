-- ============================================================================
-- SOURCED NEXUS - ORDER RECEIPTS (paid-order snapshot + receipt email outbox)
-- ----------------------------------------------------------------------------
-- Purpose:
--   After a payment is VERIFIED (amount + currency + reference) the server
--   freezes a receipt from the confirmed order and emails it to the customer.
--
-- Safety:
--   - Additive only: create ... if not exists / add column if not exists.
--     No drops, no deletes, no changes to existing rows or policies.
--   - Idempotent: payment_id is UNIQUE on order_receipts, so a duplicate
--     webhook / verify call can never create a second receipt or email.
--   - Email failure NEVER touches payment/order state. The receipt row tracks
--     its own email_status so the worker can retry independently.
--   - RLS: customers read only their own receipts; admins read all.
--     No insert/update/delete policies exist for app users, writes go through
--     the server's service role only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ORDERS: record WHEN payment was confirmed and WHICH payment confirmed it
-- ----------------------------------------------------------------------------
alter table public.orders
    add column if not exists paid_at timestamptz,
    add column if not exists paid_amount numeric(12,2),
    add column if not exists paid_payment_id uuid references public.payments(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 2. ORDER RECEIPTS: immutable snapshot of the confirmed order + email state
-- ----------------------------------------------------------------------------
create table if not exists public.order_receipts (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    -- UNIQUE = exactly one receipt per verified payment (idempotency key)
    payment_id uuid not null unique references public.payments(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    receipt_number text not null unique,
    order_number text not null,
    payment_reference text not null,
    payment_method text,
    provider text not null default 'payza',
    currency text not null default 'ZMW',
    total numeric(12,2) not null,
    customer_name text,
    customer_email text not null,
    -- Frozen line items: [{name, grade, size, color, quantity, unit_price, line_total}]
    items jsonb not null default '[]'::jsonb,
    paid_at timestamptz not null default now(),
    -- Email delivery state (independent from payment state)
    email_status text not null default 'pending'
        check (email_status in ('pending', 'sending', 'sent', 'failed')),
    email_attempts integer not null default 0,
    email_last_error text,
    email_next_attempt_at timestamptz not null default now(),
    email_sent_at timestamptz,
    email_message_id text,
    created_at timestamptz not null default now()
);

alter table public.order_receipts enable row level security;

drop policy if exists "Customers can view own receipts" on public.order_receipts;
create policy "Customers can view own receipts"
    on public.order_receipts for select
    to authenticated
    using (auth.uid() = user_id or public.is_admin());

-- Lookups the app actually performs:
--   user_id            -> "My Orders" / receipt list for one customer
--   order_id           -> receipt for one order (view receipt, admin)
--   email retry queue  -> due, unsent receipts only (partial index stays tiny)
create index if not exists idx_order_receipts_user on public.order_receipts (user_id, paid_at desc);
create index if not exists idx_order_receipts_order on public.order_receipts (order_id);
create index if not exists idx_order_receipts_email_due
    on public.order_receipts (email_next_attempt_at)
    where email_status in ('pending', 'failed');

-- ----------------------------------------------------------------------------
-- 3. Atomic claim for the retry worker (safe with parallel workers)
-- ----------------------------------------------------------------------------
-- Returns receipts whose email is due. A row stuck in 'sending' for more than
-- 10 minutes (crashed worker) is reclaimed so it is never lost.
create or replace function public.claim_receipt_emails(p_limit integer default 20)
returns setof public.order_receipts
language sql
security definer
set search_path = public
as $$
    update public.order_receipts r
       set email_status = 'sending',
           email_attempts = r.email_attempts + 1
     where r.id in (
            select id from public.order_receipts
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
    returning r.*;
$$;

-- Only the server (service role) may run the claim; never browsers.
revoke all on function public.claim_receipt_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_receipt_emails(integer) to service_role;
