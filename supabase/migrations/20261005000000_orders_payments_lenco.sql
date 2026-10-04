-- ============================================================================
-- SOURCED NEXUS — ORDERS, ORDER ITEMS & LENCO PAYMENTS
-- ----------------------------------------------------------------------------
-- Purpose:
--   Minimal, additive schema for online payments via Lenco (BroadPay). Adds
--   three new tables that do not touch any existing table, policy or data:
--     public.orders       one row per purchase attempt (cart fingerprint)
--     public.order_items  immutable line-item snapshots (product, grade, price)
--     public.payments     one row per payment attempt (Lenco reference)
--
-- Safety:
--   - Purely additive: create table if not exists only, no drops, no deletes,
--     no changes to existing tables, policies or triggers.
--   - RLS enabled on all three tables: customers can only read their own
--     rows, admins can read everything, and NO insert/update/delete policies
--     exist for app users — all writes go through the server (service role)
--     exclusively, so a browser can never forge an order or payment state.
--   - Indexes are limited to the exact lookups the payment flow performs:
--     reference lookups (verify + webhook, unique), order_id and user_id
--     ownership checks, and the admin/customer order lists.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ORDERS
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    order_number text not null unique,
    user_id uuid not null references auth.users(id) on delete cascade,
    customer_email text not null,
    customer_phone text,
    customer_first_name text,
    customer_last_name text,
    subtotal numeric(12,2) not null default 0,
    currency text not null default 'ZMW',
    -- lifecycle: pending (awaiting payment) -> processing (paid) -> ...
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'shipped', 'completed', 'cancelled')),
    payment_status text not null default 'pending'
        check (payment_status in ('pending', 'paid', 'failed', 'cancelled', 'confirmation_pending')),
    -- identity of the checkout basket (product|size|color|grade set) used to
    -- reuse a pending order instead of creating duplicates on retry
    cart_fingerprint text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. ORDER ITEMS — snapshot of what was actually purchased
-- ----------------------------------------------------------------------------
create table if not exists public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    product_name text not null,
    category text,
    image text,
    selected_size text,
    selected_color text,
    grade_name text,
    grade_original_price numeric(12,2),
    grade_discount numeric(5,2),
    unit_price numeric(12,2) not null,
    quantity integer not null check (quantity > 0),
    line_total numeric(12,2) not null,
    created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. PAYMENTS — one row per Lenco payment attempt
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null default 'lenco',
    -- our unique reference, sent to the Lenco widget, used for verification
    reference text not null unique,
    lenco_reference text,
    amount numeric(12,2) not null,
    currency text not null default 'ZMW',
    payment_method text,
    status text not null default 'pending'
        check (status in ('pending', 'paid', 'failed', 'cancelled', 'confirmation_pending')),
    failure_reason text,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

-- ----------------------------------------------------------------------------
-- Row Level Security — read-only for owners and admins, writes only via the
-- server's service role (which bypasses RLS). No client-side write policies.
-- ----------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

-- Customers see their own orders; admins see all
create policy "Customers can view own orders"
    on public.orders for select
    to authenticated
    using (auth.uid() = user_id or public.is_admin());

create policy "Customers can view own order items"
    on public.order_items for select
    to authenticated
    using (
        exists (
            select 1 from public.orders o
            where o.id = order_items.order_id
              and (o.user_id = auth.uid() or public.is_admin())
        )
    );

create policy "Customers can view own payments"
    on public.payments for select
    to authenticated
    using (auth.uid() = user_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- Indexes justified by actual payment-flow queries:
--   payments.reference  -> verify endpoint + webhook lookups (unique index
--                          already created by the constraint, no extra needed)
--   payments.order_id   -> listing attempts of one order / admin view
--   payments.user_id    -> ownership checks + customer payment history
--   orders.user_id      -> customer order list + pending-order reuse lookup
--   orders.status       -> admin "paid orders" filter
--   order_items.order_id-> assembling order details
-- ----------------------------------------------------------------------------
create index if not exists idx_payments_order_id on public.payments (order_id);
create index if not exists idx_payments_user_id on public.payments (user_id);
create index if not exists idx_orders_user_id on public.orders (user_id);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_order_items_order_id on public.order_items (order_id);
