-- ============================================================================
-- SOURCED NEXUS — SECURITY & ROW LEVEL SECURITY (RLS) HARDENING MIGRATION
-- Server-side admin role authorization, private preorder storage, and OWASP protection
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADMIN USERS TABLE & SERVER-SIDE AUTHORIZATION
-- ----------------------------------------------------------------------------
-- Trusted table for authorized administrators. Roles are never inferred from client metadata.
create table if not exists public.admin_users (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique not null,
    role text not null default 'admin' check (role in ('admin', 'superadmin')),
    created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Security Definer function to safely check if the caller is an active admin
-- Does not expose the admin table to unauthenticated users or customers
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
    if auth.uid() is null then
        return false;
    end if;

    return exists (
        select 1 from public.admin_users
        where id = auth.uid() and role in ('admin', 'superadmin')
    );
end;
$$;

-- Allow admins to read the admin list
create policy "Admins can view admin_users"
    on public.admin_users for select
    to authenticated
    using (public.is_admin() or auth.uid() = id);

-- Trigger to automatically grant admin role to the official owner email upon sign up / sign in
create or replace function public.handle_admin_user_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Authorized owner email
    if new.email = 'frankmwalu04@gmail.com' then
        insert into public.admin_users (id, email, role)
        values (new.id, new.email, 'admin')
        on conflict (id) do update set role = 'admin', email = new.email;
    end if;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_admin on auth.users;
create trigger on_auth_user_created_admin
    after insert or update of email on auth.users
    for each row
    execute function public.handle_admin_user_registration();

-- Seed existing auth user if present
insert into public.admin_users (id, email, role)
select id, email, 'admin'
from auth.users
where email = 'frankmwalu04@gmail.com'
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. USER ID ON PREORDERS & IDOR PREVENTION
-- ----------------------------------------------------------------------------
-- Associate preorders with authenticated users to prevent Insecure Direct Object References (IDOR)
alter table public.preorders
    add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_preorders_user_id on public.preorders(user_id);

-- ----------------------------------------------------------------------------
-- 3. HARDENED ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- A. CATEGORIES
drop policy if exists "Allow public read access on categories" on public.categories;
drop policy if exists "Allow admin insert on categories" on public.categories;
drop policy if exists "Allow admin update on categories" on public.categories;
drop policy if exists "Allow admin delete on categories" on public.categories;

-- Public can read all categories
create policy "Public can read categories"
    on public.categories for select
    using (true);

-- Only verified server-side admins can modify categories
create policy "Admins can insert categories"
    on public.categories for insert
    to authenticated
    with check (public.is_admin());

create policy "Admins can update categories"
    on public.categories for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Admins can delete categories"
    on public.categories for delete
    to authenticated
    using (public.is_admin());

-- B. PRODUCTS
drop policy if exists "Allow public read on non-hidden products" on public.products;
drop policy if exists "Allow admin insert on products" on public.products;
drop policy if exists "Allow admin update on products" on public.products;
drop policy if exists "Allow admin delete on products" on public.products;

-- Public can view available/preorder/soldout; admins can view all including hidden
create policy "Public can read active products"
    on public.products for select
    using (status != 'hidden' or public.is_admin());

-- Only verified server-side admins can create/update/delete products
create policy "Admins can insert products"
    on public.products for insert
    to authenticated
    with check (public.is_admin());

create policy "Admins can update products"
    on public.products for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Admins can delete products"
    on public.products for delete
    to authenticated
    using (public.is_admin());

-- C. PREORDERS (PERSONAL CUSTOMER SOURCING REQUESTS)
drop policy if exists "Allow anyone to submit preorder" on public.preorders;
drop policy if exists "Allow admin read access on preorders" on public.preorders;
drop policy if exists "Allow admin update on preorders" on public.preorders;
drop policy if exists "Allow admin delete on preorders" on public.preorders;

-- Customers can read only their own preorders; admins can read all
create policy "Users can read own preorders or admin"
    on public.preorders for select
    to authenticated
    using (auth.uid() = user_id or public.is_admin());

-- Authenticated users can insert preorders bound to their user_id, or admins
create policy "Authenticated users can submit preorder"
    on public.preorders for insert
    to authenticated
    with check (auth.uid() = user_id or public.is_admin());

-- Only verified admins can update preorder status/notes
create policy "Admins can update preorders"
    on public.preorders for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- Only verified admins can delete preorders
create policy "Admins can delete preorders"
    on public.preorders for delete
    to authenticated
    using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. HARDENED STORAGE SECURITY POLICIES
-- ----------------------------------------------------------------------------

-- Make preorder-uploads private so customer outfit photos are not exposed to the public internet
update storage.buckets
set public = false
where id = 'preorder-uploads';

-- Ensure product-images and category-images remain public for CDN delivery
update storage.buckets
set public = true
where id in ('product-images', 'category-images');

-- Drop old storage policies
drop policy if exists "Public can view product images" on storage.objects;
drop policy if exists "Admin can upload product images" on storage.objects;
drop policy if exists "Admin can update product images" on storage.objects;
drop policy if exists "Admin can delete product images" on storage.objects;

drop policy if exists "Public can view category images" on storage.objects;
drop policy if exists "Admin can upload category images" on storage.objects;

drop policy if exists "Public can view preorder uploads" on storage.objects;
drop policy if exists "Public can upload preorder outfit photos" on storage.objects;
drop policy if exists "Admin can delete preorder uploads" on storage.objects;

-- Product media: public read, admin write
create policy "Public can view product images"
    on storage.objects for select
    using (bucket_id = 'product-images');

create policy "Admins can upload product images"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'product-images' and public.is_admin());

create policy "Admins can update product images"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'product-images' and public.is_admin());

create policy "Admins can delete product images"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'product-images' and public.is_admin());

-- Category media: public read, admin write
create policy "Public can view category images"
    on storage.objects for select
    using (bucket_id = 'category-images');

create policy "Admins can upload category images"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'category-images' and public.is_admin());

-- Preorder uploads: private storage, authenticated user can upload only to their folder or root,
-- and only the owner or verified admin can read/view
create policy "Users and admins can view preorder uploads"
    on storage.objects for select
    to authenticated
    using (
        bucket_id = 'preorder-uploads'
        and (
            public.is_admin()
            or (storage.foldername(name))[1] = auth.uid()::text
            or name like auth.uid()::text || '/%'
        )
    );

create policy "Authenticated users can upload preorder images"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'preorder-uploads'
        and (
            public.is_admin()
            or (storage.foldername(name))[1] = auth.uid()::text
            or name like auth.uid()::text || '/%'
        )
    );

create policy "Users and admins can delete preorder images"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'preorder-uploads'
        and (
            public.is_admin()
            or (storage.foldername(name))[1] = auth.uid()::text
            or name like auth.uid()::text || '/%'
        )
    );
