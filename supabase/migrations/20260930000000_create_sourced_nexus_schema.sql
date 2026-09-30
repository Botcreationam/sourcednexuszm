-- ============================================================================
-- SOURCED NEXUS — SUPABASE INITIAL MIGRATION
-- Database schema for luxury fashion catalog, personal sourcing, and media storage
-- ============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. CATEGORIES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    slug text,
    image text,
    description text,
    display_order integer default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. PRODUCTS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    price text,
    category text not null,
    images text[] not null default '{}',
    sizes text[] default '{}',
    colors text[] default '{}',
    status text not null default 'available' check (status in ('available', 'preorder', 'soldout', 'hidden')),
    is_new_arrival boolean not null default false,
    is_popular boolean not null default false,
    delivery_info text not null default '7–14 working days',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. PREORDERS / SOURCING REQUESTS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.preorders (
    id uuid primary key default gen_random_uuid(),
    customer_name text not null,
    phone text,
    whatsapp text,
    category text,
    size text,
    color text,
    message text,
    requested_image text,
    status text not null default 'new' check (status in ('new', 'contacted', 'processing', 'sourced', 'completed', 'cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_new_arrival on public.products(is_new_arrival);
create index if not exists idx_products_popular on public.products(is_popular);
create index if not exists idx_products_created_at on public.products(created_at desc);
create index if not exists idx_preorders_status on public.preorders(status);
create index if not exists idx_preorders_created_at on public.preorders(created_at desc);

-- ----------------------------------------------------------------------------
-- 5. AUTOMATIC UPDATED_AT TRIGGER
-- ----------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
    before update on public.products
    for each row
    execute function public.handle_updated_at();

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
    before update on public.categories
    for each row
    execute function public.handle_updated_at();

drop trigger if exists set_preorders_updated_at on public.preorders;
create trigger set_preorders_updated_at
    before update on public.preorders
    for each row
    execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.preorders enable row level security;

-- Categories: Anyone can read, only authenticated admins can write
create policy "Allow public read access on categories"
    on public.categories for select
    using (true);

create policy "Allow admin insert on categories"
    on public.categories for insert
    to authenticated
    with check (true);

create policy "Allow admin update on categories"
    on public.categories for update
    to authenticated
    using (true);

create policy "Allow admin delete on categories"
    on public.categories for delete
    to authenticated
    using (true);

-- Products: Public can view non-hidden products; admins can view all & write
create policy "Allow public read on non-hidden products"
    on public.products for select
    using (status != 'hidden' or auth.role() = 'authenticated');

create policy "Allow admin insert on products"
    on public.products for insert
    to authenticated
    with check (true);

create policy "Allow admin update on products"
    on public.products for update
    to authenticated
    using (true);

create policy "Allow admin delete on products"
    on public.products for delete
    to authenticated
    using (true);

-- Preorders: Anyone can submit a sourcing request; admins can read & manage
create policy "Allow anyone to submit preorder"
    on public.preorders for insert
    with check (true);

create policy "Allow admin read access on preorders"
    on public.preorders for select
    to authenticated
    using (true);

create policy "Allow admin update on preorders"
    on public.preorders for update
    to authenticated
    using (true);

create policy "Allow admin delete on preorders"
    on public.preorders for delete
    to authenticated
    using (true);

-- ----------------------------------------------------------------------------
-- 7. SUPABASE STORAGE BUCKETS CONFIGURATION
-- ----------------------------------------------------------------------------
-- Create public storage buckets for product media, categories, and customer requests
insert into storage.buckets (id, name, public)
values 
    ('product-images', 'product-images', true),
    ('category-images', 'category-images', true),
    ('preorder-uploads', 'preorder-uploads', true)
on conflict (id) do update set public = true;

-- Storage Policies for 'product-images'
create policy "Public can view product images"
    on storage.objects for select
    using (bucket_id = 'product-images');

create policy "Admin can upload product images"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'product-images');

create policy "Admin can update product images"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'product-images');

create policy "Admin can delete product images"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'product-images');

-- Storage Policies for 'category-images'
create policy "Public can view category images"
    on storage.objects for select
    using (bucket_id = 'category-images');

create policy "Admin can upload category images"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'category-images');

-- Storage Policies for 'preorder-uploads' (Customers can upload outfit photos)
create policy "Public can view preorder uploads"
    on storage.objects for select
    using (bucket_id = 'preorder-uploads');

create policy "Public can upload preorder outfit photos"
    on storage.objects for insert
    with check (bucket_id = 'preorder-uploads');

create policy "Admin can delete preorder uploads"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'preorder-uploads');
