-- ============================================================================
-- SOURCED NEXUS - PRODUCT BUNDLES + CLOTHING SIZE VERIFICATION
-- ----------------------------------------------------------------------------
-- ADDITIVE AND IDEMPOTENT. No drops, no deletes, no change to existing rows,
-- columns, policies or constraints. Safe to run more than once.
--
-- 1. PRODUCT BUNDLES
--    bundles          one row per bundle (name, description, images, price...)
--    bundle_items     which EXISTING products a bundle contains (references
--                     products.id, never duplicates a product)
--    order_items      gets bundle columns so a bundle purchase is a snapshot
--    order_item_components  frozen list of what each bundle line contained
--
-- 2. SIZE VERIFICATION
--    products         sizing_standard + size_guide_type (per-product setting)
--    order_items      selected_size already exists; adds sizing_standard and
--                     size_verified so the order permanently records exactly
--                     what the customer chose and confirmed.
--
-- INVENTORY NOTE
--    This shop has no stock counters; availability is products.status and each
--    grade's stock_status. A bundle is therefore purchasable only while EVERY
--    component product is available (and the chosen grade, if any, is In
--    Stock). That is checked on the server at quote time AND again when the
--    order is created. Nothing is decremented because nothing is counted, and
--    no component product is ever modified by a bundle.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BUNDLES
-- ----------------------------------------------------------------------------
create table if not exists public.bundles (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 150),
    slug text unique,
    description text,
    images text[] not null default '{}',
    -- The price the customer pays for ONE bundle. Admin-set, read server-side.
    bundle_price numeric(12,2) not null check (bundle_price > 0),
    is_active boolean not null default true,
    -- Optional admin availability window / label (display only)
    availability_note text,
    display_order integer not null default 0,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.bundle_items (
    id uuid primary key default gen_random_uuid(),
    bundle_id uuid not null references public.bundles(id) on delete cascade,
    -- References the EXISTING product. If a product is deleted the bundle line
    -- is removed with it (a bundle cannot contain a product that no longer
    -- exists); the product itself is never touched by bundle edits.
    product_id uuid not null references public.products(id) on delete cascade,
    quantity integer not null default 1 check (quantity between 1 and 20),
    -- Optional fixed variant for this component (e.g. grade). Size/colour for a
    -- component, when needed, is chosen by the customer and stored on the order.
    grade_name text,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    unique (bundle_id, product_id, grade_name)
);

create index if not exists idx_bundles_active on public.bundles(is_active, display_order);
create index if not exists idx_bundle_items_bundle on public.bundle_items(bundle_id);
create index if not exists idx_bundle_items_product on public.bundle_items(product_id);

drop trigger if exists set_bundles_updated_at on public.bundles;
create trigger set_bundles_updated_at
    before update on public.bundles
    for each row execute function public.handle_updated_at();

-- RLS: anyone can read ACTIVE bundles (the storefront); admins read/write all.
-- Customers can never write. The server (service role) bypasses RLS.
alter table public.bundles enable row level security;
alter table public.bundle_items enable row level security;

drop policy if exists "Public can view active bundles" on public.bundles;
create policy "Public can view active bundles"
    on public.bundles for select
    to anon, authenticated
    using (is_active = true or public.is_admin());

drop policy if exists "Admins manage bundles" on public.bundles;
create policy "Admins manage bundles"
    on public.bundles for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "Public can view items of active bundles" on public.bundle_items;
create policy "Public can view items of active bundles"
    on public.bundle_items for select
    to anon, authenticated
    using (
        public.is_admin()
        or exists (select 1 from public.bundles b where b.id = bundle_items.bundle_id and b.is_active = true)
    );

drop policy if exists "Admins manage bundle items" on public.bundle_items;
create policy "Admins manage bundle items"
    on public.bundle_items for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. ORDER ITEMS: bundle snapshot + size verification snapshot
-- ----------------------------------------------------------------------------
alter table public.order_items
    add column if not exists bundle_id uuid references public.bundles(id) on delete set null,
    add column if not exists is_bundle boolean not null default false,
    add column if not exists bundle_name text,
    -- what the customer would have paid buying each part separately, and the
    -- saving, frozen at purchase time
    add column if not exists bundle_separate_total numeric(12,2),
    add column if not exists bundle_savings numeric(12,2),
    add column if not exists sizing_standard text,
    add column if not exists size_verified boolean not null default false,
    add column if not exists size_verified_at timestamptz;

-- A bundle line has no single product row; keep product_id nullable (it
-- already is: "on delete set null"), and index the new lookup columns.
create index if not exists idx_order_items_bundle on public.order_items(bundle_id) where bundle_id is not null;

-- Frozen contents of a bundle line. One row per component per order line, so
-- orders and receipts can always show exactly what was in the bundle even if
-- the bundle or its products are edited or removed later.
create table if not exists public.order_item_components (
    id uuid primary key default gen_random_uuid(),
    order_item_id uuid not null references public.order_items(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    product_name text not null,
    category text,
    image text,
    quantity integer not null check (quantity > 0),
    unit_price numeric(12,2) not null,
    grade_name text,
    selected_size text,
    selected_color text,
    sizing_standard text,
    size_verified boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists idx_order_item_components_item on public.order_item_components(order_item_id);

alter table public.order_item_components enable row level security;

drop policy if exists "Customers can view own order item components" on public.order_item_components;
create policy "Customers can view own order item components"
    on public.order_item_components for select
    to authenticated
    using (
        exists (
            select 1
            from public.order_items oi
            join public.orders o on o.id = oi.order_id
            where oi.id = order_item_components.order_item_id
              and (o.user_id = auth.uid() or public.is_admin())
        )
    );

-- ----------------------------------------------------------------------------
-- 3. PRODUCTS: per-product sizing information
-- ----------------------------------------------------------------------------
-- sizing_standard : the sizing system the SUPPLIER's labels use, shown on the
--                   product page and stored on the order. Defaults to the
--                   global/international wording from the policy. Admin can set
--                   a specific system (e.g. "US/UK suit sizing (chest, in)").
-- size_guide_type : which size-guide table to show: suits | tops_dresses |
--                   bottoms | shoes | none. NULL = derive from category.
-- requires_size_verification : NULL = derive from category (clothing), true /
--                   false = explicit admin override.
alter table public.products
    add column if not exists sizing_standard text,
    add column if not exists size_guide_type text,
    add column if not exists requires_size_verification boolean;

alter table public.products drop constraint if exists products_size_guide_type_check;
alter table public.products add constraint products_size_guide_type_check
    check (size_guide_type is null or size_guide_type in ('suits', 'tops_dresses', 'bottoms', 'shoes', 'none'));
